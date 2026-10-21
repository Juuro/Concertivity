import {
  type PaddleWebhookEnvelope,
  paddleWebhookEnvelope,
} from "@/lib/validations/paddle"
import { prisma } from "@/lib/prisma"
import { Prisma, SubscriptionStatus } from "@/generated/prisma/client"
import { getPlanForPriceId, getPaddleEnvConfig } from "./config"

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null
}

function readUserIdFromCustomData(obj: unknown): string | null {
  const r = asRecord(obj)
  if (!r) return null
  const u = r["user_id"] ?? r["userId"]
  return typeof u === "string" && u.length > 0 ? u : null
}

function parseIsoDate(s: unknown): Date | null {
  if (typeof s !== "string") return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

function mapPaddleSubscriptionStatus(
  paddle: string
): SubscriptionStatus | null {
  switch (paddle) {
    case "trialing":
      return SubscriptionStatus.TRIALING
    case "active":
      return SubscriptionStatus.ACTIVE
    case "past_due":
      return SubscriptionStatus.PAST_DUE
    case "paused":
      return SubscriptionStatus.PAUSED
    case "canceled":
      return SubscriptionStatus.CANCELED
    default:
      return null
  }
}

async function resolveUserIdForSubscription(
  data: Record<string, unknown>
): Promise<string | null> {
  const fromCustom = readUserIdFromCustomData(data["custom_data"])
  if (fromCustom) return fromCustom
  const customerId = data["customer_id"]
  if (typeof customerId !== "string") return null
  const user = await prisma.user.findFirst({
    where: { paddleCustomerId: customerId },
    select: { id: true },
  })
  return user?.id ?? null
}

function firstRecurringPriceId(data: Record<string, unknown>): string | null {
  const items = data["items"]
  if (!Array.isArray(items)) return null
  for (const raw of items) {
    const it = asRecord(raw)
    if (!it) continue
    if (it["recurring"] !== true) continue
    const price = asRecord(it["price"])
    const id =
      (typeof it["price_id"] === "string" && it["price_id"]) ||
      (price && typeof price["id"] === "string" ? price["id"] : null)
    if (id) return id
  }
  return null
}

/** Prefer recurring line items; fall back to any priced line (Paddle.js payloads sometimes omit `recurring`). */
function primarySubscriptionPriceId(
  data: Record<string, unknown>
): string | null {
  const fromRecurring = firstRecurringPriceId(data)
  if (fromRecurring) return fromRecurring
  const items = data["items"]
  if (!Array.isArray(items)) return null
  for (const raw of items) {
    const it = asRecord(raw)
    if (!it) continue
    const price = asRecord(it["price"])
    const id =
      (typeof it["price_id"] === "string" && it["price_id"]) ||
      (price && typeof price["id"] === "string" ? price["id"] : null)
    if (id) return id
  }
  return null
}

function trialEndsAtFromData(data: Record<string, unknown>): Date | null {
  const items = data["items"]
  if (!Array.isArray(items)) return null
  for (const raw of items) {
    const it = asRecord(raw)
    if (!it || it["recurring"] !== true) continue
    const trial = asRecord(it["trial_dates"])
    if (!trial) continue
    const ends = parseIsoDate(trial["ends_at"])
    if (ends) return ends
  }
  return null
}

/** Effective date of a pending cancellation (e.g. cancel during a trial), else null. */
function cancelScheduledForFromData(
  data: Record<string, unknown>
): Date | null {
  const change = asRecord(data["scheduled_change"])
  if (!change || change["action"] !== "cancel") return null
  return parseIsoDate(change["effective_at"])
}

function currentPeriodEndFromData(data: Record<string, unknown>): Date | null {
  const period = asRecord(data["current_billing_period"])
  if (period) {
    const ends = parseIsoDate(period["ends_at"])
    if (ends) return ends
  }
  return parseIsoDate(data["next_billed_at"])
}

export async function syncSubscriptionFromPaddleData(
  data: unknown,
  options?: { userId?: string }
): Promise<void> {
  const d = asRecord(data)
  if (!d) return

  const userId = options?.userId ?? (await resolveUserIdForSubscription(d))
  if (!userId) {
    throw new Error("subscription_webhook_missing_user")
  }

  const subId = typeof d["id"] === "string" ? d["id"] : null
  if (!subId) throw new Error("subscription_webhook_missing_id")

  const paddleStatus = typeof d["status"] === "string" ? d["status"] : ""
  const status = mapPaddleSubscriptionStatus(paddleStatus)
  if (!status)
    throw new Error(`subscription_webhook_unknown_status:${paddleStatus}`)

  const priceId = primarySubscriptionPriceId(d)
  const planKey = priceId ? getPlanForPriceId(priceId) : null
  const customerId =
    typeof d["customer_id"] === "string" ? d["customer_id"] : null

  if (customerId) {
    await prisma.user.update({
      where: { id: userId },
      data: { paddleCustomerId: customerId },
    })
  }

  await prisma.subscription.upsert({
    where: { userId },
    create: {
      userId,
      status,
      paddleSubscriptionId: subId,
      paddlePriceId: priceId,
      planKey: planKey ?? undefined,
      currentPeriodEnd: currentPeriodEndFromData(d),
      trialEndsAt: trialEndsAtFromData(d),
      canceledAt: parseIsoDate(d["canceled_at"]),
      cancelScheduledFor: cancelScheduledForFromData(d),
    },
    update: {
      status,
      paddleSubscriptionId: subId,
      paddlePriceId: priceId ?? undefined,
      planKey: planKey ?? undefined,
      currentPeriodEnd: currentPeriodEndFromData(d),
      trialEndsAt: trialEndsAtFromData(d),
      canceledAt: parseIsoDate(d["canceled_at"]),
      cancelScheduledFor: cancelScheduledForFromData(d),
    },
  })
}

export async function handleSubscriptionEvent(
  envelope: PaddleWebhookEnvelope
): Promise<void> {
  await syncSubscriptionFromPaddleData(envelope.data)
}

function firstTransactionPriceId(data: Record<string, unknown>): string | null {
  const items = data["items"]
  if (!Array.isArray(items)) return null
  for (const raw of items) {
    const it = asRecord(raw)
    if (!it) continue
    if (typeof it["price_id"] === "string" && it["price_id"])
      return it["price_id"]
    const price = asRecord(it["price"])
    if (price && typeof price["id"] === "string") return price["id"]
  }
  return null
}

export async function handleTransactionCompleted(data: unknown): Promise<void> {
  const d = asRecord(data)
  if (!d) return

  const userId = readUserIdFromCustomData(d["custom_data"])
  const customerId =
    typeof d["customer_id"] === "string" ? d["customer_id"] : null

  let resolvedUserId = userId
  if (!resolvedUserId && customerId) {
    const u = await prisma.user.findFirst({
      where: { paddleCustomerId: customerId },
      select: { id: true },
    })
    resolvedUserId = u?.id ?? null
  }
  if (!resolvedUserId) {
    throw new Error("transaction_completed_missing_user")
  }

  if (customerId) {
    await prisma.user.update({
      where: { id: resolvedUserId },
      data: { paddleCustomerId: customerId },
    })
  }

  const priceId = firstTransactionPriceId(d)
  const plan = priceId ? getPlanForPriceId(priceId) : null
  if (plan !== "lifetime_beta") {
    return
  }

  const cfg = getPaddleEnvConfig()
  const now = new Date()
  if (cfg.lifetimeOfferDeadline && now > cfg.lifetimeOfferDeadline) {
    throw new Error("lifetime_offer_deadline_passed")
  }

  await prisma.$transaction(async (tx) => {
    if (cfg.lifetimeOfferSeatCap != null) {
      const count = await tx.subscription.count({
        where: {
          status: SubscriptionStatus.LIFETIME,
          planKey: "lifetime_beta",
        },
      })
      if (count >= cfg.lifetimeOfferSeatCap) {
        throw new Error("lifetime_offer_seat_cap_reached")
      }
    }

    await tx.subscription.upsert({
      where: { userId: resolvedUserId },
      create: {
        userId: resolvedUserId,
        status: SubscriptionStatus.LIFETIME,
        paddleSubscriptionId: null,
        paddlePriceId: priceId,
        planKey: "lifetime_beta",
      },
      update: {
        status: SubscriptionStatus.LIFETIME,
        paddlePriceId: priceId,
        planKey: "lifetime_beta",
        paddleSubscriptionId: null,
      },
    })
  })
}

export async function handleAdjustmentCreated(data: unknown): Promise<void> {
  const d = asRecord(data)
  if (!d) return

  const action = typeof d["action"] === "string" ? d["action"] : ""
  const status = typeof d["status"] === "string" ? d["status"] : ""
  if (status !== "approved") return

  const customerId =
    typeof d["customer_id"] === "string" ? d["customer_id"] : null
  if (!customerId) return

  const user = await prisma.user.findFirst({
    where: { paddleCustomerId: customerId },
    select: { id: true },
  })
  if (!user) return

  const sub = await prisma.subscription.findUnique({
    where: { userId: user.id },
  })
  if (!sub || sub.status !== SubscriptionStatus.LIFETIME) return

  const items = d["items"]
  const isFullRefund =
    action === "chargeback" ||
    (action === "refund" &&
      Array.isArray(items) &&
      items.length > 0 &&
      items.every((raw) => {
        const it = asRecord(raw)
        return it?.["type"] === "full"
      }))

  if (!isFullRefund) return

  await prisma.subscription.update({
    where: { userId: user.id },
    data: {
      status: SubscriptionStatus.CANCELED,
      canceledAt: new Date(),
    },
  })

  await prisma.adminActivity.create({
    data: {
      userId: user.id,
      action: "paddle_lifetime_revoked",
      targetType: "subscription",
      targetId: sub.id,
      details: { reason: action },
    },
  })
}

export function redactWebhookPayload(payload: unknown): unknown {
  const r = asRecord(payload)
  if (!r) return payload
  const data = asRecord(r["data"])
  if (!data) return { ...r, data: "[redacted]" }
  const copy = { ...r, data: { ...data } }
  const nested = asRecord(copy.data)
  if (nested && "billing_details" in nested) {
    nested["billing_details"] = "[redacted]"
  }
  return copy
}

async function dispatch(envelope: PaddleWebhookEnvelope): Promise<void> {
  switch (envelope.event_type) {
    case "subscription.created":
    case "subscription.trialing":
    case "subscription.activated":
    case "subscription.updated":
    case "subscription.canceled":
    case "subscription.past_due":
    case "subscription.paused":
      await handleSubscriptionEvent(envelope)
      return
    case "transaction.completed":
      await handleTransactionCompleted(envelope.data)
      return
    case "adjustment.created":
      await handleAdjustmentCreated(envelope.data)
      return
  }
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "P2002"
  )
}

export async function processPaddleWebhookEvent(
  envelope: PaddleWebhookEnvelope
): Promise<{ duplicate: boolean }> {
  const payload = JSON.parse(JSON.stringify(envelope)) as Prisma.InputJsonValue
  try {
    await prisma.paddleWebhookEvent.create({
      data: {
        eventId: envelope.event_id,
        eventType: envelope.event_type,
        payload,
      },
    })
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { duplicate: true }
    }
    throw err
  }

  try {
    await dispatch(envelope)
    await prisma.paddleWebhookEvent.update({
      where: { eventId: envelope.event_id },
      data: { processedAt: new Date(), error: null },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await prisma.paddleWebhookEvent.update({
      where: { eventId: envelope.event_id },
      data: { error: msg, processedAt: new Date() },
    })
    throw err
  }

  return { duplicate: false }
}

export async function reprocessWebhookEvent(row: {
  id: string
  eventId: string
  eventType: string
  payload: unknown
}): Promise<void> {
  const p = asRecord(row.payload)
  if (!p) throw new Error("invalid_stored_payload")
  const parsed = paddleWebhookEnvelope.safeParse({
    event_id: row.eventId,
    event_type: row.eventType,
    data: p["data"],
  })
  if (!parsed.success) {
    throw new Error(`invalid_stored_envelope:${parsed.error.message}`)
  }
  const envelope = parsed.data

  await prisma.paddleWebhookEvent.update({
    where: { id: row.id },
    data: { lastRetryAt: new Date(), retryCount: { increment: 1 } },
  })

  await dispatch(envelope)
  await prisma.paddleWebhookEvent.update({
    where: { id: row.id },
    data: { processedAt: new Date(), error: null },
  })
}
