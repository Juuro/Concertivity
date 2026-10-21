import Link from "next/link"
import React from "react"
import styles from "./heroBanner.module.scss"

const HeroBanner: React.FC = () => (
  <section className={styles.hero} aria-label="Introduction">
    <p className={styles.freeBadge}>Free to start</p>
    <h2 className={styles.headline}>Your concert diary. No credit card.</h2>
    <p className={styles.subline}>
      Log every gig. Map your music journey. See the stats. The base version is
      free — no credit card needed.
    </p>
    <ul className={styles.featureList} aria-label="What you get for free">
      <li>Track every concert you&apos;ve ever been to</li>
      <li>Interactive world map of your live music history</li>
      <li>Charts — top years, bands, and cities</li>
      <li>Band pages with genre info and history</li>
    </ul>
    <div className={styles.actions}>
      <Link href="/register" className={styles.ctaPrimary}>
        Start free
      </Link>
      <Link href="/pricing" className={styles.ctaSecondary}>
        See pricing
      </Link>
    </div>
  </section>
)

export default HeroBanner
