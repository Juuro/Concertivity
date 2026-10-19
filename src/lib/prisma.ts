import { PrismaClient } from "@/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * Read server env at request time. Reading via a dynamic key avoids any
 * build-time inlining of `process.env.X` to a stale/undefined value.
 */
function readRuntimeEnv(key: string): string | undefined {
  const value = process.env[key]
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function isAccelerateUrl(url: string): boolean {
  return url.startsWith("prisma+postgres://") || url.startsWith("prisma://")
}

function isDirectPostgresUrl(url: string): boolean {
  return url.startsWith("postgresql://") || url.startsWith("postgres://")
}

/**
 * Prisma Postgres / Accelerate runtime URL (`prisma+postgres://`). Returns
 * undefined when not configured (e.g. local dev against a direct database).
 *
 * On Vercel's serverless fan-out, runtime queries MUST go through Accelerate,
 * which pools connections at the edge. The direct `postgres://…@db.prisma.io`
 * connection authenticates as the low-limit `prisma_migration` role and is
 * exhausted instantly — it is only for migrations, never serverless runtime.
 */
export function resolveAccelerateUrl(): string | undefined {
  const candidates = [
    readRuntimeEnv("PRISMA_DATABASE_URL"),
    readRuntimeEnv("DATABASE_URL"),
  ]
  return candidates.find(
    (v): v is string => v !== undefined && isAccelerateUrl(v)
  )
}

/**
 * Direct `postgres://` connection — used for local development (and by the
 * Prisma CLI for migrations). Not suitable for serverless runtime against
 * Prisma Postgres; prefer Accelerate there.
 */
export function resolveDirectDatabaseUrl(): string | undefined {
  const candidates = [
    readRuntimeEnv("DATABASE_URL"),
    readRuntimeEnv("POSTGRES_PRISMA_URL"),
    readRuntimeEnv("POSTGRES_URL"),
    readRuntimeEnv("POSTGRES_URL_NON_POOLING"),
  ]
  return candidates.find(
    (v): v is string => v !== undefined && isDirectPostgresUrl(v)
  )
}

function createPrismaClient(): PrismaClient {
  const isDevelopment =
    readRuntimeEnv(["NODE", "_ENV"].join("")) === "development"
  const log: ("query" | "error" | "warn")[] = isDevelopment
    ? ["query", "error", "warn"]
    : ["error"]

  // Prefer Accelerate (`prisma+postgres://`) — the correct serverless runtime
  // path. `accelerateUrl` routes the client through Accelerate's edge pooler.
  const accelerateUrl = resolveAccelerateUrl()
  if (accelerateUrl) {
    return new PrismaClient({ accelerateUrl, log })
  }

  // Fallback: direct `postgres://` via the pg driver adapter (local dev).
  // Pass the CONFIG (not a `pg.Pool` instance) — handing PrismaPg a Pool can
  // fail its internal `instanceof pg.Pool` check under the externalized build,
  // making it drop the connection string and fall back to 127.0.0.1.
  const connectionString = resolveDirectDatabaseUrl()
  if (!connectionString) {
    throw new Error(
      "Missing database URL. Set PRISMA_DATABASE_URL (prisma+postgres://) for " +
        "Accelerate, or DATABASE_URL (postgres://) for a direct connection."
    )
  }
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log,
  })
}

function getPrismaClient(): PrismaClient {
  if (globalForPrisma.prisma) {
    return globalForPrisma.prisma
  }

  globalForPrisma.prisma = createPrismaClient()
  return globalForPrisma.prisma
}

/**
 * Lazy Prisma singleton. Defers client creation until the first query so the
 * connection URL is read from the runtime environment, not at build time.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrismaClient()
    const value = Reflect.get(client, prop) as unknown

    if (typeof value === "function") {
      return (value as (...args: unknown[]) => unknown).bind(client)
    }

    return value
  },
})
