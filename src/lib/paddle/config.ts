import { z } from "zod"

const paddleEnvSchema = z.enum(["sandbox", "production"])

const configSchema = z.object({
  paddleApiKey: z.string().min(1),
  paddleWebhookSecret: z.string().min(1),
  paddleEnvironment: z.preprocess((v) => {
    const s = typeof v === "string" ? v.trim().toLowerCase() : "sandbox"
    if (s === "production" || s === "prod") return "production"
    return "sandbox"
  }, paddleEnvSchema),
  priceIdMonthly: z.string().min(1),
  priceIdYearly: z.string().min(1),
  priceIdLifetimeBeta: z.string().min(1),
  priceIdMonthlyTrial: z.string().min(1).optional(),
  priceIdYearlyTrial: z.string().min(1).optional(),
  lifetimeOfferDeadline: z.coerce.date().optional(),
  lifetimeOfferSeatCap: z.coerce.number().int().positive().optional(),
})

export type PaddlePlanKey = "monthly" | "yearly" | "lifetime_beta"

export type PaddleEnvConfig = z.infer<typeof configSchema>

let cached: PaddleEnvConfig | null = null
let cachedInvalid: Error | null = null

function readConfig(): PaddleEnvConfig {
  const raw = {
    paddleApiKey: process.env.PADDLE_API_KEY?.trim() ?? "",
    paddleWebhookSecret: process.env.PADDLE_WEBHOOK_SECRET?.trim() ?? "",
    paddleEnvironment: process.env.PADDLE_ENVIRONMENT,
    priceIdMonthly: process.env.PADDLE_PRICE_ID_MONTHLY?.trim() ?? "",
    priceIdYearly: process.env.PADDLE_PRICE_ID_YEARLY?.trim() ?? "",
    priceIdLifetimeBeta:
      process.env.PADDLE_PRICE_ID_LIFETIME_BETA?.trim() ?? "",
    priceIdMonthlyTrial:
      process.env.PADDLE_PRICE_ID_MONTHLY_TRIAL?.trim() || undefined,
    priceIdYearlyTrial:
      process.env.PADDLE_PRICE_ID_YEARLY_TRIAL?.trim() || undefined,
    lifetimeOfferDeadline:
      process.env.LIFETIME_OFFER_DEADLINE?.trim() || undefined,
    lifetimeOfferSeatCap:
      process.env.LIFETIME_OFFER_SEAT_CAP?.trim() || undefined,
  }

  const parsed = configSchema.safeParse(raw)
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ")
    throw new Error(`Invalid Paddle configuration: ${msg}`)
  }
  return parsed.data
}

/**
 * Validated Paddle env (throws if misconfigured). Call only when Paddle routes are active.
 */
export function getPaddleEnvConfig(): PaddleEnvConfig {
  if (cachedInvalid) throw cachedInvalid
  if (cached) return cached
  try {
    cached = readConfig()
    return cached
  } catch (e) {
    cachedInvalid = e instanceof Error ? e : new Error(String(e))
    throw cachedInvalid
  }
}

export function tryGetPaddleEnvConfig(): PaddleEnvConfig | null {
  try {
    return getPaddleEnvConfig()
  } catch {
    return null
  }
}

export function resetPaddleConfigCacheForTests(): void {
  cached = null
  cachedInvalid = null
}

export function getPriceIdForPlan(plan: PaddlePlanKey): string {
  const c = getPaddleEnvConfig()
  switch (plan) {
    case "monthly":
      return c.priceIdMonthly
    case "yearly":
      return c.priceIdYearly
    case "lifetime_beta":
      return c.priceIdLifetimeBeta
    default: {
      const _exhaustive: never = plan
      return _exhaustive
    }
  }
}

export function getPlanForPriceId(
  priceId: string | undefined | null
): PaddlePlanKey | null {
  if (!priceId) return null
  const c = getPaddleEnvConfig()
  if (priceId === c.priceIdMonthly) return "monthly"
  if (priceId === c.priceIdYearly) return "yearly"
  if (priceId === c.priceIdLifetimeBeta) return "lifetime_beta"
  if (c.priceIdMonthlyTrial && priceId === c.priceIdMonthlyTrial)
    return "monthly"
  if (c.priceIdYearlyTrial && priceId === c.priceIdYearlyTrial) return "yearly"
  return null
}

/** Catalog price with the 14-day trial for a recurring plan; null when none is configured. */
export function getTrialPriceIdForPlan(plan: PaddlePlanKey): string | null {
  const c = tryGetPaddleEnvConfig()
  if (!c) return null
  switch (plan) {
    case "monthly":
      return c.priceIdMonthlyTrial ?? null
    case "yearly":
      return c.priceIdYearlyTrial ?? null
    case "lifetime_beta":
      return null
    default: {
      const _exhaustive: never = plan
      return _exhaustive
    }
  }
}

/** True when the plan has a trial price configured. Never throws. */
export function isTrialOfferConfigured(plan: PaddlePlanKey): boolean {
  return getTrialPriceIdForPlan(plan) !== null
}

export function isLifetimeOfferOpen(now = new Date()): boolean {
  let cfg: PaddleEnvConfig
  try {
    cfg = getPaddleEnvConfig()
  } catch {
    return false
  }
  if (cfg.lifetimeOfferDeadline && now > cfg.lifetimeOfferDeadline) {
    return false
  }
  return true
}
