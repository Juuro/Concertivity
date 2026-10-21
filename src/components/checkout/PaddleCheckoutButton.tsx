"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { useTypedSession } from "@/lib/auth-client"
import { setPaddleConsentState } from "@/lib/paddle-consent"
import { openPaddleCheckout } from "@/lib/paddle-client"
import type { PaddlePlanKey } from "@/lib/paddle/config"
import styles from "./PaddleCheckoutButton.module.scss"

interface PaddleCheckoutButtonProps {
  planKey: PaddlePlanKey
  label: string
  className?: string
  paywallEnabled: boolean
  /** The card promised a free trial; tell the user if the server did not apply it. */
  trialOffered?: boolean
  localeDe?: boolean
  variant?: "primary" | "secondary"
}

export function PaddleCheckoutButton({
  planKey,
  label,
  className,
  paywallEnabled,
  trialOffered = false,
  localeDe = false,
  variant = "secondary",
}: PaddleCheckoutButtonProps) {
  const router = useRouter()
  const { data: session, isPending } = useTypedSession()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onClick() {
    setError(null)
    setNotice(null)
    if (!paywallEnabled) {
      setError("Checkout is not available.")
      return
    }
    if (isPending) return
    if (!session?.user) {
      router.push(`/login?callbackUrl=${encodeURIComponent("/pricing")}`)
      return
    }

    setBusy(true)
    setPaddleConsentState("granted")

    try {
      const res = await fetch("/api/paddle/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planKey }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        transactionId?: string
        trial?: boolean
      }

      if (res.status === 409 && data.error === "already_subscribed") {
        setError("You already have an active Superfan plan.")
        return
      }
      if (!res.ok || !data.transactionId) {
        setError("Could not start checkout. Please try again.")
        return
      }

      if (trialOffered && data.trial === false) {
        setNotice(
          localeDe
            ? "Für dieses Konto ist keine kostenlose Testphase verfügbar. Du zahlst beim Checkout."
            : "A free trial is not available for this account. You will be charged at checkout."
        )
      }

      await openPaddleCheckout(data.transactionId)
    } catch {
      setError("Could not start checkout. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        className={`${styles.button} ${variant === "primary" ? styles.buttonPrimary : ""} ${className ?? ""}`.trim()}
        onClick={() => void onClick()}
        disabled={busy || isPending}
        aria-busy={busy}
      >
        {busy ? "Starting…" : label}
      </button>
      {notice ? (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
