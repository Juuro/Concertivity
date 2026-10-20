import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  PADDLE_BILLING_CHANGED_EVENT,
  PREMIUM_BILLING_STATUSES,
  subscriptionStatusIsPremium,
  syncBillingAfterCheckout,
} from "./billing-ui"

const fetchMock = vi.fn()

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal("fetch", fetchMock)
})

describe("subscriptionStatusIsPremium", () => {
  it.each(["TRIALING", "ACTIVE", "PAST_DUE", "PAUSED", "LIFETIME"])(
    "treats %s as premium",
    (status) => {
      expect(subscriptionStatusIsPremium(status)).toBe(true)
    }
  )

  it.each(["CANCELED", "", "active", "UNKNOWN"])(
    "does not treat %j as premium",
    (status) => {
      expect(subscriptionStatusIsPremium(status)).toBe(false)
    }
  )

  it("mirrors the server-side Prisma enum values", async () => {
    const { SubscriptionStatus } = await import("@/generated/prisma/client")
    const nonPremium = new Set<string>([SubscriptionStatus.CANCELED])
    for (const status of Object.values(SubscriptionStatus)) {
      expect(PREMIUM_BILLING_STATUSES.has(status)).toBe(!nonPremium.has(status))
    }
  })
})

describe("syncBillingAfterCheckout", () => {
  it("exposes a stable event name", () => {
    expect(PADDLE_BILLING_CHANGED_EVENT).toBe(
      "concertivity:paddle-billing-changed"
    )
  })

  it("posts an empty body without a transaction id", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ synced: true }),
    })
    expect(await syncBillingAfterCheckout()).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith("/api/paddle/subscription/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: "{}",
    })
  })

  it("sends the transaction id", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ synced: true }),
    })
    await syncBillingAfterCheckout("txn_1")
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({
      transactionId: "txn_1",
    })
  })

  it("reports an unsynced result", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ synced: false }),
    })
    expect(await syncBillingAfterCheckout()).toBe(false)
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) })
    expect(await syncBillingAfterCheckout()).toBe(false)
  })

  it("is false for HTTP errors and network failures", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ synced: true }),
    })
    expect(await syncBillingAfterCheckout()).toBe(false)
    fetchMock.mockRejectedValue(new Error("offline"))
    expect(await syncBillingAfterCheckout()).toBe(false)
  })
})
