/** Client-safe: matches `SUPERFAN_STATUSES` in `entitlement.ts` (Prisma enum string values). */
export const PREMIUM_BILLING_STATUSES = new Set([
  "TRIALING",
  "ACTIVE",
  "PAST_DUE",
  "PAUSED",
  "LIFETIME",
])

export function subscriptionStatusIsPremium(status: string): boolean {
  return PREMIUM_BILLING_STATUSES.has(status)
}

/** Dispatched on Paddle.js `checkout.completed` (see `paddle-client.ts`). */
export const PADDLE_BILLING_CHANGED_EVENT =
  "concertivity:paddle-billing-changed"

/** Pull billing state from Paddle after checkout (webhooks often miss localhost). */
export async function syncBillingAfterCheckout(
  transactionId?: string
): Promise<boolean> {
  try {
    const res = await fetch("/api/paddle/subscription/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(transactionId ? { transactionId } : {}),
    })
    if (!res.ok) return false
    const data = (await res.json()) as { synced?: boolean }
    return Boolean(data.synced)
  } catch {
    return false
  }
}
