import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getPaddleInstance, initializePaddle } from "@paddle/paddle-js"
import { syncBillingAfterCheckout } from "@/lib/paddle/billing-ui"
import { ensurePaddleJs, openPaddleCheckout } from "./paddle-client"

vi.mock("@paddle/paddle-js", () => ({
  CheckoutEventNames: { CHECKOUT_COMPLETED: "checkout.completed" },
  getPaddleInstance: vi.fn(),
  initializePaddle: vi.fn(),
}))
vi.mock("@/lib/paddle/billing-ui", () => ({
  PADDLE_BILLING_CHANGED_EVENT: "concertivity:paddle-billing-changed",
  syncBillingAfterCheckout: vi.fn(),
}))

const getInstance = vi.mocked(getPaddleInstance)
const init = vi.mocked(initializePaddle)
const sync = vi.mocked(syncBillingAfterCheckout)

function fakePaddle(initialized = true) {
  return {
    Initialized: initialized,
    Update: vi.fn(),
    Checkout: { open: vi.fn(), close: vi.fn() },
  }
}

type UpdateArg = { eventCallback: (e: unknown) => void }
const callback = (p: ReturnType<typeof fakePaddle>) =>
  (p.Update.mock.calls[0]![0] as UpdateArg).eventCallback

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv("NEXT_PUBLIC_PADDLE_CLIENT_TOKEN", "test_token")
  vi.stubEnv("NEXT_PUBLIC_PADDLE_ENV", "sandbox")
  sync.mockResolvedValue(true)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("ensurePaddleJs", () => {
  it("reuses an initialised instance and wires the completion handler", async () => {
    const p = fakePaddle()
    getInstance.mockReturnValue(p as never)
    expect(await ensurePaddleJs()).toBe(p)
    expect(init).not.toHaveBeenCalled()
    expect(p.Update).toHaveBeenCalledTimes(1)
  })

  it("is undefined without a client token", async () => {
    getInstance.mockReturnValue(undefined as never)
    vi.stubEnv("NEXT_PUBLIC_PADDLE_CLIENT_TOKEN", "  ")
    expect(await ensurePaddleJs()).toBeUndefined()
    expect(init).not.toHaveBeenCalled()
  })

  it.each([
    ["sandbox", "sandbox"],
    ["production", "production"],
    [" PRODUCTION ", "production"],
    ["staging", "sandbox"],
    [undefined, "sandbox"],
  ])(
    "initialises with NEXT_PUBLIC_PADDLE_ENV=%s as %s",
    async (raw, expected) => {
      getInstance.mockReturnValue(undefined as never)
      vi.stubEnv("NEXT_PUBLIC_PADDLE_ENV", raw as string)
      const p = fakePaddle()
      init.mockResolvedValue(p as never)
      expect(await ensurePaddleJs()).toBe(p)
      expect(init).toHaveBeenCalledWith({
        environment: expected,
        token: "test_token",
        version: "v1",
      })
      expect(p.Update).toHaveBeenCalledTimes(1)
    }
  )

  it("initialises when the existing instance is not ready", async () => {
    getInstance.mockReturnValue(fakePaddle(false) as never)
    init.mockResolvedValue(fakePaddle() as never)
    await ensurePaddleJs()
    expect(init).toHaveBeenCalledTimes(1)
  })

  it("returns undefined when Paddle.js fails to initialise", async () => {
    getInstance.mockReturnValue(undefined as never)
    init.mockResolvedValue(undefined)
    expect(await ensurePaddleJs()).toBeUndefined()
  })

  it("syncs billing, announces the change and closes the overlay on completion", async () => {
    const p = fakePaddle()
    getInstance.mockReturnValue(p as never)
    const changed = vi.fn()
    window.addEventListener("concertivity:paddle-billing-changed", changed)
    await ensurePaddleJs()
    callback(p)({
      name: "checkout.completed",
      data: { transaction_id: "txn_1" },
    })
    await vi.waitFor(() => expect(p.Checkout.close).toHaveBeenCalled())
    window.removeEventListener("concertivity:paddle-billing-changed", changed)
    expect(sync).toHaveBeenCalledWith("txn_1")
    expect(changed).toHaveBeenCalledTimes(1)
  })

  it("ignores other checkout events and tolerates a close failure", async () => {
    const p = fakePaddle()
    p.Checkout.close.mockImplementation(() => {
      throw new Error("closing")
    })
    getInstance.mockReturnValue(p as never)
    await ensurePaddleJs()
    callback(p)({ name: "checkout.loaded" })
    expect(sync).not.toHaveBeenCalled()

    callback(p)({ name: "checkout.completed" })
    await vi.waitFor(() => expect(p.Checkout.close).toHaveBeenCalled())
    expect(sync).toHaveBeenCalledWith(undefined)
  })
})

describe("openPaddleCheckout", () => {
  function ready() {
    const p = fakePaddle()
    getInstance.mockReturnValue(p as never)
    return p
  }

  it("opens the overlay with the default success url", async () => {
    const p = ready()
    await openPaddleCheckout("txn_1")
    expect(p.Checkout.open).toHaveBeenCalledWith({
      transactionId: "txn_1",
      settings: {
        successUrl: new URL(
          "/pricing?success=1",
          window.location.origin
        ).toString(),
      },
    })
  })

  it("accepts a custom same-origin success path", async () => {
    const p = ready()
    await openPaddleCheckout("txn_1", { successPath: " /settings " })
    expect(p.Checkout.open).toHaveBeenCalledWith({
      transactionId: "txn_1",
      settings: {
        successUrl: new URL("/settings", window.location.origin).toString(),
      },
    })
  })

  it.each(["https://evil.example/x", "settings", "   "])(
    "falls back to the default for the unsafe path %j",
    async (successPath) => {
      const p = ready()
      await openPaddleCheckout("txn_1", { successPath })
      const arg = p.Checkout.open.mock.calls[0]![0] as {
        settings: { successUrl: string }
      }
      expect(arg.settings.successUrl).toBe(
        new URL("/pricing?success=1", window.location.origin).toString()
      )
    }
  )

  it("fails when Paddle.js is not configured", async () => {
    getInstance.mockReturnValue(undefined as never)
    vi.stubEnv("NEXT_PUBLIC_PADDLE_CLIENT_TOKEN", "")
    await expect(openPaddleCheckout("txn_1")).rejects.toThrow(
      "paddle_not_configured"
    )
  })

  it("fails outside the browser", async () => {
    vi.stubGlobal("window", undefined)
    try {
      await expect(openPaddleCheckout("txn_1")).rejects.toThrow(
        "paddle_checkout_requires_browser"
      )
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
