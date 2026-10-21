import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SubscriptionStatus } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import type { PrismaMock } from "@/test-utils/paddle"
import { anonymiseCustomer, cancelSubscription } from "./client"
import { erasePaddleDataForUser, getSubscriptionExportData } from "./gdpr"

vi.mock("@/lib/prisma", async () => {
  const { makePrismaMock } = await import("@/test-utils/paddle")
  return { prisma: makePrismaMock() }
})
vi.mock("./client", () => ({
  anonymiseCustomer: vi.fn(),
  cancelSubscription: vi.fn(),
}))

const db = prisma as unknown as PrismaMock
const cancel = vi.mocked(cancelSubscription)
const anonymise = vi.mocked(anonymiseCustomer)

// `deleteMany` is not part of the shared mock surface.
const deleteMany = vi.fn()
;(db.subscription as Record<string, unknown>).deleteMany = deleteMany

function withPaddleUser(sub: Record<string, unknown> | null) {
  db.user.findUnique.mockResolvedValue({
    id: "user_1",
    paddleCustomerId: "ctm_1",
  })
  db.subscription.findUnique.mockResolvedValue(sub)
}

const activeSub = {
  id: "row_1",
  status: SubscriptionStatus.ACTIVE,
  paddleSubscriptionId: "sub_1",
}

async function erase() {
  const p = erasePaddleDataForUser("user_1")
  await vi.runAllTimersAsync()
  return p
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("erasePaddleDataForUser", () => {
  it("only removes the local mirror for users without a Paddle customer", async () => {
    db.user.findUnique.mockResolvedValue({
      id: "user_1",
      paddleCustomerId: null,
    })
    await erase()
    expect(deleteMany).toHaveBeenCalledWith({ where: { userId: "user_1" } })
    expect(cancel).not.toHaveBeenCalled()
    expect(anonymise).not.toHaveBeenCalled()
    expect(db.adminActivity.create).not.toHaveBeenCalled()
  })

  it("handles an unknown user the same way", async () => {
    db.user.findUnique.mockResolvedValue(null)
    await erase()
    expect(deleteMany).toHaveBeenCalledTimes(1)
    expect(anonymise).not.toHaveBeenCalled()
  })

  it("cancels a trialing subscription immediately so no trial charge follows, before deleting", async () => {
    withPaddleUser({ ...activeSub, status: SubscriptionStatus.TRIALING })
    const order: string[] = []
    cancel.mockImplementation(async () => {
      order.push("cancel")
      return undefined as never
    })
    deleteMany.mockImplementation(async () => {
      order.push("delete")
    })
    await erase()
    expect(cancel).toHaveBeenCalledWith("sub_1", {
      effectiveFrom: "immediately",
    })
    expect(order).toEqual(["cancel", "delete"])
    expect(anonymise).toHaveBeenCalledTimes(1)
  })

  it("cancels the subscription before anonymising, then deletes and audits", async () => {
    withPaddleUser(activeSub)
    const order: string[] = []
    cancel.mockImplementation(async () => {
      order.push("cancel")
      return undefined as never
    })
    anonymise.mockImplementation(async () => {
      order.push("anonymise")
      return undefined as never
    })
    deleteMany.mockImplementation(async () => {
      order.push("delete")
    })

    await erase()

    expect(order).toEqual(["cancel", "anonymise", "delete"])
    expect(cancel).toHaveBeenCalledWith("sub_1", {
      effectiveFrom: "immediately",
    })
    expect(anonymise).toHaveBeenCalledWith(
      "ctm_1",
      expect.stringMatching(/^erased-[0-9a-f]{24}@noemail\.invalid$/)
    )
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: { paddleCustomerId: null },
    })
    expect(db.adminActivity.create).toHaveBeenCalledWith({
      data: {
        userId: "user_1",
        action: "paddle_erasure",
        targetType: "subscription",
        targetId: "ctm_1",
        details: { paddleCustomerId: "ctm_1" },
      },
    })
  })

  it("uses a fresh placeholder email each time", async () => {
    withPaddleUser(null)
    await erase()
    await erase()
    const [a, b] = anonymise.mock.calls.map((c) => c[1])
    expect(a).not.toBe(b)
  })

  it.each([
    ["canceled", { status: SubscriptionStatus.CANCELED }],
    ["lifetime", { status: SubscriptionStatus.LIFETIME }],
    ["without a Paddle subscription id", { paddleSubscriptionId: null }],
  ])("does not cancel a %s subscription", async (_label, over) => {
    withPaddleUser({ ...activeSub, ...over })
    await erase()
    expect(cancel).not.toHaveBeenCalled()
    expect(anonymise).toHaveBeenCalledTimes(1)
  })

  it("retries a failing cancellation up to three times, then still erases", async () => {
    withPaddleUser(activeSub)
    cancel.mockRejectedValue(new Error("5xx"))
    await erase()
    expect(cancel).toHaveBeenCalledTimes(3)
    expect(anonymise).toHaveBeenCalledTimes(1)
    expect(deleteMany).toHaveBeenCalledTimes(1)
  })

  it("stops retrying after a successful attempt", async () => {
    withPaddleUser(activeSub)
    cancel
      .mockRejectedValueOnce(new Error("blip"))
      .mockResolvedValueOnce({} as never)
    await erase()
    expect(cancel).toHaveBeenCalledTimes(2)
  })

  it("treats anonymisation as best effort and still removes local data", async () => {
    withPaddleUser(activeSub)
    anonymise.mockRejectedValue(new Error("paddle down"))
    await erase()
    expect(deleteMany).toHaveBeenCalledTimes(1)
    expect(db.user.update).toHaveBeenCalledTimes(1)
    expect(db.adminActivity.create).toHaveBeenCalledTimes(1)
  })

  it("propagates local database failures", async () => {
    withPaddleUser(null)
    deleteMany.mockRejectedValue(new Error("db down"))
    const p = erasePaddleDataForUser("user_1")
    const assertion = expect(p).rejects.toThrow("db down")
    await vi.runAllTimersAsync()
    await assertion
    expect(db.adminActivity.create).not.toHaveBeenCalled()
  })
})

describe("getSubscriptionExportData", () => {
  it("selects only user-facing subscription fields for the user", async () => {
    const row = { status: SubscriptionStatus.ACTIVE, planKey: "monthly" }
    db.subscription.findUnique.mockResolvedValue(row)
    expect(await getSubscriptionExportData("user_1")).toBe(row)
    const arg = db.subscription.findUnique.mock.calls[0]![0] as {
      where: unknown
      select: Record<string, boolean>
    }
    expect(arg.where).toEqual({ userId: "user_1" })
    expect(Object.keys(arg.select).sort()).toEqual(
      [
        "cancelScheduledFor",
        "canceledAt",
        "createdAt",
        "currentPeriodEnd",
        "paddlePriceId",
        "paddleSubscriptionId",
        "planKey",
        "status",
        "trialEndsAt",
        "updatedAt",
      ].sort()
    )
    expect(arg.select).not.toHaveProperty("userId")
  })

  it("returns null when there is no subscription", async () => {
    db.subscription.findUnique.mockResolvedValue(null)
    expect(await getSubscriptionExportData("user_1")).toBeNull()
  })
})
