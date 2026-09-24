<!--
Sync Impact Report (temporary; remove before commit)
Version change: (unversioned template) → 1.0.0
Modified principles: none renamed; all five principle slots and both extra sections filled
  from blank template.
Added sections: Core Principles I–V, Technical Constraints, Development Workflow, Governance.
Removed sections: none.
Deferred items: none. RATIFICATION_DATE set to 2026-09-24 (first adoption alongside spec-kit).
Sources: CLAUDE.md, README.md, docs/adr/0001-record-architecture-decisions.md.
-->
# Concertivity Constitution

## Core Principles

### I. Security & Privacy by Default (NON-NEGOTIABLE)

- Every mutating API route and server action MUST verify the session via `auth.api.getSession()`.
- Update/delete of user data MUST be scoped to the owning `userId`.
- Admin routes/actions MUST require `session.user.role === "admin"`.
- All external input MUST be validated (Zod preferred); client payloads are never trusted.
- Sensitive server data MUST NOT appear in client responses.
- Public profile data is opt-in only (`isPublic`); non-public users MUST return not found.
- Any change adding tracking/marketing cookies or non-essential client identifiers MUST flag that a
  GDPR/DSGVO consent flow may be required. Features sending user data to third parties MUST update
  the privacy policy/sub-processor list before production use.

Rationale: the app stores personal history and is operated from the EU; breaches or leaks of
private data are the highest-cost failure.

### II. Shared-Concert Data Model Integrity

- Concerts are shared entities; user attendance is modeled via `UserConcert`.
- Headliners are shared (`ConcertBand`); support acts are per-user (`UserConcert.supportingActIds`).
  Flows MUST preserve this split.
- `Concert.userId` and `Concert.cost` are deprecated; new logic MUST NOT depend on them.
- Concert create/update/delete flows MUST trigger the `concert-statistics` tag revalidation.

Rationale: multi-tenancy correctness and cache freshness depend on these invariants.

### III. Type-Safe, Server-First TypeScript

- Code MUST use strict TypeScript and absolute `@/*` imports.
- Server components are the default; `'use client'` boundaries MUST be explicit and minimal.
- Routes depending on session/user state MUST remain dynamically rendered (`force-dynamic`).
- Package management MUST use Yarn 4 only (no `npm`, `pnpm`, `npx`).
- Next.js APIs MUST be verified against `node_modules/next/dist/docs/` before use; this Next.js
  version has breaking changes.

Rationale: strict types and server-first rendering reduce runtime errors and shipped JS.

### IV. Accessible, Consistent UI

- Styling MUST use the repo's SCSS modules/global SCSS; Tailwind, CSS-in-JS, inline styles and
  `!important` are prohibited.
- Images MUST use `next/image` where applicable.
- Markup MUST be semantic with visible focus states; decorative icons MUST carry
  `aria-hidden="true"`; interactive controls MUST have accessible names.
- Dialogs MUST use the native `<dialog>` patterns already in the codebase; keyboard-driven inputs
  MUST preserve Arrow/Enter/Escape behavior.
- Animations MUST reuse tokens from `src/styles/variables.scss`, stay subtle, and honor
  `prefers-reduced-motion`.

Rationale: accessibility is a baseline requirement, and shared tokens keep the UI coherent.

### V. Tested, Flag-Gated Change

- New behavior MUST ship with Vitest tests; `yarn lint` and `yarn test` MUST pass before merge.
- Environment feature flags (`ENABLE_LASTFM`, `ENABLE_GEOCODING`, `ENABLE_MUSICBRAINZ`,
  `ENABLE_EXTERNAL_BAND_SUGGEST`, `ENABLE_MAP_PAGE`, `ENABLE_CONCERT_AI_SEARCH`) MUST be respected
  in both UI and API logic and MUST NOT be bypassed.
- Commits MUST follow Conventional Commits (enforced by CI; release-please derives releases).

Rationale: flags gate third-party data flows and cost; tests and commit discipline keep releases
automated and safe.

## Technical Constraints

- Stack: Next.js App Router, Prisma/PostgreSQL, Better Auth, Node.js 22, Yarn 4.
- CSP lives in `proxy.ts`: scripts use per-request nonces with `strict-dynamic`; styles
  intentionally use `'unsafe-inline'` without nonce. Any new client-facing third-party service
  (scripts, widgets, browser-side calls, remote images/fonts) MUST update the CSP directives.
  Server-only integrations need no CSP entry.
- Schema changes MUST go through Prisma migrations and MUST be safe for zero-downtime deploys.

## Development Workflow

- New features MUST go through spec-kit: `/speckit-specify` → `/speckit-plan` → `/speckit-tasks` →
  `/speckit-implement`; artifacts live under `.specify/`.
- A decision with consequences beyond one feature (data-model shape, auth/session model,
  third-party integration boundary, cross-cutting convention) MUST be recorded as an ADR in
  `docs/adr/` using `docs/adr/template.md`. Accepted ADRs MUST NOT be silently edited; supersede
  them instead. Feature-local decisions belong in the spec, not an ADR.
- Before running `yarn dev`, check that a dev server is not already running.
- Visual changes SHOULD be validated with `node screenshot.mjs` from the project root.

## Governance

This constitution supersedes other practices. `CLAUDE.md` provides runtime guidance for agents and
MUST stay consistent with it. Amendments require a pull request that updates this file, states the
rationale, and bumps the version: MAJOR for removing or redefining a principle, MINOR for adding a
principle/section or materially expanding guidance, PATCH for clarifications. All PRs and reviews
MUST verify compliance; spec-kit plans MUST pass a constitution check, and any violation MUST be
justified in the plan's complexity tracking.

**Version**: 1.0.0 | **Ratified**: 2026-09-24 | **Last Amended**: 2026-09-24
