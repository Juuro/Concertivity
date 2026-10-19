/**
 * Unit tests for the venues search module.
 *
 * Tests cover:
 * 1. DB vs Photon/Ticketmaster scoring order
 * 2. Deduplication keeps higher score
 * 3. User fields stripped for non-DB/unauthenticated
 * 4. Proximity scoring behavior (skips DB venues)
 * 5. Query length validation
 * 6. Timeout handling
 */

import { describe, test, expect, beforeEach, vi } from "vitest"
import { prisma } from "@/lib/prisma"
import {
  searchVenuesEnhanced,
  searchDatabaseVenues,
  getUserVisitedLocations,
} from "@/lib/venues"
import { searchVenues } from "@/utils/photon"
import { searchTicketmasterVenues } from "@/utils/ticketmaster"
import type { EnhancedVenueResult, PhotonSearchResult } from "@/types/photon"

// Mock external dependencies
vi.mock("@/utils/photon", () => ({
  searchVenues: vi.fn(),
}))

vi.mock("@/utils/ticketmaster", () => ({
  searchTicketmasterVenues: vi.fn(),
}))

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}))

describe("Venues Search Module", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("searchVenuesEnhanced", () => {
    test("returns empty array for queries shorter than 3 characters", async () => {
      const result = await searchVenuesEnhanced("ab")
      expect(result).toEqual([])
    })

    test("DB results rank higher than Ticketmaster and Photon results", async () => {
      const dbVenue: EnhancedVenueResult = {
        name: "Test Venue",
        displayName: "Test Venue, Berlin",
        lat: 52.52,
        lon: 13.405,
        city: "Berlin",
        source: "database",
        isUserVenue: true,
        userVisitCount: 2,
        score: 350, // 150 base + 200 (2 visits * 100) + 0 similarity
      }

      const tmVenue: EnhancedVenueResult = {
        name: "Another Venue",
        displayName: "Another Venue, Munich",
        lat: 48.137,
        lon: 11.576,
        city: "Munich",
        source: "ticketmaster",
        score: 30,
      }

      const photonVenue: EnhancedVenueResult = {
        name: "Third Venue",
        displayName: "Third Venue, Hamburg",
        lat: 53.551,
        lon: 9.993,
        city: "Hamburg",
        source: "photon",
        score: 10,
      }

      vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([
        {
          venue: "Test Venue",
          latitude: 52.52,
          longitude: 13.405,
          normalizedCity: "Berlin",
          user_count: BigInt(2),
          similarity: 0,
        },
      ])
      vi.mocked(prisma.concert.findMany).mockResolvedValueOnce([])
      vi.mocked(searchTicketmasterVenues).mockResolvedValueOnce([tmVenue])
      vi.mocked(searchVenues).mockResolvedValueOnce([photonVenue])

      const results = await searchVenuesEnhanced("test", { userId: "user-1" })

      // DB venue should be first (highest score)
      expect(results[0].source).toBe("database")
      expect(results[0].score).toBeGreaterThan(results[1]?.score || 0)
    })

    test("deduplication keeps venue with higher score", async () => {
      // Same venue from two sources with different scores
      const dbVenue: EnhancedVenueResult = {
        name: "Olympiastadion",
        displayName: "Olympiastadion, Berlin",
        lat: 52.514,
        lon: 13.239,
        city: "Berlin",
        source: "database",
        isUserVenue: true,
        userVisitCount: 1,
        score: 250,
      }

      const tmVenue: EnhancedVenueResult = {
        name: "Olympiastadion",
        displayName: "Olympiastadion Berlin",
        lat: 52.514,
        lon: 13.239,
        city: "Berlin",
        source: "ticketmaster",
        score: 30,
      }

      vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([
        {
          venue: "Olympiastadion",
          latitude: 52.514,
          longitude: 13.239,
          normalizedCity: "Berlin",
          user_count: BigInt(1),
          similarity: 0,
        },
      ])
      vi.mocked(prisma.concert.findMany).mockResolvedValueOnce([])
      vi.mocked(searchTicketmasterVenues).mockResolvedValueOnce([tmVenue])
      vi.mocked(searchVenues).mockResolvedValueOnce([])

      const results = await searchVenuesEnhanced("olympia", {
        userId: "user-1",
      })

      // Should only have one result (deduplicated)
      const olympiaResults = results.filter((r) =>
        r.name.toLowerCase().includes("olympia")
      )
      expect(olympiaResults.length).toBe(1)
      // Should keep the DB version (higher score)
      expect(olympiaResults[0].source).toBe("database")
      expect(olympiaResults[0].score).toBe(250)
    })

    test("strips user fields for unauthenticated requests", async () => {
      const photonVenue: EnhancedVenueResult = {
        name: "Public Venue",
        displayName: "Public Venue, Berlin",
        lat: 52.52,
        lon: 13.405,
        city: "Berlin",
        source: "photon",
        score: 10,
      }

      vi.mocked(searchTicketmasterVenues).mockResolvedValueOnce([])
      vi.mocked(searchVenues).mockResolvedValueOnce([photonVenue])

      // No userId provided (unauthenticated)
      const results = await searchVenuesEnhanced("public")

      expect(results[0]).not.toHaveProperty("isUserVenue")
      expect(results[0]).not.toHaveProperty("userVisitCount")
    })

    test("strips user fields for non-DB results even when authenticated", async () => {
      const tmVenue: EnhancedVenueResult = {
        name: "TM Venue",
        displayName: "TM Venue, Berlin",
        lat: 52.52,
        lon: 13.405,
        city: "Berlin",
        source: "ticketmaster",
        score: 30,
      }

      vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([])
      vi.mocked(prisma.concert.findMany).mockResolvedValueOnce([])
      vi.mocked(searchTicketmasterVenues).mockResolvedValueOnce([tmVenue])
      vi.mocked(searchVenues).mockResolvedValueOnce([])

      const results = await searchVenuesEnhanced("venue", { userId: "user-1" })

      // Ticketmaster result should not have user fields
      const tmResult = results.find((r) => r.source === "ticketmaster")
      expect(tmResult).not.toHaveProperty("isUserVenue")
      expect(tmResult).not.toHaveProperty("userVisitCount")
    })

    test("preserves user fields for authenticated user's DB results", async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([
        {
          venue: "My Venue",
          latitude: 52.52,
          longitude: 13.405,
          normalizedCity: "Berlin",
          user_count: BigInt(3),
          similarity: 0.8,
        },
      ])
      vi.mocked(prisma.concert.findMany).mockResolvedValueOnce([])
      vi.mocked(searchTicketmasterVenues).mockResolvedValueOnce([])
      vi.mocked(searchVenues).mockResolvedValueOnce([])

      const results = await searchVenuesEnhanced("venue", { userId: "user-1" })

      const dbResult = results.find((r) => r.source === "database")
      expect(dbResult).toHaveProperty("isUserVenue", true)
      expect(dbResult).toHaveProperty("userVisitCount", 3)
    })

    test("applies proximity scoring only to non-DB venues", async () => {
      // DB venue at location A
      const dbVenue: EnhancedVenueResult = {
        name: "DB Venue",
        displayName: "DB Venue, Berlin",
        lat: 52.52,
        lon: 13.405,
        city: "Berlin",
        source: "database",
        isUserVenue: true,
        userVisitCount: 1,
        score: 250,
      }

      // Photon venue very close to user's visited location
      const photonVenue: EnhancedVenueResult = {
        name: "Photon Venue",
        displayName: "Photon Venue, Berlin",
        lat: 52.521, // Very close to user location
        lon: 13.406,
        city: "Berlin",
        source: "photon",
        score: 10,
      }

      vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([
        {
          venue: "DB Venue",
          latitude: 52.52,
          longitude: 13.405,
          normalizedCity: "Berlin",
          user_count: BigInt(1),
          similarity: 0,
        },
      ])
      // User has visited a location very close to photon venue
      vi.mocked(prisma.concert.findMany).mockResolvedValueOnce([
        { latitude: 52.521, longitude: 13.406 } as never,
      ])
      vi.mocked(searchTicketmasterVenues).mockResolvedValueOnce([])
      vi.mocked(searchVenues).mockResolvedValueOnce([photonVenue])

      const results = await searchVenuesEnhanced("venue", { userId: "user-1" })

      const dbResult = results.find((r) => r.source === "database")
      const photonResult = results.find((r) => r.source === "photon")

      // DB venue score should remain unchanged (250)
      expect(dbResult?.score).toBe(250)

      // Photon venue should have proximity bonus (base 10 + ~50 for being very close)
      expect(photonResult?.score).toBeGreaterThan(10)
    })

    test("returns max 10 results", async () => {
      const manyVenues: EnhancedVenueResult[] = Array.from(
        { length: 15 },
        (_, i) => ({
          name: `Venue ${i}`,
          displayName: `Venue ${i}, City`,
          lat: 52 + i * 0.01,
          lon: 13 + i * 0.01,
          city: "City",
          source: "photon" as const,
          score: 10 + i,
        })
      )

      vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([])
      vi.mocked(prisma.concert.findMany).mockResolvedValueOnce([])
      vi.mocked(searchTicketmasterVenues).mockResolvedValueOnce([])
      vi.mocked(searchVenues).mockResolvedValueOnce(manyVenues)

      const results = await searchVenuesEnhanced("venue", { userId: "user-1" })

      expect(results.length).toBeLessThanOrEqual(10)
    })

    test("sorts results by score descending", async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([
        {
          venue: "Low Score DB",
          latitude: 52.52,
          longitude: 13.405,
          normalizedCity: "Berlin",
          user_count: BigInt(1),
          similarity: 0,
        },
      ])
      vi.mocked(prisma.concert.findMany).mockResolvedValueOnce([])
      vi.mocked(searchTicketmasterVenues).mockResolvedValueOnce([
        {
          name: "High Score TM",
          displayName: "High Score TM",
          lat: 48.137,
          lon: 11.576,
          source: "ticketmaster",
          score: 500, // Artificially high for test
        },
      ])
      vi.mocked(searchVenues).mockResolvedValueOnce([])

      const results = await searchVenuesEnhanced("venue", { userId: "user-1" })

      // Results should be sorted by score descending
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score!)
      }
    })

    test("handles source errors gracefully with fallback", async () => {
      // Ticketmaster throws an error - should fallback to empty array
      vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([])
      vi.mocked(prisma.concert.findMany).mockResolvedValueOnce([])
      vi.mocked(searchTicketmasterVenues).mockRejectedValueOnce(
        new Error("Ticketmaster API error")
      )
      vi.mocked(searchVenues).mockResolvedValueOnce([
        {
          name: "Photon Venue",
          displayName: "Photon Venue, Berlin",
          lat: 52.52,
          lon: 13.405,
          city: "Berlin",
          score: 10,
        } as PhotonSearchResult,
      ])

      const results = await searchVenuesEnhanced("venue", { userId: "user-1" })

      // Should still return Photon results even though Ticketmaster failed
      expect(results.length).toBe(1)
      expect(results[0].source).toBe("photon")
    })

    test("passes lat/lon to Photon when both are provided", async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([])
      vi.mocked(prisma.concert.findMany).mockResolvedValueOnce([])
      vi.mocked(searchTicketmasterVenues).mockResolvedValueOnce([])
      vi.mocked(searchVenues).mockResolvedValueOnce([])

      await searchVenuesEnhanced("venue", { lat: 52.52, lon: 13.405 })

      expect(searchVenues).toHaveBeenCalledWith("venue", {
        lat: 52.52,
        lon: 13.405,
      })
    })

    test("passes undefined to Photon when only lat is provided", async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([])
      vi.mocked(prisma.concert.findMany).mockResolvedValueOnce([])
      vi.mocked(searchTicketmasterVenues).mockResolvedValueOnce([])
      vi.mocked(searchVenues).mockResolvedValueOnce([])

      await searchVenuesEnhanced("venue", { lat: 52.52 })

      expect(searchVenues).toHaveBeenCalledWith("venue", undefined)
    })

    test("handles venues without scores in deduplication", async () => {
      // Two venues with same location, one without score
      const venueWithScore: EnhancedVenueResult = {
        name: "Test Venue",
        displayName: "Test Venue",
        lat: 52.52,
        lon: 13.405,
        source: "ticketmaster",
        score: 30,
      }

      const venueWithoutScore: EnhancedVenueResult = {
        name: "Test Venue",
        displayName: "Test Venue",
        lat: 52.52,
        lon: 13.405,
        source: "photon",
        // No score property
      }

      // No userId, so no prisma.concert.findMany mock needed
      vi.mocked(searchTicketmasterVenues).mockResolvedValueOnce([
        venueWithScore,
      ])
      vi.mocked(searchVenues).mockResolvedValueOnce([venueWithoutScore])

      const results = await searchVenuesEnhanced("test")

      // Should keep the one with score (higher)
      expect(results.length).toBe(1)
      expect(results[0].score).toBe(30)
    })

    test("handles venues without scores in sorting", async () => {
      const venueWithScore: EnhancedVenueResult = {
        name: "Venue A",
        displayName: "Venue A",
        lat: 52.52,
        lon: 13.405,
        source: "ticketmaster",
        score: 30,
      }

      const venueWithoutScore: EnhancedVenueResult = {
        name: "Venue B",
        displayName: "Venue B",
        lat: 48.137,
        lon: 11.576,
        source: "photon",
        // No score - should be treated as 0
      }

      // No userId, so no prisma.concert.findMany mock needed
      vi.mocked(searchTicketmasterVenues).mockResolvedValueOnce([
        venueWithScore,
      ])
      vi.mocked(searchVenues).mockResolvedValueOnce([venueWithoutScore])

      const results = await searchVenuesEnhanced("venue")

      // Venue with score should come first
      expect(results[0].name).toBe("Venue A")
    })

    test("handles proximity scoring for venues without initial score", async () => {
      const venueWithoutScore: EnhancedVenueResult = {
        name: "No Score Venue",
        displayName: "No Score Venue",
        lat: 52.521, // Very close to user location
        lon: 13.406,
        source: "photon",
        // No score property
      }

      vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([])
      vi.mocked(prisma.concert.findMany).mockResolvedValueOnce([
        { latitude: 52.521, longitude: 13.406 } as never,
      ])
      vi.mocked(searchTicketmasterVenues).mockResolvedValueOnce([])
      vi.mocked(searchVenues).mockResolvedValueOnce([venueWithoutScore])

      const results = await searchVenuesEnhanced("venue", { userId: "user-1" })

      // Should have proximity bonus added to 0 base
      expect(results[0].score).toBeGreaterThan(0)
    })
  })

  describe("searchDatabaseVenues", () => {
    beforeEach(() => {
      // Reset $queryRaw mock for these tests
      vi.mocked(prisma.$queryRaw).mockReset()
    })

    test("returns empty array for queries shorter than 3 characters", async () => {
      const result = await searchDatabaseVenues("ab", "user-1")
      expect(result).toEqual([])
    })

    test("returns empty array when no userId provided", async () => {
      const result = await searchDatabaseVenues("test")
      expect(result).toEqual([])
    })

    test("falls back to ILIKE query when pg_trgm fails", async () => {
      // First query (with word_similarity) fails
      vi.mocked(prisma.$queryRaw)
        .mockRejectedValueOnce(new Error("pg_trgm not available"))
        .mockResolvedValueOnce([
          {
            venue: "Fallback Venue",
            latitude: 52.52,
            longitude: 13.405,
            normalizedCity: "Berlin",
            user_count: BigInt(1),
            similarity: 0,
          },
        ])

      const result = await searchDatabaseVenues("fallback", "user-1")

      expect(result.length).toBe(1)
      expect(result[0].name).toBe("Fallback Venue")
    })

    test("calculates score correctly with visit count and similarity", async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([
        {
          venue: "Scored Venue",
          latitude: 52.52,
          longitude: 13.405,
          normalizedCity: "Berlin",
          user_count: BigInt(3), // 3 visits = +300
          similarity: 0.8, // 0.8 * 50 = +40
        },
      ])

      const result = await searchDatabaseVenues("scored", "user-1")

      // Score = 150 (base) + 300 (3 visits * 100) + 40 (similarity bonus)
      expect(result[0].score).toBe(490)
      expect(result[0].userVisitCount).toBe(3)
    })

    test("returns empty array when both queries fail", async () => {
      // Both pg_trgm query and ILIKE fallback fail
      vi.mocked(prisma.$queryRaw)
        .mockRejectedValueOnce(new Error("pg_trgm not available"))
        .mockRejectedValueOnce(new Error("Database connection failed"))

      const result = await searchDatabaseVenues("failing", "user-1")

      expect(result).toEqual([])
    })
  })

  describe("getUserVisitedLocations", () => {
    beforeEach(() => {
      // Reset prisma.concert.findMany mock specifically for these tests
      vi.mocked(prisma.concert.findMany).mockReset()
    })

    test("returns unique locations from user concerts", async () => {
      vi.mocked(prisma.concert.findMany).mockResolvedValueOnce([
        { latitude: 52.52, longitude: 13.405 },
        { latitude: 48.137, longitude: 11.576 },
      ] as any)

      const result = await getUserVisitedLocations("user-1")

      expect(result).toEqual([
        { latitude: 52.52, longitude: 13.405 },
        { latitude: 48.137, longitude: 11.576 },
      ])
    })

    test("returns empty array when user has no concerts", async () => {
      vi.mocked(prisma.concert.findMany).mockResolvedValueOnce([] as any)

      const result = await getUserVisitedLocations("user-1")

      expect(result).toEqual([])
    })
  })
})
