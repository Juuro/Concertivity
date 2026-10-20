import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SubscriptionStatus } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import {
  buildAdjustmentData,
  buildSubscriptionData,
  buildTransactionData,
  buildWebhookEvent,
  stubPaddleEnv,
  type PrismaMock,
} from "@/test-utils/paddle"
import { resetPaddleConfigCacheForTests } from "./config"
import {
  handleAdjustmentCreated,
  handleSubscriptionEvent,
  handleTransactionCompleted,
  processPaddleWebhookEvent,
  redactWebhookPayload,
  reprocessWebhookEvent,
  syncSubscriptionFromPaddleData,
} from "./webhook-handler"

vi.mock("@/lib/prisma", async () => {
  const { makePrismaMock } = await import("@/test-utils/paddle")
  return { prisma: makePrismaMock() }
})

const db = prisma as unknown as PrismaMock

function lastUpsert(): {
  create: Record<string, unknown>
  update: Record<string, unknown>
} {
  const call = db.subscription.upsert.mock.calls.at(-1)
  return (call as unknown[])[0] as {
    create: Record<string, unknown>
    update: Record<string, unknown>
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  db.$transaction.mockImplementation(async (cb: (tx: PrismaMock) => unknown) =>
    cb(db)
  )
  resetPaddleConfigCacheForTests()
  stubPaddleEnv()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
  resetPaddleConfigCacheForTests()
})

describe("syncSubscriptionFromPaddleData", () => {
  it("ignores non-object data", async () => {
    await syncSubscriptionFromPaddleData(null)
    await syncSubscriptionFromPaddleData([])
    expect(db.subscription.upsert).not.toHaveBeenCalled()
  })

  it("upserts an active subscription for the user in custom_data", async () => {
    await syncSubscriptionFromPaddleData(buildSubscriptionData())
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: { paddleCustomerId: "ctm_1" },
    })
    const { create, update } = lastUpsert()
    expect(create).toMatchObject({
      userId: "user_1",
      status: SubscriptionStatus.ACTIVE,
      paddleSubscriptionId: "sub_1",
      paddlePriceId: "pri_monthly",
      planKey: "monthly",
    })
    expect((create.currentPeriodEnd as Date).toISOString()).toBe(
      "2026-02-01T00:00:00.000Z"
    )
    expect(update).toMatchObject({ status: SubscriptionStatus.ACTIVE })
  })

  it("reads userId (camelCase) from custom_data", async () => {
    await syncSubscriptionFromPaddleData(
      buildSubscriptionData({ custom_data: { userId: "user_9" } })
    )
    expect(lastUpsert().create.userId).toBe("user_9")
  })

  it("prefers the explicit userId option", async () => {
    await syncSubscriptionFromPaddleData(buildSubscriptionData(), {
      userId: "user_opt",
    })
    expect(lastUpsert().create.userId).toBe("user_opt")
    expect(db.user.findFirst).not.toHaveBeenCalled()
  })

  it("falls back to the user linked to the Paddle customer", async () => {
    db.user.findFirst.mockResolvedValue({ id: "user_linked" })
    await syncSubscriptionFromPaddleData(
      buildSubscriptionData({ custom_data: null })
    )
    expect(db.user.findFirst).toHaveBeenCalledWith({
      where: { paddleCustomerId: "ctm_1" },
      select: { id: true },
    })
    expect(lastUpsert().create.userId).toBe("user_linked")
  })

  it("throws when the user cannot be resolved", async () => {
    db.user.findFirst.mockResolvedValue(null)
    await expect(
      syncSubscriptionFromPaddleData(buildSubscriptionData({ custom_data: {} }))
    ).rejects.toThrow("subscription_webhook_missing_user")
    await expect(
      syncSubscriptionFromPaddleData(
        buildSubscriptionData({ custom_data: {}, customer_id: undefined })
      )
    ).rejects.toThrow("subscription_webhook_missing_user")
    expect(db.subscription.upsert).not.toHaveBeenCalled()
  })

  it("throws when the subscription id is missing", async () => {
    await expect(
      syncSubscriptionFromPaddleData(buildSubscriptionData({ id: undefined }))
    ).rejects.toThrow("subscription_webhook_missing_id")
  })

  it("throws for an unknown Paddle status without writing", async () => {
    await expect(
      syncSubscriptionFromPaddleData(buildSubscriptionData({ status: "weird" }))
    ).rejects.toThrow("subscription_webhook_unknown_status:weird")
    await expect(
      syncSubscriptionFromPaddleData(buildSubscriptionData({ status: 5 }))
    ).rejects.toThrow("subscription_webhook_unknown_status:")
    expect(db.subscription.upsert).not.toHaveBeenCalled()
  })

  it.each([
    ["trialing", SubscriptionStatus.TRIALING],
    ["active", SubscriptionStatus.ACTIVE],
    ["past_due", SubscriptionStatus.PAST_DUE],
    ["paused", SubscriptionStatus.PAUSED],
    ["canceled", SubscriptionStatus.CANCELED],
  ])("maps Paddle status %s", async (paddleStatus, expected) => {
    await syncSubscriptionFromPaddleData(
      buildSubscriptionData({ status: paddleStatus })
    )
    expect(lastUpsert().create.status).toBe(expected)
  })

  it("records the trial end from a recurring item", async () => {
    await syncSubscriptionFromPaddleData(
      buildSubscriptionData({
        status: "trialing",
        items: [
          {
            recurring: true,
            price_id: "pri_yearly",
            trial_dates: { ends_at: "2026-01-15T00:00:00Z" },
          },
        ],
      })
    )
    const { create } = lastUpsert()
    expect(create.status).toBe(SubscriptionStatus.TRIALING)
    expect((create.trialEndsAt as Date).toISOString()).toBe(
      "2026-01-15T00:00:00.000Z"
    )
    expect(create.planKey).toBe("yearly")
  })

  it("ignores trial dates on non-recurring or malformed items", async () => {
    await syncSubscriptionFromPaddleData(
      buildSubscriptionData({
        items: [
          "junk",
          {
            recurring: false,
            trial_dates: { ends_at: "2026-01-15T00:00:00Z" },
          },
          { recurring: true, trial_dates: "bad" },
          { recurring: true, trial_dates: { ends_at: "not a date" } },
          { recurring: true, price: { id: "pri_monthly" } },
        ],
      })
    )
    const { create } = lastUpsert()
    expect(create.trialEndsAt).toBeNull()
    expect(create.paddlePriceId).toBe("pri_monthly")
  })

  it("falls back to any priced item when none is marked recurring", async () => {
    await syncSubscriptionFromPaddleData(
      buildSubscriptionData({
        items: ["junk", { price: { id: "pri_yearly" } }],
      })
    )
    expect(lastUpsert().create).toMatchObject({
      paddlePriceId: "pri_yearly",
      planKey: "yearly",
    })
  })

  it("stores no price when items are absent or unpriced", async () => {
    await syncSubscriptionFromPaddleData(
      buildSubscriptionData({ items: undefined })
    )
    expect(lastUpsert().create.paddlePriceId).toBeNull()
    await syncSubscriptionFromPaddleData(buildSubscriptionData({ items: [{}] }))
    expect(lastUpsert().create.paddlePriceId).toBeNull()
  })

  it("leaves the plan empty for an unknown price id", async () => {
    await syncSubscriptionFromPaddleData(
      buildSubscriptionData({
        items: [{ recurring: true, price_id: "pri_unknown" }],
      })
    )
    const { create, update } = lastUpsert()
    expect(create.planKey).toBeUndefined()
    expect(update.planKey).toBeUndefined()
    expect(create.paddlePriceId).toBe("pri_unknown")
  })

  it("uses next_billed_at when there is no billing period", async () => {
    await syncSubscriptionFromPaddleData(
      buildSubscriptionData({
        current_billing_period: null,
        next_billed_at: "2026-03-01T00:00:00Z",
      })
    )
    expect((lastUpsert().create.currentPeriodEnd as Date).toISOString()).toBe(
      "2026-03-01T00:00:00.000Z"
    )
  })

  it("records canceled_at and skips the customer link without a customer id", async () => {
    await syncSubscriptionFromPaddleData(
      buildSubscriptionData({
        status: "canceled",
        customer_id: undefined,
        canceled_at: "2026-01-20T00:00:00Z",
        current_billing_period: { ends_at: "garbage" },
        next_billed_at: null,
      })
    )
    expect(db.user.update).not.toHaveBeenCalled()
    const { create } = lastUpsert()
    expect((create.canceledAt as Date).toISOString()).toBe(
      "2026-01-20T00:00:00.000Z"
    )
    expect(create.currentPeriodEnd).toBeNull()
  })
})

describe("handleSubscriptionEvent", () => {
  it.each([
    "subscription.created",
    "subscription.updated",
    "subscription.canceled",
    "subscription.past_due",
    "subscription.paused",
  ] as const)("syncs state for %s", async (type) => {
    await handleSubscriptionEvent(
      buildWebhookEvent(type, buildSubscriptionData()) as never
    )
    expect(db.subscription.upsert).toHaveBeenCalledTimes(1)
  })
})

describe("handleTransactionCompleted", () => {
  it("ignores non-object data", async () => {
    await handleTransactionCompleted("nope")
    expect(db.subscription.upsert).not.toHaveBeenCalled()
  })

  it("throws when no user can be resolved", async () => {
    db.user.findFirst.mockResolvedValue(null)
    await expect(
      handleTransactionCompleted(buildTransactionData({ custom_data: null }))
    ).rejects.toThrow("transaction_completed_missing_user")
    await expect(
      handleTransactionCompleted(
        buildTransactionData({ custom_data: null, customer_id: undefined })
      )
    ).rejects.toThrow("transaction_completed_missing_user")
  })

  it("resolves the user through the Paddle customer", async () => {
    db.user.findFirst.mockResolvedValue({ id: "user_linked" })
    await handleTransactionCompleted(
      buildTransactionData({ custom_data: undefined })
    )
    expect(db.subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user_linked" } })
    )
  })

  it("links the customer but does nothing else for a recurring price", async () => {
    await handleTransactionCompleted(
      buildTransactionData({
        items: [{ price: { id: "pri_monthly" } }],
      })
    )
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: { paddleCustomerId: "ctm_1" },
    })
    expect(db.subscription.upsert).not.toHaveBeenCalled()
  })

  it("does nothing for items without a price", async () => {
    await handleTransactionCompleted(
      buildTransactionData({ items: ["junk", {}], customer_id: undefined })
    )
    await handleTransactionCompleted(buildTransactionData({ items: undefined }))
    expect(db.subscription.upsert).not.toHaveBeenCalled()
  })

  it("grants lifetime access for the lifetime price", async () => {
    await handleTransactionCompleted(buildTransactionData())
    expect(db.subscription.upsert).toHaveBeenCalledWith({
      where: { userId: "user_1" },
      create: {
        userId: "user_1",
        status: SubscriptionStatus.LIFETIME,
        paddleSubscriptionId: null,
        paddlePriceId: "pri_lifetime",
        planKey: "lifetime_beta",
      },
      update: {
        status: SubscriptionStatus.LIFETIME,
        paddlePriceId: "pri_lifetime",
        planKey: "lifetime_beta",
        paddleSubscriptionId: null,
      },
    })
    expect(db.subscription.count).not.toHaveBeenCalled()
  })

  it("replaces a recurring subscription when the user buys lifetime", async () => {
    await handleTransactionCompleted(buildTransactionData())
    expect(lastUpsert().update.paddleSubscriptionId).toBeNull()
    expect(lastUpsert().update.status).toBe(SubscriptionStatus.LIFETIME)
  })

  it("rejects a lifetime purchase after the deadline", async () => {
    vi.stubEnv("LIFETIME_OFFER_DEADLINE", "2026-06-01T00:00:00Z")
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-01T00:00:01Z"))
    await expect(
      handleTransactionCompleted(buildTransactionData())
    ).rejects.toThrow("lifetime_offer_deadline_passed")
    expect(db.subscription.upsert).not.toHaveBeenCalled()
  })

  it("accepts a lifetime purchase exactly at the deadline", async () => {
    vi.stubEnv("LIFETIME_OFFER_DEADLINE", "2026-06-01T00:00:00Z")
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-01T00:00:00Z"))
    await handleTransactionCompleted(buildTransactionData())
    expect(db.subscription.upsert).toHaveBeenCalled()
  })

  it("rejects a lifetime purchase once the seat cap is reached", async () => {
    vi.stubEnv("LIFETIME_OFFER_SEAT_CAP", "10")
    db.subscription.count.mockResolvedValue(10)
    await expect(
      handleTransactionCompleted(buildTransactionData())
    ).rejects.toThrow("lifetime_offer_seat_cap_reached")
    expect(db.subscription.count).toHaveBeenCalledWith({
      where: { status: SubscriptionStatus.LIFETIME, planKey: "lifetime_beta" },
    })
    expect(db.subscription.upsert).not.toHaveBeenCalled()
  })

  it("accepts a lifetime purchase while seats remain", async () => {
    vi.stubEnv("LIFETIME_OFFER_SEAT_CAP", "10")
    db.subscription.count.mockResolvedValue(9)
    await handleTransactionCompleted(buildTransactionData())
    expect(db.subscription.upsert).toHaveBeenCalledTimes(1)
  })
})

describe("handleAdjustmentCreated", () => {
  function lifetimeUser() {
    db.user.findFirst.mockResolvedValue({ id: "user_1" })
    db.subscription.findUnique.mockResolvedValue({
      id: "sub_row",
      status: SubscriptionStatus.LIFETIME,
    })
  }

  it("ignores non-object data and unapproved adjustments", async () => {
    await handleAdjustmentCreated(null)
    await handleAdjustmentCreated(
      buildAdjustmentData({ status: "pending_approval" })
    )
    await handleAdjustmentCreated(buildAdjustmentData({ status: undefined }))
    expect(db.user.findFirst).not.toHaveBeenCalled()
  })

  it("ignores adjustments without a customer or matching user", async () => {
    await handleAdjustmentCreated(
      buildAdjustmentData({ customer_id: undefined })
    )
    expect(db.user.findFirst).not.toHaveBeenCalled()
    db.user.findFirst.mockResolvedValue(null)
    await handleAdjustmentCreated(buildAdjustmentData())
    expect(db.subscription.findUnique).not.toHaveBeenCalled()
  })

  it("leaves non-lifetime subscriptions untouched", async () => {
    db.user.findFirst.mockResolvedValue({ id: "user_1" })
    db.subscription.findUnique.mockResolvedValue({
      id: "sub_row",
      status: SubscriptionStatus.ACTIVE,
    })
    await handleAdjustmentCreated(buildAdjustmentData())
    db.subscription.findUnique.mockResolvedValue(null)
    await handleAdjustmentCreated(buildAdjustmentData())
    expect(db.subscription.update).not.toHaveBeenCalled()
  })

  it("revokes lifetime access on a full refund and audits it", async () => {
    lifetimeUser()
    await handleAdjustmentCreated(buildAdjustmentData())
    expect(db.subscription.update).toHaveBeenCalledWith({
      where: { userId: "user_1" },
      data: {
        status: SubscriptionStatus.CANCELED,
        canceledAt: expect.any(Date),
      },
    })
    expect(db.adminActivity.create).toHaveBeenCalledWith({
      data: {
        userId: "user_1",
        action: "paddle_lifetime_revoked",
        targetType: "subscription",
        targetId: "sub_row",
        details: { reason: "refund" },
      },
    })
  })

  it("revokes lifetime access on a chargeback", async () => {
    lifetimeUser()
    await handleAdjustmentCreated(
      buildAdjustmentData({ action: "chargeback", items: [] })
    )
    expect(db.subscription.update).toHaveBeenCalledTimes(1)
  })

  it.each([
    ["a partial refund", { items: [{ type: "partial" }] }],
    [
      "a mix of full and partial items",
      { items: [{ type: "full" }, { type: "partial" }] },
    ],
    ["a refund without items", { items: [] }],
    ["a refund with non-array items", { items: "x" }],
    ["a credit action", { action: "credit" }],
  ])("keeps lifetime access for %s", async (_label, overrides) => {
    lifetimeUser()
    await handleAdjustmentCreated(buildAdjustmentData(overrides))
    expect(db.subscription.update).not.toHaveBeenCalled()
    expect(db.adminActivity.create).not.toHaveBeenCalled()
  })

  it("treats a missing action as no refund", async () => {
    lifetimeUser()
    await handleAdjustmentCreated(buildAdjustmentData({ action: undefined }))
    expect(db.subscription.update).not.toHaveBeenCalled()
  })
})

describe("redactWebhookPayload", () => {
  it("passes through non-object payloads", () => {
    expect(redactWebhookPayload("x")).toBe("x")
    expect(redactWebhookPayload(null)).toBeNull()
  })

  it("redacts data that is not an object", () => {
    expect(redactWebhookPayload({ event_id: "e", data: "secret" })).toEqual({
      event_id: "e",
      data: "[redacted]",
    })
  })

  it("redacts billing details without mutating the input", () => {
    const input = {
      event_id: "e",
      data: { id: "txn_1", billing_details: { email: "a@b.c" } },
    }
    const out = redactWebhookPayload(input) as typeof input
    expect(out.data.billing_details).toBe("[redacted]")
    expect(out.data.id).toBe("txn_1")
    expect(input.data.billing_details).toEqual({ email: "a@b.c" })
  })

  it("keeps data without billing details as-is", () => {
    const input = { event_id: "e", data: { id: "x" } }
    expect(redactWebhookPayload(input)).toEqual(input)
  })
})

describe("processPaddleWebhookEvent", () => {
  const envelope = buildWebhookEvent(
    "subscription.created",
    buildSubscriptionData()
  ) as never

  it("stores, dispatches and marks the event processed", async () => {
    const result = await processPaddleWebhookEvent(envelope)
    expect(result).toEqual({ duplicate: false })
    expect(db.paddleWebhookEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventId: "evt_1",
        eventType: "subscription.created",
      }),
    })
    expect(db.subscription.upsert).toHaveBeenCalledTimes(1)
    expect(db.paddleWebhookEvent.update).toHaveBeenCalledWith({
      where: { eventId: "evt_1" },
      data: { processedAt: expect.any(Date), error: null },
    })
  })

  it("treats a unique violation as a duplicate and does no work", async () => {
    db.paddleWebhookEvent.create.mockRejectedValue({ code: "P2002" })
    const result = await processPaddleWebhookEvent(envelope)
    expect(result).toEqual({ duplicate: true })
    expect(db.subscription.upsert).not.toHaveBeenCalled()
    expect(db.paddleWebhookEvent.update).not.toHaveBeenCalled()
    expect(db.adminActivity.create).not.toHaveBeenCalled()
  })

  it("rethrows other storage errors without dispatching", async () => {
    db.paddleWebhookEvent.create.mockRejectedValue(new Error("db down"))
    await expect(processPaddleWebhookEvent(envelope)).rejects.toThrow("db down")
    db.paddleWebhookEvent.create.mockRejectedValue("string error")
    await expect(processPaddleWebhookEvent(envelope)).rejects.toBe(
      "string error"
    )
    expect(db.subscription.upsert).not.toHaveBeenCalled()
  })

  it("records the failure and rethrows when dispatch fails", async () => {
    db.subscription.upsert.mockRejectedValue(new Error("boom"))
    await expect(processPaddleWebhookEvent(envelope)).rejects.toThrow("boom")
    expect(db.paddleWebhookEvent.update).toHaveBeenCalledWith({
      where: { eventId: "evt_1" },
      data: { error: "boom", processedAt: expect.any(Date) },
    })
  })

  it("stringifies non-Error failures", async () => {
    db.subscription.upsert.mockRejectedValue("plain")
    await expect(processPaddleWebhookEvent(envelope)).rejects.toBe("plain")
    expect(db.paddleWebhookEvent.update).toHaveBeenCalledWith({
      where: { eventId: "evt_1" },
      data: { error: "plain", processedAt: expect.any(Date) },
    })
  })

  it("dispatches transaction and adjustment events", async () => {
    await processPaddleWebhookEvent(
      buildWebhookEvent(
        "transaction.completed",
        buildTransactionData()
      ) as never
    )
    expect(db.subscription.upsert).toHaveBeenCalledTimes(1)

    db.user.findFirst.mockResolvedValue({ id: "user_1" })
    db.subscription.findUnique.mockResolvedValue({
      id: "sub_row",
      status: SubscriptionStatus.LIFETIME,
    })
    await processPaddleWebhookEvent(
      buildWebhookEvent(
        "adjustment.created",
        buildAdjustmentData(),
        "evt_2"
      ) as never
    )
    expect(db.subscription.update).toHaveBeenCalledTimes(1)
  })
})

describe("reprocessWebhookEvent", () => {
  const row = {
    id: "row_1",
    eventId: "evt_1",
    eventType: "subscription.updated",
    payload: { data: buildSubscriptionData({ status: "trialing" }) },
  }

  it("re-dispatches a stored event without inserting it again", async () => {
    await reprocessWebhookEvent(row)
    expect(db.paddleWebhookEvent.create).not.toHaveBeenCalled()
    expect(db.paddleWebhookEvent.update).toHaveBeenNthCalledWith(1, {
      where: { id: "row_1" },
      data: { lastRetryAt: expect.any(Date), retryCount: { increment: 1 } },
    })
    expect(db.subscription.upsert).toHaveBeenCalledTimes(1)
    expect(db.paddleWebhookEvent.update).toHaveBeenNthCalledWith(2, {
      where: { id: "row_1" },
      data: { processedAt: expect.any(Date), error: null },
    })
  })

  it("moves a trialing subscription to active when replayed with new state", async () => {
    await reprocessWebhookEvent({
      ...row,
      payload: { data: buildSubscriptionData({ status: "active" }) },
    })
    expect(lastUpsert().update.status).toBe(SubscriptionStatus.ACTIVE)
  })

  it("rejects a stored payload that is not an object", async () => {
    await expect(
      reprocessWebhookEvent({ ...row, payload: "x" })
    ).rejects.toThrow("invalid_stored_payload")
    expect(db.paddleWebhookEvent.update).not.toHaveBeenCalled()
  })

  it("rejects a stored event type that is no longer valid", async () => {
    await expect(
      reprocessWebhookEvent({ ...row, eventType: "customer.created" })
    ).rejects.toThrow(/invalid_stored_envelope/)
    expect(db.paddleWebhookEvent.update).not.toHaveBeenCalled()
  })

  it("counts the retry even when the handler fails again", async () => {
    db.subscription.upsert.mockRejectedValue(new Error("still broken"))
    await expect(reprocessWebhookEvent(row)).rejects.toThrow("still broken")
    expect(db.paddleWebhookEvent.update).toHaveBeenCalledTimes(1)
  })
})
