# Implementation Plan: Resolve Dependabot Alerts

**Branch**: `001-fix-dependabot-alerts` | **Date**: 2026-10-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-fix-dependabot-alerts/spec.md`

## Summary

Clear all 12 open Dependabot alerts (and the 11 open Dependabot PRs) plus extra vulnerabilities reported by `yarn npm audit` that Dependabot has not flagged. Approach: bump direct deps (`next`, `sharp`) in `package.json`, raise Yarn `resolutions` for transitive packages (`brace-expansion`, `source-map-js`, `ip-address`, `dompurify`, `http-cache-semantics`, plus audit-only `braces`, `fflate`, `fast-uri`), regenerate `yarn.lock`, then verify with audit, lint, type check, tests, production build and a browser smoke test. No application code changes are expected; the only plausible code touch points are `app/icon.tsx` / `app/apple-icon.tsx` (next/og, RCE fix) and `next.config.mjs` (image optimization SSRF fix).

## Technical Context

**Language/Version**: TypeScript 5.9 (strict), Node 22+, React 19

**Primary Dependencies**: Next.js 16.3.3 → ≥16.3.8 (webpack build, `next build --webpack`), Better Auth 1.6.22, Prisma 7.5, Sentry, PostHog, sharp, sass

**Storage**: PostgreSQL via Prisma. No schema change; no migration.

**Testing**: Vitest (35 test files), ESLint, `tsc`, `next build`

**Target Platform**: Vercel (Node.js runtime), self-hosted Next semantics apply to the cache-poisoning advisory

**Project Type**: Web application (Next.js App Router, single package, Yarn 4)

**Performance Goals**: No regression in build time or page performance; N/A otherwise

**Constraints**: Yarn 4 only; CSP in `proxy.ts` (nonce + strict-dynamic) unchanged; feature flags unchanged; read `node_modules/next/dist/docs/` before any Next change (FR-010)

**Scale/Scope**: ~7 direct/transitive package families, 1 lockfile, 0 expected source edits

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Note |
|-----------|--------|------|
| I. Security, Privacy & Tenant Isolation | PASS | Change removes known vulns. Auth/session/cookie behaviour must stay as is; Better Auth is not being bumped (already 1.6.22). Next cache-poisoning and Draft-Mode-leak advisories are tenant-isolation relevant, which raises priority. No new cookies, trackers or third-party services, so no consent flow impact (FR-011). |
| II. Data Integrity & DB Discipline | PASS | No schema or query change. `concert-statistics` revalidation untouched; smoke test covers it. |
| III. Type-Safe, Server-First Code | PASS | Yarn 4 only. Next docs must be checked before touching Next config (done in research for 16.3.x notes; repeat at implement time). |
| IV. Accessible, Consistent, Performant UI | PASS | No UI change. Build and smoke test guard against regressions. |
| Other principles (testing, ADRs) | PASS | No ADR needed: no decision outlives this change except the resolutions policy, which is recorded in research.md. |

Post-design re-check: still PASS. No complexity violations.

## Project Structure

### Documentation (this feature)

```text
specs/001-fix-dependabot-alerts/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── checklists/requirements.md
└── tasks.md             # created by /speckit-tasks
```

(`contracts/` skipped: no external interface changes.)

### Source Code (repository root)

```text
package.json             # dependency bumps + resolutions
yarn.lock                # regenerated
app/icon.tsx             # verify only (next/og)
app/apple-icon.tsx       # verify only (next/og)
next.config.mjs          # verify only (images.remotePatterns)
proxy.ts                 # verify only (CSP unchanged)
```

**Structure Decision**: Single existing project; edits limited to manifest and lockfile. Source files listed are verification targets, changed only if the upgrade forces it.

## Complexity Tracking

No constitution violations. Table omitted.
