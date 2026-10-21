import { SubscriptionStatus } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { anonymiseCustomer, cancelSubscription } from "./client"

function placeholderEmail(): string {
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 24)
  return `erased-${id}@noemail.invalid`
}

async function cancelWithRetries(
  paddleSubscriptionId: string,
  attempts = 3
): Promise<void> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      await cancelSubscription(paddleSubscriptionId, {
        effectiveFrom: "immediately",
      })
      return
    } catch (e) {
      lastErr = e
      await new Promise((r) => setTimeout(r, 400 * (i + 1)))
    }
  }
  throw lastErr
}

/**
 * GDPR Art. 17 — cancel Paddle subscriptions, anonymise customer, remove local mirror.
 */
export async function erasePaddleDataForUser(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, paddleCustomerId: true },
  })
  if (!user?.paddleCustomerId) {
    await prisma.subscription.deleteMany({ where: { userId } })
    return
  }

  const sub = await prisma.subscription.findUnique({ where: { userId } })
  if (
    sub?.paddleSubscriptionId &&
    sub.status !== SubscriptionStatus.CANCELED &&
    sub.status !== SubscriptionStatus.LIFETIME
  ) {
    try {
      await cancelWithRetries(sub.paddleSubscriptionId)
    } catch {
      // Continue with anonymisation — reconciliation may still see remote state.
    }
  }

  try {
    await anonymiseCustomer(user.paddleCustomerId, placeholderEmail())
  } catch {
    // Best-effort; user row deletion still proceeds.
  }

  await prisma.subscription.deleteMany({ where: { userId } })
  await prisma.user.update({
    where: { id: userId },
    data: { paddleCustomerId: null },
  })

  await prisma.adminActivity.create({
    data: {
      userId,
      action: "paddle_erasure",
      targetType: "subscription",
      targetId: user.paddleCustomerId,
      details: { paddleCustomerId: user.paddleCustomerId },
    },
  })
}

export async function getSubscriptionExportData(userId: string) {
  const sub = await prisma.subscription.findUnique({
    where: { userId },
    select: {
      status: true,
      planKey: true,
      paddleSubscriptionId: true,
      paddlePriceId: true,
      currentPeriodEnd: true,
      trialEndsAt: true,
      canceledAt: true,
      cancelScheduledFor: true,
      createdAt: true,
      updatedAt: true,
    },
  })
  return sub
}
