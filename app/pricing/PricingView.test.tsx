import { act, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  PADDLE_BILLING_CHANGED_EVENT,
  syncBillingAfterCheckout,
} from "@/lib/paddle/billing-ui"
import { PricingView } from "./PricingView"

const showToast = vi.fn()
let searchParams = new URLSearchParams()

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string
    children: React.ReactNode
  }) => <a href={href}>{children}</a>,
}))
vi.mock("next/navigation", () => ({ useSearchParams: () => searchParams }))
vi.mock("@/components/Toast/Toast", () => ({
  useToast: () => ({ showToast }),
}))
vi.mock("@/components/pricing/PricingTierOverview", () => ({
  PricingTierOverview: () => null,
}))
vi.mock("@/components/pricing/PricingCard", () => ({
  PricingCard: (props: {
    planKey: string
    priceLabel: string
    trialOffered?: boolean
    isCurrentPlan?: boolean
  }) => (
    <div
      data-testid={`card-${props.planKey}`}
      data-trial={String(props.trialOffered)}
      data-current={String(props.isCurrentPlan)}
    >
      {props.priceLabel}
    </div>
  ),
}))
vi.mock("@/lib/paddle/billing-ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/paddle/billing-ui")>()),
  syncBillingAfterCheckout: vi.fn(),
}))

const sync = vi.mocked(syncBillingAfterCheckout)
const fetchMock = vi.fn()

function renderView(
  props: Partial<React.ComponentProps<typeof PricingView>> = {}
) {
  return render(
    <PricingView
      localeDe={false}
      paywallEnabled
      billing={null}
      priceLabels={{}}
      {...props}
    />
  )
}

function respondWith(subscription: unknown, status = 200) {
  fetchMock.mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({ subscription }),
  })
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
  searchParams = new URLSearchParams()
  sync.mockResolvedValue(true)
  respondWith(null)
})

afterEach(() => {
  vi.useRealTimers()
})

describe("PricingView intro and trial wording", () => {
  it("keeps the free-app promise without claiming there is no trial", async () => {
    renderView()
    await settle()
    const lead = screen.getByText(/Concertivity is free to use/)
    expect(lead).toHaveTextContent("no credit card at signup")
    expect(lead).not.toHaveTextContent("no trial countdown")
    expect(lead).not.toHaveTextContent("14 days")
  })

  it("mentions the 14-day trial and offers it on the configured plans", async () => {
    renderView({ trialPlans: { monthly: true, yearly: true } })
    await settle()
    expect(screen.getByText(/Concertivity is free to use/)).toHaveTextContent(
      "New Superfan subscribers can try it free for 14 days."
    )
    expect(screen.getByTestId("card-monthly")).toHaveAttribute(
      "data-trial",
      "true"
    )
    expect(screen.getByTestId("card-yearly")).toHaveAttribute(
      "data-trial",
      "true"
    )
  })

  it("mentions the trial in German on the German site", async () => {
    renderView({ localeDe: true, trialPlans: { monthly: true } })
    await settle()
    expect(screen.getByText(/Concertivity is free to use/)).toHaveTextContent(
      "Neue Superfan-Abonnent:innen können 14 Tage kostenlos testen."
    )
    expect(
      screen.getByText(/Concertivity is free to use/)
    ).not.toHaveTextContent("can try it free for 14 days")
  })

  it("offers the trial per plan", async () => {
    renderView({ trialPlans: { yearly: true } })
    await settle()
    expect(screen.getByTestId("card-monthly")).toHaveAttribute(
      "data-trial",
      "false"
    )
    expect(screen.getByTestId("card-yearly")).toHaveAttribute(
      "data-trial",
      "true"
    )
  })

  it("offers no trial when the server found none to offer", async () => {
    renderView({ trialPlans: { monthly: false, yearly: false } })
    await settle()
    expect(screen.getByTestId("card-monthly")).toHaveAttribute(
      "data-trial",
      "false"
    )
    expect(screen.queryByText(/free for 14 days/)).not.toBeInTheDocument()
  })

  it("hides the trial from a user who already has a subscription row", async () => {
    renderView({
      trialPlans: { monthly: true, yearly: true },
      billing: { planKey: "monthly", isPremium: false },
    })
    expect(screen.getByTestId("card-monthly")).toHaveAttribute(
      "data-trial",
      "false"
    )
    await settle()
  })

  it("hides the trial once the live billing check finds a subscription", async () => {
    respondWith({ planKey: "yearly", status: "TRIALING" })
    renderView({ trialPlans: { monthly: true, yearly: true } })
    await settle()
    expect(screen.getByTestId("card-yearly")).toHaveAttribute(
      "data-trial",
      "false"
    )
    expect(screen.getByTestId("card-yearly")).toHaveAttribute(
      "data-current",
      "true"
    )
    expect(screen.queryByText(/free for 14 days/)).not.toBeInTheDocument()
  })

  it("notes that paid plans are off when the paywall flag is off", async () => {
    renderView({ paywallEnabled: false })
    await settle()
    expect(screen.getByRole("status")).toHaveTextContent(
      "Paid plans are not enabled in this deployment yet"
    )
  })

  it("shows catalog prices and falls back to static text", async () => {
    renderView({ priceLabels: { monthly: "€4.99" } })
    await settle()
    expect(screen.getByTestId("card-monthly")).toHaveTextContent("€4.99")
    expect(screen.getByTestId("card-yearly")).toHaveTextContent(
      "Amount from your Paddle catalog"
    )
  })

  it("uses German fallback text on the German site", async () => {
    renderView({ localeDe: true })
    await settle()
    expect(screen.getByTestId("card-yearly")).toHaveTextContent(
      "Betrag aus deinem Paddle-Katalog"
    )
  })
})

describe("PricingView billing state", () => {
  it("shows the lifetime thank-you for lifetime members", async () => {
    respondWith({ planKey: "lifetime_beta", status: "LIFETIME" })
    renderView()
    await settle()
    expect(
      screen.getByText(/You have lifetime Superfan access/)
    ).toBeInTheDocument()
  })

  it("explains that lifetime is by invitation otherwise", async () => {
    renderView()
    await settle(600 * 8)
    expect(
      screen.getByText(/Lifetime access is not available for public purchase/)
    ).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(8)
  })

  it("treats a signed-out visitor as having no subscription", async () => {
    respondWith(null, 401)
    renderView({ trialPlans: { monthly: true } })
    await settle()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId("card-monthly")).toHaveAttribute(
      "data-trial",
      "true"
    )
  })

  it("retries after a server error and then reads the subscription", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          subscription: { planKey: "monthly", status: "ACTIVE" },
        }),
      })
    renderView()
    await settle(600)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(screen.getByTestId("card-monthly")).toHaveAttribute(
      "data-current",
      "true"
    )
  })

  it("does not mark a canceled subscription as the current plan", async () => {
    respondWith({ planKey: "monthly", status: "CANCELED" })
    renderView()
    await settle()
    expect(screen.getByTestId("card-monthly")).toHaveAttribute(
      "data-current",
      "false"
    )
  })

  it("refreshes when billing changes after checkout", async () => {
    renderView()
    await settle(600 * 8)
    fetchMock.mockClear()
    respondWith({ planKey: "yearly", status: "ACTIVE" })
    await act(async () => {
      window.dispatchEvent(new CustomEvent(PADDLE_BILLING_CHANGED_EVENT))
    })
    await settle()
    expect(screen.getByTestId("card-yearly")).toHaveAttribute(
      "data-current",
      "true"
    )
  })

  it("stops polling when unmounted", async () => {
    const { unmount } = renderView()
    await settle()
    unmount()
    fetchMock.mockClear()
    await settle(600 * 8)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("PricingView checkout toasts", () => {
  it("confirms a completed checkout and re-syncs billing", async () => {
    searchParams = new URLSearchParams("success=1")
    const changed = vi.fn()
    window.addEventListener(PADDLE_BILLING_CHANGED_EVENT, changed)
    renderView()
    await settle()
    expect(showToast).toHaveBeenCalledWith({
      type: "success",
      message: "Thanks — your checkout completed successfully.",
    })
    expect(changed).toHaveBeenCalled()
    window.removeEventListener(PADDLE_BILLING_CHANGED_EVENT, changed)
  })

  it("acknowledges a cancelled checkout", async () => {
    searchParams = new URLSearchParams("cancelled=1")
    renderView()
    await settle()
    expect(showToast).toHaveBeenCalledWith({
      type: "info",
      message: "Checkout was cancelled.",
    })
  })

  it("shows no toast without checkout parameters", async () => {
    renderView()
    await settle()
    expect(showToast).not.toHaveBeenCalled()
  })
})
