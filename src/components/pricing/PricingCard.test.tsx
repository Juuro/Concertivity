import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { PricingCard } from "./PricingCard"

vi.mock("@/components/checkout/PaddleCheckoutButton", () => ({
  PaddleCheckoutButton: (props: {
    planKey: string
    label: string
    paywallEnabled: boolean
    variant: string
    trialOffered?: boolean
    localeDe?: boolean
  }) => (
    <button
      type="button"
      data-trial={String(props.trialOffered)}
      data-de={String(props.localeDe)}
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

describe("PricingCard trial", () => {
  const trial = { ...base, billingPeriod: "per month", trialOffered: true }

  it("offers the 14-day trial with honest terms and a trial button", () => {
    render(<PricingCard {...trial} />)
    expect(screen.getByText("14-day free trial")).toBeInTheDocument()
    expect(
      screen.getByText(
        "A payment method is required now. After 14 days you are charged €4.99 per month automatically unless you cancel before the trial ends."
      )
    ).toBeInTheDocument()
    const button = screen.getByRole("button", { name: "Start free trial" })
    expect(button).toHaveAttribute("data-trial", "true")
    expect(
      screen.queryByRole("button", { name: "Subscribe" })
    ).not.toBeInTheDocument()
  })

  it("offers the trial in German", () => {
    render(<PricingCard {...trial} billingPeriod="pro Monat" localeDe />)
    expect(screen.getByText("14 Tage kostenlos testen")).toBeInTheDocument()
    expect(
      screen.getByText(
        "Eine Zahlungsmethode ist jetzt erforderlich. Nach 14 Tagen werden €4.99 pro Monat automatisch berechnet, sofern du nicht vor Ende der Testphase kündigst."
      )
    ).toBeInTheDocument()
    const button = screen.getByRole("button", {
      name: "Kostenlos testen starten",
    })
    expect(button).toHaveAttribute("data-de", "true")
  })

  it("does not quote an amount when only the fallback price text is shown", () => {
    render(
      <PricingCard
        {...trial}
        priceLabel="Amount from catalog"
        currencyHint="EUR"
      />
    )
    expect(
      screen.getByText(
        "A payment method is required now. After 14 days you are charged automatically unless you cancel before the trial ends."
      )
    ).toBeInTheDocument()
  })

  it("shows today's wording when no trial is offered", () => {
    render(<PricingCard {...base} />)
    expect(screen.queryByText(/14-day free trial/)).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Subscribe" })).toHaveAttribute(
      "data-trial",
      "false"
    )
  })

  it("never mentions a trial on the lifetime plan", () => {
    render(<PricingCard {...trial} planKey="lifetime_beta" />)
    expect(screen.queryByText(/14-day free trial/)).not.toBeInTheDocument()
    expect(screen.queryByText(/payment method/)).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Subscribe" })).toHaveAttribute(
      "data-trial",
      "false"
    )
  })
})
