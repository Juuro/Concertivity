import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { PADDLE_TRIAL_ENV, stubPaddleEnv } from "@/test-utils/paddle"
import {
  getPaddleEnvConfig,
  getPlanForPriceId,
  getPriceIdForPlan,
  getTrialPriceIdForPlan,
  isLifetimeOfferOpen,
  isTrialOfferConfigured,
  resetPaddleConfigCacheForTests,
  tryGetPaddleEnvConfig,
} from "./config"

describe("paddle config", () => {
  beforeEach(() => {
    resetPaddleConfigCacheForTests()
    stubPaddleEnv()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.useRealTimers()
    resetPaddleConfigCacheForTests()
  })

  describe("getPaddleEnvConfig", () => {
    it("parses a complete environment", () => {
      const cfg = getPaddleEnvConfig()
      expect(cfg.paddleApiKey).toBe("test-api-key")
      expect(cfg.paddleWebhookSecret).toBe("test-webhook-secret")
      expect(cfg.paddleEnvironment).toBe("sandbox")
      expect(cfg.priceIdMonthly).toBe("pri_monthly")
      expect(cfg.lifetimeOfferDeadline).toBeUndefined()
      expect(cfg.lifetimeOfferSeatCap).toBeUndefined()
    })

    it("trims values and parses the lifetime offer settings", () => {
      vi.stubEnv("PADDLE_API_KEY", "  key  ")
      vi.stubEnv("LIFETIME_OFFER_DEADLINE", "2026-12-31T00:00:00Z")
      vi.stubEnv("LIFETIME_OFFER_SEAT_CAP", "50")
      const cfg = getPaddleEnvConfig()
      expect(cfg.paddleApiKey).toBe("key")
      expect(cfg.lifetimeOfferDeadline?.toISOString()).toBe(
        "2026-12-31T00:00:00.000Z"
      )
      expect(cfg.lifetimeOfferSeatCap).toBe(50)
    })

    it.each(["production", "PROD", " Production "])(
      "maps %j to the production environment",
      (value) => {
        vi.stubEnv("PADDLE_ENVIRONMENT", value)
        expect(getPaddleEnvConfig().paddleEnvironment).toBe("production")
      }
    )

    it.each(["", "staging", "sandbox"])(
      "falls back to sandbox for %j",
      (value) => {
        vi.stubEnv("PADDLE_ENVIRONMENT", value)
        expect(getPaddleEnvConfig().paddleEnvironment).toBe("sandbox")
      }
    )

    it("defaults to sandbox when PADDLE_ENVIRONMENT is unset", () => {
      vi.stubEnv("PADDLE_ENVIRONMENT", undefined as unknown as string)
      expect(getPaddleEnvConfig().paddleEnvironment).toBe("sandbox")
    })

    it.each([
      "PADDLE_API_KEY",
      "PADDLE_WEBHOOK_SECRET",
      "PADDLE_PRICE_ID_MONTHLY",
      "PADDLE_PRICE_ID_YEARLY",
      "PADDLE_PRICE_ID_LIFETIME_BETA",
    ])("throws when %s is blank", (name) => {
      vi.stubEnv(name, "   ")
      expect(() => getPaddleEnvConfig()).toThrow(/Invalid Paddle configuration/)
    })

    it("rejects a non-positive seat cap", () => {
      vi.stubEnv("LIFETIME_OFFER_SEAT_CAP", "0")
      expect(() => getPaddleEnvConfig()).toThrow(/Invalid Paddle configuration/)
    })

    it("caches a valid config until reset", () => {
      const first = getPaddleEnvConfig()
      vi.stubEnv("PADDLE_API_KEY", "changed")
      expect(getPaddleEnvConfig()).toBe(first)
      resetPaddleConfigCacheForTests()
      expect(getPaddleEnvConfig().paddleApiKey).toBe("changed")
    })

    it("caches the failure until reset", () => {
      vi.stubEnv("PADDLE_API_KEY", "")
      expect(() => getPaddleEnvConfig()).toThrow()
      vi.stubEnv("PADDLE_API_KEY", "now-valid")
      expect(() => getPaddleEnvConfig()).toThrow()
      resetPaddleConfigCacheForTests()
      expect(getPaddleEnvConfig().paddleApiKey).toBe("now-valid")
    })
  })

  describe("tryGetPaddleEnvConfig", () => {
    it("returns the config when valid", () => {
      expect(tryGetPaddleEnvConfig()?.priceIdYearly).toBe("pri_yearly")
    })

    it("returns null when misconfigured", () => {
      vi.stubEnv("PADDLE_API_KEY", "")
      expect(tryGetPaddleEnvConfig()).toBeNull()
    })
  })

  describe("price id mapping", () => {
    it.each([
      ["monthly", "pri_monthly"],
      ["yearly", "pri_yearly"],
      ["lifetime_beta", "pri_lifetime"],
    ] as const)("maps %s to its price id", (plan, id) => {
      expect(getPriceIdForPlan(plan)).toBe(id)
      expect(getPlanForPriceId(id)).toBe(plan)
    })

    it("returns null for unknown, empty and missing price ids", () => {
      expect(getPlanForPriceId("pri_other")).toBeNull()
      expect(getPlanForPriceId("")).toBeNull()
      expect(getPlanForPriceId(null)).toBeNull()
      expect(getPlanForPriceId(undefined)).toBeNull()
    })
  })

  describe("trial prices", () => {
    it("keeps the config valid and offers no trial when trial ids are unset", () => {
      expect(getPaddleEnvConfig().priceIdMonthlyTrial).toBeUndefined()
      expect(isTrialOfferConfigured("monthly")).toBe(false)
      expect(isTrialOfferConfigured("yearly")).toBe(false)
      expect(getTrialPriceIdForPlan("monthly")).toBeNull()
    })

    it("offers a trial for monthly and yearly only when configured", () => {
      stubPaddleEnv(PADDLE_TRIAL_ENV)
      expect(isTrialOfferConfigured("monthly")).toBe(true)
      expect(isTrialOfferConfigured("yearly")).toBe(true)
      expect(isTrialOfferConfigured("lifetime_beta")).toBe(false)
      expect(getTrialPriceIdForPlan("monthly")).toBe("pri_monthly_trial")
      expect(getTrialPriceIdForPlan("yearly")).toBe("pri_yearly_trial")
      expect(getTrialPriceIdForPlan("lifetime_beta")).toBeNull()
    })

    it("offers a trial per plan independently", () => {
      vi.stubEnv("PADDLE_PRICE_ID_YEARLY_TRIAL", "pri_yearly_trial")
      expect(isTrialOfferConfigured("monthly")).toBe(false)
      expect(isTrialOfferConfigured("yearly")).toBe(true)
    })

    it("maps trial price ids to the same plan as their no-trial price", () => {
      stubPaddleEnv(PADDLE_TRIAL_ENV)
      expect(getPlanForPriceId("pri_monthly_trial")).toBe("monthly")
      expect(getPlanForPriceId("pri_yearly_trial")).toBe("yearly")
      expect(getPriceIdForPlan("monthly")).toBe("pri_monthly")
    })

    it("treats whitespace-only trial ids as unset", () => {
      vi.stubEnv("PADDLE_PRICE_ID_MONTHLY_TRIAL", "   ")
      expect(getPaddleEnvConfig().priceIdMonthlyTrial).toBeUndefined()
      expect(isTrialOfferConfigured("monthly")).toBe(false)
    })

    it("returns false instead of throwing when the config is invalid", () => {
      stubPaddleEnv(PADDLE_TRIAL_ENV)
      vi.stubEnv("PADDLE_API_KEY", "")
      expect(isTrialOfferConfigured("monthly")).toBe(false)
      expect(getTrialPriceIdForPlan("yearly")).toBeNull()
    })
  })

  describe("isLifetimeOfferOpen", () => {
    it("is open when no deadline is configured", () => {
      expect(isLifetimeOfferOpen()).toBe(true)
    })

    it("is open before and exactly at the deadline, closed after", () => {
      vi.stubEnv("LIFETIME_OFFER_DEADLINE", "2026-06-01T00:00:00Z")
      const deadline = new Date("2026-06-01T00:00:00Z")
      expect(isLifetimeOfferOpen(new Date(deadline.getTime() - 1))).toBe(true)
      expect(isLifetimeOfferOpen(deadline)).toBe(true)
      expect(isLifetimeOfferOpen(new Date(deadline.getTime() + 1))).toBe(false)
    })

    it("uses the current time by default", () => {
      vi.stubEnv("LIFETIME_OFFER_DEADLINE", "2026-06-01T00:00:00Z")
      vi.useFakeTimers()
      vi.setSystemTime(new Date("2026-07-01T00:00:00Z"))
      expect(isLifetimeOfferOpen()).toBe(false)
    })

    it("is closed when the configuration is invalid", () => {
      vi.stubEnv("PADDLE_API_KEY", "")
      expect(isLifetimeOfferOpen()).toBe(false)
    })
  })
})
