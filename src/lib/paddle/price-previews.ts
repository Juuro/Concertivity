import type { PaddlePlanKey } from "./config"
import { getPriceIdForPlan, tryGetPaddleEnvConfig } from "./config"
import { getPaddleApi, rejectAfterMs } from "./client"

const ZERO_DECIMAL = new Set([
  "BIF",
  "CLP",
  "DJF",
  "GNF",
  "JPY",
  "KMF",
  "KRW",
  "MGA",
  "PYG",
  "RWF",
  "UGX",
  "VND",
  "VUV",
  "XAF",
  "XOF",
  "XPF",
])

function formatPaddleUnitPrice(
  amountStr: string,
  currencyCode: string,
  locale: string
): string {
  let minor: bigint
  try {
    minor = BigInt(amountStr)
  } catch {
    return `${amountStr} ${currencyCode}`
  }
  const cur = currencyCode.toUpperCase()
  const divisor = ZERO_DECIMAL.has(cur) ? BigInt(1) : BigInt(100)
  const major = Number(minor) / Number(divisor)
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: cur,
    maximumFractionDigits: ZERO_DECIMAL.has(cur) ? 0 : 2,
  }).format(major)
}

const PLAN_ORDER: PaddlePlanKey[] = ["monthly", "yearly", "lifetime_beta"]

/**
 * Fetches each configured catalog price from Paddle for display on /pricing.
 * Returns empty object when Paddle is not configured or requests fail.
 */
export async function getPlanPriceLabels(
  locale: string
): Promise<Partial<Record<PaddlePlanKey, string>>> {
  if (!tryGetPaddleEnvConfig()) return {}
  const paddle = getPaddleApi()
  const out: Partial<Record<PaddlePlanKey, string>> = {}

  for (const plan of PLAN_ORDER) {
    try {
      const priceId = getPriceIdForPlan(plan)
      const price = await Promise.race([
        paddle.prices.get(priceId),
        rejectAfterMs(5000),
      ])
      const label = formatPaddleUnitPrice(
        price.unitPrice.amount,
        price.unitPrice.currencyCode,
        locale
      )
      out[plan] = label
    } catch {
      // omit failed plan; page falls back to static copy
    }
  }

  return out
}

const SINGLE_LABEL_TIMEOUT_MS = 3000

/**
 * Locale-formatted regular price for one plan, for places where a slow
 * provider must not hold the page up. Null when unconfigured, on error or timeout.
 */
export async function getPlanPriceLabel(
  plan: PaddlePlanKey,
  locale: string
): Promise<string | null> {
  if (!tryGetPaddleEnvConfig()) return null
  try {
    const price = await Promise.race([
      getPaddleApi().prices.get(getPriceIdForPlan(plan)),
      rejectAfterMs(SINGLE_LABEL_TIMEOUT_MS),
    ])
    return formatPaddleUnitPrice(
      price.unitPrice.amount,
      price.unitPrice.currencyCode,
      locale
    )
  } catch {
    return null
  }
}
