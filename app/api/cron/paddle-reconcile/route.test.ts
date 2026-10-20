// @vitest-environment node
import { NextRequest } from "next/server"
import * as Sentry from "@sentry/nextjs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { runPaddleReconciliation } from "@/lib/paddle/reconcile"
import { GET } from "./route"

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }))
vi.mock("@/lib/paddle/reconcile", () => ({ runPaddleReconciliation: vi.fn() }))

const reconcile = vi.mocked(runPaddleReconciliation)

const get = (authorization?: string) =>
  GET(
    new NextRequest("http://localhost/api/cron/paddle-reconcile", {
      headers: authorization ? { authorization } : {},
    })
  )

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv("CRON_SECRET", "cron-secret")
  reconcile.mockResolvedValue({ checked: 2 } as never)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("GET /api/cron/paddle-reconcile", () => {
  it("answers 503 when CRON_SECRET is not configured", async () => {
    vi.stubEnv("CRON_SECRET", "  ")
    const res = await get("Bearer anything")
    expect(res.status).toBe(503)
    expect(reconcile).not.toHaveBeenCalled()
  })

  it.each([
    ["missing header", undefined],
    ["wrong scheme", "Basic cron-secret"],
    ["wrong secret of the same length", "Bearer cron-secreX"],
    ["wrong secret of another length", "Bearer wrong-secret"],
    ["wrong length", "Bearer short"],
    ["empty token", "Bearer "],
  ])("rejects %s", async (_label, header) => {
    const res = await get(header)
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: "Unauthorized" })
    expect(reconcile).not.toHaveBeenCalled()
  })

  it("runs the reconciliation for the correct secret", async () => {
    const res = await get("Bearer cron-secret")
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, checked: 2 })
    expect(reconcile).toHaveBeenCalledTimes(1)
  })

  it("answers 500 and reports to Sentry when the run fails", async () => {
    const boom = new Error("paddle down")
    reconcile.mockRejectedValue(boom)
    const res = await get("Bearer cron-secret")
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({
      ok: false,
      error: "paddle_reconcile_failed",
    })
    expect(Sentry.captureException).toHaveBeenCalledWith(boom)
  })
})
