import type { Metadata } from "next"
import type { ReactNode } from "react"

export const metadata: Metadata = {
  title: "Pricing | Concertivity",
  description: "Superfan subscription plans for Concertivity.",
}

export default function PricingLayout({ children }: { children: ReactNode }) {
  return children
}
