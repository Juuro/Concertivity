import { SubscriptionStatus } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { getCustomerPortalSessionUrl } from "./client"
import { getPlanForPriceId, tryGetPaddleEnvConfig } from "./config"
import { getPlanPriceLabel } from "./price-previews"
import { ensureSubscriptionSyncedFromPaddle } from "./subscription-sync"

const SUPERFAN_STATUSES: SubscriptionStatus[] = [
  SubscriptionStatus.TRIALING,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
  SubscriptionStatus.PAUSED,
  SubscriptionStatus.LIFETIME,
]

function planKeyForSubscriptionRow(sub: {
  planKey: string | null
  paddlePriceId: string | null
}): string | null {
  if (sub.planKey) return sub.planKey
  if (sub.paddlePriceId && tryGetPaddleEnvConfig()) {
    return getPlanForPriceId(sub.paddlePriceId) ?? null
  }
  return null
}

export async function isUserSuperfan(userId: string): Promise<boolean> {
  await ensureSubscriptionSyncedFromPaddle(userId)
  const sub = await prisma.subscription.findUnique({
    where: { userId },
    select: { status: true },
  })
  if (!sub) return false
  return SUPERFAN_STATUSES.includes(sub.status)
}

export type SubscriptionSummary = {
  status: SubscriptionStatus
  planKey: string | null
  currentPeriodEnd: string | null
  trialEndsAt: string | null
  /** Pending cancellation (e.g. canceled during a trial): access ends on this date, no further charge. */
  cancelScheduledFor: string | null
  /** Amount of the first charge after a trial; only set when the portal session is requested. */
  firstChargeAmountLabel: string | null
  manageBillingUrl: string | null
  portalTimedOut: boolean
}

const PORTAL_TIMEOUT_MS = 3000

/** Lightweight billing state for public pages (no Paddle portal session). */
export async function getPricingBillingHint(userId: string): Promise<{
  planKey: string | null
  isPremium: boolean
} | null> {
  await ensureSubscriptionSyncedFromPaddle(userId)
  const sub = await prisma.subscription.findUnique({
    where: { userId },
    select: { planKey: true, status: true, paddlePriceId: true },
  })
  if (!sub) return null
  return {
    planKey: planKeyForSubscriptionRow(sub),
    isPremium: SUPERFAN_STATUSES.includes(sub.status),
  }
}

export async function getSubscriptionSummary(
  userId: string,
  options?: { includePortalSession?: boolean; locale?: string }
): Promise<SubscriptionSummary | null> {
  await ensureSubscriptionSyncedFromPaddle(userId)
  const includePortal = options?.includePortalSession !== false
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { subscription: true },
  })
  if (!user?.subscription) return null

  const sub = user.subscription
  const displayPlanKey = planKeyForSubscriptionRow(sub)
  let manageBillingUrl: string | null = null
  let portalTimedOut = false

  if (
    includePortal &&
    user.paddleCustomerId &&
    sub.paddleSubscriptionId &&
    sub.status !== SubscriptionStatus.LIFETIME
  ) {
    try {
      manageBillingUrl = await getCustomerPortalSessionUrl(
        user.paddleCustomerId,
        [sub.paddleSubscriptionId],
        PORTAL_TIMEOUT_MS
      )
      if (!manageBillingUrl) portalTimedOut = true
    } catch {
      portalTimedOut = true
      manageBillingUrl = null
    }
  }

  let firstChargeAmountLabel: string | null = null
  if (
    includePortal &&
    sub.status === SubscriptionStatus.TRIALING &&
    !sub.cancelScheduledFor &&
    (displayPlanKey === "monthly" || displayPlanKey === "yearly")
  ) {
    firstChargeAmountLabel = await getPlanPriceLabel(
      displayPlanKey,
      options?.locale ?? "en-US"
    )
  }

  return {
    status: sub.status,
    planKey: displayPlanKey,
    currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
    trialEndsAt: sub.trialEndsAt?.toISOString() ?? null,
    cancelScheduledFor: sub.cancelScheduledFor?.toISOString() ?? null,
    firstChargeAmountLabel,
    manageBillingUrl,
    portalTimedOut,
  }
}
