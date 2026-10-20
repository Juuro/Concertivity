import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SubscriptionStatus } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { stubPaddleEnv, type PrismaMock } from "@/test-utils/paddle"
import { getCustomerPortalSessionUrl } from "./client"
import { resetPaddleConfigCacheForTests } from "./config"
import {
  getPricingBillingHint,
  getSubscriptionSummary,
  isUserSuperfan,
} from "./entitlement"
import { ensureSubscriptionSyncedFromPaddle } from "./subscription-sync"

vi.mock("@/lib/prisma", async () => {
  const { makePrismaMock } = await import("@/test-utils/paddle")
  return { prisma: makePrismaMock() }
})
vi.mock("./client", () => ({ getCustomerPortalSessionUrl: vi.fn() }))
vi.mock("./subscription-sync", () => ({
  ensureSubscriptionSyncedFromPaddle: vi.fn(),
}))

const db = prisma as unknown as PrismaMock
const portal = vi.mocked(getCustomerPortalSessionUrl)
const ensureSynced = vi.mocked(ensureSubscriptionSyncedFromPaddle)

beforeEach(() => {
  vi.resetAllMocks()
  resetPaddleConfigCacheForTests()
  stubPaddleEnv()
})

afterEach(() => {
  vi.unstubAllEnvs()
  resetPaddleConfigCacheForTests()
})

describe("isUserSuperfan", () => {
  it.each([
    [SubscriptionStatus.TRIALING, true],
    [SubscriptionStatus.ACTIVE, true],
    [SubscriptionStatus.PAST_DUE, true],
    [SubscriptionStatus.PAUSED, true],
    [SubscriptionStatus.LIFETIME, true],
    [SubscriptionStatus.CANCELED, false],
  ])("status %s -> %s", async (status, expected) => {
    db.subscription.findUnique.mockResolvedValue({ status })
    expect(await isUserSuperfan("user_1")).toBe(expected)
  })

  it("is false without a subscription row", async () => {
    db.subscription.findUnique.mockResolvedValue(null)
    expect(await isUserSuperfan("user_1")).toBe(false)
  })

  it("syncs from Paddle before reading and scopes the lookup to the user", async () => {
    db.subscription.findUnique.mockResolvedValue(null)
    await isUserSuperfan("user_1")
    expect(ensureSynced).toHaveBeenCalledWith("user_1")
    expect(db.subscription.findUnique).toHaveBeenCalledWith({
      where: { userId: "user_1" },
      select: { status: true },
    })
  })
})

describe("getPricingBillingHint", () => {
  it("is null without a subscription", async () => {
    db.subscription.findUnique.mockResolvedValue(null)
    expect(await getPricingBillingHint("user_1")).toBeNull()
    expect(ensureSynced).toHaveBeenCalledWith("user_1")
  })

  it("uses the stored plan key", async () => {
    db.subscription.findUnique.mockResolvedValue({
      planKey: "yearly",
      status: SubscriptionStatus.ACTIVE,
      paddlePriceId: null,
    })
    expect(await getPricingBillingHint("user_1")).toEqual({
      planKey: "yearly",
      isPremium: true,
    })
  })

  it("derives the plan from the price id when the key is missing", async () => {
    db.subscription.findUnique.mockResolvedValue({
      planKey: null,
      status: SubscriptionStatus.CANCELED,
      paddlePriceId: "pri_monthly",
    })
    expect(await getPricingBillingHint("user_1")).toEqual({
      planKey: "monthly",
      isPremium: false,
    })
  })

  it("has no plan for an unknown price id, a missing price, or no config", async () => {
    db.subscription.findUnique.mockResolvedValue({
      planKey: null,
      status: SubscriptionStatus.ACTIVE,
      paddlePriceId: "pri_other",
    })
    expect((await getPricingBillingHint("user_1"))?.planKey).toBeNull()

    db.subscription.findUnique.mockResolvedValue({
      planKey: null,
      status: SubscriptionStatus.ACTIVE,
      paddlePriceId: null,
    })
    expect((await getPricingBillingHint("user_1"))?.planKey).toBeNull()

    vi.stubEnv("PADDLE_API_KEY", "")
    resetPaddleConfigCacheForTests()
    db.subscription.findUnique.mockResolvedValue({
      planKey: null,
      status: SubscriptionStatus.ACTIVE,
      paddlePriceId: "pri_monthly",
    })
    expect((await getPricingBillingHint("user_1"))?.planKey).toBeNull()
  })
})

describe("getSubscriptionSummary", () => {
  const periodEnd = new Date("2026-02-01T00:00:00Z")
  const trialEnd = new Date("2026-01-15T00:00:00Z")

  function userWith(sub: Record<string, unknown> | null, extra = {}) {
    db.user.findUnique.mockResolvedValue({
      id: "user_1",
      paddleCustomerId: "ctm_1",
      subscription: sub && {
        status: SubscriptionStatus.ACTIVE,
        planKey: "monthly",
        paddlePriceId: "pri_monthly",
        paddleSubscriptionId: "sub_1",
        currentPeriodEnd: periodEnd,
        trialEndsAt: null,
        ...sub,
      },
      ...extra,
    })
  }

  it("is null when the user or subscription is missing", async () => {
    db.user.findUnique.mockResolvedValue(null)
    expect(await getSubscriptionSummary("user_1")).toBeNull()
    userWith(null)
    expect(await getSubscriptionSummary("user_1")).toBeNull()
  })

  it("returns plan, dates and the portal link", async () => {
    userWith({ status: SubscriptionStatus.TRIALING, trialEndsAt: trialEnd })
    portal.mockResolvedValue("https://portal.example/overview")
    expect(await getSubscriptionSummary("user_1")).toEqual({
      status: SubscriptionStatus.TRIALING,
      planKey: "monthly",
      currentPeriodEnd: periodEnd.toISOString(),
      trialEndsAt: trialEnd.toISOString(),
      manageBillingUrl: "https://portal.example/overview",
      portalTimedOut: false,
    })
    expect(portal).toHaveBeenCalledWith("ctm_1", ["sub_1"], 3000)
  })

  it("handles missing dates", async () => {
    userWith({ currentPeriodEnd: null })
    portal.mockResolvedValue("https://portal.example")
    const s = await getSubscriptionSummary("user_1")
    expect(s?.currentPeriodEnd).toBeNull()
    expect(s?.trialEndsAt).toBeNull()
  })

  it("flags a timeout when the portal call fails", async () => {
    userWith({})
    portal.mockRejectedValue(new Error("Paddle SDK call exceeded 3000ms"))
    const s = await getSubscriptionSummary("user_1")
    expect(s).toMatchObject({ manageBillingUrl: null, portalTimedOut: true })
  })

  it("flags a timeout when the portal returns no url", async () => {
    userWith({})
    portal.mockResolvedValue("")
    const s = await getSubscriptionSummary("user_1")
    expect(s).toMatchObject({ manageBillingUrl: "", portalTimedOut: true })
  })

  it("skips the portal when asked to", async () => {
    userWith({})
    const s = await getSubscriptionSummary("user_1", {
      includePortalSession: false,
    })
    expect(portal).not.toHaveBeenCalled()
    expect(s).toMatchObject({ manageBillingUrl: null, portalTimedOut: false })
  })

  it.each([
    ["lifetime plan", { status: SubscriptionStatus.LIFETIME }, {}],
    ["no Paddle customer", {}, { paddleCustomerId: null }],
    ["no Paddle subscription", { paddleSubscriptionId: null }, {}],
  ])("has no portal for %s", async (_label, sub, extra) => {
    userWith(sub, extra)
    const s = await getSubscriptionSummary("user_1")
    expect(portal).not.toHaveBeenCalled()
    expect(s).toMatchObject({ manageBillingUrl: null, portalTimedOut: false })
  })

  it("syncs from Paddle first", async () => {
    userWith(null)
    await getSubscriptionSummary("user_1")
    expect(ensureSynced).toHaveBeenCalledWith("user_1")
  })
})
