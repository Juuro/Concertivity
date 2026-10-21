---

description: "Task list for Payment Provider Integration Test Coverage"
---

# Tasks: Payment Provider Integration Test Coverage

**Input**: Design documents from `/specs/002-paddle-integration-tests/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md. Work on branch `feat/paddle-mor-superfan`.

**Tests**: This feature's deliverable *is* tests. Every task below adds or extends a Vitest file. **No production code changes** (FR-011); if a test exposes a defect, record it and fix it in a separate `fix(paddle):` commit.

**Organization**: Grouped by user story (spec.md). Each story's files can be run alone.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1–US4 from spec.md
- Run a single file with `yarn vitest run <path>`; check coverage with `yarn vitest run --coverage <path>` and read the row for the matching source file (all four metrics ≥ 80, per file).

## Conventions for every test task

- Mock modules with `vi.mock` at the top; reset with `vi.resetAllMocks()` in `beforeEach`.
- Call `resetPaddleConfigCacheForTests()` (`src/lib/paddle/config.ts`) and `resetPaddleApiForTests()` (`src/lib/paddle/client.ts`) in `beforeEach` where those modules are loaded; set env with `vi.stubEnv`, undo with `vi.unstubAllEnvs()` in `afterEach`.
- Use dummy secrets only (e.g. `"test-secret"`). No network, no real DB.
- Route and crypto tests start with `// @vitest-environment node`.
- Cover both the allowed and the denied path (constitution VII).

---

## Phase 1: Setup (shared scaffolding)

- [X] T001 Create `src/test-utils/paddle.ts` exporting `buildWebhookEvent(type, overrides)` for all 7 event types (`subscription.created|updated|canceled|past_due|paused`, `transaction.completed`, `adjustment.created`), `buildPaddleSubscription`, `buildTransaction`, `buildAdjustment` (full/partial refund), `makePrismaMock()` (`vi.fn()` per used method of `subscription`, `paddleWebhookEvent`, `user`, `adminActivity`; `$transaction` invokes its callback with the same mock) and `makeSession(overrides)` per `data-model.md`. Read the sources it mirrors first: `src/lib/paddle/webhook-handler.ts`, `src/lib/validations/paddle.ts`, `src/lib/paddle/subscription-sync.ts`.
- [X] T002 Run `yarn vitest run src/lib/paddle/webhook-verify.test.ts` to confirm the baseline is green and note the current per-file coverage of `src/lib/paddle/*.ts` in a comment on the PR branch scratch notes (not committed).

**Checkpoint**: fixtures compile under `yarn tsc --noEmit` (or `yarn lint`) with no `any` lacking a justifying comment.

---

## Phase 2: Foundational (blocks all stories)

- [X] T003 [P] Add `src/lib/paddle/config.test.ts`: env parsing happy path; missing/blank `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`, price ids → `getPaddleEnvConfig` throws while `tryGetPaddleEnvConfig` returns `null`; invalid `PADDLE_ENVIRONMENT`; cache reuse and `resetPaddleConfigCacheForTests`; `getPriceIdForPlan` for `monthly|yearly|lifetime_beta`; `getPlanForPriceId` known/unknown id; `isLifetimeOfferOpen` with fake timers (before deadline, exactly at deadline, after, no deadline set).
- [X] T004 [P] Add `src/lib/validations/paddle.test.ts`: `paddleWebhookEnvelope` accepts a valid payload for each of the 7 `event_type` values and rejects an unknown `event_type`, missing `event_id`, and wrong `data` shape; `paddleCheckoutBodySchema` accepts `monthly|yearly|lifetime_beta` and rejects others/missing; `paddleSyncBodySchema` accepts/rejects per its definition in `src/lib/validations/paddle.ts`.

**Checkpoint**: `config.ts` and `validations/paddle.ts` at ≥ 80% on all metrics. Stories may now start.

---

## Phase 3: User Story 1 — Subscription state under payment events (P1) 🎯 MVP

**Goal**: Every event type yields the right subscription state and access decision; duplicates and refunds behave.

**Independent Test**: `yarn vitest run src/lib/paddle/webhook-handler.test.ts src/lib/paddle/entitlement.test.ts src/lib/paddle/subscription-sync.test.ts` passes.

- [X] T005 [US1] Add `src/lib/paddle/webhook-handler.test.ts` — `processPaddleWebhookEvent` / `reprocessWebhookEvent`: new event inserted-first then dispatched and marked processed; duplicate `eventId` (unique-constraint error) is a no-op with no second state change or audit; handler throw marks the row failed and increments `retryCount`/`lastRetryAt`; `reprocessWebhookEvent` skips INSERT.
- [X] T006 [US1] Extend `src/lib/paddle/webhook-handler.test.ts` — `handleSubscriptionEvent` / `syncSubscriptionFromPaddleData`: `subscription.created` with trial → `TRIALING`; `subscription.updated` trialing→`ACTIVE`; `past_due` → `PAST_DUE` and recovery; `paused` → `PAUSED`; `canceled` → `CANCELED`; unknown price id and unknown customer handled without throwing state corruption; out-of-order cancel-before-create; `AdminActivity` written on state change.
- [X] T007 [US1] Extend `src/lib/paddle/webhook-handler.test.ts` — `handleTransactionCompleted`: recurring transaction no-op/activation; lifetime price creates `LIFETIME`; `LIFETIME_OFFER_DEADLINE` passed throws `lifetime_offer_deadline_passed`; seat cap reached throws `lifetime_offer_seat_cap_reached` (fake timers + mocked count); user with both lifetime and recurring.
- [X] T008 [US1] Extend `src/lib/paddle/webhook-handler.test.ts` — `handleAdjustmentCreated`: full refund of lifetime revokes (status leaves `LIFETIME`); partial refund keeps it; refund on non-lifetime ignored; and `redactWebhookPayload` strips emails/names/addresses/nested sensitive keys while keeping ids and non-sensitive fields, handling null/array/primitive inputs.
- [X] T009 [P] [US1] Add `src/lib/paddle/entitlement.test.ts`: `isUserSuperfan` true for `ACTIVE`, `TRIALING`, `LIFETIME`; false for `PAST_DUE`/`PAUSED`/`CANCELED`/none (use the exact rules in `entitlement.ts`); `getSubscriptionSummary` returns plan/dates/trialEndsAt/portal URL; portal call exceeding 3 s (fake timers + `rejectAfterMs`) falls back with no URL; `getPricingBillingHint` variants; `ensureSubscriptionSyncedFromPaddle` called when expected (mocked).
- [X] T010 [P] [US1] Add `src/lib/paddle/subscription-sync.test.ts`: `paddleSubscriptionRemoteToSyncData` maps each remote status, scheduled cancel, trial dates, unknown price; `discoverAndLinkPaddleCustomer` (found by email, none, already linked); `trySyncSubscriptionFromPaddleApi` and `syncSubscriptionFromCheckoutTransaction` success + provider error swallowed/reported; `ensureSubscriptionSyncedFromPaddle` skip when fresh/sync when stale; `syncBillingForUser` orchestration. Mock `./client` and `@/lib/prisma`.

**Checkpoint**: `webhook-handler.ts`, `entitlement.ts`, `subscription-sync.ts` each ≥ 80%; SC-002 event-type and state matrix covered.

---

## Phase 4: User Story 2 — Endpoints enforce security rules (P1)

**Goal**: Unauthenticated, forged, duplicate, disabled-flag and malformed requests are refused on every payment endpoint.

**Independent Test**: `yarn vitest run app/api/paddle app/api/cron/paddle-reconcile` passes.

- [X] T011 [P] [US2] Add `app/api/paddle/checkout/route.test.ts`: no session → 401; `ENABLE_PAYWALL` off → refused (check the exact status in `route.ts`); invalid body → 400 without internal detail; `isUserSuperfan` true → 409 `already_subscribed` and `createCheckoutTransaction` not called; `lifetime_beta` with `isLifetimeOfferOpen` false → `lifetime_offer_closed`; happy path monthly/yearly returns transaction id and passes customer/locale/currency; provider throws → safe 5xx body and `Sentry.captureException` called.
- [X] T012 [P] [US2] Add `app/api/paddle/subscription/route.test.ts`: no session → 401; session → returns `getSubscriptionSummary(userId)` for the session user only (never a user id from the request); summary error handling as implemented.
- [X] T013 [P] [US2] Add `app/api/paddle/subscription/sync/route.test.ts`: no session → 401; flag off → refused; invalid body → 400; success calls `syncBillingForUser` for the session user and returns the summary; throw → Sentry + safe error.
- [X] T014 [P] [US2] Add `app/api/paddle/webhook/route.test.ts` (node env): missing, invalid and stale signature → rejected, `processPaddleWebhookEvent` not called; valid signature (use real HMAC helper like `webhook-verify.test.ts`) but body failing `paddleWebhookEnvelope` → 400; valid → processed and 200; handler throw → 5xx + Sentry; raw body (not re-serialised JSON) is what gets verified.
- [X] T015 [P] [US2] Add `app/api/cron/paddle-reconcile/route.test.ts` (node env): missing `CRON_SECRET` env → refused; missing/wrong `Authorization` → 401 with `runPaddleReconciliation` not called; wrong-length token does not throw; correct `Bearer` secret → runs and returns its result; reconcile throws → Sentry + 5xx.

**Checkpoint**: each of the five routes ≥ 80%; SC-003 satisfied (unauth, flag-off, invalid-input per endpoint).

---

## Phase 5: User Story 3 — Drift repair and privacy duties (P2)

**Goal**: Reconciliation repairs drift and retries failures; export and erasure behave as required.

**Independent Test**: `yarn vitest run src/lib/paddle/reconcile.test.ts src/lib/paddle/gdpr.test.ts src/lib/paddle/client.test.ts` passes.

- [X] T016 [P] [US3] Add `src/lib/paddle/reconcile.test.ts`: remote status differs from local → local updated + `AdminActivity` `action='paddle_reconcile_drift'`; no drift → no write; `LIFETIME` users skipped from the `listCustomerSubscriptions` loop; failed webhook events below the retry cap are passed to `reprocessWebhookEvent`, events at/above the cap are left flagged; batch bound (`options` limit) respected; provider error for one user doesn't abort the run; returned counters are correct.
- [X] T017 [P] [US3] Add `src/lib/paddle/gdpr.test.ts`: `erasePaddleDataForUser` cancels active subscription before `anonymiseCustomer` (assert call order), retries cancel up to 3× then surfaces the error, anonymises with the placeholder email, writes `AdminActivity` `action='paddle_erasure'`, no-ops cleanly for a user without a Paddle customer; `getSubscriptionExportData` returns subscription fields plus at most the last 10 redacted events and none of the secrets/raw payload parts.
- [X] T018 [P] [US3] Add `src/lib/paddle/client.test.ts` (mock `@paddle/paddle-node-sdk`): `getPaddleApi` builds one instance per env and reuses it, `resetPaddleApiForTests` clears it, sandbox vs production environment selected; `rejectAfterMs` rejects after the delay (fake timers); `createCheckoutTransaction`, `getCustomerPortalSessionUrl` (timeout option), `listCustomerSubscriptions`, `getTransaction`, `getSubscription`, `listCustomersByEmail`, `cancelSubscription`, `anonymiseCustomer` pass the expected arguments and propagate errors.

**Checkpoint**: `reconcile.ts`, `gdpr.ts`, `client.ts` each ≥ 80%; spec US3 scenarios 1–4 each map to a named test.

---

## Phase 6: User Story 4 — Pricing and billing screens (P3)

**Goal**: Plan/price/VAT wording, sign-in redirect, already-subscribed message, portal fallback and trial date render correctly.

**Independent Test**: `yarn vitest run src/components/pricing src/components/checkout src/components/subscription src/lib/paddle-client.test.ts src/lib/paddle-consent.test.ts src/lib/paddle/billing-ui.test.ts src/lib/paddle/price-previews.test.ts` passes.

- [X] T019 [P] [US4] Add `src/components/pricing/PricingCard.test.tsx`: renders plan name, price label and features; English vs German "excl. VAT" / "zzgl. MwSt." wording; highlighted/CTA variants per props; accessible names via `getByRole`.
- [X] T020 [P] [US4] Add `src/components/checkout/PaddleCheckoutButton.test.tsx`: unauthenticated click navigates to `/login?callbackUrl=/pricing` without POSTing; authenticated click POSTs checkout and calls `openPaddleCheckout`; `already_subscribed` error shows the message; `setPaddleConsentState` called with `granted` on click; disabled/loading state during request; provider/network failure shows an error. Mock `fetch`, `@/lib/paddle-client`, `@/lib/paddle-consent`, session hook, `next/navigation`.
- [X] T021 [P] [US4] Add `src/components/subscription/SubscriptionSection.test.tsx`: loading state; fetches `/api/paddle/subscription` on mount and renders plan, status chip, renewal date; `TRIALING` shows `Trial ends:` date; portal URL absent (timeout fallback) → "Manage Billing" disabled with explanation; fetch failure shows error state; no subscription shows the empty/upgrade state.
- [X] T022 [P] [US4] Add `src/lib/paddle-consent.test.ts` (jsdom): `getPaddleConsentState` returns `null` by default, `granted`/`denied` after `setPaddleConsentState`, ignores garbage values, tolerates `localStorage` throwing; dispatches `PADDLE_CONSENT_EVENT` on set.
- [X] T023 [P] [US4] Add `src/lib/paddle-client.test.ts`: `ensurePaddleJs` returns `undefined` when `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` missing, initialises sandbox vs production from `NEXT_PUBLIC_PADDLE_ENV`, caches the instance, handles the loader failing; `openPaddleCheckout` passes transaction id and success/close callbacks and does nothing without Paddle.js. Mock `@paddle/paddle-js`.
- [X] T024 [P] [US4] Add `src/lib/paddle/billing-ui.test.ts`: `subscriptionStatusIsPremium` true/false per status; `syncBillingAfterCheckout` POSTs to the sync route, dispatches `PADDLE_BILLING_CHANGED_EVENT` on success, tolerates failure.
- [X] T025 [P] [US4] Add `src/lib/paddle/price-previews.test.ts`: `getPlanPriceLabels` returns formatted labels per plan from mocked `getPaddleApi`; returns fallback/empty labels when config missing (`tryGetPaddleEnvConfig` null), when the provider errors, and when it exceeds the timeout (`rejectAfterMs`, fake timers).

**Checkpoint**: all listed UI/helper files ≥ 80%.

---

## Phase 7: Polish & cross-cutting

- [X] T026 Run `yarn test:coverage` and fix any Paddle file below 80% on any of lines/branches/functions/statements by adding cases (not by editing `vitest.config.ts`). Confirm no `ERROR: Coverage for ... does not meet global threshold` lines (SC-001).
- [X] T027 Run the stability loop from `quickstart.md` step 3 (10 consecutive passes) and confirm total Paddle suite time < 60 s (SC-004); fix any order-dependence (leaked env, timers, module caches).
- [X] T028 Mutation spot-check per `quickstart.md` step 4 (SC-005): break duplicate detection, the full-refund condition and the cron secret check one at a time; confirm a test fails each time; restore with `git checkout -- <file>`; ensure `git status` shows only test/fixture/spec files changed.
- [X] T029 Run `yarn lint && yarn test && yarn build`; fix lint issues in new files only.
- [X] T030 Commit with Conventional Commit messages, e.g. `test(paddle): cover webhook handler, entitlement and sync` per phase; push to the PR #287 branch.

---

## Dependencies & Execution Order

- Phase 1 → Phase 2 → Phases 3–6 → Phase 7.
- T001 blocks every test that uses shared builders (T005–T018, T020–T021 mostly). T003/T004 are independent of T001.
- US1–US4 are independent of each other once Phase 1–2 are done; US2 route tests only mock the services, so they don't wait for US1.
- Within US1, T005→T006→T007→T008 edit one file and are sequential; T009 and T010 are parallel with them.

## Parallel Opportunities

- After T001: T003, T004 run together.
- US2: T011–T015 (five different files) fully parallel.
- US3: T016, T017, T018 parallel. US4: T019–T025 parallel.
- Different stories can be handed to different agents/people.

## Implementation Strategy

- **MVP**: Phases 1–3 (US1) — state machine and entitlement, the highest-cost failures. Stop and run T026 for those files.
- **Increment 2**: US2 (security refusals), then US3, then US4.
- Run `yarn test:coverage` after each story so gate failures surface early.

## Task counts

Total 30 · Setup 2 · Foundational 2 · US1 6 · US2 5 · US3 3 · US4 7 · Polish 5

## Implementation notes (findings while testing)

Tests pin the **actual** behaviour of the PR #287 code. Where it differs from the spec/plan wording, nothing was changed in production code (FR-011):

- **Erasure failures are swallowed.** `erasePaddleDataForUser` retries cancellation 3× and treats cancel and anonymise failures as best-effort; it still deletes local data and writes the `paddle_erasure` audit. Spec US3 scenario 4 ("a provider failure is surfaced rather than silently ignored") does not match; decide whether the code or the spec should change.
- **Export has no webhook events.** `getSubscriptionExportData` returns only the subscription row (no "last 10 redacted events").
- **Audit entries.** `AdminActivity` is written for `paddle_reconcile_drift`, `paddle_erasure` and `paddle_lifetime_revoked` (full refund/chargeback). Ordinary subscription state changes write none.
- **Redaction** only replaces `data.billing_details` (or `data` when it is not an object).
- **Access states.** `PAST_DUE` and `PAUSED` still count as Superfan; only `CANCELED` and no row do not.
- **`GET /api/paddle/subscription` is not gated by `ENABLE_PAYWALL`** (checkout and sync are).
- **Checkout** does not yet prefill locale/currency, although it reads `currency` from the user row.
- Local setup needed before tests ran: `yarn install --immutable` (Paddle packages) and `yarn db:generate` (stale generated Prisma client lacked `SubscriptionStatus`).
- Mutation spot-check: breaking duplicate detection and the full-refund check made tests fail immediately; breaking the cron secret compare initially survived (the wrong-secret case differed in length), so a same-length wrong-secret case was added.
