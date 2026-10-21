import * as Sentry from "@sentry/nextjs"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { SubscriptionStatus } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { createCheckoutTransaction } from "@/lib/paddle/client"
import {
  getPaddleEnvConfig,
  getPriceIdForPlan,
  getTrialPriceIdForPlan,
  isLifetimeOfferOpen,
} from "@/lib/paddle/config"
import { isUserSuperfan } from "@/lib/paddle/entitlement"
import { getTrialEligibility } from "@/lib/paddle/trial"
import { createRateLimiter } from "@/lib/rateLimit"
import { paddleCheckoutBodySchema } from "@/lib/validations/paddle"
import { FEATURE_FLAGS, isFeatureEnabled } from "@/utils/featureFlags"

export const runtime = "nodejs"

// Each request can make several provider calls (eligibility lookup, transaction).
const checkoutLimiter = createRateLimiter({ windowMs: 60_000, max: 10 })

export async function POST(request: NextRequest) {
  if (!isFeatureEnabled(FEATURE_FLAGS.ENABLE_PAYWALL, false)) {
    return NextResponse.json({ error: "paywall_disabled" }, { status: 404 })
  }

  const session = await auth.api.getSession({
    headers: await headers(),
  })
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!checkoutLimiter.check(session.user.id)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 })
  }

  let cfg: ReturnType<typeof getPaddleEnvConfig>
  try {
    cfg = getPaddleEnvConfig()
  } catch {
    return NextResponse.json(
      { error: "paddle_not_configured" },
      { status: 503 }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const parsed = paddleCheckoutBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }

  const planKey = parsed.data.planKey
  const userId = session.user.id

  if (await isUserSuperfan(userId)) {
    return NextResponse.json({ error: "already_subscribed" }, { status: 409 })
  }

  if (planKey === "lifetime_beta") {
    if (!isLifetimeOfferOpen()) {
      return NextResponse.json(
        { error: "lifetime_offer_closed" },
        { status: 400 }
      )
    }
    if (cfg.lifetimeOfferSeatCap != null) {
      const sold = await prisma.subscription.count({
        where: {
          status: SubscriptionStatus.LIFETIME,
          planKey: "lifetime_beta",
        },
      })
      if (sold >= cfg.lifetimeOfferSeatCap) {
        return NextResponse.json(
          { error: "lifetime_sold_out" },
          { status: 400 }
        )
      }
    }
  }

  // The trial is a property of the Paddle price, so eligibility picks the price.
  // Eligibility is decided here from the session user; the client cannot claim it.
  const trialPriceId = getTrialPriceIdForPlan(planKey)
  const useTrial = trialPriceId !== null && (await getTrialEligibility(userId))
  const priceId = useTrial ? trialPriceId : getPriceIdForPlan(planKey)
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { paddleCustomerId: true, currency: true },
  })

  try {
    const tx = await createCheckoutTransaction({
      items: [{ priceId, quantity: 1 }],
      customerId: user?.paddleCustomerId ?? undefined,
      customData: { user_id: userId },
    })

    const customerId = tx.customerId
    if (customerId && customerId !== user?.paddleCustomerId) {
      await prisma.user.update({
        where: { id: userId },
        data: { paddleCustomerId: customerId },
      })
    }

    return NextResponse.json({ transactionId: tx.id, trial: useTrial })
  } catch (error) {
    Sentry.captureException(error)
    return NextResponse.json({ error: "checkout_failed" }, { status: 502 })
  }
}
