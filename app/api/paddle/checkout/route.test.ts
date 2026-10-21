// @vitest-environment node
import { NextRequest } from "next/server"
import * as Sentry from "@sentry/nextjs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { createCheckoutTransaction } from "@/lib/paddle/client"
import { resetPaddleConfigCacheForTests } from "@/lib/paddle/config"
import { isUserSuperfan } from "@/lib/paddle/entitlement"
import { getTrialEligibility } from "@/lib/paddle/trial"
import {
  makeSession,
  PADDLE_TRIAL_ENV,
  stubPaddleEnv,
  type PrismaMock,
} from "@/test-utils/paddle"
import { POST } from "./route"

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }))
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }))
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn() } } }))
vi.mock("@/lib/prisma", async () => {
  const { makePrismaMock } = await import("@/test-utils/paddle")
  return { prisma: makePrismaMock() }
})
vi.mock("@/lib/paddle/client", () => ({ createCheckoutTransaction: vi.fn() }))
vi.mock("@/lib/paddle/entitlement", () => ({ isUserSuperfan: vi.fn() }))
vi.mock("@/lib/paddle/trial", () => ({ getTrialEligibility: vi.fn() }))

// The route owns a module-level limiter; replace it so tests control the verdict.
const { limiterCheck } = vi.hoisted(() => ({ limiterCheck: vi.fn() }))
vi.mock("@/lib/rateLimit", () => ({
  createRateLimiter: () => ({ check: limiterCheck }),
}))

const db = prisma as unknown as PrismaMock
const getSession = vi.mocked(auth.api.getSession) as unknown as ReturnType<
  typeof vi.fn
>
const createTx = vi.mocked(createCheckoutTransaction)
const superfan = vi.mocked(isUserSuperfan)
const eligible = vi.mocked(getTrialEligibility)

function post(body: unknown, raw = false) {
  return POST(
    new NextRequest("http://localhost/api/paddle/checkout", {
      method: "POST",
      body: raw ? (body as string) : JSON.stringify(body),
    })
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  resetPaddleConfigCacheForTests()
  stubPaddleEnv()
  vi.stubEnv("ENABLE_PAYWALL", "true")
  getSession.mockResolvedValue(makeSession())
  superfan.mockResolvedValue(false)
  limiterCheck.mockReturnValue(true)
  eligible.mockResolvedValue(false)
  db.user.findUnique.mockResolvedValue({
    paddleCustomerId: null,
    currency: "EUR",
  })
  createTx.mockResolvedValue({ id: "txn_1", customerId: "ctm_1" } as never)
})

afterEach(() => {
  vi.unstubAllEnvs()
  resetPaddleConfigCacheForTests()
})

describe("POST /api/paddle/checkout", () => {
  it("is hidden while the paywall flag is off", async () => {
    vi.stubEnv("ENABLE_PAYWALL", "false")
    const res = await post({ planKey: "monthly" })
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: "paywall_disabled" })
    expect(getSession).not.toHaveBeenCalled()
    expect(createTx).not.toHaveBeenCalled()
  })

  it("rejects unauthenticated requests", async () => {
    getSession.mockResolvedValue(null)
    const res = await post({ planKey: "monthly" })
    expect(res.status).toBe(401)
    expect(createTx).not.toHaveBeenCalled()
  })

  it("answers 503 when Paddle is not configured", async () => {
    vi.stubEnv("PADDLE_API_KEY", "")
    const res = await post({ planKey: "monthly" })
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: "paddle_not_configured" })
  })

  it("rejects malformed JSON and invalid bodies without internal detail", async () => {
    const bad = await post("{not json", true)
    expect(bad.status).toBe(400)
    expect(await bad.json()).toEqual({ error: "invalid_json" })

    const invalid = await post({ planKey: "weekly" })
    expect(invalid.status).toBe(400)
    expect(await invalid.json()).toEqual({ error: "invalid_body" })
    expect(createTx).not.toHaveBeenCalled()
  })

  it("answers 409 for a user who already has access and creates nothing", async () => {
    superfan.mockResolvedValue(true)
    const res = await post({ planKey: "yearly" })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: "already_subscribed" })
    expect(superfan).toHaveBeenCalledWith("user_1")
    expect(createTx).not.toHaveBeenCalled()
  })

  it("creates a monthly transaction for the session user only", async () => {
    const res = await post({ planKey: "monthly", userId: "attacker" })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ transactionId: "txn_1", trial: false })
    expect(createTx).toHaveBeenCalledWith({
      items: [{ priceId: "pri_monthly", quantity: 1 }],
      customerId: undefined,
      customData: { user_id: "user_1" },
    })
  })

  it("reuses a known Paddle customer and stores a newly created one", async () => {
    db.user.findUnique.mockResolvedValue({ paddleCustomerId: "ctm_old" })
    createTx.mockResolvedValue({ id: "txn_2", customerId: "ctm_new" } as never)
    await post({ planKey: "yearly" })
    expect(createTx).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [{ priceId: "pri_yearly", quantity: 1 }],
        customerId: "ctm_old",
      })
    )
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: { paddleCustomerId: "ctm_new" },
    })
  })

  it("does not rewrite an unchanged customer or one that is missing", async () => {
    db.user.findUnique.mockResolvedValue({ paddleCustomerId: "ctm_1" })
    await post({ planKey: "monthly" })
    createTx.mockResolvedValue({ id: "txn_3", customerId: null } as never)
    db.user.findUnique.mockResolvedValue(null)
    await post({ planKey: "monthly" })
    expect(db.user.update).not.toHaveBeenCalled()
  })

  it("refuses the lifetime plan once the offer has closed", async () => {
    vi.stubEnv("LIFETIME_OFFER_DEADLINE", "2020-01-01T00:00:00Z")
    const res = await post({ planKey: "lifetime_beta" })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "lifetime_offer_closed" })
    expect(createTx).not.toHaveBeenCalled()
  })

  it("refuses the lifetime plan when sold out", async () => {
    vi.stubEnv("LIFETIME_OFFER_SEAT_CAP", "5")
    db.subscription.count.mockResolvedValue(5)
    const res = await post({ planKey: "lifetime_beta" })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "lifetime_sold_out" })
    expect(createTx).not.toHaveBeenCalled()
  })

  it("sells the lifetime plan while seats remain or no cap is set", async () => {
    vi.stubEnv("LIFETIME_OFFER_SEAT_CAP", "5")
    db.subscription.count.mockResolvedValue(4)
    expect((await post({ planKey: "lifetime_beta" })).status).toBe(200)
    expect(createTx).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [{ priceId: "pri_lifetime", quantity: 1 }],
      })
    )

    vi.unstubAllEnvs()
    stubPaddleEnv()
    vi.stubEnv("ENABLE_PAYWALL", "true")
    resetPaddleConfigCacheForTests()
    db.subscription.count.mockClear()
    expect((await post({ planKey: "lifetime_beta" })).status).toBe(200)
    expect(db.subscription.count).not.toHaveBeenCalled()
  })

  it("reports provider failures safely", async () => {
    const boom = new Error("paddle exploded: secret details")
    createTx.mockRejectedValue(boom)
    const res = await post({ planKey: "monthly" })
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: "checkout_failed" })
    expect(Sentry.captureException).toHaveBeenCalledWith(boom)
  })

  it("answers 429 and calls nothing when the per-user limit is exceeded", async () => {
    limiterCheck.mockReturnValue(false)
    const res = await post({ planKey: "monthly" })
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ error: "rate_limited" })
    expect(limiterCheck).toHaveBeenCalledWith("user_1")
    expect(eligible).not.toHaveBeenCalled()
    expect(createTx).not.toHaveBeenCalled()
  })

  it("does not consume the limit for unauthenticated requests", async () => {
    getSession.mockResolvedValue(null)
    await post({ planKey: "monthly" })
    expect(limiterCheck).not.toHaveBeenCalled()
  })

  describe("14-day trial", () => {
    beforeEach(() => {
      stubPaddleEnv(PADDLE_TRIAL_ENV)
      resetPaddleConfigCacheForTests()
      eligible.mockResolvedValue(true)
    })

    it.each([
      ["monthly", "pri_monthly_trial"],
      ["yearly", "pri_yearly_trial"],
    ] as const)(
      "uses the %s trial price for an eligible user",
      async (plan, priceId) => {
        const res = await post({ planKey: plan })
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({
          transactionId: "txn_1",
          trial: true,
        })
        expect(eligible).toHaveBeenCalledWith("user_1")
        expect(createTx).toHaveBeenCalledWith(
          expect.objectContaining({ items: [{ priceId, quantity: 1 }] })
        )
      }
    )

    it("uses the standard price when no trial price is configured", async () => {
      vi.stubEnv("PADDLE_PRICE_ID_MONTHLY_TRIAL", "")
      resetPaddleConfigCacheForTests()
      const res = await post({ planKey: "monthly" })
      expect(await res.json()).toEqual({ transactionId: "txn_1", trial: false })
      expect(eligible).not.toHaveBeenCalled()
      expect(createTx).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [{ priceId: "pri_monthly", quantity: 1 }],
        })
      )
    })

    it("never gives the lifetime plan a trial and skips the eligibility check", async () => {
      const res = await post({ planKey: "lifetime_beta" })
      expect(await res.json()).toEqual({ transactionId: "txn_1", trial: false })
      expect(eligible).not.toHaveBeenCalled()
      expect(createTx).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [{ priceId: "pri_lifetime", quantity: 1 }],
        })
      )
    })

    it("uses the standard price for an ineligible user (prior or canceled subscription, other customer)", async () => {
      eligible.mockResolvedValue(false)
      const res = await post({ planKey: "monthly" })
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ transactionId: "txn_1", trial: false })
      expect(createTx).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [{ priceId: "pri_monthly", quantity: 1 }],
        })
      )
    })

    it("falls back to the standard price instead of failing when the lookup is unavailable", async () => {
      // getTrialEligibility fails closed and resolves false on provider errors.
      eligible.mockResolvedValue(false)
      const res = await post({ planKey: "yearly" })
      expect(res.status).toBe(200)
      expect((await res.json()).trial).toBe(false)
    })

    it("sells the standard price when eligibility could not be read because the database failed", async () => {
      // getTrialEligibility resolves false (never rejects) on lookup errors.
      eligible.mockResolvedValue(false)
      db.subscription.findUnique.mockRejectedValue(new Error("db down"))
      const res = await post({ planKey: "monthly" })
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ transactionId: "txn_1", trial: false })
      expect(createTx).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [{ priceId: "pri_monthly", quantity: 1 }],
        })
      )
    })

    it("ignores a trial claim sent by the client", async () => {
      eligible.mockResolvedValue(false)
      const res = await post({
        planKey: "monthly",
        trial: true,
        eligible: true,
      })
      expect((await res.json()).trial).toBe(false)
      expect(createTx).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [{ priceId: "pri_monthly", quantity: 1 }],
        })
      )
    })

    it("refuses a user who is already in a trial and creates nothing", async () => {
      superfan.mockResolvedValue(true)
      const res = await post({ planKey: "monthly" })
      expect(res.status).toBe(409)
      expect(await res.json()).toEqual({ error: "already_subscribed" })
      expect(eligible).not.toHaveBeenCalled()
      expect(createTx).not.toHaveBeenCalled()
    })

    it("stays hidden while the paywall flag is off", async () => {
      vi.stubEnv("ENABLE_PAYWALL", "false")
      const res = await post({ planKey: "monthly" })
      expect(res.status).toBe(404)
      expect(eligible).not.toHaveBeenCalled()
    })
  })
})
