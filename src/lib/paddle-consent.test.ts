import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  PADDLE_CONSENT_EVENT,
  PADDLE_CONSENT_STORAGE_KEY,
  getPaddleConsentState,
  setPaddleConsentState,
} from "./paddle-consent"

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("getPaddleConsentState", () => {
  it("is null by default", () => {
    expect(getPaddleConsentState()).toBeNull()
  })

  it.each(["granted", "denied"] as const)("returns stored %s", (state) => {
    window.localStorage.setItem(PADDLE_CONSENT_STORAGE_KEY, state)
    expect(getPaddleConsentState()).toBe(state)
  })

  it("ignores unknown stored values", () => {
    window.localStorage.setItem(PADDLE_CONSENT_STORAGE_KEY, "maybe")
    expect(getPaddleConsentState()).toBeNull()
  })

  it("is null when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked")
    })
    expect(getPaddleConsentState()).toBeNull()
  })

  it("is null without a window", () => {
    vi.stubGlobal("window", undefined)
    try {
      expect(getPaddleConsentState()).toBeNull()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe("setPaddleConsentState", () => {
  it("stores the state and notifies listeners", () => {
    const listener = vi.fn()
    window.addEventListener(PADDLE_CONSENT_EVENT, listener)
    expect(setPaddleConsentState("granted")).toBe(true)
    window.removeEventListener(PADDLE_CONSENT_EVENT, listener)
    expect(window.localStorage.getItem(PADDLE_CONSENT_STORAGE_KEY)).toBe(
      "granted"
    )
    expect(listener).toHaveBeenCalledTimes(1)
    expect(getPaddleConsentState()).toBe("granted")
  })

  it("can record a denial", () => {
    expect(setPaddleConsentState("denied")).toBe(true)
    expect(getPaddleConsentState()).toBe("denied")
  })

  it("returns false when storage throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota")
    })
    const listener = vi.fn()
    window.addEventListener(PADDLE_CONSENT_EVENT, listener)
    expect(setPaddleConsentState("granted")).toBe(false)
    window.removeEventListener(PADDLE_CONSENT_EVENT, listener)
    expect(listener).not.toHaveBeenCalled()
  })

  it("returns false without a window", () => {
    vi.stubGlobal("window", undefined)
    try {
      expect(setPaddleConsentState("granted")).toBe(false)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
