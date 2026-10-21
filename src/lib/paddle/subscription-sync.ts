import type { Subscription as PaddleSubscription } from "@paddle/paddle-node-sdk"
import { prisma } from "@/lib/prisma"
import {
  getSubscription,
  getTransaction,
  listCustomerSubscriptions,
  listCustomersByEmail,
} from "./client"
import {
  handleTransactionCompleted,
  syncSubscriptionFromPaddleData,
} from "./webhook-handler"

/** Shape expected by `syncSubscriptionFromPaddleData` (matches webhook payloads). */
export function paddleSubscriptionRemoteToSyncData(
  remote: PaddleSubscription
): unknown {
  return {
    id: remote.id,
    status: remote.status,
    customer_id: remote.customerId,
    custom_data: remote.customData,
    current_billing_period: remote.currentBillingPeriod
      ? {
          starts_at: remote.currentBillingPeriod.startsAt,
          ends_at: remote.currentBillingPeriod.endsAt,
        }
      : null,
    next_billed_at: remote.nextBilledAt,
    canceled_at: remote.canceledAt,
    scheduled_change: remote.scheduledChange
      ? {
          action: remote.scheduledChange.action,
          effective_at: remote.scheduledChange.effectiveAt,
        }
      : null,
    items: remote.items.map((it) => ({
      recurring: it.recurring,
      price_id: it.price?.id,
      price: it.price ? { id: it.price.id } : null,
      trial_dates: it.trialDates
        ? {
            starts_at: it.trialDates.startsAt,
            ends_at: it.trialDates.endsAt,
          }
        : null,
    })),
  }
}

function subscriptionStatusPriority(status: string): number {
  switch (status) {
    case "active":
      return 0
    case "trialing":
      return 1
    case "past_due":
      return 2
    case "paused":
      return 3
    case "canceled":
      return 4
    default:
      return 5
  }
}

function pickPrimarySubscription(
  subs: PaddleSubscription[]
): PaddleSubscription | null {
  if (subs.length === 0) return null
  return [...subs].sort(
    (a, b) =>
      subscriptionStatusPriority(a.status) -
      subscriptionStatusPriority(b.status)
  )[0]!
}

function readUserIdFromCustomData(obj: unknown): string | null {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) return null
  const r = obj as Record<string, unknown>
  const u = r["user_id"] ?? r["userId"]
  return typeof u === "string" && u.length > 0 ? u : null
}

function transactionIsPaid(status: string): boolean {
  return status === "completed" || status === "paid" || status === "billed"
}

/**
 * Link a Concertivity user to their Paddle customer when webhooks did not run
 * (typical on localhost). Matches the logged-in user's email in Paddle.
 */
export async function discoverAndLinkPaddleCustomer(
  userId: string
): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, paddleCustomerId: true },
  })
  if (!user) return null
  if (user.paddleCustomerId) return user.paddleCustomerId

  const customers = await listCustomersByEmail(user.email)
  if (customers.length === 0) return null

  let linkedId: string | null = null
  for (const customer of customers) {
    const subs = await listCustomerSubscriptions(customer.id)
    if (pickPrimarySubscription(subs)) {
      linkedId = customer.id
      break
    }
  }
  if (!linkedId) {
    linkedId = customers[0]!.id
  }

  await prisma.user.update({
    where: { id: userId },
    data: { paddleCustomerId: linkedId },
  })
  return linkedId
}

/**
 * When webhooks never reached this deployment (common on localhost), the user
 * can still have `paddleCustomerId` and an active subscription in Paddle.
 * Pull the best matching subscription and upsert local `Subscription` rows.
 */
export async function trySyncSubscriptionFromPaddleApi(
  userId: string,
  customerId: string
): Promise<boolean> {
  const remotes = await listCustomerSubscriptions(customerId)
  const best = pickPrimarySubscription(remotes)
  if (!best) return false
  try {
    await syncSubscriptionFromPaddleData(
      paddleSubscriptionRemoteToSyncData(best),
      { userId }
    )
    return true
  } catch {
    return false
  }
}

/**
 * After overlay checkout completes, pull the paid transaction from Paddle and
 * hydrate local billing state without waiting for webhooks.
 */
export async function syncSubscriptionFromCheckoutTransaction(
  userId: string,
  transactionId: string
): Promise<boolean> {
  const tx = await getTransaction(transactionId)
  const customUserId = readUserIdFromCustomData(tx.customData)
  if (customUserId && customUserId !== userId) {
    throw new Error("transaction_user_mismatch")
  }
  if (!transactionIsPaid(tx.status)) {
    return false
  }

  const customerId = tx.customerId
  if (customerId) {
    await prisma.user.update({
      where: { id: userId },
      data: { paddleCustomerId: customerId },
    })
  }

  if (tx.subscriptionId) {
    const remote = await getSubscription(tx.subscriptionId)
    await syncSubscriptionFromPaddleData(
      paddleSubscriptionRemoteToSyncData(remote),
      { userId }
    )
    return true
  }

  if (customerId) {
    const synced = await trySyncSubscriptionFromPaddleApi(userId, customerId)
    if (synced) return true
  }

  await handleTransactionCompleted({
    customer_id: customerId,
    custom_data: tx.customData ?? { user_id: userId },
    items: tx.items.map((it) => ({
      price_id: it.price?.id,
      price: it.price ? { id: it.price.id } : null,
    })),
  })

  const local = await prisma.subscription.findUnique({
    where: { userId },
    select: { id: true },
  })
  return local != null
}

/**
 * Hydrate from the Paddle API when webhooks did not populate local rows, or
 * when a row exists but `planKey` is still empty (older syncs skipped items
 * without `recurring: true`).
 */
export async function ensureSubscriptionSyncedFromPaddle(
  userId: string
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      paddleCustomerId: true,
      subscription: {
        select: { id: true, planKey: true, paddleSubscriptionId: true },
      },
    },
  })
  if (!user) return

  let customerId = user.paddleCustomerId
  if (!customerId) {
    customerId = await discoverAndLinkPaddleCustomer(userId)
  }
  if (!customerId) return

  const sub = user.subscription
  if (!sub) {
    await trySyncSubscriptionFromPaddleApi(userId, customerId)
    return
  }
  if (!sub.planKey && sub.paddleSubscriptionId) {
    await trySyncSubscriptionFromPaddleApi(userId, customerId)
  }
}

/** Used by the post-checkout sync API and client refresh flows. */
export async function syncBillingForUser(
  userId: string,
  transactionId?: string
): Promise<boolean> {
  if (transactionId) {
    try {
      return await syncSubscriptionFromCheckoutTransaction(
        userId,
        transactionId
      )
    } catch {
      // Fall through to customer discovery when transaction lookup fails.
    }
  }

  const customerId =
    (await discoverAndLinkPaddleCustomer(userId)) ??
    (
      await prisma.user.findUnique({
        where: { id: userId },
        select: { paddleCustomerId: true },
      })
    )?.paddleCustomerId

  if (!customerId) return false
  return trySyncSubscriptionFromPaddleApi(userId, customerId)
}
