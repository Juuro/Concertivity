---

description: "Task list for the 14-day Superfan trial"
---

# Tasks: 14-Day Superfan Trial

**Input**: Design documents from `/specs/003-paddle-14-day-trial/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/checkout-api.md, contracts/webhook-events.md, quickstart.md

**Tests**: Required (spec FR-018, constitution VII). Test tasks come before the implementation they pin. All provider, Prisma, auth and Sentry calls are mocked; no live provider calls. Every touched file must keep the per-file 80% gate (lines, branches, functions, statements).

**Organization**: Grouped by user story. US1 and US2 are both P1 and **must ship together**: US1 alone would let anyone repeat a trial, so do not release after US1 only.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: different files, no dependency on an incomplete task
- Paths are repository-relative. Imports use `@/*`. SCSS modules only; colours, spacing and motion from tokens in `src/styles/variables.scss`.

## Conventions for the implementer

- Reuse `src/test-utils/paddle.ts` (`stubPaddleEnv`, `buildWebhookEvent`, `buildSubscriptionData`, `buildRemoteSubscription`, `makePrismaMock`, `makeSession`) and the reset helpers `resetPaddleConfigCacheForTests` / `resetPaddleApiForTests`. Route tests use `// @vitest-environment node`.
- Existing tests that pin current behaviour must stay green; only add or extend.
- Commit with Conventional Commits (`feat(paddle): ...`, `test(paddle): ...`).

---

## Phase 1: Setup

- [X] T001 Document the two new optional variables in `.env.example` in the Paddle server block, commented out like their neighbours: `# PADDLE_PRICE_ID_MONTHLY_TRIAL=""` and `# PADDLE_PRICE_ID_YEARLY_TRIAL=""`. Add a comment that these are catalog prices with a 14-day card-required free trial and that the existing `PADDLE_PRICE_ID_MONTHLY` / `PADDLE_PRICE_ID_YEARLY` MUST have no trial period. State that the trial prices must be created with `requires_payment_method: true` (card-required is enforced only by this catalog setting).
- [X] T002 [P] Read the route-handler section under `node_modules/next/dist/docs/` before editing any route (CLAUDE.md: this Next.js has breaking changes). Note anything that affects `NextRequest`, `NextResponse.json` or `export const runtime` in the plan notes at the bottom of this file; expect no change.

---

## Phase 2: Foundational (blocks all user stories)

- [X] T003 Add `cancelScheduledFor DateTime?` to `model Subscription` in `prisma/schema.prisma` (nullable, no default, no backfill; "Never client-writable") and create `prisma/migrations/20261022120000_add_subscription_cancel_scheduled_for/migration.sql` containing `ALTER TABLE "subscription" ADD COLUMN "cancelScheduledFor" TIMESTAMP(3);`. Expand-only; no index. Run `yarn db:generate`. Do not apply by hand outside `yarn prisma migrate dev`.
- [X] T004 In `src/lib/paddle/config.ts` add optional `priceIdMonthlyTrial` and `priceIdYearlyTrial` to `configSchema` (read from `PADDLE_PRICE_ID_MONTHLY_TRIAL` / `PADDLE_PRICE_ID_YEARLY_TRIAL`, trimmed, empty string → `undefined`, so a missing value never makes config invalid). Add `isTrialOfferConfigured(plan: PaddlePlanKey): boolean` (false for `lifetime_beta` and when config is invalid, never throws), `getTrialPriceIdForPlan(plan): string | null`, and extend `getPlanForPriceId` so each trial price id returns the same plan key as its no-trial price.
- [X] T005 Extend `src/lib/paddle/config.test.ts`: trial ids unset → `isTrialOfferConfigured` false and config still valid; set → true for monthly/yearly only, `getTrialPriceIdForPlan("lifetime_beta")` null; trial ids map to `monthly`/`yearly` in `getPlanForPriceId`; whitespace-only value counts as unset; invalid config returns false instead of throwing.
- [X] T006 [P] Extend `src/test-utils/paddle.ts`: add trial ids to `PADDLE_TEST_ENV` (`PADDLE_PRICE_ID_MONTHLY_TRIAL`, `PADDLE_PRICE_ID_YEARLY_TRIAL`) with an option on `stubPaddleEnv` to omit them; let `buildSubscriptionData` and `buildRemoteSubscription` accept `scheduledChange?: { action: "cancel"; effectiveAt: string } | null` and a trial price id; keep every existing signature backward compatible.
- [X] T007 Create `src/lib/paddle/trial.ts` exporting `getLocalTrialEligibility(userId): Promise<boolean>` (true iff no `Subscription` row for `userId`; no provider call) and `getTrialEligibility(userId): Promise<boolean>` (local check first; then collect customer ids from `User.paddleCustomerId` plus `listCustomersByEmail(user.email)`; eligible only if `listCustomerSubscriptions` returns no subscription of any status for any of them). The whole provider part is wrapped in `Promise.race` with `rejectAfterMs(3000)` from `./client`; any error or timeout returns `false`. Missing user returns `false`. No module-level state, no logging of the email.
- [X] T008 Create `src/lib/paddle/trial.test.ts` with fake timers: no row + no history → true; row of each status (`CANCELED`, `TRIALING`, `ACTIVE`, `LIFETIME`) → false; linked customer with a canceled provider subscription → false; email matches a second customer with a subscription → false; provider throws → false; provider hangs past 3 s → false; unknown user → false; `getLocalTrialEligibility` never calls the client mock.

**Checkpoint**: config, schema and eligibility exist; no behaviour visible to users yet.

---

## Phase 3: User Story 1 - Eligible user starts and completes a trial (P1)

**Goal**: eligible user checks out on the trial price, is `TRIALING` with access, sees the trial in settings, converts to `ACTIVE`, or cancels without being charged.

**Independent test**: with mocks, post checkout for monthly as an eligible user and get the trial price and `trial: true`; process trial-start, conversion and scheduled-cancel events and see the right stored state and settings text.

### Tests for US1

- [X] T009 [P] [US1] `src/lib/validations/paddle.test.ts`: `subscription.trialing` and `subscription.activated` parse; an unrelated event type is still rejected; `data` key still required.
- [X] T010 [P] [US1] `src/lib/paddle/webhook-handler.test.ts`: `subscription.trialing` with a trial price creates a `TRIALING` row with `trialEndsAt` from `trial_dates.ends_at` and `planKey` resolved from the trial price id; `subscription.activated` moves `TRIALING` → `ACTIVE`; `scheduled_change` with `action: "cancel"` stores `cancelScheduledFor` from `effective_at`; a later event without a scheduled change, or with another action, clears it to `null`; the audit/processed-row behaviour is unchanged; a `TRIALING` row receiving an event with status `past_due` becomes `PAST_DUE` (failed first payment, SC-004) and keeps `trialEndsAt`; an update that changes the price id from monthly to yearly with unchanged `trial_dates` keeps `trialEndsAt` and the new `planKey` (plan switch during trial).
- [X] T011 [P] [US1] `src/lib/paddle/subscription-sync.test.ts`: `paddleSubscriptionRemoteToSyncData` carries `scheduled_change` (snake_case, `effective_at`) and `null` when absent; `syncSubscriptionFromCheckoutTransaction` with a completed zero-amount trial transaction that has a `subscriptionId` fetches the subscription and stores `TRIALING` (the localhost path without webhooks); if the transaction status is not one of the paid statuses the function returns `false` and stores nothing. If the zero-amount case turns out to use another status in the sandbox (see T045), extend `transactionIsPaid` in `src/lib/paddle/subscription-sync.ts` accordingly and add that status to this test.
- [X] T012 [P] [US1] `src/lib/paddle/entitlement.test.ts`: `getSubscriptionSummary` returns `cancelScheduledFor` as ISO or `null`; `TRIALING` with a scheduled cancel stays entitled in `isUserSuperfan`; `firstChargeAmountLabel` is set for `TRIALING` monthly/yearly without a scheduled cancel, `null` for other statuses and when the price fetch fails or times out; with `includePortalSession: false` the price helper is never called.
- [X] T013 [P] [US1] `src/lib/paddle/price-previews.test.ts`: new single-plan helper returns a locale-formatted label, returns `null` when Paddle is unconfigured, on error, and after its 3 s timeout (fake timers); existing `getPlanPriceLabels` tests unchanged.
- [X] T014 [P] [US1] `src/components/subscription/SubscriptionSection.test.tsx`: trial shows status, trial end date and "first charge" date plus amount when the label exists, date only when it does not; a scheduled cancel shows access-until text, "you will not be charged", and no first-charge line; non-trial states unchanged.
- [X] T015 [US1] `app/api/paddle/checkout/route.test.ts`: eligible user and trial price configured → transaction items use the trial price id and body is `{ transactionId, trial: true }`; trial price not configured → standard price and `trial: false`; `lifetime_beta` → standard price and `trial: false` and eligibility never called; rate limit exceeded → `429 { error: "rate_limited" }` and no provider call; flag off, no session, invalid body behave as before (existing tests stay).
- [X] T016 [P] [US1] `src/lib/paddle/gdpr.test.ts`: `getSubscriptionExportData` selects `cancelScheduledFor`.

### Implementation for US1

- [X] T017 [P] [US1] `src/lib/validations/paddle.ts`: add `envelopeBranch("subscription.trialing")` and `envelopeBranch("subscription.activated")` to `paddleWebhookEnvelope`.
- [X] T018 [US1] `src/lib/paddle/webhook-handler.ts`: route the two new event types in `processPaddleWebhookEvent` to `handleSubscriptionEvent`; in `syncSubscriptionFromPaddleData` read `scheduled_change` (only `action === "cancel"` with a parseable `effective_at` sets the value; everything else writes `null`) and write `cancelScheduledFor` in both `create` and `update`. Quote: "Null by default. Set from the provider's scheduled change when its action is `cancel`; cleared when the change is removed."
- [X] T019 [US1] `src/lib/paddle/subscription-sync.ts`: include `scheduled_change` in `paddleSubscriptionRemoteToSyncData` (`{ action, effective_at }` mapped from the SDK's `scheduledChange`, or `null`).
- [X] T020 [P] [US1] `src/lib/paddle/price-previews.ts`: add `getPlanPriceLabel(plan, locale)` using the existing formatter with `rejectAfterMs(3000)`, returning `null` on any failure or when `tryGetPaddleEnvConfig()` is null.
- [X] T021 [US1] `src/lib/paddle/entitlement.ts`: extend `SubscriptionSummary` with `cancelScheduledFor: string | null` and `firstChargeAmountLabel: string | null`; compute the label only for `TRIALING`, recurring plan, no scheduled cancel, **and only when the portal session is requested** (`options.includePortalSession !== false`), so the pricing page's `?portal=0` polling (up to 8 requests) never triggers a provider price fetch. The locale for formatting comes from a new optional `options.locale` (default `en-US`), passed by the settings caller. Update `getSubscriptionSummary` accordingly and any consumer of the type (`app/api/paddle/subscription/route.ts`, `src/components/subscription/SubscriptionSection.tsx`) and its existing test fixtures.
- [X] T022 [P] [US1] `src/lib/paddle/gdpr.ts`: add `cancelScheduledFor: true` to the `getSubscriptionExportData` select.
- [X] T023 [US1] `app/api/paddle/checkout/route.ts`: create a module-level limiter with `createRateLimiter` from `@/lib/rateLimit` (per-user key, for example 10 per minute) checked after the session check and before any provider call; for `monthly`/`yearly`, when `isTrialOfferConfigured(planKey)` run `getTrialEligibility(userId)` and use `getTrialPriceIdForPlan` if true, else `getPriceIdForPlan`; return `{ transactionId, trial }`. The request schema stays unchanged so a client-supplied trial claim is ignored. Follow `contracts/checkout-api.md`.
- [X] T024 [US1] `src/components/subscription/SubscriptionSection.tsx`: render the first-charge line (date from `trialEndsAt`, amount when present) for trials, and the scheduled-cancel text when `cancelScheduledFor` is set, localized to the browser locale like the existing dates; keep semantic markup and existing classes in `SubscriptionSection.module.scss`.

**Checkpoint**: eligible flow works end to end against mocks. Do not release yet (see US2).

---

## Phase 4: User Story 2 - One trial per person (P1)

**Goal**: ineligible users never get a trial, and know it.

**Independent test**: for each ineligible history the checkout returns the standard price and `trial: false`, and the button tells the user.

### Tests for US2

- [X] T025 [US2] Extend `app/api/paddle/checkout/route.test.ts`: user with a `CANCELED` row → standard price, `trial: false`; trialed-then-canceled row → same; provider shows a subscription for the user's email under another customer id → same; eligibility lookup rejects or hangs → `200` with standard price and `trial: false` (no 5xx); body containing an extra `trial: true` field is ignored; already `TRIALING` user → `409 already_subscribed` and no transaction.
- [X] T026 [P] [US2] `src/components/checkout/PaddleCheckoutButton.test.tsx`: with `trialOffered` true and response `trial: false`, a `role="status"` notice appears (both locales via a `localeDe` prop) and the overlay still opens with the transaction id; with `trialOffered` true and `trial: true`, no notice; without `trialOffered`, no notice; the notice is found with `getByRole("status")` and the button keeps its accessible name (FR-017); existing error and redirect tests stay green.

### Implementation for US2

- [X] T027 [US2] `src/components/checkout/PaddleCheckoutButton.tsx`: add optional `trialOffered?: boolean` and `localeDe?: boolean`; read `trial` from the checkout response and show the status notice (EN: "A free trial is not available for this account. You will be charged at checkout." / DE equivalent) before calling `openPaddleCheckout`. Style in `PaddleCheckoutButton.module.scss` with existing tokens; no `!important`.

**Checkpoint**: US1 + US2 together are the releasable core.

---

## Phase 5: User Story 3 - Honest, consistent wording (P2)

**Goal**: every page describes the same trial terms, in both languages, to the right audience.

**Independent test**: render pricing card, pricing view and landing section for signed-out, eligible, ineligible and lifetime cases and read the text.

### Tests for US3

- [X] T028 [P] [US3] `src/components/pricing/PricingCard.test.tsx`: `trialOffered` on monthly/yearly shows "14-day free trial", the auto-charge sentence including the price label, and the CTA "Start free trial" (DE: "14 Tage kostenlos testen"); `trialOffered` false shows today's text and CTA; `lifetime_beta` never shows trial wording even if `trialOffered` is passed; `PaddleCheckoutButton` receives `trialOffered`; the CTA is found with `getByRole("button", { name })` in both locales (FR-017).
- [X] T029 [P] [US3] `app/pricing/PricingView.test.tsx` (create if absent, mocking server helpers and child components): signed-out visitor and eligible user see trial wording; ineligible user does not; `paywallEnabled` false shows none; the intro no longer contains "no trial countdown" and still says no credit card at signup.
- [X] T030 [P] [US3] `src/components/landing/LandingPricingSection.test.tsx` (create if absent): intro no longer says "no trial countdown", still says the app is free and needs no card at signup; mentions the 14-day trial only when the `trialOffered` prop is true. Also add `app/pricing/page.test.tsx` (create if absent; `// @vitest-environment node`, mock `auth`, `next/headers`, `@/lib/paddle/*`): `trialPlans` is true for an eligible user and for a signed-out visitor, false when the user has a subscription row, when the paywall flag is off, when a trial price is unset, and when the eligibility helper throws.

### Implementation for US3

- [X] T031 [US3] `src/components/pricing/PricingCard.tsx` and `PricingCard.module.scss`: add `trialOffered?: boolean`; when true and the plan is monthly or yearly, show the trial line and terms sentence ("A payment method is required now. After 14 days you are charged {priceLabel}{billingPeriod} automatically unless you cancel before the trial ends."; DE equivalent) and change the CTA label; pass `trialOffered` and `localeDe` to `PaddleCheckoutButton`. Keep the VAT text. Trial line is plain text, no icon-only meaning.
- [X] T032 [US3] `PricingView.tsx` is a `"use client"` component, so compute eligibility on the server in `app/pricing/page.tsx` (already `force-dynamic`, already reads the session): `trialPlans: Partial<Record<"monthly" | "yearly", boolean>>` where each entry is `paywallEnabled && isTrialOfferConfigured(plan)` and, for a signed-in user, `&& await getLocalTrialEligibility(session.user.id)` (local only; no provider call; wrap in try/catch so a failure means `false`). Pass `trialPlans` to `PricingView` as a new prop, forward it to each `PricingCard` as `trialOffered`, and replace the "no trial countdown, no credit card at signup" sentence in `app/pricing/PricingView.tsx` with wording that keeps "free to use, no card at signup" and does not contradict the trial. Signed-out visitors get the config-only value.
- [X] T033 [US3] `src/components/landing/LandingPricingSection.tsx` is a server component that only renders `PricingTierOverview` (no plan cards). Add a `trialOffered: boolean` prop, computed in `app/page.tsx` as `paywallEnabled && (isTrialOfferConfigured("monthly") || isTrialOfferConfigured("yearly"))`, and pass it from there. Replace the intro sentence the same way as T032; mention the 14-day trial only when `trialOffered` is true.
- [X] T034 [US3] Validate visually: start (or reuse, per CLAUDE.md) the dev server and run `node screenshot.mjs http://localhost:3000/pricing` plus the landing page in English and German, eligible and ineligible; check no overflow at phone width and visible focus on the CTA. Save nothing to the repo.

---

## Phase 6: User Story 4 - Trial state stays correct and observable (P3)

**Goal**: late, duplicate and out-of-order events and drift never corrupt trial state; erasure during a trial stops charging.

**Independent test**: run the reconcile, webhook-handler, webhook route and gdpr suites.

### Tests for US4

- [X] T035 [P] [US4] `src/lib/paddle/reconcile.test.ts`: status equal but remote `trialEndsAt` differs → drift counted, audit entry created with changed fields in `details`, row re-synced; status equal and `cancelScheduledFor` differs → same; nothing differs → no drift; timestamps compared by value, not by `Date` identity; per-user failure still non-fatal.
- [X] T036 [P] [US4] `app/api/paddle/webhook/route.test.ts`: signed `subscription.trialing` and `subscription.activated` return `200`; an unknown event type still returns `400 invalid_envelope`; invalid signature still `401` and nothing stored.
- [X] T037 [US4] Extend `src/lib/paddle/webhook-handler.test.ts`: the same `subscription.trialing` event id processed twice yields one stored row and one processed event (duplicate path); `subscription.activated` arriving before `subscription.trialing` ends with the provider's final state once both are applied in either order using their payload status.
- [X] T038 [US4] Extend `src/lib/paddle/gdpr.test.ts`: erasing a user whose row is `TRIALING` cancels the provider subscription with `effectiveFrom: "immediately"` before deleting the row and anonymising the customer.

### Implementation for US4

- [X] T039 [US4] `src/lib/paddle/reconcile.ts`: treat a difference in status, `trialEndsAt` or `cancelScheduledFor` (by `getTime()`, null-safe) as drift; keep the `paddle_reconcile_drift` audit action and add `fields: string[]` plus the old and new values of the changed fields to `details`; keep batch size and the dead-letter step untouched. The `include` for the loop must select the extra columns.

---

## Phase 7: Polish and cross-cutting

- [X] T040 Run `yarn lint` and `yarn tsc --noEmit`; fix findings in touched files only.
- [X] T041 Run `yarn test:coverage`; every touched file must stay at or above 80% on all four metrics (per-file gate). Add tests rather than lowering anything.
- [X] T042 Stability: run the Paddle suites 10 times in a row (`for i in {1..10}; do yarn vitest run src/lib/paddle src/lib/validations/paddle.test.ts app/api/paddle src/components/pricing src/components/checkout src/components/subscription src/components/landing; done`) and confirm identical results (SC-004).
- [X] T043 Run `yarn build`; afterwards restore `tsconfig.tsbuildinfo` with `git checkout` if it changed.
- [X] T044 [P] Security/privacy pass against the constitution: no email or customer id in logs or Sentry for the new code, no trial field accepted from the client, limiter placed after the session check, `ENABLE_PAYWALL` off hides every trial surface. Record the result in the notes below.
- [ ] T045 Manual operator run (cannot be automated; needs the sandbox account): follow `quickstart.md` sections 2–8, including the "no-trial prices have no trial period" check, the "trial prices have `requires_payment_method: true`" check (FR-003 is enforced only by catalog configuration), the localhost check that the post-checkout sync (`/api/paddle/subscription/sync`) turns a zero-amount trial transaction into `TRIALING` without webhooks (record the transaction status Paddle returns), and the CSP smoke test. Record outcomes in the notes below. Production needs the two new price ids and the two new webhook events enabled (see `contracts/webhook-events.md`) before `ENABLE_PAYWALL` is turned on.
- [ ] T046 After merge, change ADR status in `docs/adr/0002-paddle-trial-eligibility-via-paired-prices.md` from Proposed to Accepted (a new status line only; do not rewrite the body).

---

## Dependencies and execution order

- Phase 1 → Phase 2 → everything else. Phase 2 is blocking.
- T004 → T005, T007 → T008; T006 can run beside T004.
- US1: tests T009–T016 can be written in parallel (different files, except T015 which shares a file with T025). Implementation order: T017, T018 → T019, T020 → T021 → T022, T023 (needs T007 and T004) → T024 (needs T021).
- US2 depends on US1's T023 (same route) and adds T025, T026, T027. Ship US1 and US2 together.
- US3 depends on Phase 2 only for config and trial helpers (T004, T007) and on T027 for the button props; T028–T030 are parallel; T031 → T032; T033 is independent of T032 (different files: `app/page.tsx` and the landing section vs `app/pricing/page.tsx` and `PricingView.tsx`); T034 last.
- US4 is independent of US3. T039 depends on T003 and T018. T037 and T038 extend files first touched by T010 and T016, so do them after those.
- Polish after all stories; T045 needs the migration applied and operator access; T046 after merge.

## Parallel examples

- After Phase 2: write T009, T010, T011, T012, T013, T014, T016 at the same time (seven different test files).
- During US3: T028, T029, T030 together; then T031 and T033 together.
- US4 T035 and T036 together while US3 is in review.

## Implementation strategy

1. **MVP / first release candidate**: Phase 1 + 2 + US1 + US2 (T001–T027). This gives a working, abuse-guarded trial behind the new env vars; with them unset nothing changes.
2. Add US3 (wording) before turning the trial prices on in production, because the pricing page must not promise terms it does not state. In practice treat US1–US3 as one release.
3. US4 hardens drift handling and can land in the same PR or straight after.
4. Run Polish, then the manual sandbox run (T045), then switch on the trial prices.

## Notes (fill in during implementation)

- Next route-handler docs check (T002): `NextRequest`, `NextResponse.json` and `export const runtime` are unchanged in `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`; no changes needed.
- Security/privacy pass (T044): eligibility is computed server-side from the session user; the request schema has no trial field and a client `trial`/`eligible` claim is ignored (tested); the limiter runs after the session check; no email or customer id is logged or sent to Sentry in the new code; `ENABLE_PAYWALL` off hides trial wording and checkout (tested in checkout route and pricing page); trial env vars are documented in `.env.example`; no CSP change.
- Sandbox run outcomes (T045): NOT DONE. Needs the operator's sandbox account (two trial prices with `requires_payment_method: true`, the two new webhook events enabled). Run `quickstart.md` §2–8 and record the zero-amount trial transaction status here. If it is not `completed`/`paid`/`billed`, extend `transactionIsPaid` in `src/lib/paddle/subscription-sync.ts` and its test.
- ADR status (T046): NOT DONE; change `Proposed` to `Accepted` after merge.
- Deviations from the plan:
  - `PADDLE_TRIAL_ENV` in `src/test-utils/paddle.ts` is opt-in (`stubPaddleEnv(PADDLE_TRIAL_ENV)`) instead of part of the default env, so existing tests keep exercising the no-trial configuration.
  - Pricing page tests live in `app/pricing/PricingView.test.tsx` and `app/pricing/page.test.tsx`; adding them pulls both files into the per-file coverage gate (98% / 100% lines).
  - `PaddleCheckoutButton` also takes `localeDe` for the notice wording; `PricingCard` hides the amount in the trial terms when only the fallback price text is shown.
  - The subscription route derives the amount locale from `Accept-Language` (same rule as the pricing page).
  - The reconcile audit entry now carries `fields` and the old/new trial and cancel dates in `details`; the existing assertion was updated.
- Known limitation (spec US4/AC2): webhook handling has no event-ordering guard (events carry no ordering field in our envelope), so a stale `subscription.trialing` delivered after `subscription.activated` would briefly show `TRIALING`. The row is always upserted by `userId`, so no second trial or row can result, and the daily reconcile repairs the status. Not fixed here; consider comparing `occurred_at` if it shows up in practice.
- Visual check (T034): `/pricing` rendered with dummy trial env shows the trial line, terms and CTA on both plans and none on lifetime (English only; German wording is covered by component tests). The amount is omitted in the terms because the dummy key cannot fetch real prices, which is the intended fallback.
- Findings that differ from the spec or plan: none beyond the above.

## Phase 8: Convergence

- [X] T047 CRITICAL: replace the hardcoded `#555` in `.notice` (`src/components/checkout/PaddleCheckoutButton.module.scss`) and `.trialTerms` (`src/components/pricing/PricingCard.module.scss`) with a colour token from `src/styles/variables.scss` (for example `variables.$color-black`), keeping the text legible at WCAG 2.2 AA contrast, per Constitution IV (contradicts)
- [X] T048 Make `getTrialEligibility` in `src/lib/paddle/trial.ts` fail closed for the local check too: move `getLocalTrialEligibility(userId)` inside the `try` so a database error resolves `false`; add a case to `src/lib/paddle/trial.test.ts` where `prisma.subscription.findUnique` rejects and the result is `false`, and a case to `app/api/paddle/checkout/route.test.ts` showing a `200` with the standard price and `trial: false` when eligibility resolves `false` after such an error, per FR-004 (partial)
- [X] T049 Resolve the out-of-order gap for US4/AC2 and FR-012 by choosing one option and recording the choice in the Notes section. (a) Add an ordering guard: store the provider's last-applied update time on `Subscription` as a nullable column via an expand-only migration, skip a `subscription.*` event whose `updated_at` is older than it in `syncSubscriptionFromPaddleData` (`src/lib/paddle/webhook-handler.ts`), and add tests for a stale `trialing` after `activated` and for an in-order event; or (b) amend US4/AC2 in `spec.md` to say the daily reconciliation, not the notification handler, restores the provider's state, and replace the single-row test in `src/lib/paddle/webhook-handler.test.ts` with one that states that limit, per US4/AC2 (partial)
- [X] T050 Localize the trial sentence in `app/pricing/PricingView.tsx` using the existing `localeDe` prop (for example "Neue Superfan-Abonnent:innen können 14 Tage kostenlos testen."), and add German cases to `app/pricing/PricingView.test.tsx`; add one line to the spec Assumptions in `spec.md` stating that the landing intro and the settings subscription text are English-only like the surrounding pages, per FR-011 (partial)
- [X] T051 Review the non-trial "Cancels on {date}. You keep access until then." text in `src/components/subscription/SubscriptionSection.tsx` (and its test): either keep it and add a sentence to plan R6 justifying it, or restrict the message to trials and delete the non-trial test case, per plan R6 (unrequested)
- Convergence decisions: T049 took option (b): US4/AC2 now says the daily reconciliation restores the provider's state, and the handler test states the limit (last applied event wins until reconcile). T051 kept the paid-subscription "Cancels on" line and justified it in `research.md` R6. T047 used `variables.$color-black` (`#444`, was `#555`).

## Phase 9: Convergence

- [X] T052 Show guidance when a subscription is `PAST_DUE` in `src/components/subscription/SubscriptionSection.tsx`: a `role="status"` line such as "Your last payment did not go through. Update your payment method under Manage billing to keep your access." (and, when no portal link is available, point to the same place the portal-unavailable hint uses); add cases to `src/components/subscription/SubscriptionSection.test.tsx` for a past-due trial (status `PAST_DUE`, `trialEndsAt` set) and for a normal paid past-due subscription, plus one showing no such line for `ACTIVE` and `TRIALING`, per US1/AC6 (partial)
- [X] T053 Replace the `remote as unknown as RemoteTrialFields` cast in `src/lib/paddle/reconcile.ts` with the SDK's subscription type (items' `trialDates` and `scheduledChange`) accessed with optional chaining, so tests that pass partial remote objects still work and no double cast remains; keep `src/lib/paddle/reconcile.test.ts` green, per Constitution III (partial)
