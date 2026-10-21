import Link from "next/link"
import React from "react"
import { CheckIcon, HeartIcon } from "@/components/landing/LandingIcons"
import { FREE_TIER_FEATURES, SUPERFAN_TIER_FEATURES } from "./pricingContent"
import styles from "./PricingLayout.module.scss"

interface PricingTierOverviewProps {
  paywallEnabled: boolean
  /** On the dedicated pricing page the Superfan card links to plan selection below. */
  variant?: "landing" | "page"
}

export function PricingTierOverview({
  paywallEnabled,
  variant = "landing",
}: PricingTierOverviewProps) {
  return (
    <div className={styles.cards}>
      <article className={`${styles.card} ${styles.cardFree}`}>
        <span className={styles.badge}>Always free</span>
        <h4>Free</h4>
        <p className={styles.price}>
          <span className={styles.priceAmount}>€0</span>
          <span className={styles.pricePeriod}>forever</span>
        </p>
        <p className={styles.cardIntro}>
          Everything you need to build and share your concert diary.
        </p>
        <ul className={styles.featureList}>
          {FREE_TIER_FEATURES.map((item) => (
            <li key={item}>
              <CheckIcon className={styles.check} />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <Link href="/register" className={styles.ctaPrimary}>
          Create free account
        </Link>
      </article>

      <article className={`${styles.card} ${styles.cardSuperfan}`}>
        <span className={`${styles.badge} ${styles.badgeSuperfan}`}>
          Optional upgrade
        </span>
        <h4>Superfan</h4>
        <p className={styles.price}>
          <span className={styles.priceAmount}>From</span>
          <span className={styles.pricePeriod}>monthly plans</span>
        </p>
        <p className={styles.cardIntro}>
          Back Concertivity and get first access to what we build next.
        </p>
        <ul className={styles.featureList}>
          {SUPERFAN_TIER_FEATURES.map((item) => (
            <li key={item}>
              <HeartIcon className={styles.heart} />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        {variant === "landing" ? (
          <Link href="/pricing" className={styles.ctaSecondary}>
            Compare Superfan plans
          </Link>
        ) : (
          <a href="#superfan-plans" className={styles.ctaSecondary}>
            See Superfan plans
          </a>
        )}
        {!paywallEnabled ? (
          <p className={styles.inlineNotice} role="status">
            Paid checkout is not live in this environment yet — you can still
            review plans below.
          </p>
        ) : null}
      </article>
    </div>
  )
}
