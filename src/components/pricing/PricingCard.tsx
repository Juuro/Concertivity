"use client"

import type { PaddlePlanKey } from "@/lib/paddle/config"
import { PaddleCheckoutButton } from "@/components/checkout/PaddleCheckoutButton"
import styles from "./PricingCard.module.scss"

interface PricingCardProps {
  title: string
  description: string
  priceLabel: string
  planKey: PaddlePlanKey
  currencyHint?: string
  localeDe: boolean
  paywallEnabled: boolean
  /** Eligible for the 14-day trial (monthly/yearly only; never shown for lifetime). */
  trialOffered?: boolean
  isCurrentPlan?: boolean
  highlighted?: boolean
  badge?: string
  billingPeriod?: string
}

export function PricingCard({
  title,
  description,
  priceLabel,
  planKey,
  currencyHint,
  localeDe,
  paywallEnabled,
  trialOffered = false,
  isCurrentPlan = false,
  highlighted = false,
  badge,
  billingPeriod,
}: PricingCardProps) {
  const vatText = localeDe
    ? "Preise zzgl. MwSt.; der finale Betrag wird beim Checkout angezeigt."
    : "Prices exclude VAT; the final amount is shown at checkout."

  const showTrial = trialOffered && planKey !== "lifetime_beta"
  // The amount is only quoted when it is the real catalog price, not the fallback text.
  const chargeAmount = currencyHint
    ? ""
    : ` ${priceLabel}${billingPeriod ? ` ${billingPeriod}` : ""}`
  const trialTerms = localeDe
    ? `Eine Zahlungsmethode ist jetzt erforderlich. Nach 14 Tagen werden${chargeAmount} automatisch berechnet, sofern du nicht vor Ende der Testphase kündigst.`
    : `A payment method is required now. After 14 days you are charged${chargeAmount} automatically unless you cancel before the trial ends.`
  const subscribeLabel = showTrial
    ? localeDe
      ? "Kostenlos testen starten"
      : "Start free trial"
    : localeDe
      ? "Jetzt abonnieren"
      : "Subscribe"

  const cardClass = [styles.card, highlighted ? styles.cardHighlighted : ""]
    .filter(Boolean)
    .join(" ")

  return (
    <article className={cardClass}>
      {badge ? <span className={styles.badge}>{badge}</span> : null}
      {isCurrentPlan ? (
        <p className={styles.currentPlan} role="status">
          {localeDe ? "Dein aktueller Plan" : "Your current plan"}
        </p>
      ) : null}
      <h3 className={styles.title}>{title}</h3>
      <p className={styles.price}>
        <span className={styles.priceAmount}>{priceLabel}</span>
        {billingPeriod ? (
          <span className={styles.pricePeriod}>{billingPeriod}</span>
        ) : null}
        {currencyHint ? (
          <span className={styles.vatHint} title={vatText}>
            ({currencyHint})
          </span>
        ) : null}
      </p>
      <p className={styles.description}>{description}</p>
      <p className={styles.vat}>
        <span title={vatText}>{localeDe ? "zzgl. MwSt." : "excl. VAT"}</span>
      </p>
      {showTrial ? (
        <>
          <p className={styles.trial}>
            {localeDe ? "14 Tage kostenlos testen" : "14-day free trial"}
          </p>
          <p className={styles.trialTerms}>{trialTerms}</p>
        </>
      ) : null}
      <PaddleCheckoutButton
        planKey={planKey}
        label={subscribeLabel}
        paywallEnabled={paywallEnabled}
        trialOffered={showTrial}
        localeDe={localeDe}
        variant={highlighted ? "primary" : "secondary"}
        className={styles.checkoutButton}
      />
    </article>
  )
}
