---

description: "Task list for resolving Dependabot alerts"
---

# Tasks: Resolve Dependabot Alerts

**Input**: Design documents from `/specs/001-fix-dependabot-alerts/`

**Prerequisites**: plan.md, spec.md, research.md, quickstart.md (data-model.md: no change; contracts/: none)

**Tests**: No new test tasks (not requested). Existing checks (tsc, lint, vitest, build) are the regression net.

**Organization**: By user story. Almost every task edits `package.json` / `yarn.lock`, so little is parallelizable; `[P]` is used only for read-only verification.

## Format: `[ID] [P?] [Story] Description`

Yarn 4 only (`yarn`, `yarn dlx`, `yarn npm audit`). No `npm`/`npx`.

---

## Phase 1: Setup

- [X] T001 Create branch `001-fix-dependabot-alerts` from `main` (`git switch -c 001-fix-dependabot-alerts`)
- [X] T002 Record baseline: run `yarn npm audit --all --recursive` and `yarn tsc --noEmit && yarn lint && yarn test` on unchanged tree; save audit output to `/private/tmp/claude-501/-Users-juuro-Repos-Concertivity/797263ae-1489-4fb8-a72a-a995972ddef1/scratchpad/audit-before.txt`; note any pre-existing failures

---

## Phase 2: Foundational

- [X] T003 Read `node_modules/next/dist/docs/` sections on upgrading/versions, `next/og` ImageResponse, image optimization (`images.remotePatterns`) and caching before touching Next (spec FR-010)
- [X] T004 Check whether `http-cache-semantics@4.3.0` fixes GHSA-ch52-4w7c-c8xp (max-stale handling): read advisory references listed in `specs/001-fix-dependabot-alerts/research.md` D4 and the 4.3.0 changelog/diff; record result in research.md D4

**Checkpoint**: baseline and docs known; safe to change dependencies.

---

## Phase 3: User Story 1 - No open security alerts (Priority: P1) 🎯 MVP

**Goal**: Every alerted and audit-flagged vulnerable package resolves to a patched version.

**Independent Test**: `yarn npm audit --all --recursive` shows no vulnerability at moderate or above (exceptions only as documented); `yarn why` shows only patched versions.

- [X] T005 [US1] In `package.json` set `"next": "^16.3.8"` and `"sharp": "^0.35.5"` in `dependencies`; run `yarn up next sharp` to update `yarn.lock`
- [X] T006 [US1] In `package.json` `resolutions`, raise `"brace-expansion@npm:^1.1.7"` to `^1.1.21`, `"brace-expansion@npm:^5.0.2"` to `^5.0.12`, `"ip-address"` to `^10.7.4`, `"fast-uri"` to `^3.1.8`
- [X] T007 [US1] In `package.json` `resolutions`, add `"source-map-js": "^1.2.2"`, `"dompurify": "^3.4.17"`, `"http-cache-semantics": "^4.3.0"`; add `"braces"` and `"fflate"` entries at the patched versions reported by `yarn npm audit` (braces >3.0.3 in 3.x; fflate ≥0.8.3, scoped `fflate@npm:^0.4.8` if the posthog-js copy needs it)
- [X] T008 [US1] Run `yarn install` to regenerate `yarn.lock`; if a resolution is not honored, use `yarn up -R <pkg>` and re-check
- [X] T009 [US1] Verify with `yarn why next sharp http-cache-semantics source-map-js ip-address dompurify brace-expansion braces fflate fast-uri` that only patched versions remain and `sharp` has a single copy
- [X] T010 [US1] Run `yarn npm audit --all --recursive`; fix any remaining moderate+ vulnerability. If an alert cannot be fixed (e.g. http-cache-semantics per T004), add an accepted-risk entry to `specs/001-fix-dependabot-alerts/research.md` with advisory ID, path, reachability, revisit trigger (FR-006)
  - _http-cache-semantics (4.3.0 does not fix max-stale) and braces (no patch) recorded as accepted risk in research.md._

**Checkpoint**: audit clean (or documented exceptions). MVP complete once US2 confirms nothing broke.

---

## Phase 4: User Story 2 - Application keeps working (Priority: P1)

**Goal**: No behavior regression after upgrades.

**Independent Test**: tsc, lint, vitest, build pass; manual smoke per `quickstart.md` step 3 passes with no CSP violations.

- [X] T011 [US2] Run `yarn tsc --noEmit`; fix type errors caused by upgrades in files under `src/` and `app/`
- [X] T012 [US2] Run `yarn lint`; fix new lint errors (no `!important`, inline styles, or Tailwind additions)
- [X] T013 [US2] Run `yarn test`; fix regressions in the affected tests under `src/**/__tests__/`
- [X] T014 [US2] Run `yarn build`; fix build/config breakage in `next.config.mjs`, `app/`, or `proxy.ts` (keep CSP nonce + strict-dynamic and `'unsafe-inline'` styles as documented in CLAUDE.md)
- [X] T015 [P] [US2] Verify `app/icon.tsx` and `app/apple-icon.tsx` still render via `next/og` after the bump (request `/icon` and `/apple-icon` on a running dev/prod server)
- [X] T016 [P] [US2] Verify `images.remotePatterns` in `next.config.mjs` still allows the current remote hosts and an image renders via `next/image`
- [X] T017 [US2] Smoke test (check for existing dev server first; no duplicates): sign in via `/api/dev/login`, create/edit/delete a concert, open statistics page (confirms `concert-statistics` revalidation), public and non-public profile, map page; use `node screenshot.mjs http://localhost:3000 ...`; confirm no CSP violations in console and security headers unchanged
  - _Done read-only: login, /icon, /apple-icon, manifest, privacy, /settings, /map, /year/2024 render; CSP nonce present; image optimizer rejects non-allowlisted host (400). Concert create/edit/delete NOT exercised (writes to the live DB in `.env`)._
- [X] T018 [US2] Confirm no new deprecation warnings in `yarn build` output compared to baseline from T002

**Checkpoint**: app works on patched dependencies.

---

## Phase 5: User Story 3 - Dependabot PR queue cleared (Priority: P2)

**Goal**: No stale Dependabot PRs.

**Independent Test**: `gh pr list --author "app/dependabot" --state open` returns none (apart from newly opened ones).

- [ ] T019 [US3] Commit with conventional message (e.g. `fix(deps): resolve open dependabot alerts`), push branch, open PR referencing alerts #396–#407 and PRs #315, #317, #321, #323, #325, #326, #341, #346, #347, #348, #349
- [ ] T020 [US3] After merge, close any still-open Dependabot PRs from that list as superseded with a one-line comment (`gh pr close <n> -c "Superseded by #<pr>"`); for any not applied, record the reason
- [ ] T021 [US3] Confirm `gh api repos/:owner/:repo/dependabot/alerts` shows zero open alerts (or only the documented exception)

---

## Phase 6: Polish

- [ ] T022 Update `specs/001-fix-dependabot-alerts/research.md` follow-up notes: audit-only EOL notices (eslint 9, git-raw-commits) left out of scope per D5
- [ ] T023 Run full `quickstart.md` once more end to end

---

## Dependencies & Execution Order

- Phase 1 → Phase 2 → US1 (T005–T010 strictly sequential: same files) → US2 (T011–T014 sequential; T015, T016 parallel with each other) → T017/T018 → US3 → Polish.
- US2 depends on US1 (it validates the upgraded tree). US3 depends on US1 and US2 passing.
- If T014 fails because of `next` 16.3.8, try 16.4.2 as the fallback (research D1) and re-run T009–T014.

## Implementation Strategy

- MVP = US1 + US2 (patched and working). US3 is housekeeping after merge.
- If review prefers smaller PRs: split Next/sharp (T005) from the transitive resolutions (T006–T007).

## Summary

- Total tasks: 23
- Per phase: Setup 2, Foundational 2, US1 6, US2 8, US3 3, Polish 2
- Parallel: T015 and T016 only (dependency file edits conflict)
