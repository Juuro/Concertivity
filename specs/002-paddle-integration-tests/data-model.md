# Test Data Model: fixtures and mock surfaces

No schema or runtime data changes. This describes the shared test scaffolding in `src/test-utils/paddle.ts`.

## Fixture builders
| Builder | Produces | Key variations |
|---|---|---|
| `buildWebhookEvent(type, overrides)` | Paddle envelope `{ event_id, event_type, occurred_at, data }` for all 7 types | missing fields, unknown type, bad price id |
| `buildPaddleSubscription(overrides)` | Remote subscription (SDK shape) | `trialing`, `active`, `past_due`, `paused`, `canceled`; scheduled change |
| `buildTransaction(overrides)` | Completed transaction | recurring vs. lifetime price |
| `buildAdjustment(overrides)` | Refund adjustment | full vs. partial |
| `makePrismaMock()` | Object with `vi.fn()` for `subscription`, `paddleWebhookEvent`, `user`, `adminActivity`, `$transaction` | `$transaction` runs callback with the same mock |
| `makeSession(overrides)` | Better Auth session `{ user: { id, email, role } }` | unauthenticated = `null` |

## Entities exercised (from spec Key Entities)
- **Subscription**: statuses `TRIALING, ACTIVE, PAST_DUE, PAUSED, CANCELED, LIFETIME`.
  Transitions under test: created→TRIALING, TRIALING→ACTIVE, ACTIVE→PAST_DUE→ACTIVE, ACTIVE→PAUSED, any→CANCELED, LIFETIME→CANCELED (full refund only).
- **Webhook event record**: states received → processed | failed; `retryCount` increments up to the cap; payload stored redacted.
- **Audit entry (`AdminActivity`)**: actions `paddle_reconcile_drift`, `paddle_erasure`, plus webhook state changes.
- **Provider customer**: linked via `User.paddleCustomerId`; anonymised on erasure.

## Environment stubs
`PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`, `PADDLE_ENVIRONMENT`, `PADDLE_PRICE_ID_{MONTHLY,YEARLY,LIFETIME_BETA}`, `LIFETIME_OFFER_DEADLINE`, `LIFETIME_OFFER_SEAT_CAP`, `ENABLE_PAYWALL`, `CRON_SECRET`, `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`, `NEXT_PUBLIC_PADDLE_ENV` — all dummy values via `vi.stubEnv`.
