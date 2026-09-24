# CLAUDE.md

High-signal instructions for coding agents. Keep this file concise and non-obvious.

## Hard Rules

- Use **Yarn 4 only** (`yarn`, `yarn dlx`, `yarn npm audit`); do not use `npm`, `pnpm`, or `npx` in normal workflows.
- Use TypeScript with strict typing; prefer server components and explicit `'use client'` boundaries.
- Styling must use SCSS modules/global SCSS patterns already in the repo; no Tailwind, CSS-in-JS, inline styles, or `!important`.
- Use `next/image` instead of raw `<img>` where applicable.
- Keep imports absolute via `@/*`.

## Security / Privacy Guardrails (Non-Negotiable)

- Any mutating API route must verify session via `auth.api.getSession()`.
- Update/delete operations on user data must verify ownership (`userId`-scoped access).
- Validate all external input (Zod preferred). Never trust client payloads.
- Never expose sensitive server data in client responses.
- Public profile data is opt-in only (`isPublic`); non-public users must not be exposed.
- If a change introduces tracking/marketing cookies or non-essential client-side identifiers, flag that a GDPR/DSGVO cookie banner/consent flow may be required.

## CSP Gotcha

- CSP is defined in `proxy.ts`.
- Scripts use per-request nonces with strict-dynamic.
- Styles intentionally use `'unsafe-inline'` **without** nonce due to Next.js/Turbopack style tag behavior.
- When adding a new client-facing third-party service (scripts, widgets, browser-side API calls, remote images/fonts), update the relevant CSP directives.
- Server-only integrations do not need CSP allowlist entries.

## Multi-Tenancy & Data Model Gotchas

- Concerts are shared entities; user attendance is modeled via `UserConcert`.
- `Concert.userId`/`Concert.cost` are legacy/deprecated; avoid building new logic on deprecated ownership assumptions.
- Band model is split:
  - Headliner: shared (`ConcertBand`).
  - Support acts: per-user (`UserConcert.supportingActIds`).
- Preserve this split when editing concert/band flows.

## Auth & Access Conventions

- Protected routes should remain dynamically rendered (`force-dynamic`) when they depend on session/user-specific state.
- Admin routes/actions require `session.user.role === "admin"`.
- Public profile pages must return not found for users without public visibility.

## UI/UX & A11y Conventions

- Use semantic HTML and visible focus states.
- Decorative icons should be hidden from assistive tech (`aria-hidden="true"`).
- Interactive controls need accessible names (`aria-label`/`aria-labelledby` when needed).
- Dialogs should use native `<dialog>` patterns used in this codebase (including keyboard behavior).
- For keyboard-driven inputs (autocomplete/dropdowns), preserve Arrow/Enter/Escape interactions.

## Caching / Revalidation Gotcha

- Statistics views rely on cached data; concert create/update/delete flows must trigger the existing tag revalidation path (`concert-statistics`) to avoid stale UI.

## Feature Flags

- Respect and preserve environment feature flags:
  - `ENABLE_LASTFM`
  - `ENABLE_GEOCODING`
  - `ENABLE_MUSICBRAINZ`
  - `ENABLE_EXTERNAL_BAND_SUGGEST`
  - `ENABLE_MAP_PAGE`
  - `ENABLE_CONCERT_AI_SEARCH` (AI "help me remember" backfill: Groq parse + Setlist.fm search; gates the inline panel on `/concerts/new` and the `/api/concerts/ai-search` + `/api/concerts/from-setlist` routes. Off by default. Sends user prose to Groq (US) — privacy-policy/sub-processor update required before production use.)
- Do not bypass flags in UI or API logic.

## Animations

- Reuse animation tokens from `src/styles/variables.scss`; do not hardcode durations/easings.
- Keep motion subtle and functional.
- Ensure `prefers-reduced-motion` behavior remains respected.

## Screenshots / Visual Validation Workflow

- Before `yarn dev`, check if a dev server is already running; do not start duplicates.
- Use `node screenshot.mjs http://localhost:3000 ...` from project root.
- Protected-route screenshots require local dev auth (`DEV_USER_EMAIL`, `/api/dev/login` flow).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
