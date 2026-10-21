// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { auth } from "@/lib/auth"
import { isTrialOfferConfigured } from "@/lib/paddle/config"
import { getPricingBillingHint } from "@/lib/paddle/entitlement"
import { getPlanPriceLabels } from "@/lib/paddle/price-previews"
import { getLocalTrialEligibility } from "@/lib/paddle/trial"
import { makeSession } from "@/test-utils/paddle"
import PricingPage from "./page"

let acceptLanguage = "en-US"

vi.mock("next/headers", () => ({
  headers: vi.fn(
    async () => new Headers({ "accept-language": acceptLanguage })
  ),
  cookies: vi.fn(async () => ({})),
}))
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn() } } }))
vi.mock("@/components/layout-client", () => ({
  default: ({ children }: { children: unknown }) => children,
}))
vi.mock("./PricingView", () => ({ PricingView: () => null }))
vi.mock("./pricing.scss", () => ({}))
vi.mock("@/lib/paddle/config", () => ({ isTrialOfferConfigured: vi.fn() }))
vi.mock("@/lib/paddle/entitlement", () => ({ getPricingBillingHint: vi.fn() }))
vi.mock("@/lib/paddle/price-previews", () => ({ getPlanPriceLabels: vi.fn() }))
vi.mock("@/lib/paddle/trial", () => ({ getLocalTrialEligibility: vi.fn() }))

const getSession = vi.mocked(auth.api.getSession) as unknown as ReturnType<
  typeof vi.fn
>
const configured = vi.mocked(isTrialOfferConfigured)
const eligible = vi.mocked(getLocalTrialEligibility)
const hint = vi.mocked(getPricingBillingHint)
const labels = vi.mocked(getPlanPriceLabels)

type ViewProps = {
  trialPlans: { monthly: boolean; yearly: boolean }
  localeDe: boolean
  paywallEnabled: boolean
  billing: unknown
  priceLabels: unknown
}

// The page is an async server component returning a React element tree; the
// props of the PricingView element are what the browser receives.
async function viewProps(): Promise<ViewProps> {
  const tree = (await PricingPage()) as {
    props: { children: { props: { children: { props: ViewProps } } } }
  }
  return tree.props.children.props.children.props
}

beforeEach(() => {
  vi.resetAllMocks()
  acceptLanguage = "en-US"
  vi.stubEnv("ENABLE_PAYWALL", "true")
  getSession.mockResolvedValue(makeSession())
  configured.mockReturnValue(true)
  eligible.mockResolvedValue(true)
  hint.mockResolvedValue(null)
  labels.mockResolvedValue({})
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("PricingPage trial plans", () => {
  it("offers the trial to an eligible signed-in user on configured plans", async () => {
    const props = await viewProps()
    expect(props.trialPlans).toEqual({ monthly: true, yearly: true })
    expect(eligible).toHaveBeenCalledWith("user_1")
  })

  it("offers the trial to a signed-out visitor without a lookup", async () => {
    getSession.mockResolvedValue(null)
    const props = await viewProps()
    expect(props.trialPlans).toEqual({ monthly: true, yearly: true })
    expect(eligible).not.toHaveBeenCalled()
  })

  it("offers no trial to a user with subscription history", async () => {
    eligible.mockResolvedValue(false)
    expect((await viewProps()).trialPlans).toEqual({
      monthly: false,
      yearly: false,
    })
  })

  it("offers no trial while the paywall flag is off", async () => {
    vi.stubEnv("ENABLE_PAYWALL", "false")
    expect((await viewProps()).trialPlans).toEqual({
      monthly: false,
      yearly: false,
    })
  })

  it("offers the trial only on plans with a trial price", async () => {
    configured.mockImplementation((plan) => plan === "yearly")
    expect((await viewProps()).trialPlans).toEqual({
      monthly: false,
      yearly: true,
    })
  })

  it("offers no trial when the eligibility lookup throws", async () => {
    eligible.mockRejectedValue(new Error("db down"))
    expect((await viewProps()).trialPlans).toEqual({
      monthly: false,
      yearly: false,
    })
  })
})

describe("PricingPage other props", () => {
  it("passes the billing hint, price labels and locale", async () => {
    acceptLanguage = "de-DE,de;q=0.9"
    hint.mockResolvedValue({ planKey: "monthly", isPremium: true })
    labels.mockResolvedValue({ monthly: "4,99 €" })
    const props = await viewProps()
    expect(props.localeDe).toBe(true)
    expect(props.billing).toEqual({ planKey: "monthly", isPremium: true })
    expect(props.priceLabels).toEqual({ monthly: "4,99 €" })
    expect(labels).toHaveBeenCalledWith("de-DE")
  })

  it("survives billing and price lookups failing", async () => {
    hint.mockRejectedValue(new Error("x"))
    labels.mockRejectedValue(new Error("y"))
    const props = await viewProps()
    expect(props.billing).toBeNull()
    expect(props.priceLabels).toEqual({})
    expect(props.paywallEnabled).toBe(true)
  })
})
