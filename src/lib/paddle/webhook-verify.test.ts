import { createHmac } from "node:crypto"
import { describe, expect, it } from "vitest"
import { verifyPaddleWebhookSignature } from "./webhook-verify"

function makeSignature(body: string, secret: string, ts: number): string {
  const h1 = createHmac("sha256", secret)
    .update(`${ts}:${body}`, "utf8")
    .digest("hex")
  return `ts=${ts};h1=${h1}`
}

describe("verifyPaddleWebhookSignature", () => {
  it("rejects missing signature", () => {
    const r = verifyPaddleWebhookSignature("{}", null, "secret")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe("missing_signature")
  })

  it("rejects empty string signature", () => {
    const r = verifyPaddleWebhookSignature("{}", "", "secret")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe("missing_signature")
  })

  it("rejects whitespace-only signature", () => {
    const r = verifyPaddleWebhookSignature("{}", "   ", "secret")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe("missing_signature")
  })

  it("rejects invalid format", () => {
    const r = verifyPaddleWebhookSignature("{}", "bad", "secret")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe("invalid_signature_format")
  })

  it("rejects non-numeric timestamp", () => {
    const r = verifyPaddleWebhookSignature(
      "{}",
      `ts=notanumber;h1=${"ab".repeat(32)}`,
      "secret",
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe("invalid_signature_format")
  })

  it("rejects stale timestamp", () => {
    const oldTs = Math.floor(Date.now() / 1000) - 99999
    const r = verifyPaddleWebhookSignature("{}", `ts=${oldTs};h1=abc`, "secret")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe("timestamp_outside_window")
  })

  it("accepts a valid signature", () => {
    const body = '{"event":"test"}'
    const secret = "test-secret"
    const ts = Math.floor(Date.now() / 1000)
    const r = verifyPaddleWebhookSignature(body, makeSignature(body, secret, ts), secret)
    expect(r.ok).toBe(true)
  })

  it("rejects a signature computed with the wrong secret", () => {
    const body = '{"event":"test"}'
    const ts = Math.floor(Date.now() / 1000)
    const r = verifyPaddleWebhookSignature(
      body,
      makeSignature(body, "wrong-secret", ts),
      "correct-secret",
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe("signature_mismatch")
  })

  it("rejects h1 with different byte length than expected", () => {
    const ts = Math.floor(Date.now() / 1000)
    // SHA-256 produces 32 bytes (64 hex chars); provide only 4 hex chars (2 bytes)
    const r = verifyPaddleWebhookSignature("{}", `ts=${ts};h1=aabb`, "secret")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe("signature_mismatch")
  })
})
