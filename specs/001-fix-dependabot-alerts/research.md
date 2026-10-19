# Research: Resolve Dependabot Alerts

Snapshot 2026-10-19. Sources: GitHub Dependabot alerts API, `yarn npm audit --all --recursive`, `yarn why`, `yarn npm info`.

## Alert inventory (12 open)

| # | Severity | Package | Installed | Fix | Path |
|---|----------|---------|-----------|-----|------|
| 396 | critical | next (RCE in next/og ImageResponse) | 16.3.3 | 16.3.6 | direct |
| 402 | high | next (SSRF image optimization) | 16.3.3 | 16.3.8 | direct |
| 401, 403, 405 | medium | next (Draft Mode leak, SSG/ISR cache poisoning, metadata image info disclosure) | 16.3.3 | 16.3.8 | direct |
| 404 | low | next (dev-server MCP endpoint info disclosure) | 16.3.3 | 16.3.8 | direct |
| 406 | high | source-map-js | 1.2.1 | 1.2.2 | via sass, postcss, css-tree, magicast |
| 398 | high | brace-expansion 5.x | 5.0.9 | 5.0.10 (audit wants 5.0.12) | via minimatch 10 |
| 407 | medium | brace-expansion 1.x | 1.1.18 | 1.1.21 | via minimatch 3 |
| 399 | medium | ip-address | 10.7.0 | 10.7.1 (latest 10.7.4) | via socks |
| 397 | low | dompurify | 3.4.15 | 3.4.16 (latest 3.4.17) | via posthog-js |
| 400 | high | http-cache-semantics | 4.2.0 | none listed | via make-fetch-happen ← node-gyp ← fsevents / @parcel/watcher |

## Extra findings from audit (not Dependabot alerts)

| Package | Severity | Installed | Fix | Path |
|---------|----------|-----------|-----|------|
| sharp | high | 0.35.4 | 0.35.5 | direct (and next) |
| braces | high | 3.0.3 | newer 3.x | via micromatch |
| fflate | moderate | 0.8.2 and 0.4.9 | ≥0.8.3 | via @vitest/ui, posthog-js |
| fast-uri | moderate | 3.1.7 | ≥3.1.8 | via ajv; existing resolution `^3.1.6` too loose |
| eslint | moderate (EOL notice) | 9.39.4 | v10 | direct dev dep |
| git-raw-commits | moderate (deprecated) | 5.0.1 | replacement package | via commitlint |

## Decisions

### D1. Next.js target version
- **Decision**: Bump to `^16.3.8` (stay on the 16.3 line). Latest is 16.4.2, but 16.3.8 fixes every listed advisory and is a patch-level move from 16.3.3.
- **Rationale**: Smallest blast radius for a security fix. Dependabot PR #348 proposes exactly 16.3.8. Minor jump to 16.4 can be a separate decision.
- **Alternatives**: 16.4.2 (more churn, no extra advisory fixed that we know of). Revisit if 16.3.8 breaks the build.
- **Checks**: read `node_modules/next/dist/docs/` after install; exercise `app/icon.tsx`, `app/apple-icon.tsx`, image optimization remote patterns in `next.config.mjs`, Draft Mode / `use cache` (not used; grep shows no use) and ISR/SSG pages.

### D2. sharp
- **Decision**: Bump direct dep to `^0.35.5`. Audit flags a high advisory in bundled librsvg that Dependabot did not alert on. Next also depends on sharp; ensure a single copy.

### D3. Transitive packages: use `resolutions`
- **Decision**: Raise existing entries in `package.json` `resolutions` to patched ranges: `brace-expansion@npm:^1.1.7` → `^1.1.21`, `brace-expansion@npm:^5.0.2` → `^5.0.12`, `ip-address` → `^10.7.4`, `fast-uri` → `^3.1.8`. Add new entries for `source-map-js` (`^1.2.2`), `dompurify` (`^3.4.17`), `braces` (`^3.0.4`-or-newer patched 3.x, confirm exact version from audit), `fflate` (`^0.8.3`, plus the 0.4.x copy under posthog-js; may need a descriptor-scoped entry or a posthog-js bump), `http-cache-semantics` (`^4.3.0`).
- **Rationale**: Repo already uses this pattern; parents (sass, posthog-js, minimatch) have not adopted patched ranges.
- **Alternatives**: wait for parents to bump (leaves alerts open); `yarn up -R` only (lockfile-only, does not stick if range excludes patch). Prefer `yarn up -R <pkg>` first, add a resolution only where the parent range blocks it.

### D4. http-cache-semantics (alert 400, "no patched version")
- **Finding**: Advisory range is `<= 4.2.0`. Registry has 4.3.0 (published 2026-10-04), which lies outside the range, so the alert should close after upgrading even though GitHub lists no "first patched version". Verify behavior of 4.3.0 against the advisory references (max-stale handling) before relying on it.
- **Reachability**: only reachable through `node-gyp` → `make-fetch-happen`, used for optional native build tooling (`fsevents`, `@parcel/watcher`) at install time, never at app runtime or in request handling. Risk is low even if unpatched.
- **Decision**: Resolution `http-cache-semantics@^4.3.0`; if `make-fetch-happen` breaks at install, fall back to documented accepted risk (FR-006) with revisit trigger "new node-gyp or make-fetch-happen release".

### D5. Audit-only EOL/deprecation notices (eslint 9, git-raw-commits)
- **Decision**: Out of scope. These are "no longer supported/deprecated" notices, not exploitable vulnerabilities. ESLint 10 and a commitlint swap are separate migrations. Record in follow-up notes. Reconsider if the user wants a zero-audit-entry bar; the spec threshold is "known vulnerabilities", so this is within the spec.

### D6. Dependabot PRs
- **Decision**: Single PR containing all bumps. After merge, close #315, #317, #321, #323, #325, #326, #341, #346, #347, #348, #349 as superseded (or let Dependabot auto-close when versions match). Non-security ones (`@babel/core`, `immutable`, `tar`, `better-auth` 1.6.22 [already pinned], `undici`, `baseline-browser-mapping`) get bumped to the PR's target, but `better-auth` is already at 1.6.22 in `package.json`.
- **Rationale**: Spec FR-007. Note #323 likely already satisfied.

### D7. Verification
- Typecheck (`yarn tsc --noEmit`), `yarn lint`, `yarn test`, `yarn build`, `yarn npm audit --all --recursive`, and browser smoke test via `screenshot.mjs` / dev login for protected pages. Confirm CSP nonce behaviour in console on a rendered page.

## Open items for implement phase
- Confirm `braces` and `fflate` exact patched versions from audit output.
- Confirm no duplicate `sharp` copy remains.
- Confirm 4.3.0 of `http-cache-semantics` clears the alert in GitHub after merge (alert closes on push to default branch).

## Implementation results (2026-10-19)

Resolved: next 16.3.8 (pinned `~16.3.8`; `^` floated to 16.4.2), sharp 0.35.5, brace-expansion 1.1.21 / 5.0.12, ip-address 10.7.4, dompurify 3.4.17, source-map-js 1.2.2, fast-uri 3.1.8, fflate 0.8.3 (0.4.9 under posthog-js is outside the advisory range). tsc, lint (0 errors; 5 pre-existing warnings in `coverage/`), vitest (504 passed) and `yarn build` all pass. No source files changed.

### Accepted risks / follow-ups (FR-006)

| Advisory | Package | Why unfixed | Reachability | Revisit when |
|----------|---------|-------------|--------------|--------------|
| GHSA-ch52-4w7c-c8xp (alert 400) | http-cache-semantics 4.3.0 | 4.3.0 sits outside the advisory range `<= 4.2.0`, but a diff of 4.2.0 vs 4.3.0 shows the `max-stale` logic is unchanged (only the Vary handling and `status()` changed). Upstream has not fixed the cross-user disclosure. | Install-time only: node-gyp → make-fetch-happen (fsevents, @parcel/watcher). No HTTP caching in app request handling. | upstream publishes a real fix |
| braces `<=3.0.3` (audit only) | braces 3.0.3 | Latest published is 3.0.3; no patch exists | Dev-only: eslint-config-next → fast-glob → micromatch. Not in the runtime bundle. | braces > 3.0.3 released |
| eslint 9 EOL, git-raw-commits deprecated (audit only) | eslint, git-raw-commits | Support/deprecation notices, not vulnerabilities (D5) | Dev-only | separate migrations |
