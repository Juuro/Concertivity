import { prisma } from "../prisma"
import { cityToSlug } from "@/utils/helpers"
import type { ConcertCounts, ConcertStatistics } from "./types"
import { getStartOfToday } from "./date"

/** Prisma `groupBy` with `_count: { _all: true }` returns counts on `_count._all`. */
function groupByAllCount(row: { _count: { _all: number } }): number {
  return row._count._all
}

// ============================================
// Concert Counts (lightweight)
// ============================================

export async function getConcertCounts(): Promise<ConcertCounts> {
  const now = getStartOfToday()
  const [past, future] = await Promise.all([
    prisma.concert.count({ where: { date: { lt: now } } }),
    prisma.concert.count({ where: { date: { gte: now } } }),
  ])
  return { past, future }
}

/**
 * Count user's concerts for a band (headliner or supporting act).
 * Includes both ConcertBand (headliner) and UserConcert.supportingActIds.
 */
export async function getUserBandConcertCounts(
  userId: string,
  bandId: string,
  now: Date
): Promise<ConcertCounts> {
  type Row = { past_count: bigint; future_count: bigint }
  const rows = await prisma.$queryRaw<Row[]>`
    WITH band_matches AS (
      SELECT uc.id, c."date"
      FROM user_concert uc
      JOIN concert c ON c.id = uc."concertId"
      WHERE uc."userId" = ${userId}
        AND (
          EXISTS (
            SELECT 1 FROM concert_band cb
            WHERE cb."concertId" = c.id AND cb."bandId" = ${bandId}
          )
          OR (
            uc."supportingActIds" IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM jsonb_array_elements(uc."supportingActIds") AS elem
              WHERE (elem->>'bandId') = ${bandId}
            )
          )
        )
    )
    SELECT
      COUNT(*) FILTER (WHERE "date" < ${now})::bigint AS past_count,
      COUNT(*) FILTER (WHERE "date" >= ${now})::bigint AS future_count
    FROM band_matches
  `
  const r = rows[0]
  return {
    past: r ? Number(r.past_count) : 0,
    future: r ? Number(r.future_count) : 0,
  }
}

// ============================================
// Statistics (server-side with caching)
// ============================================

async function computeConcertStatistics(): Promise<ConcertStatistics> {
  const now = getStartOfToday()

  const [yearStats, cityStats, bandStats, pastCount, futureCount] =
    await Promise.all([
      prisma.concert
        .groupBy({
          by: ["date"],
          where: { date: { lt: now } },
          _count: { _all: true },
        })
        .then((results) => {
          const yearMap = new Map<string, number>()
          for (const r of results) {
            const year = r.date.getFullYear().toString()
            yearMap.set(year, (yearMap.get(year) || 0) + groupByAllCount(r))
          }
          return Array.from(yearMap.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(
              ([year, count]) => [year, count, year] as [string, number, string]
            )
        }),

      prisma.concert
        .groupBy({
          by: ["normalizedCity"],
          where: { date: { lt: now }, normalizedCity: { not: null } },
          _count: { _all: true },
          orderBy: { _count: { normalizedCity: "desc" } },
          take: 5,
        })
        .then((results) =>
          results.map(
            (r) =>
              [
                r.normalizedCity!,
                groupByAllCount(r),
                cityToSlug(r.normalizedCity!),
              ] as [string, number, string]
          )
        ),

      prisma.concertBand
        .groupBy({
          by: ["bandId"],
          where: { concert: { date: { lt: now } } },
          _count: { _all: true },
          orderBy: { _count: { bandId: "desc" } },
          take: 5,
        })
        .then(async (results) => {
          const bandIds = results.map((r) => r.bandId)
          if (bandIds.length === 0) return [] as [string, number, string][]

          const bands = await prisma.band.findMany({
            where: { id: { in: bandIds } },
            select: { id: true, name: true, slug: true },
          })
          const bandById = new Map(bands.map((band) => [band.id, band]))

          return results
            .map((r) => {
              const band = bandById.get(r.bandId)
              return band
                ? ([band.name, groupByAllCount(r), band.slug] as [
                    string,
                    number,
                    string,
                  ])
                : null
            })
            .filter((b): b is [string, number, string] => b !== null)
        }),

      prisma.concert.count({ where: { date: { lt: now } } }),
      prisma.concert.count({ where: { date: { gte: now } } }),
    ])

  return {
    yearCounts: yearStats,
    cityCounts: cityStats,
    mostSeenBands: bandStats,
    maxYearCount: yearStats[0]?.[1] ?? 0,
    maxCityCount: cityStats[0]?.[1] ?? 0,
    maxBandCount: bandStats[0]?.[1] ?? 0,
    totalPast: pastCount,
    totalFuture: futureCount,
  }
}

export async function getConcertStatistics(): Promise<ConcertStatistics> {
  return computeConcertStatistics()
}

// ============================================
// Per-user statistics
// ============================================

async function computeUserConcertStatistics(
  userId: string
): Promise<ConcertStatistics> {
  const now = getStartOfToday()

  const userConcertIds = await prisma.userConcert.findMany({
    where: { userId },
    select: { concertId: true },
  })
  const concertIds = userConcertIds.map((uc) => uc.concertId)

  const [yearStats, cityStats, bandStats, pastCount, futureCount] =
    await Promise.all([
      prisma.concert
        .groupBy({
          by: ["date"],
          where: { id: { in: concertIds }, date: { lt: now } },
          _count: { _all: true },
        })
        .then((results) => {
          const yearMap = new Map<string, number>()
          for (const r of results) {
            const year = r.date.getFullYear().toString()
            yearMap.set(year, (yearMap.get(year) || 0) + groupByAllCount(r))
          }
          return Array.from(yearMap.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(
              ([year, count]) => [year, count, year] as [string, number, string]
            )
        }),

      prisma.concert
        .groupBy({
          by: ["normalizedCity"],
          where: {
            id: { in: concertIds },
            date: { lt: now },
            normalizedCity: { not: null },
          },
          _count: { _all: true },
          orderBy: { _count: { normalizedCity: "desc" } },
          take: 5,
        })
        .then((results) =>
          results.map(
            (r) =>
              [
                r.normalizedCity!,
                groupByAllCount(r),
                cityToSlug(r.normalizedCity!),
              ] as [string, number, string]
          )
        ),

      // Most seen bands (effective bands: core + supportingActIds)
      (async () => {
        type Row = { band_id: string; cnt: bigint }
        try {
          const rows = await prisma.$queryRaw<Row[]>`
            WITH user_concerts AS (
              SELECT uc."concertId", uc."supportingActIds", c."date"
              FROM user_concert uc
              JOIN concert c ON c.id = uc."concertId"
              WHERE uc."userId" = ${userId} AND c."date" < ${now}
            ),
            effective_bands AS (
              SELECT uc."concertId", cb."bandId" AS band_id
              FROM user_concerts uc
              JOIN concert_band cb ON cb."concertId" = uc."concertId"
              WHERE uc."supportingActIds" IS NULL
              UNION ALL
              SELECT uc."concertId", cb."bandId" AS band_id
              FROM user_concerts uc
              JOIN concert_band cb ON cb."concertId" = uc."concertId" AND cb."isHeadliner" = true
              WHERE uc."supportingActIds" IS NOT NULL
              UNION ALL
              SELECT uc."concertId", (elem->>'bandId')::text AS band_id
              FROM user_concerts uc, jsonb_array_elements(uc."supportingActIds") AS elem
              WHERE uc."supportingActIds" IS NOT NULL
            )
            SELECT band_id, COUNT(*)::bigint AS cnt
            FROM effective_bands
            WHERE band_id IS NOT NULL
            GROUP BY band_id
            ORDER BY cnt DESC
            LIMIT 10
          `

          const bandIds = rows.map((r) => r.band_id)
          if (bandIds.length === 0) return [] as [string, number, string][]

          const bands = await prisma.band.findMany({
            where: { id: { in: bandIds } },
            select: { id: true, name: true, slug: true },
          })

          return rows
            .map((r) => {
              const band = bands.find((b) => b.id === r.band_id)
              const count = Number(r.cnt)
              return band && count > 0
                ? ([band.name, count, band.slug] as [string, number, string])
                : null
            })
            .filter((x): x is [string, number, string] => x != null)
            .slice(0, 5)
        } catch {
          // Fallback when supportingActIds column does not exist (migration not run)
          const results = await prisma.concertBand.groupBy({
            by: ["bandId"],
            where: { concertId: { in: concertIds } },
            _count: { _all: true },
            orderBy: { _count: { bandId: "desc" } },
            take: 10,
          })

          const bandIds = results.map((r) => r.bandId)
          if (bandIds.length === 0) return [] as [string, number, string][]

          const bands = await prisma.band.findMany({
            where: { id: { in: bandIds } },
            select: { id: true, name: true, slug: true },
          })

          const bandCounts = await Promise.all(
            bandIds.map(async (bandId) => {
              const count = await prisma.concertBand.count({
                where: {
                  bandId,
                  concertId: { in: concertIds },
                  concert: { date: { lt: now } },
                } as any,
              })
              const band = bands.find((b) => b.id === bandId)
              return band ? { ...band, count } : null
            })
          )

          return bandCounts
            .filter(
              (b): b is NonNullable<typeof b> => b !== null && b.count > 0
            )
            .sort((a, b) => b.count - a.count)
            .slice(0, 5)
            .map((b) => [b.name, b.count, b.slug] as [string, number, string])
        }
      })(),

      prisma.userConcert.count({
        where: { userId, concert: { date: { lt: now } } },
      }),
      prisma.userConcert.count({
        where: { userId, concert: { date: { gte: now } } },
      }),
    ])

  return {
    yearCounts: yearStats,
    cityCounts: cityStats,
    mostSeenBands: bandStats,
    maxYearCount: yearStats[0]?.[1] ?? 0,
    maxCityCount: cityStats[0]?.[1] ?? 0,
    maxBandCount: bandStats[0]?.[1] ?? 0,
    totalPast: pastCount,
    totalFuture: futureCount,
  }
}

export async function getUserConcertStatistics(
  userId: string
): Promise<ConcertStatistics> {
  return computeUserConcertStatistics(userId)
}

export async function getUserConcertCounts(
  userId: string
): Promise<ConcertCounts> {
  const now = getStartOfToday()
  const [past, future] = await Promise.all([
    prisma.userConcert.count({
      where: { userId, concert: { date: { lt: now } } },
    }),
    prisma.userConcert.count({
      where: { userId, concert: { date: { gte: now } } },
    }),
  ])
  return { past, future }
}

/** Efficient aggregate: unique cities + unique years for the homepage dashboard. */
export async function getUserDashboardCounts(userId: string): Promise<{
  uniqueCities: number
  uniqueYears: number
}> {
  type Row = { unique_cities: bigint; unique_years: bigint }
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT
      COUNT(DISTINCT c."normalizedCity") FILTER (WHERE c."normalizedCity" IS NOT NULL)::bigint AS unique_cities,
      COUNT(DISTINCT EXTRACT(YEAR FROM c.date))::bigint AS unique_years
    FROM concert c
    WHERE EXISTS (
      SELECT 1 FROM user_concert uc WHERE uc."concertId" = c.id AND uc."userId" = ${userId}
    )
  `
  return {
    uniqueCities: Number(rows[0]?.unique_cities ?? 0),
    uniqueYears: Number(rows[0]?.unique_years ?? 0),
  }
}

/**
 * Counts distinct bands (headliners + supporting acts) for a user's concerts.
 * Includes all user concerts (past and future).
 */
export async function getUserUniqueBandCount(userId: string): Promise<number> {
  type Row = { cnt: bigint }
  try {
    const rows = await prisma.$queryRaw<Row[]>`
      WITH user_concerts AS (
        SELECT uc."concertId", uc."supportingActIds"
        FROM user_concert uc
        WHERE uc."userId" = ${userId}
      ),
      effective_bands AS (
        SELECT cb."bandId" AS band_id
        FROM user_concerts uc
        JOIN concert_band cb ON cb."concertId" = uc."concertId"
        WHERE uc."supportingActIds" IS NULL
        UNION
        SELECT cb."bandId" AS band_id
        FROM user_concerts uc
        JOIN concert_band cb ON cb."concertId" = uc."concertId" AND cb."isHeadliner" = true
        WHERE uc."supportingActIds" IS NOT NULL
        UNION
        SELECT (elem->>'bandId')::text AS band_id
        FROM user_concerts uc, jsonb_array_elements(uc."supportingActIds") AS elem
        WHERE uc."supportingActIds" IS NOT NULL
      )
      SELECT COUNT(*)::bigint AS cnt
      FROM (SELECT DISTINCT band_id FROM effective_bands WHERE band_id IS NOT NULL) AS unique_bands
    `
    return Number(rows[0]?.cnt ?? 0)
  } catch {
    const results = await prisma.concertBand.groupBy({
      by: ["bandId"],
      where: { concert: { attendees: { some: { userId } } } },
    })
    return results.length
  }
}

export type GlobalAppStats = {
  concertCount: number
  bandCount: number
  userCount: number
}

/**
 * Public landing-page counts. Returns null when the database is unavailable so
 * anonymous home renders without a 500.
 */
export async function getGlobalAppStats(): Promise<GlobalAppStats | null> {
  try {
    const now = getStartOfToday()
    const [concertCount, bandCount, userCount] = await Promise.all([
      prisma.concert.count({ where: { date: { lt: now } } }),
      prisma.band.count(),
      prisma.user.count({ where: { isPublic: true } }),
    ])
    return { concertCount, bandCount, userCount }
  } catch {
    return null
  }
}
