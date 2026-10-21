export const FREE_TIER_FEATURES = [
  "Unlimited concert logging",
  "Interactive map of your shows",
  "Stats — top bands, cities, and years",
  "Band pages with genre context",
  "Public profile to share your journey",
] as const

export const SUPERFAN_TIER_FEATURES = [
  "Everything in the free plan",
  "Support independent development",
  "Early access to premium features as they launch",
  "Flexible monthly or yearly billing",
] as const

export const PRICING_FAQ = [
  {
    question: "Do I need to pay to use Concertivity?",
    answer:
      "No. The core app is free — track concerts, view your map, explore stats, and share your profile without a subscription or credit card.",
  },
  {
    question: "What does Superfan include today?",
    answer:
      "Superfan supports ongoing development and gives you early access to premium capabilities as we ship them. You keep full free-tier access either way.",
  },
  {
    question: "Can I buy a lifetime plan?",
    answer:
      "Lifetime access is not sold publicly. It is offered only to manually assigned beta testers or on special occasions — never as a standard checkout option.",
  },
  {
    question: "How does billing work?",
    answer:
      "Superfan subscriptions are processed by Paddle as merchant of record. Taxes and invoices are shown at checkout where applicable, and you can manage billing from Settings.",
  },
] as const
