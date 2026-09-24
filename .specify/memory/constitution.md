<!--
Sync Impact Report (temporary; remove before commit)
Version change: 1.0.0 → 1.1.0 (MINOR: new principles and materially expanded guidance)
Modified principles:
  - I. Security & Privacy by Default → I. Security, Privacy & Tenant Isolation (expanded: secrets,
    rate limiting, erasure/export, security headers)
  - II. Shared-Concert Data Model Integrity → II. Data Integrity & Database Discipline
    (app invariants kept; added Prisma migration, query, pagination, pooling rules)
  - III. Type-Safe, Server-First TypeScript → III. Type-Safe, Server-First Application Code
  - IV. Accessible, Consistent UI → IV. Accessible, Consistent, Performant UI (added budgets)
  - V. Tested, Flag-Gated Change → VII. Tested, Flag-Gated Change (renumbered)
Added principles:
  - V. Scalable, Stateless Design for Concurrent Use
  - VI. Resilient External API Integration
  - Observability & Operations requirements (Technical Constraints section)
Added sections: Observability & Operations (within Technical Constraints), Quality Gates
  (within Development Workflow).
Removed sections: none.
Deferred items: none. Numeric thresholds (timeouts, budgets) are stated as defaults that
  individual specs MAY tighten but MUST NOT loosen without justification.
-->
# Concertivity Constitution

## Core Principles

### I. Security, Privacy & Tenant Isolation (NON-NEGOTIABLE)

- Every mutating API route and server action MUST verify the session via `auth.api.getSession()`;
  read routes serving user-specific data MUST do the same.
- Authorization MUST be enforced server-side on every request. UI hiding is never access control.
- Update/delete/read of user data MUST be scoped to the owning `userId`. Admin routes/actions MUST
  require `session.user.role === "admin"`.
- All external input (body, query, params, headers, webhooks, third-party API responses) MUST be
  validated with a schema (Zod preferred) before use.
- Sensitive server data (tokens, hashes, internal IDs not needed by the client, other users'
  data) MUST NOT appear in client responses, logs, or error messages.
- Secrets MUST live in environment variables, never in source or client bundles; only variables
  intentionally public MAY use the `NEXT_PUBLIC_` prefix.
- Public profile data is opt-in only (`isPublic`); non-public users MUST return not found.
- Endpoints that are unauthenticated, expensive, or call paid/quota-limited third parties MUST
  be rate limited.
- Auth flows (Better Auth) MUST keep secure, httpOnly, SameSite cookies, CSRF protection, and
  session expiry/rotation defaults; they MUST NOT be weakened without an ADR.
- Users MUST be able to export and delete their personal data; new tables holding personal data
  MUST be covered by the deletion path.
- Any change adding tracking/marketing cookies or non-essential client identifiers MUST flag that
  a GDPR/DSGVO consent flow may be required. Features sending user data to third parties MUST
  update the privacy policy/sub-processor list before production use.

Rationale: a multi-user SaaS holds personal history; cross-tenant leaks or account takeover are
the highest-cost failures, and EU operation makes privacy a legal duty.

### II. Data Integrity & Database Discipline

- Concerts are shared entities; user attendance is modeled via `UserConcert`.
- Headliners are shared (`ConcertBand`); support acts are per-user (`UserConcert.supportingActIds`).
  Flows MUST preserve this split.
- `Concert.userId` and `Concert.cost` are deprecated; new logic MUST NOT depend on them.
- Schema changes MUST ship as Prisma migrations, MUST be backward compatible with the currently
  deployed code (expand → migrate → contract), and MUST NOT be applied by hand.
- Multi-step writes that must succeed together MUST use transactions; writes that may be retried
  or raced (imports, webhooks, double submits) MUST be idempotent or protected by unique
  constraints.
- Columns used in filters, joins, or ordering on growing tables MUST be indexed.
- List endpoints and queries MUST be paginated or bounded; queries MUST NOT loop per row (N+1) —
  use `include`/`select` or batching, and select only needed fields.
- One shared Prisma client instance MUST be used per process, and connection usage MUST be
  compatible with pooled/serverless deployment.
- Concert create/update/delete flows MUST trigger the `concert-statistics` tag revalidation.

Rationale: shared and per-user data must stay consistent under concurrent writes, and unindexed or
unbounded queries are the most common cause of SaaS slowdowns.

### III. Type-Safe, Server-First Application Code

- Code MUST use strict TypeScript, no untyped `any` without a justifying comment, and absolute
  `@/*` imports.
- Server components are the default; `'use client'` boundaries MUST be explicit and minimal.
- Data fetching and mutations MUST happen on the server (server components, route handlers,
  server actions); client components receive only the data they render.
- Routes depending on session/user state MUST remain dynamically rendered (`force-dynamic`);
  shared/public data SHOULD use cached or static rendering with explicit revalidation.
- API route inputs and outputs MUST have typed, schema-defined contracts; breaking changes to a
  response shape MUST be versioned or migrated with all consumers in the same change.
- Package management MUST use Yarn 4 only (no `npm`, `pnpm`, `npx`).
- Next.js APIs MUST be verified against `node_modules/next/dist/docs/` before use; this Next.js
  version has breaking changes.

Rationale: strict types and server-first rendering reduce runtime errors, shipped JavaScript, and
the surface for client-side data leaks.

### IV. Accessible, Consistent, Performant UI

- Styling MUST use the repo's SCSS modules/global SCSS; Tailwind, CSS-in-JS, inline styles, and
  `!important` are prohibited. Colors, spacing, and motion MUST come from shared SCSS tokens.
- Images MUST use `next/image` where applicable; fonts MUST use `next/font` or self-hosting
  compatible with the CSP.
- Markup MUST be semantic with visible focus states, sufficient color contrast (WCAG 2.2 AA),
  and full keyboard operability. Decorative icons MUST carry `aria-hidden="true"`; interactive
  controls MUST have accessible names.
- Dialogs MUST use the native `<dialog>` patterns already in the codebase; keyboard-driven inputs
  MUST preserve Arrow/Enter/Escape behavior.
- Animations MUST reuse tokens from `src/styles/variables.scss`, stay subtle, and honor
  `prefers-reduced-motion`.
- Pages MUST provide loading, empty, and error states; layouts MUST be responsive from mobile up.
- New pages SHOULD keep Core Web Vitals in the "good" range (LCP ≤ 2.5 s, INP ≤ 200 ms,
  CLS ≤ 0.1); heavy client libraries MUST be lazy-loaded or justified.

Rationale: accessibility is a baseline requirement, and a fast, consistent UI matters at scale.

### V. Scalable, Stateless Design for Concurrent Use

- Application instances MUST be stateless: no user or request state in module-level variables,
  in-memory caches relied on for correctness, or local files. Shared state MUST live in the
  database or a shared cache.
- Code MUST assume many simultaneous users and multiple instances: no reliance on request
  ordering, no unbounded in-memory collections, no work proportional to total user count in a
  request path.
- Long-running or bulk work (imports, enrichment, email) MUST run outside the request path
  (background job, queue, or scheduled task) and MUST be idempotent and resumable.
- Caching MUST have an explicit key, scope (per-user vs shared), TTL or tag, and invalidation
  path. User-specific data MUST NOT be stored in shared caches without the user in the key.
- Public, unauthenticated, and expensive endpoints MUST have abuse protection (rate limiting,
  payload size limits).
- Features MUST degrade gracefully under partial failure rather than fail whole pages.

Rationale: horizontal scale and serverless execution break any hidden per-instance state.

### VI. Resilient External API Integration

- Every outbound call to a third-party API (Last.fm, MusicBrainz, Photon geocoding, Setlist.fm,
  Groq, and others) MUST have a timeout, bounded retries with backoff for idempotent requests,
  and a defined fallback (cached value, empty result, or user-visible degraded state).
- A third-party outage or slowdown MUST NOT break core flows (auth, viewing/creating concerts).
- Third-party responses MUST be validated by schema; failures MUST be handled, not assumed
  successful.
- Third-party results SHOULD be cached per each provider's terms to reduce latency and quota
  use; provider rate limits and attribution requirements MUST be respected.
- Provider API keys MUST stay server-side. Browser-side calls to third parties MUST be avoided
  unless required, and then require a CSP update.
- Each integration MUST sit behind an internal module boundary (single client/adapter) so it can
  be replaced, mocked, or disabled by feature flag.
- Cost or privacy-sensitive integrations MUST be gated by an environment feature flag that is off
  by default.

Rationale: with many external dependencies, availability and cost are only as good as the weakest
integration; isolating and bounding them protects users.

### VII. Tested, Flag-Gated Change

- New behavior MUST ship with Vitest tests; bug fixes MUST include a regression test.
- Auth, authorization, ownership checks, validation, and data-model invariants MUST have tests
  covering both the allowed and the denied path.
- External APIs MUST be mocked in tests; tests MUST NOT call live third-party services.
- Environment feature flags (`ENABLE_LASTFM`, `ENABLE_GEOCODING`, `ENABLE_MUSICBRAINZ`,
  `ENABLE_EXTERNAL_BAND_SUGGEST`, `ENABLE_MAP_PAGE`, `ENABLE_CONCERT_AI_SEARCH`) MUST be respected
  in both UI and API logic and MUST NOT be bypassed.
- Commits MUST follow Conventional Commits (enforced by CI; release-please derives releases).

Rationale: flags gate third-party data flows and cost; tests and commit discipline keep releases
automated and safe.

## Technical Constraints

- Stack: Next.js App Router, React, SCSS, Prisma/PostgreSQL, Better Auth, Node.js 22, Yarn 4.
- CSP lives in `proxy.ts`: scripts use per-request nonces with `strict-dynamic`; styles
  intentionally use `'unsafe-inline'` without nonce. Any new client-facing third-party service
  (scripts, widgets, browser-side calls, remote images/fonts) MUST update the CSP directives.
  Server-only integrations need no CSP entry.
- Security headers (CSP, HSTS, frame, referrer, content-type options) MUST NOT be weakened
  without an ADR.
- Dependencies MUST be kept free of known high/critical vulnerabilities (`yarn npm audit`);
  new dependencies MUST be justified by need, maintenance status, and license.
- Observability & Operations:
  - Errors MUST be reported to the configured error tracker (Sentry) with no PII in payloads.
  - Server logs MUST be structured, MUST omit secrets and personal data, and MUST include enough
    context (route, request ID, outcome) to diagnose failures.
  - Health-relevant failures (auth, database, third-party outage) MUST be observable and
    distinguishable from user error.
  - New environment variables MUST be documented in `.env.example` and validated at startup or
    first use.

## Development Workflow

- New features MUST go through spec-kit: `/speckit-specify` → `/speckit-plan` → `/speckit-tasks` →
  `/speckit-implement`; artifacts live under `.specify/`.
- A decision with consequences beyond one feature (data-model shape, auth/session model,
  third-party integration boundary, cross-cutting convention) MUST be recorded as an ADR in
  `docs/adr/` using `docs/adr/template.md`. Accepted ADRs MUST NOT be silently edited; supersede
  them instead. Feature-local decisions belong in the spec, not an ADR.
- Quality gates: `yarn lint`, `yarn test`, and `yarn build` MUST pass before merge; CI test
  coverage checks MUST NOT be bypassed.
- Every plan MUST state the impact on security/privacy, data model, concurrency/caching, and
  external APIs, or state that there is none.
- Before running `yarn dev`, check that a dev server is not already running.
- Visual changes SHOULD be validated with `node screenshot.mjs` from the project root.

## Governance

This constitution supersedes other practices. `CLAUDE.md` provides runtime guidance for agents and
MUST stay consistent with it. Amendments require a pull request that updates this file, states the
rationale, and bumps the version: MAJOR for removing or redefining a principle, MINOR for adding a
principle/section or materially expanding guidance, PATCH for clarifications. All PRs and reviews
MUST verify compliance; spec-kit plans MUST pass a constitution check, and any violation MUST be
justified in the plan's complexity tracking. Principles I and the Technical Constraints on
security headers are non-negotiable and MUST NOT be waived through complexity tracking; changing
them requires an amendment.

**Version**: 1.1.0 | **Ratified**: 2026-09-24 | **Last Amended**: 2026-09-24
