import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SubscriptionStatus } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import type { PrismaMock } from "@/test-utils/paddle"
import { listCustomerSubscriptions, listCustomersByEmail } from "./client"
import { getLocalTrialEligibility, getTrialEligibility } from "./trial"

vi.mock("@/lib/prisma", async () => {
  const { makePrismaMock } = await import("@/test-utils/paddle")
  return { prisma: makePrismaMock() }
})
vi.mock("./client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./client")>()),
  listCustomerSubscriptions: vi.fn(),
  listCustomersByEmail: vi.fn(),
}))

const db = prisma as unknown as PrismaMock
const listSubs = vi.mocked(listCustomerSubscriptions)
const listCustomers = vi.mocked(listCustomersByEmail)

beforeEach(() => {
  vi.resetAllMocks()
  db.subscription.findUnique.mockResolvedValue(null)
  db.user.findUnique.mockResolvedValue({
    email: "fan@example.com",
    paddleCustomerId: null,
  })
  listCustomers.mockResolvedValue([])
  listSubs.mockResolvedValue([])
})

afterEach(() => {
  vi.useRealTimers()
})

describe("getLocalTrialEligibility", () => {
  it("is eligible with no subscription row and never calls the provider", async () => {
    await expect(getLocalTrialEligibility("user_1")).resolves.toBe(true)
    expect(listCustomers).not.toHaveBeenCalled()
    expect(listSubs).not.toHaveBeenCalled()
  })

  it.each(Object.values(SubscriptionStatus))(
    "is not eligible when a %s row exists",
    async (status) => {
      db.subscription.findUnique.mockResolvedValue({ id: "row_1", status })
      await expect(getLocalTrialEligibility("user_1")).resolves.toBe(false)
    }
  )
})

describe("getTrialEligibility", () => {
  it("is eligible with no row and no provider history", async () => {
    await expect(getTrialEligibility("user_1")).resolves.toBe(true)
    expect(listCustomers).toHaveBeenCalledWith("fan@example.com")
  })

  it("skips the provider when a local row exists", async () => {
    db.subscription.findUnique.mockResolvedValue({ id: "row_1" })
    await expect(getTrialEligibility("user_1")).resolves.toBe(false)
    expect(listCustomers).not.toHaveBeenCalled()
  })

  it("is not eligible when the linked customer had a canceled subscription", async () => {
    db.user.findUnique.mockResolvedValue({
      email: "fan@example.com",
      paddleCustomerId: "ctm_1",
    })
    listSubs.mockResolvedValue([{ id: "sub_old", status: "canceled" }] as never)
    await expect(getTrialEligibility("user_1")).resolves.toBe(false)
    expect(listSubs).toHaveBeenCalledWith("ctm_1")
  })

  it("is not eligible when another customer with the same email has a subscription", async () => {
    listCustomers.mockResolvedValue([{ id: "ctm_a" }, { id: "ctm_b" }] as never)
    listSubs.mockImplementation(async (id: string) =>
      id === "ctm_b" ? ([{ id: "sub_x", status: "active" }] as never) : []
    )
    await expect(getTrialEligibility("user_1")).resolves.toBe(false)
    expect(listSubs).toHaveBeenCalledTimes(2)
  })

  it("checks a linked customer once even if the email lookup returns it", async () => {
    db.user.findUnique.mockResolvedValue({
      email: "fan@example.com",
      paddleCustomerId: "ctm_1",
    })
    listCustomers.mockResolvedValue([{ id: "ctm_1" }] as never)
    await expect(getTrialEligibility("user_1")).resolves.toBe(true)
    expect(listSubs).toHaveBeenCalledTimes(1)
  })

  it("is not eligible for an unknown user", async () => {
    db.user.findUnique.mockResolvedValue(null)
    await expect(getTrialEligibility("ghost")).resolves.toBe(false)
  })

  it("fails closed when the provider call throws", async () => {
    listCustomers.mockRejectedValue(new Error("provider down"))
    await expect(getTrialEligibility("user_1")).resolves.toBe(false)
  })

  it("fails closed when the local subscription lookup throws", async () => {
    db.subscription.findUnique.mockRejectedValue(new Error("db down"))
    await expect(getTrialEligibility("user_1")).resolves.toBe(false)
    expect(listCustomers).not.toHaveBeenCalled()
  })

  it("fails closed when the database lookup throws", async () => {
    db.user.findUnique.mockRejectedValue(new Error("db down"))
    await expect(getTrialEligibility("user_1")).resolves.toBe(false)
  })

  it("fails closed when the provider hangs past 3 seconds", async () => {
    vi.useFakeTimers()
    listCustomers.mockReturnValue(new Promise(() => {}))
    const result = getTrialEligibility("user_1")
    await vi.advanceTimersByTimeAsync(2999)
    let settled = false
    void result.then(() => {
      settled = true
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await expect(result).resolves.toBe(false)
  })
})
