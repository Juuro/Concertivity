import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { stubPaddleEnv } from "@/test-utils/paddle"
import { resetPaddleConfigCacheForTests } from "./config"

const sdk = vi.hoisted(() => ({
  ctor: vi.fn(),
  api: {
    transactions: { create: vi.fn(), get: vi.fn() },
    customerPortalSessions: { create: vi.fn() },
    subscriptions: { list: vi.fn(), get: vi.fn(), cancel: vi.fn() },
    customers: { list: vi.fn(), update: vi.fn() },
  },
}))

vi.mock("@paddle/paddle-node-sdk", () => ({
  Environment: { production: "production-url", sandbox: "sandbox-url" },
  Paddle: class {
    constructor(...args: unknown[]) {
      sdk.ctor(...args)
      return sdk.api
    }
  },
}))

import {
  anonymiseCustomer,
  cancelSubscription,
  createCheckoutTransaction,
  getCustomerPortalSessionUrl,
  getPaddleApi,
  getSubscription,
  getTransaction,
  listCustomerSubscriptions,
  listCustomersByEmail,
  rejectAfterMs,
  resetPaddleApiForTests,
} from "./client"

async function* items<T>(...values: T[]) {
  for (const v of values) yield v
}

beforeEach(() => {
  vi.clearAllMocks()
  resetPaddleApiForTests()
  resetPaddleConfigCacheForTests()
  stubPaddleEnv()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
  resetPaddleApiForTests()
  resetPaddleConfigCacheForTests()
})

describe("getPaddleApi", () => {
  it("builds one sandbox client and reuses it", () => {
    const a = getPaddleApi()
    const b = getPaddleApi()
    expect(a).toBe(b)
    expect(sdk.ctor).toHaveBeenCalledTimes(1)
    expect(sdk.ctor).toHaveBeenCalledWith("test-api-key", {
      environment: "sandbox-url",
    })
  })

  it("selects the production environment", () => {
    vi.stubEnv("PADDLE_ENVIRONMENT", "production")
    getPaddleApi()
    expect(sdk.ctor).toHaveBeenCalledWith("test-api-key", {
      environment: "production-url",
    })
  })

  it("builds a new client after a reset", () => {
    getPaddleApi()
    resetPaddleApiForTests()
    getPaddleApi()
    expect(sdk.ctor).toHaveBeenCalledTimes(2)
  })

  it("throws when the configuration is invalid", () => {
    vi.stubEnv("PADDLE_API_KEY", "")
    expect(() => getPaddleApi()).toThrow(/Invalid Paddle configuration/)
  })
})

describe("rejectAfterMs", () => {
  it("rejects after the given delay", async () => {
    vi.useFakeTimers()
    const p = rejectAfterMs(3000)
    const assertion = expect(p).rejects.toThrow(
      "Paddle SDK call exceeded 3000ms"
    )
    await vi.advanceTimersByTimeAsync(2999)
    await vi.advanceTimersByTimeAsync(1)
    await assertion
  })
})

describe("API wrappers", () => {
  it("creates checkout transactions", async () => {
    sdk.api.transactions.create.mockResolvedValue({ id: "txn_1" })
    const body = { items: [{ priceId: "pri_1", quantity: 1 }] }
    expect(await createCheckoutTransaction(body as never)).toEqual({
      id: "txn_1",
    })
    expect(sdk.api.transactions.create).toHaveBeenCalledWith(body)
  })

  it("propagates SDK errors", async () => {
    sdk.api.transactions.create.mockRejectedValue(new Error("bad request"))
    await expect(createCheckoutTransaction({} as never)).rejects.toThrow(
      "bad request"
    )
  })

  it("returns the portal overview url", async () => {
    sdk.api.customerPortalSessions.create.mockResolvedValue({
      urls: { general: { overview: "https://portal/x" } },
    })
    expect(await getCustomerPortalSessionUrl("ctm_1", ["sub_1"], 3000)).toBe(
      "https://portal/x"
    )
    expect(sdk.api.customerPortalSessions.create).toHaveBeenCalledWith(
      "ctm_1",
      ["sub_1"]
    )
  })

  it("returns an empty url when the portal response has none", async () => {
    sdk.api.customerPortalSessions.create.mockResolvedValue({})
    expect(await getCustomerPortalSessionUrl("ctm_1", [], 3000)).toBe("")
  })

  it("times out a slow portal request", async () => {
    vi.useFakeTimers()
    sdk.api.customerPortalSessions.create.mockReturnValue(new Promise(() => {}))
    const p = getCustomerPortalSessionUrl("ctm_1", ["sub_1"], 3000)
    const assertion = expect(p).rejects.toThrow("exceeded 3000ms")
    await vi.advanceTimersByTimeAsync(3000)
    await assertion
  })

  it("collects every page of a customer's subscriptions", async () => {
    sdk.api.subscriptions.list.mockReturnValue(items({ id: "a" }, { id: "b" }))
    expect(await listCustomerSubscriptions("ctm_1")).toEqual([
      { id: "a" },
      { id: "b" },
    ])
    expect(sdk.api.subscriptions.list).toHaveBeenCalledWith({
      customerId: ["ctm_1"],
    })
  })

  it("collects customers by email", async () => {
    sdk.api.customers.list.mockReturnValue(items({ id: "ctm_1" }))
    expect(await listCustomersByEmail("a@b.c")).toEqual([{ id: "ctm_1" }])
    expect(sdk.api.customers.list).toHaveBeenCalledWith({ email: ["a@b.c"] })
  })

  it("gets transactions and subscriptions by id", async () => {
    sdk.api.transactions.get.mockResolvedValue({ id: "txn_1" })
    sdk.api.subscriptions.get.mockResolvedValue({ id: "sub_1" })
    expect(await getTransaction("txn_1")).toEqual({ id: "txn_1" })
    expect(await getSubscription("sub_1")).toEqual({ id: "sub_1" })
    expect(sdk.api.transactions.get).toHaveBeenCalledWith("txn_1")
    expect(sdk.api.subscriptions.get).toHaveBeenCalledWith("sub_1")
  })

  it("cancels with the given body or an empty default", async () => {
    await cancelSubscription("sub_1", { effectiveFrom: "immediately" })
    expect(sdk.api.subscriptions.cancel).toHaveBeenLastCalledWith("sub_1", {
      effectiveFrom: "immediately",
    })
    await cancelSubscription("sub_2")
    expect(sdk.api.subscriptions.cancel).toHaveBeenLastCalledWith("sub_2", {})
  })

  it("anonymises a customer by replacing its email", async () => {
    await anonymiseCustomer("ctm_1", "erased@noemail.invalid")
    expect(sdk.api.customers.update).toHaveBeenCalledWith("ctm_1", {
      email: "erased@noemail.invalid",
    })
  })
})
