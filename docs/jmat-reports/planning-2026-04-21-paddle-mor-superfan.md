# JMAT Planning Report — Paddle (MoR) + Superfan Tier

**Date (round 1):** 2026-04-21
**Date (rounds 2 & 3 — re-plan):** 2026-04-25
**Date (revision 4 — codebase reconciliation):** 2026-05-11
**Stack:** TypeScript / Next.js 16.1 App Router + Prisma 7.5 + Better Auth 1.4 + PostgreSQL + Vitest 4
**Branch (planned, fresh from main):** `feat/paddle-mor-superfan` (per `.cursorrules` naming convention)
**Implementation confidence:** **88%** (revision 4 — slight bump; CSP / consent / cron patterns already exist in repo)
**Delivery confidence:** **45%** (still gated by legal blockers — see §6)
**File count:** **35** (25 new + 10 modified)

> **Scope reminder:** plumbing only. Premium feature gates ship in a separate, second step.
> **Revision 4 note:** This plan was authored before the 2026-05-10 multi-tenancy merge and the 2026-05-11 Concertivity rebrand. Material codebase deltas (PostHog consent infra, Sentry CSP, array-based CSP directives in `proxy.ts`, Prisma 7.5 + client output to `src/generated/prisma`, zod-as-transitive-only, Husky/commitlint/Release-Please, existing cron auth pattern, refactored `Settings` page) have been reconciled below. See §2.4 for the diff.

---

## 1. Task

Integrate **Paddle as Merchant of Record** to sell a new **Superfan** premium tier.

| AC  | Criterion |
|-----|-----------|
| AC1 | Superfan monthly subscription via Paddle checkout |
| AC2 | Superfan yearly subscription via Paddle checkout |
| AC3 | Limited-time one-time **lifetime beta** offer (auto-disables on deadline *or* seat cap) |
| AC4 | Optional free trial period on subscription plans (Paddle-native) |
| AC5 | Paddle webhooks drive subscription state; signature verified, idempotent, audit-logged |
| AC6 | Users see "Manage subscription" surface in Settings with plan / dates / Paddle portal link |
| AC7 | Env split (Sandbox/Production), feature flag, CSP updated, GDPR Art. 15 export + Art. 17 erasure extended |
| AC8 | Observability: webhook tracing, Sentry, daily reconciliation cron against Paddle API |

---

## 2. Planning rounds

### Round 1 — initial synthesis
8 specialists proposed independently → Tech Lead (Opus) synthesised → Devil's Advocate (Sonnet) found 3 CRITICAL + 5 HIGH + 4 MEDIUM issues.

### Round 2 — DA1–DA12 fixes + 4 scope cuts
Tech Lead re-ran with all DA findings as constraints. Devil's Advocate Round 2 verified all 12 fixes landed correctly but found two new issues (NC1 CRITICAL, NC2 HIGH) plus three minor (NC3–NC5).

### Round 3 — surgical NC1–NC5 patches
Tech Lead patched the round-2 plan. All fixes landed with **zero file-count delta** — pure inline modifications to existing files. Final implementation confidence 87%.

### Revision 4 (2026-05-11) — codebase reconciliation
No new specialists or DA round was run. Confirmed the plan against the current `main` (commit `74c1c48`). The plan's structural decisions remain sound; deltas are tactical (file paths, dep wiring, integration points). Implementation confidence rises to 88% because several pre-merge concerns now have existing infrastructure to lean on (CSP array, consent state machine, cron auth pattern, audit log via `AdminActivity`). The plan's pre-merge legal gates in §6 are unchanged.

### 2.4 — Concrete codebase deltas since round 3

| # | Area | Round-3 assumption | 2026-05-11 reality | Impact on plan |
|---|------|-------------------|---------------------|----------------|
| D1 | Project name | "Concerts" | Rebranded to "Concertivity" | Cosmetic; no plan changes |
| D2 | Branch | `feature/plan-and-implement-paddle-mor-with-month` | Stale and far behind `main`. `.cursorrules` mandates `feat/<name>` | Start fresh: `feat/paddle-mor-superfan` |
| D3 | `proxy.ts` CSP | Single template-string CSP | Array of directives + Sentry `report-uri`/`report-to`; PostHog `connect-src` is built dynamically | Paddle entries become array pushes (3 lines instead of regex surgery) |
| D4 | Consent | "Cookie banner audit needed for Paddle.js" (R5 / §6.3) | `src/lib/posthog-consent.ts` exists: `getPostHogConsentState`, `setPostHogConsentState`, `applyPostHogConsentState`, opt-in via Settings | Reuse the pattern: gate Paddle.js load on a `paddle_consent` key OR fold it into the "essential billing scripts" exemption per TTDSG §25(2)(2). Either way, no banner work — just a small consent helper file. |
| D5 | Prisma | Prisma 7 | Prisma 7.5; client generated to `src/generated/prisma/client`; `@prisma/adapter-pg` 7.4.2 used in `src/lib/prisma.ts` | All Paddle code imports types from `@/generated/prisma/client`, uses the existing `prisma` singleton |
| D6 | `zod` | Implicit direct dep | Only a transitive dep (yarn.lock matches `^3.24.1`, `^4.3.6`). Source code imports `from "zod"` (works today, but unpinned). | `package.json` modification must add `zod` as an explicit direct dep — promote D6 from "implicit" to "explicit" |
| D7 | Crons | "Bearer `CRON_SECRET` (timing-safe)" | Two existing crons (`feedback-github-sync`, `feedback-retention`) use **plain string compare** (`auth !== \`Bearer ${secret}\``) | Paddle reconcile cron should still use **timing-safe compare** (`crypto.timingSafeEqual`); plan now also recommends a follow-up to harden the two existing crons (out of scope for v1) |
| D8 | Settings page | `app/(protected)/settings/page.tsx` is a server component | It's now `"use client"`, uses `useTypedSession`, has `__panel` and `__panel--danger` sections, toast notifications, JSON/CSV export buttons, and delete dialog (PR #269 + #270) | `<SubscriptionSection />` must be a client component (or server-rendered above the client form). Place it as a new `__panel` between Settings form and Export panel. Data fetched via `GET /api/paddle/subscription`. |
| D9 | `User` schema | Plan only adds `paddleCustomerId` | User model already has `currency`, `isPublic`, `hideLocationPublic`, `hideCostPublic`, `includeUserIdInErrorReports`, admin plugin fields (`role`, `banned`, `banReason`, `banExpires`) | `PricingCard` and `PaddleCheckoutButton` can pre-fill currency from `session.user.currency`; respects `includeUserIdInErrorReports` for Sentry breadcrumbs around checkout failures |
| D10 | Audit | "AdminActivity audit" mentioned in R2 | `AdminActivity` model exists with `action`, `targetType`, `targetId`, `details` JSON, FK to user | `erasePaddleDataForUser` writes an `AdminActivity` with `action='paddle_erasure'`, target=`subscription`; `handleAdjustmentCreated` writes `action='paddle_lifetime_revoked'` |
| D11 | Migration filename | `20260425120000_add_paddle_plumbing` | Stale date | Use the actual implementation date: `<YYYYMMDDHHMMSS>_add_paddle_plumbing` (let `prisma migrate dev --name add_paddle_plumbing` generate it) |
| D12 | CI/Lint | None called out | Husky + commitlint (`@commitlint/config-conventional`) + Release-Please active; lint-staged runs Prettier on commit | All commits must follow Conventional Commits (`feat(paddle): ...`, `chore(paddle): ...`). Release Please will auto-bump version on merge. |
| D13 | Header brand | "Concerts" | `<Header siteTitle="Concertivity" />` rendered by `(protected)/layout.tsx` | Cosmetic only — Pricing page must use `<Header siteTitle="Concertivity" />` consistently |
| D14 | `(protected)/pricing` placement | Inside `(protected)` | `(protected)/layout.tsx` redirects unauthenticated users to `/login` | **Decision needed:** Should pricing be public (typical SaaS pattern, helps conversion) or auth-gated? Recommend moving to **`app/pricing/page.tsx`** (public) with the `<PaddleCheckoutButton>` itself redirecting to `/login?callbackUrl=/pricing` when unauthenticated. |
| D15 | Sentry | Not detailed | `@sentry/nextjs` v10 active, sourcemap upload, `tunnelRoute: "/monitoring"`, CSP `report-uri` already wired | Reuse `Sentry.captureException` in webhook handler error paths; no new infra needed |
| D16 | PostHog | Not mentioned | Analytics + opt-in session replay live; `posthog-js`, env vars `NEXT_PUBLIC_POSTHOG_*` | Track `paddle_checkout_started`, `paddle_checkout_succeeded`, `paddle_checkout_cancelled` via PostHog (respecting consent state). Optional — not in v1 plumbing scope. |

---

## 3. Key architectural decisions (final)

- Dedicated `Subscription` Prisma model with status enum `{ TRIALING, ACTIVE, PAST_DUE, PAUSED, CANCELED, LIFETIME }`.
- `PaddleWebhookEvent` idempotency table with `UNIQUE(eventId)`, **plus `retryCount Int @default(0)` and `lastRetryAt DateTime?`** for the dead-letter retry path.
- `paddleCustomerId String? @unique` on `User`, exposed via Better Auth `additionalFields` with `input:false` (server-only). _(Revision 4: slots in next to the existing `currency`, `isPublic`, `hideLocationPublic`, `hideCostPublic`, `includeUserIdInErrorReports`, `role`, `banned`, `banReason`, `banExpires` fields.)_
- Hybrid source of truth: DB mirror for O(1) reads + daily Paddle-API reconciliation cron.
- Paddle-native trials. Webhook envelope discriminates on **`event_type`** (not `data.status`) with seven branches: `subscription.created`, `subscription.updated`, `subscription.canceled`, `subscription.past_due`, `subscription.paused`, `transaction.completed`, `adjustment.created`.
- HMAC-SHA256 verification on raw body (`request.text()` before `JSON.parse`), `crypto.timingSafeEqual`, ±300s replay window, ±60s clock skew tolerance.
- Webhook handler does insert-first idempotency. **Reprocess path (`reprocessWebhookEvent`) skips the INSERT** and updates the existing row, so dead-letter retry actually works.
- Synchronous handler with <3s budget; no queue infrastructure in v1.
- Paddle-hosted customer portal deep-link from Settings; no custom cancel UI in v1.
- Lifetime cap enforced atomically at webhook receipt (date cutoff is the primary gate; seat counter is the authoritative second gate).
- CSP additions in `proxy.ts` (now an **array of directive strings**, not a single template — D3): append `https://cdn.paddle.com` to `script-src`, append `https://api.paddle.com` (and sandbox variant) to `connect-src`, add a new `frame-src 'self' https://checkout.paddle.com https://sandbox-checkout.paddle.com` directive. Reuses the same array push pattern Sentry/PostHog already use.
- All `paddle/*` route handlers declare `export const runtime = 'nodejs'`. `next.config.mjs` adds `serverExternalPackages: ['@paddle/paddle-node-sdk']`.
- **Revision 4 additions:**
  - All Paddle TypeScript code imports Prisma types from `@/generated/prisma/client` (per D5).
  - All Paddle code uses the existing `prisma` singleton from `@/lib/prisma` (no new Prisma client).
  - `AdminActivity` rows written for: `paddle_erasure` (GDPR Art. 17), `paddle_lifetime_revoked` (NC3 full-refund path), `paddle_reconcile_drift` (cron-detected divergence) — per D10.
  - Audit/breadcrumb attribution to Sentry respects `user.includeUserIdInErrorReports` (per D9).
  - Paddle.js consent reuses the PostHog consent pattern (`src/lib/paddle-consent.ts` mirrors `src/lib/posthog-consent.ts`) — per D4. Storage key `concertivity_paddle_consent_v1`. Default-allow only when the user clicks "Subscribe" (lazy-load fallback per R5).

---

## 4. Implementation plan — 35 files

### 4.1 New files (25 — revision 4 adjustments marked `[R4]`)

| # | Path | Purpose |
|---|------|---------|
| 1 | `prisma/migrations/<auto>_add_paddle_plumbing/migration.sql` _[R4: filename auto-generated by `prisma migrate dev --name add_paddle_plumbing`, was stale `20260425120000_...`]_ | Additive migration with plain `CREATE INDEX` (no `CONCURRENTLY`). |
| 2 | `src/lib/paddle/config.ts` | Validated singleton env config + `getPriceIdForPlan` / `getPlanForPriceId` helpers (SC1: pricing.ts folded in). |
| 3 | `src/lib/paddle/client.ts` | Paddle Node SDK wrapper — `createCheckoutTransaction`, `getCustomerPortalSession(opts.timeoutMs)`, `listCustomerSubscriptions`, `cancelSubscription`, `anonymiseCustomer`. Includes private `rejectAfterMs` for `Promise.race` timeout fallback. |
| 4 | `src/lib/paddle/webhook-verify.ts` | Pure HMAC-SHA256 + timestamp freshness. |
| 5 | `src/lib/validations/paddle.ts` | All Zod schemas — `paddleWebhookEnvelope` discriminated on `event_type` with 7 branches; full TS code committed in plan. _[R4: must use `zod` once it is promoted to a direct dep (D6).]_ |
| 6 | `src/lib/paddle/webhook-handler.ts` | Idempotent processor + state-machine helpers. Exports `processPaddleWebhookEvent` (INSERT-first, used by webhook route), `reprocessWebhookEvent` (skips INSERT, used by reconcile dead-letter), `handleSubscriptionEvent`, `handleTransactionEvent`, `handleAdjustmentCreated` (full-refund revokes LIFETIME), `redactWebhookPayload`. _[R4: writes `AdminActivity` rows per D10; imports `Subscription`/`PaddleWebhookEvent` types from `@/generated/prisma/client` per D5.]_ |
| 7 | `src/lib/paddle/entitlement.ts` | `isUserSuperfan` (O(1) DB query), `getSubscriptionSummary` (3s portal-session timeout). |
| 8 | `src/lib/paddle/reconcile.ts` | Bounded reconciliation; lifetime users skipped from `listCustomerSubscriptions` loop; dead-letter loop calls `reprocessWebhookEvent`. _[R4: drift detection writes `AdminActivity` with `action='paddle_reconcile_drift'`.]_ |
| 9 | `src/lib/paddle/gdpr.ts` | `getSubscriptionExportData`; `erasePaddleDataForUser` cancels subs (3× retry) → anonymises (placeholder email) → cascade delete. _[R4: emits `AdminActivity` with `action='paddle_erasure'`.]_ |
| 10 | `app/api/paddle/webhook/route.ts` | `POST` — `runtime='nodejs'`, raw body, HMAC verify, idempotent dispatch. |
| 11 | `app/api/paddle/checkout/route.ts` | `POST` — `runtime='nodejs'`, single `isUserSuperfan` 409 guard, lifetime eligibility (inlined per SC2), creates Paddle transaction. _[R4: pre-fills `customer.locale`/currency from `session.user.currency` per D9.]_ |
| 12 | `app/api/paddle/subscription/route.ts` | `GET` — current subscription summary for Settings. |
| 13 | `app/api/cron/paddle-reconcile/route.ts` | `GET` — Bearer `CRON_SECRET` with `crypto.timingSafeEqual`. _[R4: NB existing `feedback-github-sync` and `feedback-retention` cron routes use plain `!==` compare (D7); Paddle stays timing-safe, and a follow-up to harden existing crons is captured in a new R12 (§7).]_ |
| 14 | `src/lib/paddle-client.ts` | Client-side Paddle.js lazy-load + checkout opener. _[R4: consent gate via new `src/lib/paddle-consent.ts` (D4), modelled on `posthog-consent.ts`.]_ |
| 14b | `src/lib/paddle-consent.ts` _[R4: new helper, mirrors `posthog-consent.ts`]_ | `getPaddleConsentState`, `setPaddleConsentState`, key `concertivity_paddle_consent_v1`. Set implicitly to `granted` when the user clicks "Subscribe" (lazy-load consent fallback). |
| 15 | `src/components/checkout/PaddleCheckoutButton.tsx` | Button → POST checkout → open overlay; handles `error='already_subscribed'`. _[R4: when unauthenticated, redirect to `/login?callbackUrl=/pricing` instead of attempting POST (D14).]_ |
| 16 | `src/components/pricing/PricingCard.tsx` | Presentational card with locale-aware **"excl. VAT" / "zzgl. MwSt."** disclaimer + tooltip. _[R4: reads currency from session if available (D9), otherwise from `Accept-Language` header.]_ |
| 17 | `src/components/subscription/SubscriptionSection.tsx` | Client component for `Settings` `__panel` slot (D8); inlined `function StatusChip` (SC4); disabled "Manage Billing" w/ tooltip on portal-timeout. Fetches data via `GET /api/paddle/subscription` on mount. |
| 18 | `app/pricing/page.tsx` _[R4: moved out of `(protected)` per D14 so non-authenticated visitors can preview pricing]_ | Public pricing page; reads `?success=1` / `?cancelled=1` for toast (SC3); renders `<Header siteTitle="Concertivity" />` consistently (D13). |
| 19–25 | `*.test.ts` / `*.test.tsx` | Vitest 4 tests: webhook-verify, validations, webhook-handler (incl. reprocess + trialing→active + full-refund-revokes-lifetime + `AdminActivity` writes), entitlement, reconcile (incl. dead-letter + drift `AdminActivity`), gdpr (incl. erasure `AdminActivity`), client (incl. timeout fallback), checkout route (incl. all `already_subscribed` matrix + unauth-redirect), pricing card (locales + currency from session), subscription section (mounted-fetch happy path + portal-timeout fallback). |

### 4.2 Modified files (10 — revision 4 adjustments marked `[R4]`)

| Path | Changes |
|------|---------|
| `prisma/schema.prisma` | Add `Subscription` and `PaddleWebhookEvent` models (with `retryCount`, `lastRetryAt`); add `User.paddleCustomerId`. _[R4: slot the field next to the existing `currency`, `isPublic`, `role`, `banned` block; `Subscription` references `User.id`; ensure new enum names don't collide with `AppFeedbackCategory`/`AppFeedbackTriageStatus`/`AppFeedbackPriority`/`GithubIssueState` already defined.]_ |
| `src/lib/auth.ts` | Extend `additionalFields` with `paddleCustomerId` (server-only, `input:false`). _[R4: also extend `ExtendedUserFields` interface and `Session` type used by `getSession()` so the Settings client can read the field via `useTypedSession`.]_ |
| `app/api/user/export/route.ts` | Include subscription block + last 10 redacted webhook events. _[R4: extend the existing `exportData` object after the `concerts:` mapping; CSV branch unchanged; reuse `parseSupportingActIds`-style mapping pattern.]_ |
| `app/api/user/account/route.ts` | Call `erasePaddleDataForUser` (cancel→anonymise) before `prisma.user.delete`. _[R4: also writes `AdminActivity` via the helper; ban-check via `checkUserBan` is untouched; sign-out `try/catch` pattern preserved.]_ |
| `proxy.ts` | CSP additions for Paddle domains. _[R4: append to the existing `directives` array (D3); add `https://cdn.paddle.com` to `script-src`, `https://api.paddle.com https://sandbox-api.paddle.com` to `connect-src`, new `frame-src 'self' https://checkout.paddle.com https://sandbox-checkout.paddle.com`. PostHog/Sentry CSP logic untouched.]_ |
| `next.config.mjs` | `serverExternalPackages: ['@paddle/paddle-node-sdk']`. _[R4: append to existing `nextConfig`, then re-wrap with `withSentryConfig(...)`.]_ |
| `.env.example` | Document `PADDLE_*` vars + `LIFETIME_OFFER_DEADLINE`, `LIFETIME_OFFER_SEAT_CAP`, `ENABLE_PAYWALL`. _[R4: keep the existing "Feature Flags" section style — add `ENABLE_PAYWALL=false` near `ENABLE_LASTFM`/`ENABLE_MAP_PAGE`/`ENABLE_STATISTICS_WIDGET`.]_ |
| `vercel.json` | Add daily cron schedule for `/api/cron/paddle-reconcile`. _[R4: append to existing `crons` array (already has `feedback-github-sync` daily, `feedback-retention` weekly); recommend off-peak (`schedule: "30 2 * * *"`) to not collide with the 03:00 weekly feedback cron.]_ |
| `app/(protected)/settings/page.tsx` | Render `<SubscriptionSection />`. _[R4: page is now `"use client"` (D8); insert as a new `<div className="settings__panel">` block between the `Privacy`/`Diagnostics` form section and the existing `Export Your Data` panel. SubscriptionSection owns its own fetch + loading state.]_ |
| `package.json` / `yarn.lock` | Add `@paddle/paddle-node-sdk` and `@paddle/paddle-js`. _[R4: also **add `zod` as a direct dep (D6)**; today it's only in `yarn.lock` via transitive resolution. Use `yarn add zod` (per project rule: Yarn 4 only).]_ |

### 4.3 Implementation order (revision 4)

0. **Phase-0 verification (BEFORE coding)**:
   a. Context7 lookup for `@paddle/paddle-node-sdk` module type + `customers.update` payload semantics. Verify in Paddle sandbox.
   b. **[R4 new]** Branch from current `main` (commit `74c1c48` or later) as `feat/paddle-mor-superfan` per `.cursorrules` (D2).
   c. **[R4 new]** Add `zod` as a direct dep via `yarn add zod` (D6).
   d. **[R4 new]** Confirm `prisma generate` runs cleanly against existing schema before adding new models (Prisma 7.5 — D5).
1. Prisma schema + migration. Run `yarn db:migrate` with `--name add_paddle_plumbing` (D11). Re-run `yarn db:generate` so `@/generated/prisma/client` exports `Subscription` and `PaddleWebhookEvent` types.
2. Foundation modules: `config.ts`, `client.ts`, `webhook-verify.ts`, `validations/paddle.ts`.
3. Domain services: `webhook-handler.ts`, `entitlement.ts`, `reconcile.ts`, `gdpr.ts` — fully unit-tested with the SDK mocked. **[R4]** Each writes `AdminActivity` on relevant state changes (D10).
4. Route handlers: webhook → checkout → subscription → cron. **[R4]** Cron uses `crypto.timingSafeEqual` (D7).
5. Better Auth extension (extend `additionalFields` **and** `ExtendedUserFields`/`Session` types — D8 makes this load-bearing for the client SubscriptionSection) + GDPR route modifications + CSP additions (array push — D3) + `next.config.mjs` `serverExternalPackages` (re-wrapped with `withSentryConfig`).
6. **[R4 reordered]** Consent helper (`paddle-consent.ts`, D4) → client utility (`paddle-client.ts`) → components (pricing card, subscription section as a new `__panel` in the client Settings page, checkout button with unauth-redirect) → public pricing page at `app/pricing/page.tsx` (D14).
7. E2E happy path + CSP smoke test in staging Paddle sandbox.
8. **[R4 new]** Conventional Commit titles for every commit (D12): `feat(paddle): ...`, `fix(paddle): ...`, `test(paddle): ...`. Release Please will bump version automatically on merge to `main`.

---

## 5. Devil's Advocate trail

### Round 1 → all resolved in round 2/3
| ID | Severity | Issue | Resolution |
|----|----------|-------|------------|
| DA1 | CRITICAL | Account deletion never cancels Paddle subscription | `erasePaddleDataForUser` cancels (3× retry) before anonymising |
| DA2 | CRITICAL | Zod envelope discriminated on `data.status` — lifetime webhook always returns 400 | Discriminate on outer `event_type`, 7 explicit branches |
| DA3 | CRITICAL | `retryCount` referenced but missing from schema | Added `retryCount` + `lastRetryAt` columns |
| DA4 | HIGH | `email=null` may be rejected by Paddle | Use `erased-${cuid()}@noemail.invalid` placeholder |
| DA5 | HIGH | Lifetime-over-active subscription unguarded | Subsumed by NC2's broader `isUserSuperfan` guard |
| DA6 | HIGH | Reconcile cron emits drift for every lifetime user | Filter `paddleSubscriptionId IS NOT NULL` in cron loop |
| DA7 | HIGH | `CREATE INDEX CONCURRENTLY` incompatible with Prisma transactions | Use plain `CREATE INDEX` (new tables, zero rows) |
| DA8 | HIGH | Paddle SDK Next.js 16 ESM compat unverified | Phase-0 task + `serverExternalPackages` + `runtime='nodejs'` |
| DA9 | MEDIUM | Settings page blocks 15s on portal API | 3s timeout, fallback to disabled "Manage Billing" |
| DA10 | MEDIUM | VAT price surprise (€9 → €10.71) | Locale-aware "excl. VAT" disclaimer + tooltip |
| DA11 | MEDIUM | 82% confidence misleading | Split into implementation + delivery confidence |
| DA12 | MEDIUM | `subscription.trialing` is not a real Paddle event | Removed from enum; trial state inferred from `subscription.created` |

### Round 2 — new findings, all patched in round 3
| ID | Severity | Issue | Resolution |
|----|----------|-------|------------|
| NC1 | CRITICAL | Dead-letter retry hits `P2002` because `processPaddleWebhookEvent` always tries to INSERT — events were never re-processed | New `reprocessWebhookEvent(row)` skips the INSERT; reconcile dead-letter loop uses it; state-machine extracted into shared helpers |
| NC2 | HIGH | LIFETIME user could buy monthly → double billing | Single `isUserSuperfan` guard at top of checkout returns 409 `already_subscribed` for any combination; replaces narrower DA5 check |
| NC3 | MEDIUM | Refunded lifetime buyer kept LIFETIME entitlement | `handleAdjustmentCreated` revokes LIFETIME on full refund/chargeback; partial refunds & credits remain log-only |
| NC4 | MEDIUM | DA9 timeout fallback unspecified for SDKs without `AbortSignal` | `Promise.race` against `rejectAfterMs` helper in `client.ts`; tested with mocked slow SDK |
| NC5 | LOW | Missing explicit `trialing → active` transition test | Added named test case in `webhook-handler.test.ts` |

---

## 6. Pre-merge blockers (legal / external — not engineering)

These are binary ship/no-ship gates and must be resolved before any production deploy:

1. **Signed Paddle DPA + SCCs on file** (GDPR Art. 28, Schrems II).
2. **Paddle data location confirmation in writing** (GDPR Art. 44/49).
3. **Cookie banner audit for Paddle.js** (TTDSG §25, GDPR Art. 7) — fallback plan: lazy-load Paddle.js only after the user clicks the checkout button. **[R4]** Engineering side already de-risked: the new `src/lib/paddle-consent.ts` (D4, modelled on the existing `posthog-consent.ts`) implements the lazy-load pattern; legal still needs to confirm whether Paddle.js qualifies as "strictly necessary" (TTDSG §25(2)(2)) or requires explicit consent.
4. **Privacy policy update** with Paddle as processor + retention disclosure. **[R4]** The current privacy policy at `app/privacy/page.tsx` already lists PostHog as a processor — add a Paddle section in the same format.
5. **Paddle sandbox verification** that `customers.update` accepts the placeholder-email payload (DA4) — soft engineering blocker; if it fails, `anonymiseCustomer` payload changes before code freeze.

---

## 7. Risk register (final)

| ID | Severity | Description | Mitigation |
|----|---------|-------------|------------|
| R1 | HIGH | Forged or replayed webhooks | `timingSafeEqual`, raw-body HMAC, ±300s timestamp window, idempotency, price-ID whitelist |
| R2 | HIGH | GDPR Art. 17 silent failure | Cancel-first ordering + 3× retry + AdminActivity audit + RTBF-priority delete |
| R3 | MEDIUM | Webhook handler exceeds 5s | Idempotency-first insert, no network I/O on hot path, `waitUntil` for telemetry |
| R4 | MEDIUM | Out-of-order webhooks | Monotonic ordering on `occurred_at`; reconcile cron is final arbiter |
| R5 | HIGH (PRE-MERGE) | Cookie consent / ePrivacy for Paddle.js | Legal review; lazy-load fallback |
| R6 | HIGH (PRE-MERGE) | Paddle DPA + SCCs not executed | Obtain before production |
| R7 | MEDIUM | Paddle SDK ESM compat | Phase-0 verification; `serverExternalPackages` |
| R8 | MEDIUM | VAT surprise | "excl. VAT" disclaimer + tooltip |
| R9 | LOW | Refunded lifetime retains entitlement | NC3 fix: full-refund revokes LIFETIME |
| R10 | LOW | Settings page blocked by slow Paddle portal API | 3s timeout + Promise.race fallback (NC4) |
| R11 _[R4]_ | LOW | Settings page is now `"use client"` (D8); SubscriptionSection must hydrate without flashing the wrong state | SubscriptionSection mounts in a loading state, fetches `GET /api/paddle/subscription`, renders only after response; aligns with existing pattern in the same page for analytics consent |
| R12 _[R4]_ | LOW | Existing crons (`feedback-github-sync`, `feedback-retention`) use plain string compare for `CRON_SECRET` (D7) — Paddle cron is hardened but creates an inconsistency | Out of scope for v1; capture as a follow-up `fix(security): use timingSafeEqual in cron auth checks` |

---

## 8. Quality gates (final state)

**Critical items addressed**
- Raw-body HMAC verification, constant-time compare, replay window
- Idempotent webhook processing with `UNIQUE(eventId)`
- **Functional dead-letter retry path** (NC1)
- **`isUserSuperfan` guard prevents all double-entitlement billing** (NC2)
- **Refunded lifetime revokes entitlement** (NC3)
- Subscription cancellation before Art. 17 erasure (DA1)
- Correct webhook envelope parsing for both subscription and transaction events (DA2)
- `retryCount` / `lastRetryAt` schema fields (DA3)
- Environment split enforced at module init
- CSP updated, secrets never exposed to client

**High items addressed**
- Placeholder anonymisation email (DA4)
- Lifetime-only users excluded from cron drift loop (DA6)
- Plain `CREATE INDEX` in migration (DA7)
- SDK Node.js runtime + `serverExternalPackages` (DA8)
- Settings 3s portal timeout with `Promise.race` fallback (DA9, NC4)

**Pre-merge gates** — see §6.

---

## 9. Context7 lookups required at implementation kickoff

- `@paddle/paddle-node-sdk` — `transactions.create`, `subscriptions.cancel`, `customerPortalSessions.create`, `customers.update` payload shape, **module type (CJS/ESM/dual)**, webhook event catalog.
- `@paddle/paddle-js` — `Paddle.Initialize`, `Checkout.open`, CSP nonce handling.
- `better-auth` _(v1.4)_ — `additionalFields` with `input:false`, session cache invalidation, and how `additionalFields` flow through to `auth.$Infer.Session` (we extend `ExtendedUserFields` manually today — verify this is still required in 1.4).
- `prisma` _(v7.5)_ — `P2002` handling, `SELECT ... FOR UPDATE` for seat-cap transactional check, custom generator output paths.
- `next` _(v16.1)_ — route handler raw body, `runtime='nodejs'` directive, `next.config.mjs` `serverExternalPackages`.
- `zod` — `discriminatedUnion` on outer field, `safeParse` error shape, **target version** to pin in `package.json` (existing transitive usage spans `^3.24.1` and `^4.3.6` — pick one and audit existing call sites in `src/lib/feedback/schema.ts`, `src/lib/feedback/triage-schema.ts`, `src/utils/ticketmaster.ts`, `app/api/user/export/route.ts` for compatibility).

---

## 10. Recommendation

The plan is now self-consistent across two rounds of Devil's Advocate scrutiny (12 round-1 issues + 5 round-2 issues, all addressed) **and** reconciled against the current `main` (revision 4, 2026-05-11 — 16 codebase deltas D1–D16 absorbed). **Implementation can start** as soon as the legal pre-merge blockers (§6) are in flight, Phase-0 SDK verification completes, and the Phase-0b prerequisites (fresh `feat/paddle-mor-superfan` branch, `yarn add zod`, `prisma generate` smoke test) pass.

When you're ready to move forward, just say the word — we can either start implementation, or move on to specifying which premium features the Superfan tier actually unlocks (your originally announced "second step").

---

## Appendix A — Revision history

| Revision | Date | Author | Scope |
|----------|------|--------|-------|
| 1 | 2026-04-21 | JMAT (8 specialists + Tech Lead + Devil's Advocate) | Initial synthesis. 40 files, 3 CRITICAL + 5 HIGH + 4 MEDIUM DA findings. |
| 2 | 2026-04-25 | Tech Lead | DA1–DA12 fixes + 4 scope cuts. Down to 35 files. NC1 CRITICAL + NC2 HIGH found in DA Round 2. |
| 3 | 2026-04-25 | Tech Lead | NC1–NC5 surgical patches. Zero file-count delta. Implementation confidence 87%. |
| 4 | 2026-05-11 | Reconciliation pass | Codebase reconciled against `main`@`74c1c48`. 16 tactical deltas (D1–D16): rebrand, array CSP, PostHog consent reuse, Prisma 7.5, `zod` as direct dep, timing-safe cron, refactored Settings client component, Husky/commitlint, pricing-page placement. New risks R11/R12. Implementation confidence 88%. No new specialist round; structural decisions from rounds 1–3 unchanged. |
