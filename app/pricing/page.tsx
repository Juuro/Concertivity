import { cookies, headers } from "next/headers"
import Layout from "@/components/layout-client"
import { auth } from "@/lib/auth"
import type { PaddlePlanKey } from "@/lib/paddle/config"
import { isTrialOfferConfigured } from "@/lib/paddle/config"
import { getPricingBillingHint } from "@/lib/paddle/entitlement"
import { getLocalTrialEligibility } from "@/lib/paddle/trial"
import { getPlanPriceLabels } from "@/lib/paddle/price-previews"
import { FEATURE_FLAGS, isFeatureEnabled } from "@/utils/featureFlags"
import { PricingView } from "./PricingView"
import "./pricing.scss"

export const dynamic = "force-dynamic"

export default async function PricingPage() {
  const hdrs = await headers()
  await cookies()
  const accept = hdrs.get("accept-language") ?? ""
  const localeDe = accept.toLowerCase().includes("de")
  const paywallEnabled = isFeatureEnabled(FEATURE_FLAGS.ENABLE_PAYWALL, false)

  const session = await auth.api.getSession({ headers: hdrs })
  let billing: { planKey: string | null; isPremium: boolean } | null = null
  if (session?.user) {
    try {
      billing = await getPricingBillingHint(session.user.id)
    } catch {
      billing = null
    }
  }

  // Trial wording needs a configured trial price and a user without subscription
  // history. Local data only, so a provider outage never affects this page.
  let trialEligible = true
  if (session?.user) {
    try {
      trialEligible = await getLocalTrialEligibility(session.user.id)
    } catch {
      trialEligible = false
    }
  }
  const trialPlans = {
    monthly:
      paywallEnabled && trialEligible && isTrialOfferConfigured("monthly"),
    yearly: paywallEnabled && trialEligible && isTrialOfferConfigured("yearly"),
  }

  const priceLocale = localeDe ? "de-DE" : "en-US"
  let priceLabels: Partial<Record<PaddlePlanKey, string>> = {}
  try {
    priceLabels = await getPlanPriceLabels(priceLocale)
  } catch {
    priceLabels = {}
  }

  return (
    <Layout>
      <main className="pricing-page">
        <PricingView
          localeDe={localeDe}
          paywallEnabled={paywallEnabled}
          billing={billing}
          priceLabels={priceLabels}
          trialPlans={trialPlans}
        />
      </main>
    </Layout>
  )
}
