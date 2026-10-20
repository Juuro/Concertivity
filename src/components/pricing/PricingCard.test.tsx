import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { PricingCard } from "./PricingCard"

vi.mock("@/components/checkout/PaddleCheckoutButton", () => ({
  PaddleCheckoutButton: (props: {
    planKey: string
    label: string
    paywallEnabled: boolean
    variant: string
  }) => (
    <button
      type="button"
      data-plan={props.planKey}
      data-paywall={String(props.paywallEnabled)}
      data-variant={props.variant}
    >
      {props.label}
    </button>
  ),
}))

const base = {
  title: "Superfan Monthly",
  description: "All the extras",
  priceLabel: "€4.99",
  planKey: "monthly" as const,
  localeDe: false,
  paywallEnabled: true,
}

describe("PricingCard", () => {
  it("renders title, price, description and an English VAT note", () => {
    render(<PricingCard {...base} />)
    expect(
      screen.getByRole("heading", { level: 3, name: "Superfan Monthly" })
    ).toBeInTheDocument()
    expect(screen.getByText("€4.99")).toBeInTheDocument()
    expect(screen.getByText("All the extras")).toBeInTheDocument()
    const vat = screen.getByText("excl. VAT")
    expect(vat).toHaveAttribute(
      "title",
      "Prices exclude VAT; the final amount is shown at checkout."
    )
    expect(
      screen.getByRole("button", { name: "Subscribe" })
    ).toBeInTheDocument()
  })

  it("renders German wording", () => {
    render(<PricingCard {...base} localeDe />)
    const vat = screen.getByText("zzgl. MwSt.")
    expect(vat).toHaveAttribute(
      "title",
      "Preise zzgl. MwSt.; der finale Betrag wird beim Checkout angezeigt."
    )
    expect(
      screen.getByRole("button", { name: "Jetzt abonnieren" })
    ).toBeInTheDocument()
    expect(screen.queryByText("excl. VAT")).not.toBeInTheDocument()
  })

  it("shows optional badge, billing period and currency hint only when given", () => {
    const { rerender } = render(<PricingCard {...base} />)
    expect(screen.queryByText("Popular")).not.toBeInTheDocument()
    expect(screen.queryByText("/ month")).not.toBeInTheDocument()
    expect(screen.queryByText("(EUR)")).not.toBeInTheDocument()

    rerender(
      <PricingCard
        {...base}
        badge="Popular"
        billingPeriod="/ month"
        currencyHint="EUR"
      />
    )
    expect(screen.getByText("Popular")).toBeInTheDocument()
    expect(screen.getByText("/ month")).toBeInTheDocument()
    expect(screen.getByText("(EUR)")).toBeInTheDocument()
  })

  it("announces the current plan in the user's language", () => {
    const { rerender } = render(<PricingCard {...base} isCurrentPlan />)
    expect(screen.getByRole("status")).toHaveTextContent("Your current plan")
    rerender(<PricingCard {...base} isCurrentPlan localeDe />)
    expect(screen.getByRole("status")).toHaveTextContent("Dein aktueller Plan")
  })

  it("does not announce a current plan by default", () => {
    render(<PricingCard {...base} />)
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
  })

  it("passes plan, paywall flag and variant to the checkout button", () => {
    const { rerender } = render(
      <PricingCard {...base} paywallEnabled={false} />
    )
    let button = screen.getByRole("button", { name: "Subscribe" })
    expect(button).toHaveAttribute("data-plan", "monthly")
    expect(button).toHaveAttribute("data-paywall", "false")
    expect(button).toHaveAttribute("data-variant", "secondary")

    rerender(<PricingCard {...base} planKey="lifetime_beta" highlighted />)
    button = screen.getByRole("button", { name: "Subscribe" })
    expect(button).toHaveAttribute("data-plan", "lifetime_beta")
    expect(button).toHaveAttribute("data-variant", "primary")
  })
})
