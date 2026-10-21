import { createHmac, timingSafeEqual } from "node:crypto"

const MAX_SKEW_SECONDS = 360 // ±300s replay + ±60s clock skew (plan)

export type WebhookVerifyResult = { ok: true } | { ok: false; reason: string }

function parseSignatureHeader(
  header: string
): { ts: number; h1: string } | null {
  const parts = header.split(";")
  let ts = ""
  let h1 = ""
  for (const part of parts) {
    const eq = part.indexOf("=")
    if (eq === -1) continue
    const key = part.slice(0, eq).trim()
    const value = part.slice(eq + 1).trim()
    if (key === "ts") ts = value
    else if (key === "h1") h1 = value
  }
  if (!ts || !h1) return null
  const tsNum = Number.parseInt(ts, 10)
  if (!Number.isFinite(tsNum)) return null
  return { ts: tsNum, h1 }
}

/**
 * Paddle Billing webhook signature: HMAC-SHA256 of `${ts}:${rawBody}` compared to `h1` (hex).
 * @see https://developer.paddle.com/webhooks/signature-verification
 */
export function verifyPaddleWebhookSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret: string
): WebhookVerifyResult {
  if (!signatureHeader?.trim()) {
    return { ok: false, reason: "missing_signature" }
  }
  const parsed = parseSignatureHeader(signatureHeader.trim())
  if (!parsed) {
    return { ok: false, reason: "invalid_signature_format" }
  }

  const nowSec = Math.floor(Date.now() / 1000)
  if (Math.abs(nowSec - parsed.ts) > MAX_SKEW_SECONDS) {
    return { ok: false, reason: "timestamp_outside_window" }
  }

  const payload = `${parsed.ts}:${rawBody}`
  const expectedHex = createHmac("sha256", secret)
    .update(payload, "utf8")
    .digest("hex")

  try {
    const a = Buffer.from(expectedHex, "hex")
    const b = Buffer.from(parsed.h1, "hex")
    if (a.length !== b.length) {
      return { ok: false, reason: "signature_mismatch" }
    }
    if (!timingSafeEqual(a, b)) {
      return { ok: false, reason: "signature_mismatch" }
    }
  } catch {
    return { ok: false, reason: "signature_mismatch" }
  }

  return { ok: true }
}
