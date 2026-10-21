// @vitest-environment node
import { NextRequest } from "next/server"
import * as Sentry from "@sentry/nextjs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { auth } from "@/lib/auth"
import { getSubscriptionSummary } from "@/lib/paddle/entitlement"
import { syncBillingForUser } from "@/lib/paddle/subscription-sync"
import { makeSession } from "@/test-utils/paddle"
import { POST } from "./route"

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }))
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }))
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn() } } }))
vi.mock("@/lib/paddle/entitlement", () => ({ getSubscriptionSummary: vi.fn() }))
vi.mock("@/lib/paddle/subscription-sync", () => ({
  syncBillingForUser: vi.fn(),
}))

const getSession = vi.mocked(auth.api.getSession) as unknown as ReturnType<
  typeof vi.fn
>
const summary = vi.mocked(getSubscriptionSummary)
const sync = vi.mocked(syncBillingForUser)

const post = (body?: string) =>
  POST(
    new NextRequest("http://localhost/api/paddle/subscription/sync", {
      method: "POST",
      body,
    })
  )

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv("ENABLE_PAYWALL", "true")
  getSession.mockResolvedValue(makeSession())
  sync.mockResolvedValue(true)
  summary.mockResolvedValue({ status: "ACTIVE" } as never)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("POST /api/paddle/subscription/sync", () => {
  it("is hidden while the paywall flag is off", async () => {
    vi.stubEnv("ENABLE_PAYWALL", "false")
    const res = await post("{}")
    expect(res.status).toBe(404)
    expect(sync).not.toHaveBeenCalled()
  })

  it("rejects unauthenticated requests", async () => {
    getSession.mockResolvedValue(null)
    const res = await post("{}")
    expect(res.status).toBe(401)
    expect(sync).not.toHaveBeenCalled()
  })

  it("rejects malformed JSON and invalid bodies", async () => {
    const bad = await post("{nope")
    expect(bad.status).toBe(400)
    expect(await bad.json()).toEqual({ error: "invalid_json" })

    const invalid = await post(JSON.stringify({ transactionId: "" }))
    expect(invalid.status).toBe(400)
    expect(await invalid.json()).toEqual({ error: "invalid_body" })
    expect(sync).not.toHaveBeenCalled()
  })

  it("syncs the session user with an optional transaction id", async () => {
    const res = await post(JSON.stringify({ transactionId: "txn_1" }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      synced: true,
      subscription: { status: "ACTIVE" },
    })
    expect(sync).toHaveBeenCalledWith("user_1", "txn_1")
    expect(summary).toHaveBeenCalledWith("user_1", {
      includePortalSession: false,
    })
  })

  it("accepts an empty body", async () => {
    expect((await post("   ")).status).toBe(200)
    expect(sync).toHaveBeenCalledWith("user_1", undefined)
    expect((await post(undefined)).status).toBe(200)
  })

  it("reports failures safely", async () => {
    const boom = new Error("db password in message")
    sync.mockRejectedValue(boom)
    const res = await post("{}")
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: "sync_failed" })
    expect(Sentry.captureException).toHaveBeenCalledWith(boom)
  })
})
