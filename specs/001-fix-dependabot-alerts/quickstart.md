# Quickstart: Validate Dependabot Fix

Prerequisites: Yarn 4, Node 22+, `.env` with `DEV_USER_EMAIL`, local database running.

## 1. Install and audit

```bash
yarn install
yarn npm audit --all --recursive
```
Expect: no entries at moderate or above except documented exceptions (eslint EOL, git-raw-commits deprecated per research D5).

```bash
yarn why next sharp http-cache-semantics source-map-js ip-address dompurify brace-expansion braces fflate fast-uri
```
Expect: only patched versions (see research.md table); single `sharp` copy.

## 2. Static checks and tests

```bash
yarn tsc --noEmit
yarn lint
yarn test
yarn build
```
Expect: all pass.

## 3. Runtime smoke test

Check no dev server is running first, then `yarn dev` and, using `node screenshot.mjs http://localhost:3000 ...` with the dev login flow, verify:
- Sign in / out, protected route redirect.
- Create, edit, delete a concert; statistics page updates (revalidation tag `concert-statistics`).
- Public profile (public and non-public user), map page.
- `/icon` and `/apple-icon` render (next/og).
- A remote image (band/venue) renders via `next/image`.
- Browser console: no CSP violations, nonce present on scripts.

## 4. GitHub

After merge to `main`: Dependabot alert list shows 0 open (or only the documented http-cache-semantics exception); close superseded Dependabot PRs.
