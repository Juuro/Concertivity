import { describe, expect, it } from "vitest"
import {
  paddleCheckoutBodySchema,
  paddleSyncBodySchema,
  paddleWebhookEnvelope,
} from "./paddle"

const EVENT_TYPES = [
  "subscription.created",
  "subscription.updated",
  "subscription.canceled",
  "subscription.past_due",
  "subscription.paused",
  "transaction.completed",
  "adjustment.created",
] as const

describe("paddleWebhookEnvelope", () => {
  it.each(EVENT_TYPES)("accepts %s", (event_type) => {
    const r = paddleWebhookEnvelope.safeParse({
      event_id: "evt_1",
      event_type,
      data: { id: "x" },
    })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.event_type).toBe(event_type)
  })

  it.each([null, "text", 5, [], { nested: { a: 1 } }])(
    "accepts any data shape (%j)",
    (data) => {
      expect(
        paddleWebhookEnvelope.safeParse({
          event_id: "evt_1",
          event_type: "subscription.created",
          data,
        }).success
      ).toBe(true)
    }
  )

  it("requires the data key to be present", () => {
    expect(
      paddleWebhookEnvelope.safeParse({
        event_id: "evt_1",
        event_type: "subscription.created",
      }).success
    ).toBe(false)
  })

  it("rejects an unknown event type", () => {
    expect(
      paddleWebhookEnvelope.safeParse({
        event_id: "evt_1",
        event_type: "customer.created",
        data: {},
      }).success
    ).toBe(false)
  })

  it("rejects a missing or empty event_id", () => {
    expect(
      paddleWebhookEnvelope.safeParse({
        event_type: "subscription.created",
        data: {},
      }).success
    ).toBe(false)
    expect(
      paddleWebhookEnvelope.safeParse({
        event_id: "",
        event_type: "subscription.created",
        data: {},
      }).success
    ).toBe(false)
  })

  it("rejects a missing event_type and non-object input", () => {
    expect(paddleWebhookEnvelope.safeParse({ event_id: "evt_1" }).success).toBe(
      false
    )
    expect(paddleWebhookEnvelope.safeParse("nope").success).toBe(false)
    expect(paddleWebhookEnvelope.safeParse(null).success).toBe(false)
  })
})

describe("paddleCheckoutBodySchema", () => {
  it.each(["monthly", "yearly", "lifetime_beta"])("accepts %s", (planKey) => {
    expect(paddleCheckoutBodySchema.safeParse({ planKey }).success).toBe(true)
  })

  it("rejects unknown or missing plans", () => {
    expect(
      paddleCheckoutBodySchema.safeParse({ planKey: "weekly" }).success
    ).toBe(false)
    expect(paddleCheckoutBodySchema.safeParse({}).success).toBe(false)
  })
})

describe("paddleSyncBodySchema", () => {
  it("accepts an empty body and a transaction id", () => {
    expect(paddleSyncBodySchema.safeParse({}).success).toBe(true)
    expect(
      paddleSyncBodySchema.safeParse({ transactionId: "txn_1" }).success
    ).toBe(true)
  })

  it("rejects an empty or non-string transaction id", () => {
    expect(paddleSyncBodySchema.safeParse({ transactionId: "" }).success).toBe(
      false
    )
    expect(paddleSyncBodySchema.safeParse({ transactionId: 5 }).success).toBe(
      false
    )
  })
})
