# Research: Payment Provider Integration Test Coverage

## R1 — Coverage gate semantics
- **Decision**: Treat 80% as a *per-file* floor on all four metrics.
- **Rationale**: `vitest.config.ts` sets `perFile: true` with lines/branches/functions/statements = 80. Branches are the usual miss (e.g. `webhook-verify.ts` failed at 68.57% lines). Each file therefore needs its error/guard branches tested, not just the happy path.
- **Alternatives**: Aggregate coverage (rejected: not what CI enforces).

## R2 — Mock boundaries
- **Decision**: `vi.mock` at module level: `@/lib/prisma` (hand-built object of `vi.fn()` per used model method), `./client` (Paddle wrapper) for services, `@paddle/paddle-node-sdk` only in `client.test.ts`, `@/lib/auth` + `next/headers` + `@sentry/nextjs` for routes.
- **Rationale**: Matches constitution VII (mock external APIs) and keeps tests offline and fast. Mocking our own thin wrapper (`client.ts`) keeps service tests independent of SDK shape.
- **Alternatives**: Real test DB (rejected: spec FR-009, slower, needs infra); MSW HTTP mocks (rejected: SDK is wrapped, extra dep).

## R3 — Module-level state
- **Decision**: Use existing `resetPaddleConfigCacheForTests()` and `resetPaddleApiForTests()` in `beforeEach`; set env via `vi.stubEnv` and `vi.unstubAllEnvs()` in `afterEach`.
- **Rationale**: Config and SDK instance are cached singletons; leakage between tests would cause order-dependent failures (SC-004 stability).

## R4 — Time-dependent rules
- **Decision**: `vi.useFakeTimers()` + `vi.setSystemTime()` for lifetime-offer deadline, webhook freshness window, trial end display; fake-timer-driven rejection for portal 3 s timeout (`rejectAfterMs`).
- **Rationale**: Deterministic boundaries without sleeping.

## R5 — Route handler testing
- **Decision**: Import `POST`/`GET` directly and call with `new NextRequest(url, { method, body, headers })`; assert on `Response.status` and `await res.json()`. Add `// @vitest-environment node` where jsdom's `Request` differs (webhook raw body, crypto).
- **Rationale**: No server needed; fastest. Next.js docs for route handlers should be re-checked in `node_modules/next/dist/docs/` during implementation per CLAUDE.md (no Next API is newly used in tests beyond `NextRequest`).

## R6 — Component testing
- **Decision**: React Testing Library with `getByRole`/`getByText`; mock `fetch`, `@/lib/paddle-client`, `@/lib/auth-client`, and `next/navigation` per component. Existing tests (`ConcertCard`, `Toast`) are the style reference.
- **Rationale**: Role-based queries double as accessible-name checks (constitution IV).

## R7 — Scope beyond the spec's named areas
- **Decision**: Also cover `subscription-sync.ts` (260 lines), `price-previews.ts`, `billing-ui.ts`, `config.ts`, `client.ts`, `paddle-consent.ts`, `paddle-client.ts`.
- **Rationale**: They are part of the PR, untested, and subject to the per-file gate once loaded transitively; spec FR-010 requires all touched payment files to pass.
- **Alternatives**: Exclude from coverage (rejected: hides risk).

## R8 — Defects found while testing
- **Decision**: If a test exposes a bug, mark it `it.fails`/note in tasks, fix in a separate commit (`fix(paddle): ...`) per FR-011.

## R9 — Deferred (not in this plan)
Trial wiring (#216), sandbox E2E, `customers.update` placeholder-email check, `app/api/user/{account,export}` route tests (their Paddle calls are covered via `gdpr.ts`; add only if their own coverage gate trips).
