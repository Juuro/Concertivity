# Concertivity

Track every concert you've been to. Next.js App Router frontend with Prisma/PostgreSQL and Better Auth techstack.

Repository: [github.com/Juuro/Concertivity](https://github.com/Juuro/Concertivity)

## Getting Started

### Prerequisites

- **Node.js 22** (see `.nvmrc`)
- **Yarn 4** (see `packageManager` in `package.json`; enable via [Corepack](https://nodejs.org/api/corepack.html) if needed)
- **PostgreSQL** — connection string for Prisma (`DATABASE_URL`)
- **Photon** reverse geocoding (no API key; please be fair with usage)
- **Last.fm API** keys (optional; band enrichment when `ENABLE_LASTFM` is on)

### Installation

1. Clone the repository.
2. Install dependencies:

```bash
yarn install
```

3. Copy the environment template and fill in values (see [Environment variables](#environment-variables)):

```bash
cp .env.example .env.local
```

4. Create the database schema (requires `DATABASE_URL`):

```bash
yarn db:migrate
```

5. Start the development server:

```bash
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

### Scripts

| Command                                                  | Description                                                                                              |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `yarn dev`                                               | Generate Prisma client and start the Next.js dev server                                                  |
| `yarn build`                                             | Generate Prisma client and production build                                                              |
| `yarn start`                                             | Start the production server                                                                              |
| `yarn lint`                                              | Run ESLint                                                                                               |
| `yarn format`                                            | Format with Prettier                                                                                     |
| `yarn test`                                              | Run Vitest once                                                                                          |
| `yarn test:watch`                                        | Vitest watch mode                                                                                        |
| `yarn test:coverage`                                     | Vitest with coverage                                                                                     |
| `yarn db:generate`                                       | `prisma generate`                                                                                        |
| `yarn db:migrate`                                        | `prisma migrate dev`                                                                                     |
| `yarn db:migrate:deploy`                                 | `prisma migrate deploy` (e.g. production)                                                                |
| `yarn db:push`                                           | `prisma db push` (prototype / non-migration workflows)                                                   |
| `yarn db:reset`                                          | `prisma migrate reset`                                                                                   |
| `yarn db:studio`                                         | Open Prisma Studio                                                                                       |
| `yarn commitlint --edit <file>`                          | Validate a commit message file (the Husky `commit-msg` hook passes `.git/COMMIT_EDITMSG`)                |
| `yarn tsx --env-file=.env scripts/prefetch-lastfm.ts`    | Optional: prefetch Last.fm JSON from band names in Postgres (requires `ENABLE_LASTFM`, `LASTFM_API_KEY`) |
| `yarn tsx --env-file=.env scripts/prefetch-geocoding.ts` | Optional: prefetch Photon geocoding cache from concert coordinates in Postgres                           |

## Environment variables

Authoritative template: [.env.example](.env.example). Highlights:

- **Database** — `DATABASE_URL` (use the pooled Prisma URL on Vercel when offered).
- **Auth** — `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`, and OAuth client IDs/secrets (e.g. GitHub; Google optional).
- **Integrations (optional)** — Last.fm, Ticketmaster, Resend (email), PostHog, Sentry, GitHub feedback escalation tokens, `CRON_SECRET` for secured cron routes.

Feature flags (`ENABLE_LASTFM`, `ENABLE_MAP_PAGE`, `ENABLE_STATISTICS_WIDGET`, etc.) are documented in `.env.example`.

### Getting a Last.fm API key

1. Visit [https://www.last.fm/api/account/create](https://www.last.fm/api/account/create)
2. Create an API account
3. Add the key (and optional secret) to `.env.local`

Without a Last.fm key, or with Last.fm disabled via feature flags, the app uses cached fallbacks and built-in defaults.

## API endpoints

| Method          | Path                                   | Description                                                          |
| --------------- | -------------------------------------- | -------------------------------------------------------------------- |
| `POST`          | `/api/feedback`                        | In-app feedback (validated, rate limited).                           |
| `GET`           | `/api/admin/feedback`                  | Admin queue (`queue=active` default or `all`, filters, pagination).  |
| `GET` / `PATCH` | `/api/admin/feedback/[id]`             | Admin detail and triage updates.                                     |
| `POST`          | `/api/admin/feedback/[id]/github`      | Create a linked GitHub issue.                                        |
| `POST`          | `/api/admin/feedback/[id]/github/sync` | Refresh linked issue state from GitHub.                              |
| `GET`           | `/api/cron/feedback-github-sync`       | Cron: batch-sync stale issues (`Authorization: Bearer CRON_SECRET`). |

Other routes under `app/api/` cover authentication, concerts, bands, venues, festivals, user profile, and admin tools.

## Releases

Version bumps, `CHANGELOG.md`, git tags, and GitHub Releases are automated with [Release Please](https://github.com/googleapis/release-please) (`.github/workflows/release-please.yml`) when changes on `main` follow [Conventional Commits](https://www.conventionalcommits.org/). Open and merge the release PR when you want to ship a new version.

Pull request titles are checked by `.github/workflows/conventional-commits.yml` (use titles like `feat: …` or `fix: …`, especially if you squash-merge).

## History

The project was migrated from Gatsby to Next.js (App Router). Older migration notes are not shipped in this repo; use git history if you need the full story.

## Tech stack

- **Next.js 16** — App Router
- **React 19**
- **Prisma** — PostgreSQL
- **Better Auth** — sessions and OAuth
- **MapLibre GL** — maps
- **SCSS modules** — styling
- **Last.fm** — artist metadata (optional, feature-flagged)
- **Photon** — reverse geocoding
- **Sentry** / **PostHog** — error monitoring and analytics (optional, env-gated)
