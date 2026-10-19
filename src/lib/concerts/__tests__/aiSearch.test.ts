import { describe, test, expect, beforeEach, vi } from "vitest"
import { prisma } from "@/lib/prisma"
import type { ParsedConcertQuery } from "@/types/concertAiSearch"
import type { SetlistfmSetlist } from "@/types/setlistfm"

vi.mock("@/lib/concerts/aiParse", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/concerts/aiParse")>()
  return {
    ...actual,
    parseConcertProse: vi.fn(),
    MAX_PROSE_LENGTH: 500,
  }
})
vi.mock("@/lib/concerts/aiRank", () => ({
  rankCandidatesByHints: vi.fn(async (candidates: unknown[]) => candidates),
}))
vi.mock("@/lib/concerts/aiSearchTelemetry", () => ({
  logAiSearchNoResult: vi.fn(),
}))
vi.mock("@/utils/setlistfm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/utils/setlistfm")>()
  return {
    ...actual,
    searchSetlistsWithMeta: vi.fn(),
    searchArtists: vi.fn(),
    getSetlistById: vi.fn(),
  }
})
vi.mock("@/lib/bands", () => ({
  getOrCreateBand: vi.fn(),
  enrichBandData: vi.fn(),
}))
vi.mock("@/utils/photon", () => ({
  searchVenues: vi.fn(),
}))

import { parseConcertProse } from "@/lib/concerts/aiParse"
import { logAiSearchNoResult } from "@/lib/concerts/aiSearchTelemetry"
import {
  searchSetlistsWithMeta,
  searchArtists,
  getSetlistById,
  type SetlistSearchMeta,
} from "@/utils/setlistfm"
import { getOrCreateBand, enrichBandData } from "@/lib/bands"
import { searchVenues } from "@/utils/photon"
import {
  parseEventDate,
  searchConcertCandidates,
  buildCreateInputFromSetlist,
  pickBestGeocodeResult,
} from "@/lib/concerts/aiSearch"

function pq(partial: Partial<ParsedConcertQuery>): ParsedConcertQuery {
  return {
    artist: null,
    artistHints: null,
    city: null,
    venue: null,
    festival: null,
    countryCode: null,
    yearStart: null,
    yearEnd: null,
    season: null,
    month: null,
    ...partial,
  }
}

function setlist(
  over: Partial<SetlistfmSetlist> & { id: string; eventDate: string }
): SetlistfmSetlist {
  return {
    artist: { name: "The Rolling Stones", mbid: "mbid-1" },
    venue: {
      name: "Wembley Stadium",
      city: {
        name: "London",
        coords: { lat: 51.556, long: -0.2796 },
        country: { code: "GB", name: "United Kingdom" },
      },
    },
    url: `https://www.setlist.fm/setlist/${over.id}.html`,
    ...over,
  }
}

const EMPTY_SETLIST_META: SetlistSearchMeta = {
  queries: 1,
  emptyCount: 1,
  errorCount: 0,
  unavailable: false,
  httpStatuses: [404],
}

const SUCCESS_SETLIST_META: SetlistSearchMeta = {
  queries: 1,
  emptyCount: 0,
  errorCount: 0,
  unavailable: false,
  httpStatuses: [200],
}

function mockSearchSetlistsWithMeta(
  setlists: SetlistfmSetlist[],
  meta: SetlistSearchMeta = setlists.length
    ? SUCCESS_SETLIST_META
    : EMPTY_SETLIST_META
) {
  vi.mocked(searchSetlistsWithMeta).mockResolvedValue({ setlists, meta })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.userConcert.findMany).mockResolvedValue([] as never)
  vi.mocked(searchArtists).mockResolvedValue([])
  mockSearchSetlistsWithMeta([])
})

describe("parseEventDate", () => {
  test("parses dd-MM-yyyy to UTC midnight + ISO (no timezone drift)", () => {
    const result = parseEventDate("11-07-1999")
    expect(result).not.toBeNull()
    expect(result!.iso).toBe("1999-07-11")
    expect(result!.date.toISOString()).toBe("1999-07-11T00:00:00.000Z")
    expect(result!.month).toBe(7)
    expect(result!.year).toBe(1999)
  })

  test("rejects malformed input", () => {
    expect(parseEventDate("1999-07-11")).toBeNull()
    expect(parseEventDate("garbage")).toBeNull()
    expect(parseEventDate("")).toBeNull()
  })

  test("rejects impossible calendar dates", () => {
    expect(parseEventDate("31-02-2020")).toBeNull()
    expect(parseEventDate("00-01-2020")).toBeNull()
    expect(parseEventDate("01-13-2020")).toBeNull()
  })

  test("rejects pre-1900 and far-future years", () => {
    expect(parseEventDate("01-01-1899")).toBeNull()
    const farFuture = String(new Date().getUTCFullYear() + 5)
    expect(parseEventDate(`01-01-${farFuture}`)).toBeNull()
  })
})

describe("searchConcertCandidates", () => {
  test("returns hint and no candidates when parse fails", async () => {
    vi.mocked(parseConcertProse).mockResolvedValue(null)
    const result = await searchConcertCandidates("???", "user-1")
    expect(result.candidates).toEqual([])
    expect(result.parsed).toBeNull()
    expect(result.hint).toBeTruthy()
    expect(searchSetlistsWithMeta).not.toHaveBeenCalled()
    expect(logAiSearchNoResult).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "parse_failed",
        prose: "???",
        parsed: null,
      })
    )
  })

  test("returns 'name the band' hint when no anchor fields are present", async () => {
    vi.mocked(parseConcertProse).mockResolvedValue(pq({ yearStart: 1999 }))
    const result = await searchConcertCandidates("something in 1999", "user-1")
    expect(result.candidates).toEqual([])
    expect(result.hint).toMatch(/band or artist/i)
    expect(searchSetlistsWithMeta).not.toHaveBeenCalled()
    expect(logAiSearchNoResult).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "insufficient_anchors",
        prose: "something in 1999",
      })
    )
  })

  test("pins the artist by MBID and maps candidates", async () => {
    vi.mocked(parseConcertProse).mockResolvedValue(
      pq({
        artist: "The Rolling Stones",
        city: "London",
        yearStart: 1999,
        yearEnd: 1999,
      })
    )
    vi.mocked(searchArtists).mockResolvedValue([
      { name: "The Rolling Stones", mbid: "mbid-stones" },
    ])
    mockSearchSetlistsWithMeta([
      setlist({ id: "aaa1", eventDate: "11-07-1999" }),
      setlist({ id: "bbb2", eventDate: "12-07-1999" }),
    ])

    const result = await searchConcertCandidates(
      "Stones, London, '99",
      "user-1"
    )

    // Single year => exactly one search call, pinned by artistMbid.
    expect(searchSetlistsWithMeta).toHaveBeenCalledTimes(1)
    expect(searchSetlistsWithMeta).toHaveBeenCalledWith(
      expect.objectContaining({
        artistMbid: "mbid-stones",
        cityName: "London",
        year: 1999,
      })
    )
    expect(result.candidates).toHaveLength(2)
    const first = result.candidates[0]
    expect(first.date).toBe("1999-07-12") // newest first
    expect(first.venue).toBe("Wembley Stadium")
    expect(first.city).toBe("London")
    expect(first.country).toBe("United Kingdom")
    expect(first.lat).toBe(51.556)
    expect(first.lon).toBe(-0.2796) // mapped from coords.long
    expect(first.headliner).toBe("The Rolling Stones")
    expect(result.hint).toBeNull()
    expect(logAiSearchNoResult).not.toHaveBeenCalled()
  })

  test("caps a wide year range to one query and filters client-side", async () => {
    vi.mocked(parseConcertProse).mockResolvedValue(
      pq({ artist: "Metallica", yearStart: 1990, yearEnd: 2005 })
    )
    mockSearchSetlistsWithMeta([
      setlist({
        id: "in1",
        eventDate: "01-06-1995",
        artist: { name: "Metallica" },
      }),
      setlist({
        id: "out1",
        eventDate: "01-06-2010",
        artist: { name: "Metallica" },
      }),
    ])

    const result = await searchConcertCandidates(
      "Metallica in the 90s/00s",
      "user-1"
    )

    // Span > 3 years => one un-yeared query (no `year` param).
    expect(searchSetlistsWithMeta).toHaveBeenCalledTimes(1)
    expect(searchSetlistsWithMeta).toHaveBeenCalledWith(
      expect.not.objectContaining({ year: expect.anything() })
    )
    expect(result.candidates.map((c) => c.id)).toEqual(["in1"])
  })

  test("applies a season filter client-side", async () => {
    vi.mocked(parseConcertProse).mockResolvedValue(
      pq({
        artist: "Radiohead",
        yearStart: 2012,
        yearEnd: 2012,
        season: "summer",
      })
    )
    mockSearchSetlistsWithMeta([
      setlist({
        id: "jul",
        eventDate: "10-07-2012",
        artist: { name: "Radiohead" },
      }),
      setlist({
        id: "jan",
        eventDate: "10-01-2012",
        artist: { name: "Radiohead" },
      }),
    ])

    const result = await searchConcertCandidates(
      "Radiohead summer 2012",
      "user-1"
    )
    expect(result.candidates.map((c) => c.id)).toEqual(["jul"])
  })

  test("retries venue-only when a city+venue search returns nothing", async () => {
    vi.mocked(parseConcertProse).mockResolvedValue(
      pq({
        artist: "The Rolling Stones",
        city: "Metro London",
        venue: "Wembley Arena",
        yearStart: 2003,
        yearEnd: 2003,
      })
    )
    vi.mocked(searchArtists).mockResolvedValue([
      { name: "The Rolling Stones", mbid: "mbid-stones" },
    ])
    vi.mocked(searchSetlistsWithMeta)
      .mockResolvedValueOnce({ setlists: [], meta: EMPTY_SETLIST_META })
      .mockResolvedValueOnce({
        setlists: [setlist({ id: "wembley1", eventDate: "15-09-2003" })],
        meta: SUCCESS_SETLIST_META,
      })

    const result = await searchConcertCandidates(
      "Stones at Wembley Arena 2003",
      "user-1"
    )

    expect(searchSetlistsWithMeta).toHaveBeenCalledTimes(2)
    expect(searchSetlistsWithMeta).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        artistMbid: "mbid-stones",
        cityName: "Metro London",
        venueName: "Wembley Arena",
        year: 2003,
      })
    )
    expect(searchSetlistsWithMeta).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        artistMbid: "mbid-stones",
        venueName: "Wembley Arena",
        year: 2003,
      })
    )
    expect(searchSetlistsWithMeta).toHaveBeenNthCalledWith(
      2,
      expect.not.objectContaining({ cityName: expect.anything() })
    )
    expect(result.candidates).toHaveLength(1)
    expect(result.hint).toBeNull()
  })

  test("searches by country and year when only a region is given (no city)", async () => {
    vi.mocked(parseConcertProse).mockResolvedValue(
      pq({
        artist: "Die Ärzte",
        countryCode: "DE",
        yearStart: 2003,
        yearEnd: 2003,
      })
    )
    vi.mocked(searchArtists).mockResolvedValue([
      { name: "Die Ärzte", mbid: "mbid-arzte" },
    ])
    mockSearchSetlistsWithMeta([
      setlist({
        id: "stuttgart03",
        eventDate: "21-12-2003",
        artist: { name: "Die Ärzte", mbid: "mbid-arzte" },
        venue: {
          name: "Hanns-Martin-Schleyer-Halle",
          city: {
            name: "Stuttgart",
            coords: { lat: 48.79, long: 9.18 },
            country: { code: "DE", name: "Germany" },
          },
        },
      }),
    ])

    const result = await searchConcertCandidates(
      "Die Ärzte in 2003 in South germany",
      "user-1"
    )

    expect(searchSetlistsWithMeta).toHaveBeenCalledWith(
      expect.objectContaining({
        artistMbid: "mbid-arzte",
        countryCode: "DE",
        year: 2003,
      })
    )
    expect(searchSetlistsWithMeta).toHaveBeenCalledWith(
      expect.not.objectContaining({ cityName: expect.anything() })
    )
    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0].city).toBe("Stuttgart")
  })

  test("finds Nirvana in Paris for early-90s decade range via year filter", async () => {
    vi.mocked(parseConcertProse).mockResolvedValue(
      pq({
        artist: "Nirvana",
        city: "Paris",
        yearStart: 1990,
        yearEnd: 1993,
      })
    )
    vi.mocked(searchArtists).mockResolvedValue([
      { name: "Nirvana", mbid: "mbid-nirvana" },
    ])
    mockSearchSetlistsWithMeta([
      setlist({
        id: "paris92",
        eventDate: "24-06-1992",
        artist: { name: "Nirvana", mbid: "mbid-nirvana" },
        venue: {
          name: "Le Zénith",
          city: {
            name: "Paris",
            coords: { lat: 48.89, long: 2.39 },
            country: { code: "FR", name: "France" },
          },
        },
      }),
      setlist({
        id: "paris94",
        eventDate: "14-02-1994",
        artist: { name: "Nirvana", mbid: "mbid-nirvana" },
        venue: {
          name: "Palais Omnisports",
          city: { name: "Paris", country: { code: "FR", name: "France" } },
        },
      }),
    ])

    const result = await searchConcertCandidates(
      "Nirvana beginning of the 90ies Paris",
      "user-1"
    )

    expect(searchSetlistsWithMeta).toHaveBeenCalledWith(
      expect.objectContaining({
        artistMbid: "mbid-nirvana",
        cityName: "Paris",
      })
    )
    expect(searchSetlistsWithMeta).toHaveBeenCalledWith(
      expect.not.objectContaining({ year: expect.anything() })
    )
    expect(result.candidates.map((c) => c.id)).toEqual(["paris92"])
  })

  test("searches by city and year without artist for fuzzy descriptions", async () => {
    vi.mocked(parseConcertProse).mockResolvedValue(
      pq({
        city: "Kaiserslautern",
        countryCode: "DE",
        yearStart: 2026,
        yearEnd: 2026,
        month: 5,
        artistHints: "German woman singer songwriter",
      })
    )
    mockSearchSetlistsWithMeta([
      setlist({
        id: "dota-kl",
        eventDate: "02-05-2026",
        artist: { name: "Dota", mbid: "mbid-dota" },
        venue: {
          name: "Pfalztheater",
          city: {
            name: "Kaiserslautern",
            coords: { lat: 49.44, long: 7.77 },
            country: { code: "DE", name: "Germany" },
          },
        },
      }),
      setlist({
        id: "rock-kl",
        eventDate: "15-05-2026",
        artist: { name: "Some Rock Band" },
        venue: {
          name: "Other Venue",
          city: {
            name: "Kaiserslautern",
            country: { code: "DE", name: "Germany" },
          },
        },
      }),
    ])

    const result = await searchConcertCandidates(
      "German woman singer songwriter Kaiserslautern last month",
      "user-1"
    )

    expect(searchArtists).not.toHaveBeenCalled()
    expect(searchSetlistsWithMeta).toHaveBeenCalledWith(
      expect.objectContaining({
        cityName: "Kaiserslautern",
        countryCode: "DE",
        year: 2026,
      })
    )
    expect(searchSetlistsWithMeta).toHaveBeenCalledWith(
      expect.not.objectContaining({
        artistName: expect.anything(),
        artistMbid: expect.anything(),
      })
    )
    expect(result.candidates).toHaveLength(2)
    expect(result.candidates.every((c) => c.date.startsWith("2026-05"))).toBe(
      true
    )
    expect(result.hint).toBeNull()
  })

  test("rejects fuzzy search without a date anchor", async () => {
    vi.mocked(parseConcertProse).mockResolvedValue(
      pq({
        city: "Berlin",
        countryCode: "DE",
        yearStart: 2020,
        yearEnd: 2025,
        artistHints: "German singer",
      })
    )

    const result = await searchConcertCandidates(
      "German singer in Berlin",
      "user-1"
    )

    expect(searchSetlistsWithMeta).not.toHaveBeenCalled()
    expect(result.hint).toMatch(/month or year/i)
    expect(logAiSearchNoResult).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "fuzzy_missing_date" })
    )
  })

  test("rejects fuzzy search without a city or venue", async () => {
    vi.mocked(parseConcertProse).mockResolvedValue(
      pq({
        countryCode: "DE",
        yearStart: 2025,
        yearEnd: 2025,
        artistHints: "German singer",
      })
    )

    const result = await searchConcertCandidates(
      "German singer last year",
      "user-1"
    )

    expect(searchSetlistsWithMeta).not.toHaveBeenCalled()
    expect(result.hint).toMatch(/city or venue/i)
    expect(logAiSearchNoResult).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "fuzzy_missing_place" })
    )
  })

  test("marks candidates already in the user's list", async () => {
    vi.mocked(parseConcertProse).mockResolvedValue(
      pq({ artist: "The Rolling Stones", yearStart: 1999, yearEnd: 1999 })
    )
    mockSearchSetlistsWithMeta([
      setlist({ id: "aaa1", eventDate: "11-07-1999" }),
    ])
    vi.mocked(prisma.userConcert.findMany).mockResolvedValue([
      {
        concert: {
          id: "concert-xyz",
          date: new Date("1999-07-11T00:00:00.000Z"),
          bands: [{ band: { slug: "the-rolling-stones" } }],
        },
      },
    ] as never)

    const result = await searchConcertCandidates("Stones 1999", "user-1")
    expect(result.candidates[0].alreadyAdded).toBe(true)
    expect(result.candidates[0].editPath).toBe("/concerts/edit/concert-xyz")
  })

  test("filters by month and returns a city/year hint on miss", async () => {
    vi.mocked(parseConcertProse).mockResolvedValue(
      pq({
        artist: "Radiohead",
        city: "Berlin",
        yearStart: 2012,
        yearEnd: 2012,
        month: 7,
      })
    )
    mockSearchSetlistsWithMeta([
      setlist({
        id: "jul",
        eventDate: "10-07-2012",
        artist: { name: "Radiohead" },
      }),
      setlist({
        id: "aug",
        eventDate: "10-08-2012",
        artist: { name: "Radiohead" },
      }),
    ])

    const result = await searchConcertCandidates(
      "Radiohead Berlin July 2012",
      "user-1"
    )
    expect(result.candidates.map((c) => c.id)).toEqual(["jul"])
  })

  test("returns a narrow-it-down hint when artist, city, and year miss", async () => {
    vi.mocked(parseConcertProse).mockResolvedValue(
      pq({
        artist: "Metallica",
        city: "Berlin",
        venue: "Waldbühne",
        yearStart: 2010,
        yearEnd: 2010,
      })
    )
    mockSearchSetlistsWithMeta([])

    const result = await searchConcertCandidates(
      "Metallica at Waldbühne Berlin 2010",
      "user-1"
    )

    expect(result.candidates).toEqual([])
    expect(result.hint).toMatch(/nearby city or a different year/i)
    expect(logAiSearchNoResult).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "setlist_empty",
        prose: "Metallica at Waldbühne Berlin 2010",
      })
    )
  })

  test("returns an artist-only hint when no place or year anchors exist", async () => {
    vi.mocked(parseConcertProse).mockResolvedValue(pq({ artist: "Metallica" }))
    mockSearchSetlistsWithMeta([])

    const result = await searchConcertCandidates("Metallica", "user-1")
    expect(result.hint).toMatch(/add a city or an approximate year/i)
  })
})

describe("pickBestGeocodeResult", () => {
  test("prefers the venue name and city over unrelated lake matches", () => {
    const picked = pickBestGeocodeResult(
      [
        {
          name: "Victory Lakes Clubhouse",
          displayName: "Bristow, VA",
          city: "Bristow",
          state: "VA",
          lat: 38.7589733,
          lon: -77.5661682,
        },
        {
          name: "Lake Compounce",
          displayName: "Bristol, CT",
          city: "Bristol",
          state: "CT",
          lat: 41.6388123,
          lon: -72.9227907,
        },
      ],
      "Lake Compounce",
      "Bristol",
      41.6717648,
      -72.9492703
    )

    expect(picked?.name).toBe("Lake Compounce")
    expect(picked?.city).toBe("Bristol")
  })
})

describe("buildCreateInputFromSetlist", () => {
  beforeEach(() => {
    vi.mocked(getOrCreateBand).mockResolvedValue({
      id: "band-1",
      name: "The Rolling Stones",
      slug: "the-rolling-stones",
      url: "/band/the-rolling-stones/",
      imageEnrichedAt: new Date(),
    } as never)
    vi.mocked(enrichBandData).mockResolvedValue(undefined)
  })

  test("returns NOT_FOUND when the setlist can't be fetched", async () => {
    vi.mocked(getSetlistById).mockResolvedValue(null)
    const result = await buildCreateInputFromSetlist("abc123", "user-1")
    expect(result).toEqual({ ok: false, code: "NOT_FOUND" })
  })

  test("returns INVALID_DATE for an unparseable event date", async () => {
    vi.mocked(getSetlistById).mockResolvedValue(
      setlist({ id: "abc123", eventDate: "99-99-9999" })
    )
    const result = await buildCreateInputFromSetlist("abc123", "user-1")
    expect(result).toEqual({ ok: false, code: "INVALID_DATE" })
  })

  test("prefers venue-precise geocoded coords over the city centroid", async () => {
    vi.mocked(getSetlistById).mockResolvedValue(
      setlist({ id: "abc123", eventDate: "11-07-1999" })
    )
    vi.mocked(searchVenues).mockResolvedValue([
      {
        name: "Wembley Stadium",
        displayName: "Wembley, London",
        lat: 51.556,
        lon: -0.2796,
      },
    ] as never)

    const result = await buildCreateInputFromSetlist("abc123", "user-1")
    expect(searchVenues).toHaveBeenCalledWith("Wembley Stadium", {
      lat: 51.556,
      lon: -0.2796,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.input.latitude).toBe(51.556)
    expect(result.input.longitude).toBe(-0.2796)
    expect(result.input.date.toISOString()).toBe("1999-07-11T00:00:00.000Z")
    expect(result.input.venue).toBe("Wembley Stadium")
    expect(result.input.isFestival).toBe(false)
    expect(result.input.bandIds).toEqual([
      { bandId: "band-1", isHeadliner: true },
    ])
    expect(getOrCreateBand).toHaveBeenCalledWith("The Rolling Stones", "user-1")
  })

  test("falls back to the city centroid when geocoding finds nothing", async () => {
    vi.mocked(getSetlistById).mockResolvedValue(
      setlist({ id: "abc123", eventDate: "11-07-1999" })
    )
    vi.mocked(searchVenues).mockResolvedValue([])

    const result = await buildCreateInputFromSetlist("abc123", "user-1")
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.input.latitude).toBe(51.556)
    expect(result.input.longitude).toBe(-0.2796)
  })

  test("returns MISSING_COORDINATES when neither geocoding nor centroid resolve", async () => {
    vi.mocked(getSetlistById).mockResolvedValue(
      setlist({
        id: "abc123",
        eventDate: "11-07-1999",
        venue: { name: "Tiny Club", city: { name: "Nowhere" } },
      })
    )
    vi.mocked(searchVenues).mockResolvedValue([])

    const result = await buildCreateInputFromSetlist("abc123", "user-1")
    expect(result).toEqual({ ok: false, code: "MISSING_COORDINATES" })
  })

  test("ignores unrelated photon hits that only match the word lake", async () => {
    vi.mocked(getSetlistById).mockResolvedValue(
      setlist({
        id: "lake-compounce",
        eventDate: "21-07-1989",
        artist: { name: "Milli Vanilli", mbid: "mbid-mv" },
        venue: {
          name: "Lake Compounce",
          city: {
            name: "Bristol",
            coords: { lat: 41.6717648, long: -72.9492703 },
            country: { code: "US", name: "United States" },
          },
        },
      })
    )
    vi.mocked(searchVenues).mockResolvedValue([
      {
        name: "Victory Lakes Clubhouse",
        displayName: "Bristow, VA",
        city: "Bristow",
        lat: 38.7589733,
        lon: -77.5661682,
      },
      {
        name: "Lake Compounce",
        displayName: "Bristol, CT",
        city: "Bristol",
        lat: 41.6388123,
        lon: -72.9227907,
      },
    ] as never)

    const result = await buildCreateInputFromSetlist("lake-compounce", "user-1")
    expect(searchVenues).toHaveBeenCalledWith("Lake Compounce", {
      lat: 41.6717648,
      lon: -72.9492703,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.input.latitude).toBe(41.6388123)
    expect(result.input.longitude).toBe(-72.9227907)
  })

  test("enriches newly created bands without cached images", async () => {
    vi.mocked(getSetlistById).mockResolvedValue(
      setlist({ id: "abc123", eventDate: "11-07-1999" })
    )
    vi.mocked(searchVenues).mockResolvedValue([
      {
        name: "Wembley Stadium",
        displayName: "Wembley, London",
        lat: 51.556,
        lon: -0.2796,
      },
    ] as never)
    vi.mocked(getOrCreateBand).mockResolvedValue({
      id: "band-1",
      name: "The Rolling Stones",
      slug: "the-rolling-stones",
      url: "/band/the-rolling-stones/",
      imageEnrichedAt: null,
    } as never)

    const result = await buildCreateInputFromSetlist("abc123", "user-1")
    expect(result.ok).toBe(true)
    expect(enrichBandData).toHaveBeenCalledWith("band-1", "The Rolling Stones")
  })
})
