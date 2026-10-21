import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { stubPaddleEnv } from "@/test-utils/paddle"
import { getPaddleApi, rejectAfterMs } from "./client"
import { resetPaddleConfigCacheForTests } from "./config"
import { getPlanPriceLabel, getPlanPriceLabels } from "./price-previews"

vi.mock("./client", () => ({
  getPaddleApi: vi.fn(),
  rejectAfterMs: vi.fn(),
}))

const getPrice = vi.fn()
const timeout = vi.mocked(rejectAfterMs)

function price(amount: string, currencyCode: string) {
  return { unitPrice: { amount, currencyCode } }
}

beforeEach(() => {
  vi.resetAllMocks()
  resetPaddleConfigCacheForTests()
  stubPaddleEnv()
  vi.mocked(getPaddleApi).mockReturnValue({
    prices: { get: getPrice },
  } as never)
  timeout.mockImplementation(() => new Promise<never>(() => {}))
})

afterEach(() => {
  vi.unstubAllEnvs()
  resetPaddleConfigCacheForTests()
})

describe("getPlanPriceLabels", () => {
  it("returns nothing when Paddle is not configured", async () => {
    vi.stubEnv("PADDLE_API_KEY", "")
    expect(await getPlanPriceLabels("en-US")).toEqual({})
    expect(getPrice).not.toHaveBeenCalled()
  })

  it("formats every plan in the requested locale", async () => {
    getPrice.mockImplementation(async (id: string) =>
      id === "pri_monthly"
        ? price("499", "EUR")
        : id === "pri_yearly"
          ? price("4999", "EUR")
          : price("19900", "USD")
    )
    const en = await getPlanPriceLabels("en-US")
    expect(en).toEqual({
      monthly: "€4.99",
      yearly: "€49.99",
      lifetime_beta: "$199.00",
    })
    expect(getPrice).toHaveBeenCalledWith("pri_monthly")
    expect(getPrice).toHaveBeenCalledWith("pri_yearly")
    expect(getPrice).toHaveBeenCalledWith("pri_lifetime")

    getPrice.mockResolvedValue(price("499", "EUR"))
    const de = await getPlanPriceLabels("de-DE")
    expect(de.monthly).toMatch(/^4,99\s€$/)
  })

  it("treats zero-decimal currencies as whole units", async () => {
    getPrice.mockResolvedValue(price("500", "jpy"))
    const labels = await getPlanPriceLabels("en-US")
    expect(labels.monthly).toBe("¥500")
  })

  it("falls back to a plain label when the amount is not an integer", async () => {
    getPrice.mockResolvedValue(price("12.5", "EUR"))
    const labels = await getPlanPriceLabels("en-US")
    expect(labels.monthly).toBe("12.5 EUR")
  })

  it("omits plans whose price lookup fails", async () => {
    getPrice
      .mockRejectedValueOnce(new Error("404"))
      .mockResolvedValueOnce(price("4999", "EUR"))
      .mockResolvedValueOnce(price("19900", "EUR"))
    const labels = await getPlanPriceLabels("en-US")
    expect(labels).toEqual({ yearly: "€49.99", lifetime_beta: "€199.00" })
  })

  it("omits plans that exceed the timeout", async () => {
    getPrice.mockReturnValue(new Promise(() => {}))
    timeout.mockImplementation(() => Promise.reject(new Error("timeout")))
    expect(await getPlanPriceLabels("en-US")).toEqual({})
    expect(timeout).toHaveBeenCalledWith(5000)
  })
})

describe("getPlanPriceLabel", () => {
  it("formats the regular price of one plan in the requested locale", async () => {
    getPrice.mockResolvedValue(price("499", "EUR"))
    expect(await getPlanPriceLabel("monthly", "en-US")).toBe("€4.99")
    expect(getPrice).toHaveBeenCalledWith("pri_monthly")
    expect(timeout).toHaveBeenCalledWith(3000)
  })

  it("is null when Paddle is not configured", async () => {
    vi.stubEnv("PADDLE_API_KEY", "")
    expect(await getPlanPriceLabel("monthly", "en-US")).toBeNull()
    expect(getPrice).not.toHaveBeenCalled()
  })

  it("is null when the lookup fails", async () => {
    getPrice.mockRejectedValue(new Error("404"))
    expect(await getPlanPriceLabel("yearly", "en-US")).toBeNull()
  })

  it("is null when the lookup exceeds the timeout", async () => {
    getPrice.mockReturnValue(new Promise(() => {}))
    timeout.mockImplementation(() => Promise.reject(new Error("timeout")))
    expect(await getPlanPriceLabel("monthly", "en-US")).toBeNull()
  })
})
