import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import LandingPricingSection from "./LandingPricingSection"

vi.mock("@/components/pricing/PricingTierOverview", () => ({
  PricingTierOverview: (props: {
    paywallEnabled: boolean
    variant: string
  }) => (
    <div
      data-testid="tiers"
      data-paywall={String(props.paywallEnabled)}
      data-variant={props.variant}
    />
  ),
}))

describe("LandingPricingSection", () => {
  it("promises a free app with no card at signup and no longer denies a trial", () => {
    render(<LandingPricingSection paywallEnabled />)
    const lead = screen.getByText(/Concertivity is free to use/)
    expect(lead).toHaveTextContent("no credit card at signup")
    expect(lead).not.toHaveTextContent("no trial countdown")
    expect(lead).not.toHaveTextContent("14 days")
  })

  it("mentions the 14-day trial only when it is offered", () => {
    render(<LandingPricingSection paywallEnabled trialOffered />)
    expect(screen.getByText(/Concertivity is free to use/)).toHaveTextContent(
      "New Superfan subscribers can try it free for 14 days."
    )
  })

  it("keeps a labelled heading and passes the paywall flag on", () => {
    render(<LandingPricingSection paywallEnabled={false} />)
    expect(
      screen.getByRole("heading", { name: /Start free\. Go Superfan/ })
    ).toBeInTheDocument()
    expect(screen.getByTestId("tiers")).toHaveAttribute("data-paywall", "false")
  })
})
