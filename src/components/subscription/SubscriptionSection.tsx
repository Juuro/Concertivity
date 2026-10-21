"use client"

import { useEffect, useState } from "react"
import {
  PADDLE_BILLING_CHANGED_EVENT,
  syncBillingAfterCheckout,
} from "@/lib/paddle/billing-ui"
import styles from "./SubscriptionSection.module.scss"

type SubscriptionPayload = {
  status: string
  planKey: string | null
  currentPeriodEnd: string | null
  trialEndsAt: string | null
  cancelScheduledFor?: string | null
  firstChargeAmountLabel?: string | null
  manageBillingUrl: string | null
  portalTimedOut: boolean
}

function StatusChip({ status }: { status: string }) {
  return <span className={styles.chip}>{status.replaceAll("_", " ")}</span>
}

export function SubscriptionSection() {
  const [loading, setLoading] = useState(true)
  const [sub, setSub] = useState<SubscriptionPayload | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        await syncBillingAfterCheckout()
        let found: SubscriptionPayload | null = null
        for (let _i = 0; _i < 8; _i++) {
          if (cancelled) return
          const res = await fetch("/api/paddle/subscription")
          const data = (await res.json()) as {
            subscription: SubscriptionPayload | null
          }
          if (data.subscription) {
            found = data.subscription
            break
          }
          await new Promise((r) => setTimeout(r, 600))
        }
        if (!cancelled) {
          setSub(found)
        }
      } catch {
        if (!cancelled) setSub(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()

    function onPaddleBilling() {
      void load()
    }
    window.addEventListener(PADDLE_BILLING_CHANGED_EVENT, onPaddleBilling)

    return () => {
      cancelled = true
      window.removeEventListener(PADDLE_BILLING_CHANGED_EVENT, onPaddleBilling)
    }
  }, [])

  if (loading) {
    return (
      <div className="settings__panel">
        <div className="settings__section">
          <h2>Subscription</h2>
          <p className={styles.loading}>Loading billing status…</p>
        </div>
      </div>
    )
  }

  if (!sub) {
    return (
      <div className="settings__panel">
        <div className="settings__section">
          <h2>Subscription</h2>
          <p className={styles.empty}>
            You do not have an active Superfan subscription yet.{" "}
            <a href="/pricing">View pricing</a>.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="settings__panel">
      <div className="settings__section">
        <h2>Subscription</h2>
        <p className="settings__hint settings__hint--block">
          Superfan billing is processed securely by Paddle (merchant of record).
        </p>
        <div className={styles.row}>
          <span>Status:</span>
          <StatusChip status={sub.status} />
        </div>
        {sub.planKey ? (
          <p className={styles.meta}>
            Plan: {sub.planKey.replaceAll("_", " ")}
          </p>
        ) : null}
        {sub.trialEndsAt ? (
          <p className={styles.meta}>
            Trial ends: {new Date(sub.trialEndsAt).toLocaleDateString()}
          </p>
        ) : null}
        {sub.status === "TRIALING" &&
        sub.trialEndsAt &&
        !sub.cancelScheduledFor ? (
          <p className={styles.meta}>
            First charge:{" "}
            {sub.firstChargeAmountLabel
              ? `${sub.firstChargeAmountLabel} on `
              : "on "}
            {new Date(sub.trialEndsAt).toLocaleDateString()}
          </p>
        ) : null}
        {sub.status === "PAST_DUE" ? (
          <p className={styles.meta} role="status">
            Your last payment did not go through. Update your payment method
            under Manage billing to keep your access.
          </p>
        ) : null}
        {sub.cancelScheduledFor ? (
          <p className={styles.meta} role="status">
            {sub.status === "TRIALING"
              ? `Canceled during your trial. You keep access until ${new Date(sub.cancelScheduledFor).toLocaleDateString()} and will not be charged.`
              : `Cancels on ${new Date(sub.cancelScheduledFor).toLocaleDateString()}. You keep access until then.`}
          </p>
        ) : null}
        {sub.currentPeriodEnd ? (
          <p className={styles.meta}>
            Current period ends:{" "}
            {new Date(sub.currentPeriodEnd).toLocaleDateString()}
          </p>
        ) : null}
        {sub.manageBillingUrl ? (
          <a
            className={styles.link}
            href={sub.manageBillingUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Manage billing
          </a>
        ) : (
          <span
            className={`${styles.link} ${styles.linkDisabled}`}
            title={
              sub.portalTimedOut
                ? "Billing portal is temporarily unavailable. Try again later."
                : "Manage billing is only available for recurring subscriptions."
            }
          >
            Manage billing
          </span>
        )}
      </div>
    </div>
  )
}
