"use client"

import Link from "next/link"
import type { PaddlePlanKey } from "@/lib/paddle/config"
import {
  PADDLE_BILLING_CHANGED_EVENT,
  subscriptionStatusIsPremium,
  syncBillingAfterCheckout,
} from "@/lib/paddle/billing-ui"
import { PricingCard } from "@/components/pricing/PricingCard"
import { PRICING_FAQ } from "@/components/pricing/pricingContent"
import { PricingTierOverview } from "@/components/pricing/PricingTierOverview"
import layout from "@/components/pricing/PricingLayout.module.scss"
import { useToast } from "@/components/Toast/Toast"
import { Suspense, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"

type BillingHint = { planKey: string | null; isPremium: boolean }

async function fetchBillingHintWithRetry(
  signal: AbortSignal
): Promise<BillingHint | null> {
  await syncBillingAfterCheckout()
  for (let _attempt = 0; _attempt < 8; _attempt++) {
    if (signal.aborted) return null
    const res = await fetch("/api/paddle/subscription?portal=0", {
      credentials: "same-origin",
      signal,
    })
    if (signal.aborted) return null
    if (res.status === 401) {
      return null
    }
    if (!res.ok) {
      await new Promise((r) => setTimeout(r, 600))
      continue
    }
    const data = (await res.json()) as {
      subscription: { planKey: string | null; status: string } | null
    }
    const sub = data.subscription
    if (sub) {
      return {
        planKey: sub.planKey,
        isPremium: subscriptionStatusIsPremium(sub.status),
      }
    }
    await new Promise((r) => setTimeout(r, 600))
  }
  return null
}

function PricingToastListener() {
  const params = useSearchParams()
  const { showToast } = useToast()

  useEffect(() => {
    if (params.get("success") === "1") {
      void syncBillingAfterCheckout().then(() => {
        window.dispatchEvent(new CustomEvent(PADDLE_BILLING_CHANGED_EVENT))
      })
      showToast({
        type: "success",
        message: "Thanks — your checkout completed successfully.",
      })
    }
    if (params.get("cancelled") === "1") {
      showToast({
        type: "info",
        message: "Checkout was cancelled.",
      })
    }
  }, [params, showToast])

  return null
}

export function PricingView({
  localeDe,
  paywallEnabled,
  billing: serverBilling,
  priceLabels,
  trialPlans = {},
}: {
  localeDe: boolean
  paywallEnabled: boolean
  billing: BillingHint | null
  priceLabels: Partial<Record<PaddlePlanKey, string>>
  /** Plans the visitor can start a 14-day trial on (decided on the server). */
  trialPlans?: Partial<Record<"monthly" | "yearly", boolean>>
}) {
  const [clientBilling, setClientBilling] = useState<
    BillingHint | null | undefined
  >(undefined)

  useEffect(() => {
    const ac = new AbortController()
    async function run() {
      const hint = await fetchBillingHintWithRetry(ac.signal)
      if (!ac.signal.aborted) {
        setClientBilling(hint)
      }
    }
    void run()

    function onPaddleBilling() {
      const ac2 = new AbortController()
      void fetchBillingHintWithRetry(ac2.signal).then((hint) => {
        setClientBilling(hint)
      })
    }
    window.addEventListener(PADDLE_BILLING_CHANGED_EVENT, onPaddleBilling)
    return () => {
      ac.abort()
      window.removeEventListener(PADDLE_BILLING_CHANGED_EVENT, onPaddleBilling)
    }
  }, [])

  const billing = clientBilling !== undefined ? clientBilling : serverBilling

  const fallback = (_plan: PaddlePlanKey) =>
    localeDe
      ? "Betrag aus deinem Paddle-Katalog (siehe Umgebungsvariablen)"
      : "Amount from your Paddle catalog (set price ID env vars)"

  // A subscription row (billing hint) means a trial was already used or is running.
  const trialFor = (plan: "monthly" | "yearly") =>
    Boolean(trialPlans[plan]) && !billing
  const anyTrial = trialFor("monthly") || trialFor("yearly")

  const hasLifetimePlan =
    Boolean(billing?.isPremium) && billing?.planKey === "lifetime_beta"

  return (
    <div className={layout.page}>
      <Suspense fallback={null}>
        <PricingToastListener />
      </Suspense>
      <div className={layout.glow} aria-hidden="true" />
      <div className={layout.inner}>
        <header className={layout.header}>
          <p className={layout.eyebrow}>Honest pricing</p>
          <h1 className={layout.heading}>
            Start free. Go Superfan when you&apos;re ready.
          </h1>
          <p className={layout.lead}>
            Concertivity is free to use — no credit card at signup. Superfan is
            optional: support the project and unlock premium capabilities as
            they roll out.
            {anyTrial
              ? localeDe
                ? " Neue Superfan-Abonnent:innen können 14 Tage kostenlos testen."
                : " New Superfan subscribers can try it free for 14 days."
              : null}
          </p>
        </header>

        {!paywallEnabled ? (
          <p className={layout.notice} role="status">
            Paid plans are not enabled in this deployment yet (
            <code>ENABLE_PAYWALL</code>). You can still review plans below.
          </p>
        ) : null}

        <PricingTierOverview paywallEnabled={paywallEnabled} variant="page" />

        <section
          id="superfan-plans"
          className={layout.plansSection}
          aria-labelledby="superfan-plans-heading"
        >
          <header className={layout.plansHeader}>
            <h2 id="superfan-plans-heading">Choose your Superfan plan</h2>
            <p>
              Pick monthly flexibility or yearly value. Both include the same
              Superfan benefits — cancel anytime from Settings.
            </p>
          </header>

          <div className={layout.planGrid}>
            <PricingCard
              title="Superfan — Monthly"
              description="Flexible monthly access to Superfan features."
              priceLabel={priceLabels.monthly ?? fallback("monthly")}
              billingPeriod={localeDe ? "pro Monat" : "per month"}
              planKey="monthly"
              currencyHint={priceLabels.monthly ? undefined : "EUR"}
              localeDe={localeDe}
              paywallEnabled={paywallEnabled}
              trialOffered={trialFor("monthly")}
              isCurrentPlan={
                Boolean(billing?.isPremium) && billing?.planKey === "monthly"
              }
            />
            <PricingCard
              title="Superfan — Yearly"
              description="Best value for long-time gig-goers who want to support the project."
              priceLabel={priceLabels.yearly ?? fallback("yearly")}
              billingPeriod={localeDe ? "pro Jahr" : "per year"}
              planKey="yearly"
              currencyHint={priceLabels.yearly ? undefined : "EUR"}
              localeDe={localeDe}
              paywallEnabled={paywallEnabled}
              highlighted
              badge={localeDe ? "Beliebteste Wahl" : "Best value"}
              trialOffered={trialFor("yearly")}
              isCurrentPlan={
                Boolean(billing?.isPremium) && billing?.planKey === "yearly"
              }
            />
          </div>

          <aside
            className={layout.invitationCard}
            aria-labelledby="lifetime-heading"
          >
            <h3 id="lifetime-heading">Lifetime beta — by invitation</h3>
            {hasLifetimePlan ? (
              <p role="status">
                You have lifetime Superfan access through a beta invitation.
                Thank you for supporting Concertivity early.
              </p>
            ) : (
              <p>
                Lifetime access is not available for public purchase. It is
                offered only to manually assigned beta testers or on special
                occasions — never as a standard checkout option on this page.
              </p>
            )}
          </aside>
        </section>

        <section className={layout.faq} aria-labelledby="pricing-faq-heading">
          <h2 id="pricing-faq-heading" className={layout.faqHeading}>
            Common questions
          </h2>
          <ul className={layout.faqList}>
            {PRICING_FAQ.map((item) => (
              <li key={item.question} className={layout.faqItem}>
                <h3>{item.question}</h3>
                <p>{item.answer}</p>
              </li>
            ))}
          </ul>
        </section>

        <p className={layout.footnote}>
          Billing for Superfan is handled securely by Paddle (merchant of
          record). Taxes and invoices are shown at checkout where applicable.
        </p>

        <section
          className={layout.bottomCta}
          aria-labelledby="pricing-cta-heading"
        >
          <h2 id="pricing-cta-heading">
            Your next show deserves a spot in your diary
          </h2>
          <p>
            Sign up free in minutes. Upgrade to Superfan only if you want to
            support Concertivity and get early access to premium features.
          </p>
          <div className={layout.bottomActions}>
            <Link href="/register" className={layout.ctaPrimary}>
              Start free
            </Link>
            <Link href="/" className={layout.ctaSecondary}>
              Back to home
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}
