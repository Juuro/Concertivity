import React from "react"
import { PricingTierOverview } from "@/components/pricing/PricingTierOverview"
import styles from "@/components/pricing/PricingLayout.module.scss"

interface LandingPricingSectionProps {
  paywallEnabled: boolean
  /** A 14-day trial is configured and the paywall is on. */
  trialOffered?: boolean
}

export default function LandingPricingSection({
  paywallEnabled,
  trialOffered = false,
}: LandingPricingSectionProps) {
  return (
    <section className={styles.page} aria-labelledby="landing-pricing-heading">
      <div className={styles.glow} aria-hidden="true" />
      <div className={styles.inner}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>Honest pricing</p>
          <h3 id="landing-pricing-heading" className={styles.heading}>
            Start free. Go Superfan when you&apos;re ready.
          </h3>
          <p className={styles.lead}>
            Concertivity is free to use — no credit card at signup. Superfan is
            optional: support the project and unlock premium capabilities as
            they roll out.
            {trialOffered
              ? " New Superfan subscribers can try it free for 14 days."
              : null}
          </p>
        </header>

        <PricingTierOverview
          paywallEnabled={paywallEnabled}
          variant="landing"
        />

        <p className={styles.footnote}>
          Billing for Superfan is handled securely by Paddle (merchant of
          record). Taxes and invoices are shown at checkout where applicable.
        </p>
      </div>
    </section>
  )
}
