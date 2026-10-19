/**
 * Migration script: Move support acts from ConcertBand to UserConcert.supportingActIds
 *
 * This script implements the architectural change where:
 * - ConcertBand stores ONLY headliners (shared across all attendees)
 * - UserConcert.supportingActIds stores support acts (per-user)
 *
 * Migration steps:
 * 1. For each UserConcert where supportingActIds is null:
 *    - Copy non-headliner bands from ConcertBand to supportingActIds
 * 2. Remove non-headliner entries from ConcertBand table
 *
 * Usage (requires DIRECT postgres URL, not Prisma Accelerate):
 *   DATABASE_URL="postgres://..." npx tsx scripts/migrate-supporting-acts.ts
 *
 * For Vercel Postgres, use POSTGRES_URL_NON_POOLING from your dashboard.
 */

import { PrismaClient, Prisma } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const connectionString = process.env["DATABASE_URL"]

if (!connectionString) {
  console.error("Error: DATABASE_URL environment variable not set")
  console.error(
    'Usage: DATABASE_URL="postgres://..." npx tsx scripts/migrate-supporting-acts.ts'
  )
  process.exit(1)
}

if (connectionString.startsWith("prisma://")) {
  console.error(
    "Error: Prisma Accelerate URLs (prisma://...) are not supported."
  )
  console.error(
    "Please use a direct PostgreSQL connection string (postgres://...)"
  )
  console.error(
    "\nFor Vercel Postgres, use POSTGRES_URL_NON_POOLING from your dashboard."
  )
  process.exit(1)
}

// Warn about Prisma Postgres connections which have aggressive timeouts
let connectionHost = ""
try {
  connectionHost = new URL(connectionString).hostname
} catch {
  // Unparseable URL: let the database driver report the real error.
}

if (connectionHost === "db.prisma.io") {
  console.warn(
    "Warning: Prisma Postgres (db.prisma.io) connections have short timeouts."
  )
  console.warn(
    "If you experience connection errors, try using POSTGRES_URL_NON_POOLING instead.\n"
  )
}

// Configure pool with shorter idle timeout and keepalive to handle managed DB connections
const pool = new Pool({
  connectionString,
  idleTimeoutMillis: 5000, // Close idle connections quickly
  connectionTimeoutMillis: 10000,
  max: 3, // Fewer connections to avoid pool exhaustion
})
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

// Retry helper for transient connection failures
async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 1000
): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (error: any) {
      const isConnectionError =
        error?.code === "P1017" || error?.message?.includes("ConnectionClosed")
      if (isConnectionError && attempt < retries) {
        console.warn(`Connection error, retrying (${attempt}/${retries})...`)
        await new Promise((r) => setTimeout(r, delay))
        continue
      }
      throw error
    }
  }
  throw new Error("Unreachable")
}

interface SupportingActItem {
  bandId: string
  sortOrder: number
}

async function migrateSupportingActsToUserConcert() {
  console.log(
    "Step 1: Migrating support acts from ConcertBand to UserConcert.supportingActIds...\n"
  )

  // Find all UserConcert records where supportingActIds is null
  // For JSON fields in Prisma, use Prisma.DbNull to check for database NULL
  const userConcertsToMigrate = await withRetry(() =>
    prisma.userConcert.findMany({
      where: { supportingActIds: { equals: Prisma.DbNull } },
      select: { id: true, concertId: true },
    })
  )

  console.log(
    `Found ${userConcertsToMigrate.length} UserConcert records to migrate`
  )

  if (userConcertsToMigrate.length === 0) {
    console.log("No UserConcert records need migration\n")
    return
  }

  // Group by concertId to batch fetch ConcertBand data
  const concertIds = [
    ...new Set(userConcertsToMigrate.map((uc) => uc.concertId)),
  ]
  console.log(`Fetching band data for ${concertIds.length} unique concerts...`)

  // Fetch all ConcertBand entries for these concerts
  const concertBands = await withRetry(() =>
    prisma.concertBand.findMany({
      where: { concertId: { in: concertIds } },
      orderBy: { sortOrder: "asc" },
    })
  )

  // Group by concertId
  const bandsByConcert = new Map<string, typeof concertBands>()
  for (const cb of concertBands) {
    if (!bandsByConcert.has(cb.concertId)) {
      bandsByConcert.set(cb.concertId, [])
    }
    bandsByConcert.get(cb.concertId)!.push(cb)
  }

  // Update each UserConcert with its supportingActIds
  let migrated = 0
  const batchSize = 100

  for (let i = 0; i < userConcertsToMigrate.length; i += batchSize) {
    const batch = userConcertsToMigrate.slice(i, i + batchSize)

    await withRetry(() =>
      Promise.all(
        batch.map(async (uc) => {
          const bands = bandsByConcert.get(uc.concertId) || []
          // Get non-headliner bands as support acts
          const supportingActs: SupportingActItem[] = bands
            .filter((b) => !b.isHeadliner)
            .map((b, index) => ({ bandId: b.bandId, sortOrder: index }))

          await prisma.userConcert.update({
            where: { id: uc.id },
            data: {
              supportingActIds:
                supportingActs as unknown as Prisma.InputJsonValue,
            },
          })
        })
      )
    )

    migrated += batch.length
    console.log(
      `Migrated ${migrated}/${userConcertsToMigrate.length} UserConcert records`
    )
  }

  console.log(`\nMigrated support acts to ${migrated} UserConcert records\n`)
}

async function removeNonHeadlinersFromConcertBand() {
  console.log("Step 2: Removing non-headliner entries from ConcertBand...\n")

  // Count how many will be removed
  const countToRemove = await withRetry(() =>
    prisma.concertBand.count({
      where: { isHeadliner: false },
    })
  )

  console.log(
    `Found ${countToRemove} non-headliner ConcertBand entries to remove`
  )

  if (countToRemove === 0) {
    console.log("No non-headliner entries to remove\n")
    return
  }

  // Remove all non-headliner entries
  const result = await withRetry(() =>
    prisma.concertBand.deleteMany({
      where: { isHeadliner: false },
    })
  )

  console.log(`Removed ${result.count} non-headliner ConcertBand entries\n`)
}

async function printStats() {
  try {
    // Use a single query batch to minimize connection usage
    const [
      concertCount,
      userConcertCount,
      concertBandCount,
      headlinerCount,
      userConcertsWithSupportingActs,
    ] = await withRetry(() =>
      Promise.all([
        prisma.concert.count(),
        prisma.userConcert.count(),
        prisma.concertBand.count(),
        prisma.concertBand.count({ where: { isHeadliner: true } }),
        prisma.userConcert.count({
          where: { supportingActIds: { not: Prisma.DbNull } },
        }),
      ])
    )

    console.log("=== Migration Statistics ===")
    console.log(`Total concerts: ${concertCount}`)
    console.log(`Total UserConcert records: ${userConcertCount}`)
    console.log(`  - With supportingActIds: ${userConcertsWithSupportingActs}`)
    console.log(
      `  - Without supportingActIds: ${userConcertCount - userConcertsWithSupportingActs}`
    )
    console.log(`Total ConcertBand entries: ${concertBandCount}`)
    console.log(`  - Headliners: ${headlinerCount}`)
    console.log(`  - Non-headliners: ${concertBandCount - headlinerCount}`)
    console.log("============================\n")
  } catch (error) {
    console.warn(
      "Could not fetch statistics (connection issue):",
      (error as Error).message
    )
  }
}

async function main() {
  console.log("===========================================")
  console.log("Support Acts Migration (ConcertBand -> UserConcert)")
  console.log("===========================================\n")

  try {
    console.log("=== Before Migration ===")
    await printStats()

    await migrateSupportingActsToUserConcert()
    await removeNonHeadlinersFromConcertBand()

    console.log("=== After Migration ===")
    await printStats()

    console.log("Migration completed successfully!")
  } catch (error) {
    console.error("Migration failed:", error)
    throw error
  } finally {
    await prisma.$disconnect()
    await pool.end()
  }
}

main()
