import { act, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { syncBillingAfterCheckout } from "@/lib/paddle/billing-ui"
import { SubscriptionSection } from "./SubscriptionSection"

vi.mock("@/lib/paddle/billing-ui", () => ({
  PADDLE_BILLING_CHANGED_EVENT: "concertivity:paddle-billing-changed",
  syncBillingAfterCheckout: vi.fn(),
}))

const sync = vi.mocked(syncBillingAfterCheckout)
const fetchMock = vi.fn()

const payload = {
  status: "ACTIVE",
  planKey: "lifetime_beta",
  currentPeriodEnd: "2026-02-01T12:00:00.000Z",
  trialEndsAt: null,
  manageBillingUrl: "https://portal.example/overview",
  portalTimedOut: false,
}

function respondWith(subscription: unknown) {
  fetchMock.mockResolvedValue({ json: async () => ({ subscription }) })
}

async function settle(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.stubGlobal("fetch", fetchMock)
  sync.mockResolvedValue(true)
})

afterEach(() => {
  vi.useRealTimers()
})

describe("SubscriptionSection", () => {
  it("shows a loading state first", () => {
    fetchMock.mockReturnValue(new Promise(() => {}))
    render(<SubscriptionSection />)
    expect(screen.getByText("Loading billing status…")).toBeInTheDocument()
  })

  it("syncs billing, then renders status, plan and period end", async () => {
    respondWith(payload)
    render(<SubscriptionSection />)
    await settle()
    expect(sync).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith("/api/paddle/subscription")
    expect(
      screen.getByRole("heading", { name: "Subscription" })
    ).toBeInTheDocument()
    expect(screen.getByText("ACTIVE")).toBeInTheDocument()
    expect(screen.getByText("Plan: lifetime beta")).toBeInTheDocument()
    expect(
      screen.getByText(
        `Current period ends: ${new Date(payload.currentPeriodEnd).toLocaleDateString()}`
      )
    ).toBeInTheDocument()
    expect(screen.queryByText(/Trial ends/)).not.toBeInTheDocument()
  })

  it("formats multi-word statuses", async () => {
    respondWith({ ...payload, status: "PAST_DUE" })
    render(<SubscriptionSection />)
    await settle()
    expect(screen.getByText("PAST DUE")).toBeInTheDocument()
  })

  it("shows the trial end date", async () => {
    respondWith({
      ...payload,
      status: "TRIALING",
      trialEndsAt: "2026-01-15T12:00:00.000Z",
      currentPeriodEnd: null,
    })
    render(<SubscriptionSection />)
    await settle()
    expect(
      screen.getByText(
        `Trial ends: ${new Date("2026-01-15T12:00:00.000Z").toLocaleDateString()}`
      )
    ).toBeInTheDocument()
    expect(screen.queryByText(/Current period ends/)).not.toBeInTheDocument()
  })

  it("omits the plan line when no plan is known", async () => {
    respondWith({ ...payload, planKey: null })
    render(<SubscriptionSection />)
    await settle()
    expect(screen.queryByText(/^Plan:/)).not.toBeInTheDocument()
  })

  it("links to the billing portal safely when available", async () => {
    respondWith(payload)
    render(<SubscriptionSection />)
    await settle()
    const link = screen.getByRole("link", { name: "Manage billing" })
    expect(link).toHaveAttribute("href", "https://portal.example/overview")
    expect(link).toHaveAttribute("target", "_blank")
    expect(link).toHaveAttribute("rel", "noopener noreferrer")
  })

  it("explains an unavailable portal after a timeout", async () => {
    respondWith({ ...payload, manageBillingUrl: null, portalTimedOut: true })
    render(<SubscriptionSection />)
    await settle()
    expect(
      screen.queryByRole("link", { name: "Manage billing" })
    ).not.toBeInTheDocument()
    expect(screen.getByText("Manage billing")).toHaveAttribute(
      "title",
      "Billing portal is temporarily unavailable. Try again later."
    )
    expect(screen.getByText("Status:")).toBeInTheDocument()
  })

  it("explains that lifetime plans have no portal", async () => {
    respondWith({ ...payload, manageBillingUrl: null, portalTimedOut: false })
    render(<SubscriptionSection />)
    await settle()
    expect(screen.getByText("Manage billing")).toHaveAttribute(
      "title",
      "Manage billing is only available for recurring subscriptions."
    )
  })

  it("polls briefly and then shows the empty state with a pricing link", async () => {
    respondWith(null)
    render(<SubscriptionSection />)
    await settle(600 * 8)
    expect(fetchMock).toHaveBeenCalledTimes(8)
    expect(
      screen.getByText(/You do not have an active Superfan subscription yet\./)
    ).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "View pricing" })).toHaveAttribute(
      "href",
      "/pricing"
    )
  })

  it("picks up a subscription that appears while polling", async () => {
    fetchMock
      .mockResolvedValueOnce({ json: async () => ({ subscription: null }) })
      .mockResolvedValue({ json: async () => ({ subscription: payload }) })
    render(<SubscriptionSection />)
    await settle(600)
    expect(screen.getByText("ACTIVE")).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("falls back to the empty state when loading fails", async () => {
    fetchMock.mockRejectedValue(new Error("offline"))
    render(<SubscriptionSection />)
    await settle()
    expect(
      screen.getByText(/You do not have an active Superfan subscription yet\./)
    ).toBeInTheDocument()
  })

  it("reloads when checkout completes", async () => {
    respondWith(null)
    render(<SubscriptionSection />)
    await settle(600 * 8)
    expect(
      screen.getByRole("link", { name: "View pricing" })
    ).toBeInTheDocument()

    respondWith(payload)
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent("concertivity:paddle-billing-changed")
      )
    })
    await settle()
    expect(screen.getByText("ACTIVE")).toBeInTheDocument()
  })

  it("stops after unmounting without updating state or polling further", async () => {
    respondWith(null)
    const { unmount } = render(<SubscriptionSection />)
    await settle(600)
    const calls = fetchMock.mock.calls.length
    unmount()
    await settle(600 * 8)
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(calls + 1)
  })
})
