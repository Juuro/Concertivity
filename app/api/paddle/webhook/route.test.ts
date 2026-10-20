// @vitest-environment node
import { createHmac } from "node:crypto"
import { NextRequest } from "next/server"
import * as Sentry from "@sentry/nextjs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { resetPaddleConfigCacheForTests } from "@/lib/paddle/config"
import { processPaddleWebhookEvent } from "@/lib/paddle/webhook-handler"
import { buildWebhookEvent, stubPaddleEnv } from "@/test-utils/paddle"
import { POST } from "./route"

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }))
vi.mock("@/lib/paddle/webhook-handler", () => ({
  processPaddleWebhookEvent: vi.fn(),
}))

const process_ = vi.mocked(processPaddleWebhookEvent)
const SECRET = "test-webhook-secret"

function sign(body: string, ts = Math.floor(Date.now() / 1000)) {
  const h1 = createHmac("sha256", SECRET).update(`${ts}:${body}`).digest("hex")
  return `ts=${ts};h1=${h1}`
}

function post(
  body: string,
  signature: string | null,
  headerName = "paddle-signature"
) {
  const headers = new Headers()
  if (signature !== null) headers.set(headerName, signature)
  return POST(
    new NextRequest("http://localhost/api/paddle/webhook", {
      method: "POST",
      body,
      headers,
    })
  )
}

const validBody = JSON.stringify(
  buildWebhookEvent("subscription.created", { id: "sub_1" })
)

beforeEach(() => {
  vi.resetAllMocks()
  resetPaddleConfigCacheForTests()
  stubPaddleEnv()
  process_.mockResolvedValue({ duplicate: false })
})

afterEach(() => {
  vi.unstubAllEnvs()
  resetPaddleConfigCacheForTests()
})

describe("POST /api/paddle/webhook", () => {
  it("answers 503 when Paddle is not configured", async () => {
    vi.stubEnv("PADDLE_WEBHOOK_SECRET", "")
    const res = await post(validBody, sign(validBody))
    expect(res.status).toBe(503)
    expect(process_).not.toHaveBeenCalled()
  })

  it("rejects a missing signature", async () => {
    const res = await post(validBody, null)
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: "missing_signature" })
    expect(process_).not.toHaveBeenCalled()
  })

  it("rejects an invalid signature", async () => {
    const forged = sign(validBody).replace(/h1=.{6}/, "h1=000000")
    const res = await post(validBody, forged)
    expect(res.status).toBe(401)
    expect(process_).not.toHaveBeenCalled()
  })

  it("rejects a signature made for a different body", async () => {
    const res = await post(validBody, sign('{"other":true}'))
    expect(res.status).toBe(401)
    expect(process_).not.toHaveBeenCalled()
  })

  it("rejects a stale signature", async () => {
    const old = Math.floor(Date.now() / 1000) - 60 * 60
    const res = await post(validBody, sign(validBody, old))
    expect(res.status).toBe(401)
    expect(process_).not.toHaveBeenCalled()
  })

  it("also reads the capitalised signature header", async () => {
    const res = await post(validBody, sign(validBody), "Paddle-Signature")
    expect(res.status).toBe(200)
  })

  it("rejects a correctly signed body that is not JSON", async () => {
    const body = "not json"
    const res = await post(body, sign(body))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "invalid_json" })
  })

  it("rejects a correctly signed body with an invalid envelope", async () => {
    const body = JSON.stringify({
      event_id: "e",
      event_type: "customer.created",
      data: {},
    })
    const res = await post(body, sign(body))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "invalid_envelope" })
    expect(process_).not.toHaveBeenCalled()
  })

  it("processes a valid event using the exact raw body for verification", async () => {
    const spaced = `  ${validBody}  `
    const res = await post(spaced, sign(spaced))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, duplicate: false })
    expect(process_).toHaveBeenCalledWith(
      expect.objectContaining({
        event_id: "evt_1",
        event_type: "subscription.created",
      })
    )
  })

  it("reports duplicates as success", async () => {
    process_.mockResolvedValue({ duplicate: true })
    const res = await post(validBody, sign(validBody))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, duplicate: true })
  })

  it("answers 500 and reports to Sentry when processing fails", async () => {
    const boom = new Error("handler failed")
    process_.mockRejectedValue(boom)
    const res = await post(validBody, sign(validBody))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ ok: false })
    expect(Sentry.captureException).toHaveBeenCalledWith(boom)
  })
})
