import React from "react"
import Link from "next/link"
import styles from "./Footer.module.scss"

export default function Footer() {
  const year = 2025

  return (
    <footer className={styles.footer}>
      <span aria-hidden="true">© {year}</span>
      <span className={styles.separator}>·</span>
      <Link href="/imprint" className={styles.link} aria-label="Legal imprint">
        Imprint
      </Link>
      <span className={styles.separator}>·</span>
      <Link
        href="/terms"
        className={styles.link}
        aria-label="Allgemeine Geschäftsbedingungen"
      >
        Terms and Conditions
      </Link>
      <span className={styles.separator}>·</span>
      <Link
        href="/revocation"
        className={styles.link}
        aria-label="Widerrufsrecht"
      >
        Right of Withdrawal
      </Link>
      <span className={styles.separator}>·</span>
      <Link href="/privacy" className={styles.link} aria-label="Privacy Policy">
        Privacy
      </Link>
      <span className={styles.separator}>·</span>
      <Link href="/pricing" className={styles.link} aria-label="Pricing plans">
        Pricing
      </Link>
      <span className={styles.separator}>·</span>
      <span aria-hidden="true">Built with ❤️ on 🌍! 🤟🏳️‍🌈</span>
    </footer>
  )
}
