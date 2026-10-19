/**
 * Statistics & Aggregation unit tests extracted from `src/lib/concerts.test.ts`.
 *
 * Test data uses anonymized PII following GDPR compliance.
 */

import { describe, test, expect, beforeEach, vi } from "vitest"
import { prisma } from "@/lib/prisma"
import {
  getConcertStatistics,
  getUserConcertStatistics,
  getConcertCounts,
  getUserConcertCounts,
  getUserBandConcertCounts,
} from "@/lib/concerts/stats"
import {
  getUserTotalSpent,
  getUserTotalSpentCached,
} from "@/lib/concerts/spending"
import { mockConcertCountPastFuture } from "./testUtils"

// Mock external utilities
vi.mock("@/utils/data", () => ({
  getGeocodingData: vi.fn().mockResolvedValue({
    _normalized_city: "Test City",
    _is_coordinates: false,
  }),
}))

describe("Statistics & Aggregation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("getConcertStatistics", () => {
    test("test_getConcertStatistics_returns_top_years", async () => {
      const mockNow = new Date("2024-03-31T00:00:00.000Z")
      vi.useFakeTimers()
      vi.setSystemTime(mockNow)

      // Mock groupBy for year counts
      vi.mocked(prisma.concert.groupBy as any).mockImplementation(
        (args: any) => {
          if (args.by.includes("date")) {
            return Promise.resolve([
              { date: new Date("2023-06-15"), _count: { _all: 5 } },
              { date: new Date("2023-08-20"), _count: { _all: 3 } },
              { date: new Date("2022-07-10"), _count: { _all: 7 } },
              { date: new Date("2022-09-15"), _count: { _all: 2 } },
              { date: new Date("2021-05-01"), _count: { _all: 4 } },
            ])
          }
          return Promise.resolve([])
        }
      )

      // Mock other groupBy calls (cities, bands)
      vi.mocked(prisma.concert.count).mockResolvedValue(21)
      vi.mocked(prisma.concertBand.groupBy).mockResolvedValue([])
      vi.mocked(prisma.band.findMany).mockResolvedValue([])
      vi.mocked(prisma.concertBand.count).mockResolvedValue(0)

      const stats = await getConcertStatistics()

      expect(stats.yearCounts).toHaveLength(3)
      expect(stats.yearCounts[0]).toEqual(["2022", 9, "2022"]) // 7 + 2
      expect(stats.yearCounts[1]).toEqual(["2023", 8, "2023"]) // 5 + 3
      expect(stats.yearCounts[2]).toEqual(["2021", 4, "2021"])
      expect(stats.maxYearCount).toBe(9)

      vi.useRealTimers()
    })

    test("test_getConcertStatistics_returns_top_cities", async () => {
      const mockNow = new Date("2024-03-31T00:00:00.000Z")
      vi.useFakeTimers()
      vi.setSystemTime(mockNow)

      // Mock groupBy for city counts
      vi.mocked(prisma.concert.groupBy as any).mockImplementation(
        (args: any) => {
          if (args.by.includes("normalizedCity")) {
            return Promise.resolve([
              { normalizedCity: "Berlin", _count: { _all: 12 } },
              { normalizedCity: "New York", _count: { _all: 8 } },
              { normalizedCity: "London", _count: { _all: 5 } },
            ])
          }
          if (args.by.includes("date")) {
            return Promise.resolve([])
          }
          return Promise.resolve([])
        }
      )

      vi.mocked(prisma.concert.count).mockResolvedValue(25)
      vi.mocked(prisma.concertBand.groupBy).mockResolvedValue([])
      vi.mocked(prisma.band.findMany).mockResolvedValue([])
      vi.mocked(prisma.concertBand.count).mockResolvedValue(0)

      const stats = await getConcertStatistics()

      expect(stats.cityCounts).toHaveLength(3)
      expect(stats.cityCounts[0][0]).toBe("Berlin")
      expect(stats.cityCounts[0][1]).toBe(12)
      expect(stats.cityCounts[1][0]).toBe("New York")
      expect(stats.cityCounts[1][1]).toBe(8)
      expect(stats.maxCityCount).toBe(12)

      vi.useRealTimers()
    })

    test("test_getConcertStatistics_returns_top_bands", async () => {
      const mockNow = new Date("2024-03-31T00:00:00.000Z")
      vi.useFakeTimers()
      vi.setSystemTime(mockNow)

      const mockBandIds = ["band-1", "band-2", "band-3"]

      // Mock groupBy for bands
      vi.mocked(prisma.concertBand.groupBy).mockResolvedValue([
        { bandId: "band-1", _count: { _all: 15 } },
        { bandId: "band-2", _count: { _all: 10 } },
        { bandId: "band-3", _count: { _all: 7 } },
      ] as any)

      vi.mocked(prisma.band.findMany).mockResolvedValue([
        { id: "band-1", name: "Radiohead", slug: "radiohead" },
        { id: "band-2", name: "The National", slug: "the-national" },
        { id: "band-3", name: "Arcade Fire", slug: "arcade-fire" },
      ] as any)

      vi.mocked(prisma.concertBand.count as any).mockImplementation(
        (args: any) => {
          if (args.where.bandId === "band-1") return Promise.resolve(15)
          if (args.where.bandId === "band-2") return Promise.resolve(10)
          if (args.where.bandId === "band-3") return Promise.resolve(7)
          return Promise.resolve(0)
        }
      )

      // Mock other groupBy calls
      vi.mocked(prisma.concert.groupBy).mockResolvedValue([])
      vi.mocked(prisma.concert.count).mockResolvedValue(32)

      const stats = await getConcertStatistics()

      expect(stats.mostSeenBands).toHaveLength(3)
      expect(stats.mostSeenBands[0]).toEqual(["Radiohead", 15, "radiohead"])
      expect(stats.mostSeenBands[1]).toEqual([
        "The National",
        10,
        "the-national",
      ])
      expect(stats.mostSeenBands[2]).toEqual(["Arcade Fire", 7, "arcade-fire"])
      expect(stats.maxBandCount).toBe(15)

      vi.useRealTimers()
    })

    test("test_getConcertStatistics_handles_missing_band_rows_and_defaults_max_values", async () => {
      vi.mocked(prisma.concert.groupBy as any).mockResolvedValue([])
      vi.mocked(prisma.concertBand.groupBy).mockResolvedValue([
        { bandId: "band-missing", _count: { _all: 5 } },
      ] as any)
      // Missing matching band record should be filtered out by map/filter branch.
      vi.mocked(prisma.band.findMany).mockResolvedValue([] as any)
      vi.mocked(prisma.concert.count).mockResolvedValue(0)

      const stats = await getConcertStatistics()
      expect(stats.mostSeenBands).toEqual([])
      expect(stats.maxYearCount).toBe(0)
      expect(stats.maxCityCount).toBe(0)
      expect(stats.maxBandCount).toBe(0)
    })
  })

  describe("getUserConcertStatistics", () => {
    test("test_getUserConcertStatistics_filters_by_userId", async () => {
      const userId = "user-test-123@test.example.com"
      const mockNow = new Date("2024-03-31T00:00:00.000Z")
      vi.useFakeTimers()
      vi.setSystemTime(mockNow)

      // Mock user's concert IDs
      vi.mocked(prisma.userConcert.findMany).mockResolvedValue([
        { concertId: "concert-1" },
        { concertId: "concert-2" },
        { concertId: "concert-3" },
      ] as any)

      // Mock groupBy for years
      vi.mocked(prisma.concert.groupBy as any).mockImplementation(
        (args: any) => {
          if (args.by.includes("date")) {
            return Promise.resolve([
              { date: new Date("2023-06-15"), _count: { _all: 2 } },
              { date: new Date("2022-07-10"), _count: { _all: 1 } },
            ])
          }
          if (args.by.includes("normalizedCity")) {
            return Promise.resolve([
              { normalizedCity: "Berlin", _count: { _all: 2 } },
              { normalizedCity: "Munich", _count: { _all: 1 } },
            ])
          }
          return Promise.resolve([])
        }
      )

      // Mock $queryRaw for bands
      vi.mocked(prisma.$queryRaw).mockResolvedValue([
        { band_id: "band-1", cnt: BigInt(2) },
        { band_id: "band-2", cnt: BigInt(1) },
      ])

      vi.mocked(prisma.band.findMany).mockResolvedValue([
        { id: "band-1", name: "Radiohead", slug: "radiohead" },
        { id: "band-2", name: "Blur", slug: "blur" },
      ] as any)

      vi.mocked(prisma.userConcert.count as any).mockImplementation(
        (args: any) => {
          if (args.where.userId === userId) {
            return Promise.resolve(3)
          }
          return Promise.resolve(0)
        }
      )

      const stats = await getUserConcertStatistics(userId)

      expect(stats.yearCounts).toBeDefined()
      expect(stats.cityCounts).toBeDefined()
      expect(stats.mostSeenBands).toBeDefined()
      expect(stats.totalPast).toBe(3)
      expect(stats.totalFuture).toBe(3)

      // Verify user-specific filtering was applied
      expect(prisma.userConcert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId },
        })
      )

      vi.useRealTimers()
    })

    test("test_getUserConcertStatistics_when_raw_sql_fails_uses_groupBy_fallback_for_bands", async () => {
      const userId = "user-fallback-stats"
      const mockNow = new Date("2024-03-31T00:00:00.000Z")
      vi.useFakeTimers()
      vi.setSystemTime(mockNow)

      vi.mocked(prisma.userConcert.findMany).mockResolvedValue([
        { concertId: "concert-1" },
        { concertId: "concert-2" },
      ] as any)
      vi.mocked(prisma.concert.groupBy as any).mockImplementation(
        (args: any) => {
          if (args.by.includes("date"))
            return Promise.resolve([
              { date: new Date("2023-01-01"), _count: { _all: 2 } },
            ])
          if (args.by.includes("normalizedCity"))
            return Promise.resolve([
              { normalizedCity: "Berlin", _count: { _all: 2 } },
            ])
          return Promise.resolve([])
        }
      )

      vi.mocked(prisma.$queryRaw).mockRejectedValueOnce(
        new Error("missing column")
      )
      vi.mocked(prisma.concertBand.groupBy).mockResolvedValue([
        { bandId: "band-1", _count: { _all: 2 } },
        { bandId: "band-2", _count: { _all: 1 } },
      ] as any)
      vi.mocked(prisma.band.findMany).mockResolvedValue([
        { id: "band-1", name: "Band One", slug: "band-one" },
        { id: "band-2", name: "Band Two", slug: "band-two" },
      ] as any)
      vi.mocked(prisma.concertBand.count as any).mockImplementation(
        (args: any) => {
          if (args.where.bandId === "band-1") return Promise.resolve(2)
          if (args.where.bandId === "band-2") return Promise.resolve(1)
          return Promise.resolve(0)
        }
      )
      vi.mocked(prisma.userConcert.count as any).mockImplementation(() =>
        Promise.resolve(2)
      )

      const stats = await getUserConcertStatistics(userId)
      expect(stats.mostSeenBands).toEqual([
        ["Band One", 2, "band-one"],
        ["Band Two", 1, "band-two"],
      ])

      vi.useRealTimers()
    })

    test("test_getUserConcertStatistics_with_no_user_concerts_returns_zero_max_values", async () => {
      vi.mocked(prisma.userConcert.findMany).mockResolvedValue([] as any)
      vi.mocked(prisma.concert.groupBy as any).mockResolvedValue([])
      vi.mocked(prisma.$queryRaw).mockResolvedValue([] as any)
      vi.mocked(prisma.band.findMany).mockResolvedValue([] as any)
      vi.mocked(prisma.userConcert.count).mockResolvedValue(0)

      const stats = await getUserConcertStatistics("user-empty")
      expect(stats.yearCounts).toEqual([])
      expect(stats.cityCounts).toEqual([])
      expect(stats.mostSeenBands).toEqual([])
      expect(stats.maxYearCount).toBe(0)
      expect(stats.maxCityCount).toBe(0)
      expect(stats.maxBandCount).toBe(0)
    })
  })

  describe("getUserTotalSpent", () => {
    test("test_getUserTotalSpent_aggregates_cost_from_userConcert", async () => {
      const userId = "user-test-123@test.example.com"

      // Mock aggregate for spending aggregation (no filters)
      vi.mocked(prisma.userConcert.aggregate).mockResolvedValue({
        _sum: { cost: 250.5 },
        _avg: { cost: null },
        _count: { cost: 0 },
        _min: { cost: null },
        _max: { cost: null },
      } as any)

      // Mock user for currency
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        currency: "EUR",
      } as any)

      const result = await getUserTotalSpent(userId)

      expect(result.total).toBe(250.5)
      expect(result.currency).toBe("EUR")

      // Verify aggregate was called
      expect(prisma.userConcert.aggregate).toHaveBeenCalled()
    })

    test("test_getUserTotalSpent_with_filters_applies_correctly", async () => {
      const userId = "user-test-456@test.example.com"

      // Mock band lookup for bandSlug filter
      vi.mocked(prisma.band.findUnique).mockResolvedValue({
        id: "band-radiohead-123",
        slug: "radiohead",
      } as any)

      // Mock $queryRaw with filters (bandSlug uses raw SQL path)
      vi.mocked(prisma.$queryRaw).mockResolvedValue([{ total: 150.75 }])

      // Mock user for currency
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        currency: "USD",
      } as any)

      const result = await getUserTotalSpent(userId, {
        bandSlug: "radiohead",
        city: "Berlin",
        year: 2023,
        pastOnly: true,
      })

      expect(result.total).toBe(150.75)
      expect(result.currency).toBe("USD")

      // Verify $queryRaw was called (bandSlug requires raw SQL)
      expect(prisma.$queryRaw).toHaveBeenCalled()
    })

    test("test_getUserTotalSpent_returns_zero_when_no_costs", async () => {
      const userId = "user-test-789@test.example.com"

      // Mock empty aggregate result
      vi.mocked(prisma.userConcert.aggregate).mockResolvedValue({
        _sum: { cost: null },
        _avg: { cost: null },
        _count: { cost: 0 },
        _min: { cost: null },
        _max: { cost: null },
      } as any)

      // Mock user for currency
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        currency: "GBP",
      } as any)

      const result = await getUserTotalSpent(userId)

      expect(result.total).toBe(0)
      expect(result.currency).toBe("GBP")
    })
  })

  describe("getUserTotalSpentCached", () => {
    test("test_getUserTotalSpentCached_uses_cache", async () => {
      const userId = "user-test-cache-123@test.example.com"

      // Mock aggregate (calls getUserTotalSpent with pastOnly=true)
      vi.mocked(prisma.userConcert.aggregate).mockResolvedValue({
        _sum: { cost: 300 },
        _avg: { cost: null },
        _count: { cost: 0 },
        _min: { cost: null },
        _max: { cost: null },
      } as any)

      // Mock user for currency
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        currency: "EUR",
      } as any)

      const result = await getUserTotalSpentCached(userId)

      expect(result.total).toBe(300)
      expect(result.currency).toBe("EUR")

      // Verify it calls getUserTotalSpent with pastOnly filter
      expect(prisma.userConcert.aggregate).toHaveBeenCalled()
    })
  })

  describe("getConcertCounts", () => {
    test("test_getConcertCounts_returns_attendee_counts", async () => {
      const mockNow = new Date("2024-03-31T00:00:00.000Z")
      vi.useFakeTimers()
      vi.setSystemTime(mockNow)

      mockConcertCountPastFuture(prisma, { past: 42, future: 15 })

      const counts = await getConcertCounts()

      expect(counts.past).toBe(42)
      expect(counts.future).toBe(15)

      vi.useRealTimers()
    })
  })

  describe("getUserConcertCounts", () => {
    test("test_getUserConcertCounts_filters_by_userId", async () => {
      const userId = "user-test-counts-123@test.example.com"
      const mockNow = new Date("2024-03-31T00:00:00.000Z")
      vi.useFakeTimers()
      vi.setSystemTime(mockNow)

      vi.mocked(prisma.userConcert.count as any).mockImplementation(
        (args: any) => {
          if (args.where.userId === userId && args.where.concert?.date?.lt) {
            return Promise.resolve(20) // User's past concerts
          }
          if (args.where.userId === userId && args.where.concert?.date?.gte) {
            return Promise.resolve(5) // User's future concerts
          }
          return Promise.resolve(0)
        }
      )

      const counts = await getUserConcertCounts(userId)

      expect(counts.past).toBe(20)
      expect(counts.future).toBe(5)

      vi.useRealTimers()
    })
  })

  describe("getUserBandConcertCounts", () => {
    test("test_getUserBandConcertCounts_aggregates_headliner_and_support", async () => {
      const userId = "user-test-band-123@test.example.com"
      const bandId = "band-radiohead-123"
      const mockNow = new Date("2024-03-31T00:00:00.000Z")

      // Mock $queryRaw for band concert counts (includes both headliner and support acts)
      vi.mocked(prisma.$queryRaw).mockResolvedValue([
        { past_count: BigInt(8), future_count: BigInt(2) },
      ])

      const counts = await getUserBandConcertCounts(userId, bandId, mockNow)

      expect(counts.past).toBe(8)
      expect(counts.future).toBe(2)

      // Verify $queryRaw was called
      expect(prisma.$queryRaw).toHaveBeenCalled()
    })

    test("test_getUserBandConcertCounts_returns_zero_when_no_matches", async () => {
      const userId = "user-test-no-band-123@test.example.com"
      const bandId = "band-unknown-123"
      const mockNow = new Date("2024-03-31T00:00:00.000Z")

      // Mock empty result
      vi.mocked(prisma.$queryRaw).mockResolvedValue([])

      const counts = await getUserBandConcertCounts(userId, bandId, mockNow)

      expect(counts.past).toBe(0)
      expect(counts.future).toBe(0)
    })
  })
})

describe("Dashboard & Global Stats", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("test_getUserDashboardCounts_returns_unique_cities_and_years", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      { unique_cities: BigInt(5), unique_years: BigInt(3) },
    ])
    const { getUserDashboardCounts } = await import("@/lib/concerts/stats")
    const result = await getUserDashboardCounts("user-dash-1")
    expect(result.uniqueCities).toBe(5)
    expect(result.uniqueYears).toBe(3)
  })

  test("test_getUserUniqueBandCount_fallback_on_error_uses_groupBy", async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValue(new Error("SQL error"))
    vi.mocked(prisma.concertBand.groupBy).mockResolvedValue([
      { bandId: "band-1" },
      { bandId: "band-2" },
      { bandId: "band-3" },
    ] as any)
    const { getUserUniqueBandCount } = await import("@/lib/concerts/stats")
    const result = await getUserUniqueBandCount("user-fallback")
    expect(result).toBe(3)
  })

  test("test_getUserUniqueBandCount_primary_sql_path_returns_count", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ cnt: BigInt(7) }])
    const { getUserUniqueBandCount } = await import("@/lib/concerts/stats")
    const result = await getUserUniqueBandCount("user-primary")
    expect(result).toBe(7)
  })

  test("test_getGlobalAppStats_returns_three_counts", async () => {
    vi.mocked(prisma.concert.count).mockResolvedValue(42)
    vi.mocked(prisma.band.count).mockResolvedValue(120)
    vi.mocked(prisma.user.count).mockResolvedValue(15)
    const { getGlobalAppStats } = await import("@/lib/concerts/stats")
    const result = await getGlobalAppStats()
    expect(result).toEqual({ concertCount: 42, bandCount: 120, userCount: 15 })
  })

  test("test_getGlobalAppStats_returns_null_when_db_unavailable", async () => {
    vi.mocked(prisma.concert.count).mockRejectedValue(
      new Error("Can't reach database server")
    )
    const { getGlobalAppStats } = await import("@/lib/concerts/stats")
    const result = await getGlobalAppStats()
    expect(result).toBeNull()
  })
})
