# Implementation Plan: 14-Day Superfan Trial

**Branch**: `feat/paddle-mor-superfan` (PR #287; spec dir `specs/003-paddle-14-day-trial`) | **Date**: 2026-10-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-paddle-14-day-trial/spec.md`

## Summary

Make the already-modelled `TRIALING` state reachable. The payment provider attaches a trial to a *price*, not to a transaction, so each recurring plan gets a second catalog price with a 14-day card-required trial. Checkout picks the trial price only when a server-side eligibility check passes (no local subscription row, no provider subscription history for the user's customer records); otherwise it uses today's no-trial price. Along the way the plan closes four gaps found in the existing integration that would break a trial in production: webhook events for trial start and trial-to-paid conversion are rejected by the envelope schema, a cancel-during-trial is invisible locally, reconciliation ignores trial-end drift, and the pricing copy says "no trial". Trial offer is hidden unless both trial prices are configured, so deploys without them behave exactly as today.

## Technical Context

**Language/Version**: TypeScript (strict), Node.js 22, Next.js App Router (Next 16; route-handler APIs re-checked in `node_modules/next/dist/docs/` before edits)

**Primary Dependencies**: `@paddle/paddle-node-sdk` (server only, wrapped in `src/lib/paddle/client.ts`), Paddle.js overlay (unchanged), Zod 4, Prisma 7.5, Vitest 4 + React Testing Library

**Storage**: PostgreSQL via Prisma. One additive nullable column on `Subscription` (`cancelScheduledFor`), expand-only migration.

**Testing**: `yarn test`, `yarn test:coverage` (per-file 80% on lines/branches/functions/statements); provider mocked, no live calls

**Target Platform**: Vercel serverless (stateless instances), browser for the pricing and settings UI

**Project Type**: Web application (Next.js App Router), single project

**Performance Goals**: Pricing page adds no provider call (local eligibility only). Checkout adds at most one bounded provider lookup (3 s timeout) before creating the transaction.

**Constraints**: Provider outage must not break checkout or pages (fail safe = no trial). New env vars optional and documented. No new third-party browser calls, so no CSP change. No new dependencies.

**Scale/Scope**: ~15 source files touched, 1 migration, 1 new module, 1 ADR, ~10 test files added or extended.

## Constitution Check

*GATE: passed before research; re-checked after design — still passes.*

| Principle | Status | Note |
|---|---|---|
| I. Security/Privacy | Pass | Eligibility decided server-side from session user; body schema carries no trial flag (FR-016). Checkout keeps session + flag checks; new provider lookups are rate limited. No PII added to logs or Sentry. Export gains `cancelScheduledFor`. Deletion path already cancels immediately; trial covered by tests. |
| II. Data integrity | Pass | Migration is additive and nullable (expand-only, safe with deployed code). Webhook handling stays idempotent via `UNIQUE(eventId)` and a `userId`-unique upsert. |
| III. Type-safe, server-first | Pass | Eligibility and price choice are server code; pricing page stays a server component and passes plain props. Checkout response gets a typed `trial` boolean. |
| IV. UI | Pass | SCSS modules and tokens only; trial note is semantic text with `role="status"` where dynamic; both locales; accessible names kept. |
| V. Stateless | Pass | No module-level state for eligibility; rate limiter follows the existing `createRateLimiter` pattern and its documented per-instance limitation. |
| VI. Resilient integrations | Pass | Eligibility lookup has a timeout and fails closed (no trial). Single adapter (`client.ts`) is reused. Responses stay schema-guarded. |
| VII. Tested, flag-gated | Pass | `ENABLE_PAYWALL` off hides every trial surface. Allowed and denied paths tested. Provider mocked. |
| Technical constraints | Pass | New env vars documented in `.env.example`; validated at first use via the existing config schema. |

### Plan impact statements

- **Security/privacy**: new server-side eligibility check reads the user's own subscription row and provider customer records; no new personal data leaves the system. Prior-trial detection uses the account email already sent to the provider, and a deleted-and-recreated account is an accepted residual gap (see research R4). Privacy text already names the provider as sub-processor; no new processor.
- **Data model**: one nullable column. See [data-model.md](./data-model.md).
- **Concurrency/caching**: no caches added. Two simultaneous checkouts by one user are bounded by the existing unique `userId` on `Subscription` (research R7).
- **External APIs**: provider adds two listing calls at checkout and one price fetch on the settings page; all with timeouts and fallbacks.

## Decisions needing an ADR

- **Per-user trial eligibility via paired catalog prices** — third-party integration boundary and operator-facing configuration. Recorded as [ADR 0002](../../docs/adr/0002-paddle-trial-eligibility-via-paired-prices.md).

## Project Structure

### Documentation (this feature)

```text
specs/003-paddle-14-day-trial/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── checkout-api.md
│   └── webhook-events.md
├── checklists/requirements.md
└── tasks.md             # created by /speckit-tasks
```

### Source Code (repository root)

```text
prisma/
├── schema.prisma                                 # + Subscription.cancelScheduledFor
└── migrations/<ts>_add_subscription_cancel_scheduled_for/migration.sql

src/lib/paddle/
├── config.ts                    # optional trial price ids; getTrialPriceIdForPlan; getPlanForPriceId maps them; isTrialOfferConfigured
├── trial.ts                     # NEW: getLocalTrialEligibility, getTrialEligibility (authoritative, fail-closed)
├── client.ts                    # reused (listCustomersByEmail, listCustomerSubscriptions)
├── webhook-handler.ts           # dispatch subscription.trialing / .activated; read scheduled_change
├── subscription-sync.ts         # carry scheduled_change into sync data
├── reconcile.ts                 # drift also on trialEndsAt / cancelScheduledFor
├── entitlement.ts               # summary: cancelScheduledFor, firstChargeAmountLabel
├── price-previews.ts            # single-plan label helper with short timeout
└── gdpr.ts                      # export selects cancelScheduledFor

src/lib/validations/paddle.ts    # + two event types in the envelope union
app/api/paddle/checkout/route.ts # eligibility, price choice, rate limit, `trial` in response
app/pricing/page.tsx             # server: computes trialPlans (local eligibility only) and passes it down
app/pricing/PricingView.tsx      # client: receives trialPlans, forwards to cards, new intro copy
app/page.tsx                     # server: computes trialOffered for the landing section
src/components/landing/LandingPricingSection.tsx # trialOffered prop, new intro copy
src/components/pricing/PricingCard.tsx            # trial line + CTA label, both locales
src/components/checkout/PaddleCheckoutButton.tsx  # trial-not-applied notice
src/components/subscription/SubscriptionSection.tsx # first charge, scheduled cancel
.env.example                     # PADDLE_PRICE_ID_MONTHLY_TRIAL / _YEARLY_TRIAL
docs/adr/0002-paddle-trial-eligibility-via-paired-prices.md

# tests (colocated): config, trial, webhook-handler, reconcile, entitlement, price-previews,
# gdpr, validations/paddle, checkout route, webhook route, PricingCard, PaddleCheckoutButton,
# SubscriptionSection, src/test-utils/paddle.ts builders
```

**Structure Decision**: single Next.js project; trial logic isolated in one new module (`trial.ts`) so the checkout route and pricing page share one definition of eligibility. No new layers.

## Complexity Tracking

No constitution violations to justify.
