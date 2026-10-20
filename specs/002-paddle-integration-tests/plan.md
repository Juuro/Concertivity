# Implementation Plan: Payment Provider Integration Test Coverage

**Branch**: `feat/paddle-mor-superfan` (PR #287; spec dir `specs/002-paddle-integration-tests`) | **Date**: 2026-10-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-paddle-integration-tests/spec.md`

## Summary

Add Vitest suites for all untested Paddle code on PR #287: domain services, validation schemas, five route handlers, client helpers, and three React components. Only `webhook-verify.test.ts` exists today. External boundaries (Prisma, Paddle SDK wrapper, Better Auth, `next/headers`, Sentry) are mocked at module level; no production behaviour changes. Goal: every Paddle source file clears the repo's per-file 80% gate (lines, branches, functions, statements) and every rule in the spec is pinned by at least one failing-if-broken test.

## Technical Context

**Language/Version**: TypeScript (strict), Node.js 22

**Primary Dependencies**: Vitest 4 (`globals: true`, jsdom), `@testing-library/react` + `jest-dom` (already in `vitest.setup.ts`), `@paddle/paddle-node-sdk` (mocked), Zod

**Storage**: None touched; Prisma client mocked per test file

**Testing**: `yarn test` (`vitest run`), `yarn test:coverage` (v8, `perFile: true`, 80% on lines/branches/functions/statements)

**Target Platform**: Developer machines and CI (jsdom environment by default; node-only files use `// @vitest-environment node`)

**Project Type**: Web application (Next.js App Router) — single project

**Performance Goals**: Full Paddle suite < 60 s (SC-004)

**Constraints**: No network, no real DB, no real credentials; no production code changes (FR-009, FR-011); Yarn 4 only; absolute `@/*` imports

**Scale/Scope**: ~20 new test files covering ~2,250 source lines in 24 files

## Constitution Check

*GATE: passed before research; re-checked after design — still passes.*

| Principle | Status | Note |
|---|---|---|
| I. Security/Privacy | Pass | Tests assert the denied paths (no session, bad signature, wrong cron secret, validation failures, redaction, erasure). No secrets in fixtures — use obvious dummy values. |
| II. Data integrity | Pass | Idempotency (`UNIQUE(eventId)` duplicate path) and transactional behaviour asserted via mocks. |
| III. Type-safe | Pass | Tests are strict TS; no untyped `any` without comment. |
| IV. UI | Pass | Component tests query by role/name, which also checks accessible names. |
| V. Stateless | Pass | Module-level caches reset via existing `resetPaddleConfigCacheForTests` / `resetPaddleApiForTests`. |
| VI. Resilient integrations | Pass | Timeout/fallback paths (`rejectAfterMs`, portal 3 s, erasure retries) are explicit test targets. |
| VII. Tested, flag-gated | Pass | This feature *is* the VII compliance work; `ENABLE_PAYWALL` on/off tested on every gated route. Mocks only; no live Paddle. |

Plan impact statements — Security/privacy: none (tests only). Data model: none. Concurrency/caching: none. External APIs: none (mocked).

## Project Structure

### Documentation (this feature)

```text
specs/002-paddle-integration-tests/
├── plan.md
├── research.md
├── data-model.md        # test fixtures & mock surfaces (no schema change)
├── quickstart.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

`contracts/` intentionally omitted: the feature adds no interface; endpoint contracts under test already exist in code and `src/lib/validations/paddle.ts`.

### Source Code (test files to add, beside the code they cover)

```text
src/lib/paddle/
├── config.test.ts
├── client.test.ts
├── webhook-handler.test.ts        # US1 core
├── subscription-sync.test.ts
├── entitlement.test.ts            # US1
├── reconcile.test.ts              # US3
├── gdpr.test.ts                   # US3
├── price-previews.test.ts
├── billing-ui.test.ts
└── (webhook-verify.test.ts exists)
src/lib/validations/paddle.test.ts # US1
src/lib/paddle-consent.test.ts
src/lib/paddle-client.test.ts
app/api/paddle/checkout/route.test.ts             # US2
app/api/paddle/subscription/route.test.ts
app/api/paddle/subscription/sync/route.test.ts
app/api/paddle/webhook/route.test.ts
app/api/cron/paddle-reconcile/route.test.ts
src/components/checkout/PaddleCheckoutButton.test.tsx   # US4
src/components/subscription/SubscriptionSection.test.tsx
src/components/pricing/PricingCard.test.tsx
src/test-utils/paddle.ts           # shared fixtures (event builders, prisma mock factory)
```

**Structure Decision**: Colocate `*.test.ts(x)` beside sources, matching the existing `webhook-verify.test.ts`. One shared helper module for fixtures; no new tooling or dependencies.

## Complexity Tracking

No constitution violations.
