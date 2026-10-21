"use client"

import {
  CheckoutEventNames,
  getPaddleInstance,
  initializePaddle,
} from "@paddle/paddle-js"
import type { Paddle } from "@paddle/paddle-js"
import {
  PADDLE_BILLING_CHANGED_EVENT,
  syncBillingAfterCheckout,
} from "@/lib/paddle/billing-ui"

function dispatchBillingChanged(): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(PADDLE_BILLING_CHANGED_EVENT))
}

const DEFAULT_CHECKOUT_SUCCESS_PATH = "/pricing?success=1"

function attachCheckoutCompletedHandler(paddle: Paddle): void {
  paddle.Update({
    eventCallback: (event) => {
      if (event.name === CheckoutEventNames.CHECKOUT_COMPLETED) {
        const transactionId = event.data?.transaction_id
        void syncBillingAfterCheckout(transactionId).finally(() => {
          dispatchBillingChanged()
          try {
            paddle.Checkout.close()
          } catch {
            /* overlay may already be closing */
          }
        })
      }
    },
  })
}

export async function ensurePaddleJs(): Promise<Paddle | undefined> {
  const existing = getPaddleInstance("v1")
  if (existing?.Initialized) {
    attachCheckoutCompletedHandler(existing)
    return existing
  }

  const token = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN?.trim()
  if (!token) {
    return undefined
  }

  const envRaw = process.env.NEXT_PUBLIC_PADDLE_ENV?.trim().toLowerCase()
  const environment = envRaw === "production" ? "production" : "sandbox"

  const paddle = await initializePaddle({
    environment,
    token,
    version: "v1",
  })
  if (paddle) {
    attachCheckoutCompletedHandler(paddle)
  }
  return paddle
}

export type OpenPaddleCheckoutOptions = {
  /**
   * Path on the current origin after successful payment (must start with `/`).
   * Paddle opens this URL when checkout completes (overlay + success screen).
   */
  successPath?: string
}

/**
 * Opens Paddle overlay checkout. Sets `successUrl` on the client so Paddle can
 * return shoppers to your site after payment — this is not configured in the
 * Paddle dashboard for transaction-based overlay checkout.
 */
export async function openPaddleCheckout(
  transactionId: string,
  options?: OpenPaddleCheckoutOptions
): Promise<void> {
  if (typeof window === "undefined") {
    throw new Error("paddle_checkout_requires_browser")
  }
  const paddle = await ensurePaddleJs()
  if (!paddle) {
    throw new Error("paddle_not_configured")
  }

  const rawPath = options?.successPath?.trim()
  const successPath =
    rawPath && rawPath.startsWith("/") ? rawPath : DEFAULT_CHECKOUT_SUCCESS_PATH
  const successUrl = new URL(successPath, window.location.origin).toString()

  paddle.Checkout.open({
    transactionId,
    settings: {
      successUrl,
    },
  })
}
