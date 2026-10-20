// @vitest-environment node
import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { auth } from "@/lib/auth"
import { getSubscriptionSummary } from "@/lib/paddle/entitlement"
import { makeSession } from "@/test-utils/paddle"
import { GET } from "./route"

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }))
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn() } } }))
vi.mock("@/lib/paddle/entitlement", () => ({ getSubscriptionSummary: vi.fn() }))

const getSession = vi.mocked(auth.api.getSession) as unknown as ReturnType<
  typeof vi.fn
>
const summary = vi.mocked(getSubscriptionSummary)

const get = (query = "") =>
  GET(new NextRequest(`http://localhost/api/paddle/subscription${query}`))

beforeEach(() => {
  vi.resetAllMocks()
  getSession.mockResolvedValue(makeSession())
})

describe("GET /api/paddle/subscription", () => {
  it("rejects unauthenticated requests", async () => {
    getSession.mockResolvedValue(null)
    const res = await get()
    expect(res.status).toBe(401)
    expect(summary).not.toHaveBeenCalled()
  })

  it("returns null when the user has no subscription", async () => {
    summary.mockResolvedValue(null)
    const res = await get()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ subscription: null })
  })

  it("returns the summary of the session user, including the portal by default", async () => {
    const data = { status: "ACTIVE", planKey: "monthly" }
    summary.mockResolvedValue(data as never)
    const res = await get()
    expect(await res.json()).toEqual({ subscription: data })
    expect(summary).toHaveBeenCalledWith("user_1", {
      includePortalSession: true,
    })
  })

  it.each(["0", "false"])(
    "skips the portal session for portal=%s",
    async (v) => {
      summary.mockResolvedValue(null)
      await get(`?portal=${v}`)
      expect(summary).toHaveBeenCalledWith("user_1", {
        includePortalSession: false,
      })
    }
  )

  it("ignores any user id supplied by the client", async () => {
    summary.mockResolvedValue(null)
    await get("?userId=someone_else")
    expect(summary).toHaveBeenCalledWith("user_1", expect.anything())
  })
})
