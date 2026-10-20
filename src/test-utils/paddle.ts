import { vi } from "vitest"

/** Dummy Paddle environment shared by all Paddle tests. */
export const PADDLE_TEST_ENV = {
  PADDLE_API_KEY: "test-api-key",
  PADDLE_WEBHOOK_SECRET: "test-webhook-secret",
  PADDLE_ENVIRONMENT: "sandbox",
  PADDLE_PRICE_ID_MONTHLY: "pri_monthly",
  PADDLE_PRICE_ID_YEARLY: "pri_yearly",
  PADDLE_PRICE_ID_LIFETIME_BETA: "pri_lifetime",
} as const

export function stubPaddleEnv(extra: Record<string, string> = {}): void {
  for (const [key, value] of Object.entries({ ...PADDLE_TEST_ENV, ...extra })) {
    vi.stubEnv(key, value)
  }
}

export type WebhookEventType =
  | "subscription.created"
  | "subscription.updated"
  | "subscription.canceled"
  | "subscription.past_due"
  | "subscription.paused"
  | "transaction.completed"
  | "adjustment.created"

/** Webhook envelope as validated by `paddleWebhookEnvelope`. */
export function buildWebhookEvent(
  type: WebhookEventType,
  data: unknown = {},
  eventId = "evt_1"
) {
  return { event_id: eventId, event_type: type, data }
}

/** `data` of a subscription webhook (snake_case, as Paddle sends it). */
export function buildSubscriptionData(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id: "sub_1",
    status: "active",
    customer_id: "ctm_1",
    custom_data: { user_id: "user_1" },
    current_billing_period: {
      starts_at: "2026-01-01T00:00:00Z",
      ends_at: "2026-02-01T00:00:00Z",
    },
    items: [
      {
        recurring: true,
        price_id: "pri_monthly",
        price: { id: "pri_monthly" },
        trial_dates: null,
      },
    ],
    ...overrides,
  }
}

/** `data` of a `transaction.completed` webhook. */
export function buildTransactionData(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id: "txn_1",
    customer_id: "ctm_1",
    custom_data: { user_id: "user_1" },
    items: [{ price_id: "pri_lifetime", price: { id: "pri_lifetime" } }],
    ...overrides,
  }
}

/** `data` of an `adjustment.created` webhook. */
export function buildAdjustmentData(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    action: "refund",
    status: "approved",
    customer_id: "ctm_1",
    items: [{ type: "full" }],
    ...overrides,
  }
}

/** Remote subscription as returned by the Paddle Node SDK (camelCase). */
export function buildRemoteSubscription(
  overrides: Record<string, unknown> = {}
) {
  return {
    id: "sub_1",
    status: "active",
    customerId: "ctm_1",
    customData: { user_id: "user_1" },
    currentBillingPeriod: {
      startsAt: "2026-01-01T00:00:00Z",
      endsAt: "2026-02-01T00:00:00Z",
    },
    nextBilledAt: "2026-02-01T00:00:00Z",
    canceledAt: null,
    items: [
      {
        recurring: true,
        price: { id: "pri_monthly" },
        trialDates: null,
      },
    ],
    ...overrides,
  }
}

function modelMock(
  methods: string[]
): Record<string, ReturnType<typeof vi.fn>> {
  return Object.fromEntries(methods.map((m) => [m, vi.fn()]))
}

/** Prisma stand-in with a `vi.fn()` per method the Paddle code uses. */
export function makePrismaMock() {
  const prisma = {
    user: modelMock(["findUnique", "findFirst", "findMany", "update"]),
    subscription: modelMock([
      "findUnique",
      "findMany",
      "count",
      "upsert",
      "update",
      "delete",
    ]),
    paddleWebhookEvent: modelMock([
      "create",
      "update",
      "findMany",
      "findFirst",
    ]),
    adminActivity: modelMock(["create"]),
    $transaction: vi.fn(),
  }
  prisma.$transaction.mockImplementation(
    async (cb: (tx: typeof prisma) => unknown) => cb(prisma)
  )
  return prisma
}

export type PrismaMock = ReturnType<typeof makePrismaMock>

/** Better Auth session shape used by the route handlers. */
export function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      id: "user_1",
      email: "fan@example.com",
      role: "user",
      ...overrides,
    },
  }
}
