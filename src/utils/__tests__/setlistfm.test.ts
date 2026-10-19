import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { SetlistfmArtist, SetlistfmSetlist } from "@/types/setlistfm"

const mockFetch = vi.fn()

function jsonResponse(
  status: number,
  body: unknown,
  statusText = status === 404 ? "Not Found" : "OK"
) {
  return {
    status,
    statusText,
    ok: status >= 200 && status < 300,
    json: vi.fn().mockResolvedValue(body),
  }
}

const sampleSetlist: SetlistfmSetlist = {
  id: "abc123",
  eventDate: "01-06-2020",
  artist: { name: "Radiohead", mbid: "mbid-1" },
  venue: { name: "Arena", city: { name: "Berlin", country: { code: "DE" } } },
}

const sampleArtist: SetlistfmArtist = {
  name: "Radiohead",
  mbid: "mbid-1",
}

async function loadSetlistfm() {
  vi.resetModules()
  vi.stubGlobal("fetch", mockFetch)
  return import("../setlistfm")
}

function stubAvailableEnv() {
  vi.stubEnv("ENABLE_CONCERT_AI_SEARCH", "true")
  vi.stubEnv("SETLISTFM_API_KEY", "test-setlist-key")
}

describe("setlistfm", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.unstubAllEnvs()
    mockFetch.mockReset()
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.mocked(console.warn).mockRestore()
    vi.mocked(console.error).mockRestore()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  describe("mergeSetlistSearchMeta", () => {
    it("test_mergeSetlistSearchMeta_combines_counters_and_statuses", async () => {
      const { mergeSetlistSearchMeta, EMPTY_SETLIST_SEARCH_META } =
        await loadSetlistfm()

      const merged = mergeSetlistSearchMeta(
        {
          queries: 2,
          emptyCount: 1,
          errorCount: 0,
          unavailable: false,
          httpStatuses: [200, 404],
        },
        {
          queries: 1,
          emptyCount: 0,
          errorCount: 1,
          unavailable: true,
          httpStatuses: [500],
        }
      )

      expect(merged).toEqual({
        queries: 3,
        emptyCount: 1,
        errorCount: 1,
        unavailable: true,
        httpStatuses: [200, 404, 500],
      })
      expect(EMPTY_SETLIST_SEARCH_META).toEqual({
        queries: 0,
        emptyCount: 0,
        errorCount: 0,
        unavailable: false,
        httpStatuses: [],
      })
    })
  })

  describe("searchSetlistsWithMeta", () => {
    it("test_searchSetlistsWithMeta_when_feature_disabled_marks_unavailable", async () => {
      const { searchSetlistsWithMeta } = await loadSetlistfm()
      vi.stubEnv("ENABLE_CONCERT_AI_SEARCH", "false")
      vi.stubEnv("SETLISTFM_API_KEY", "key")

      const result = await searchSetlistsWithMeta({ artistName: "Radiohead" })

      expect(result).toEqual({
        setlists: [],
        meta: {
          queries: 0,
          emptyCount: 0,
          errorCount: 0,
          unavailable: true,
          httpStatuses: [],
        },
      })
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it("test_searchSetlistsWithMeta_when_api_key_missing_marks_unavailable", async () => {
      const { searchSetlistsWithMeta } = await loadSetlistfm()
      vi.stubEnv("ENABLE_CONCERT_AI_SEARCH", "true")
      delete process.env.SETLISTFM_API_KEY

      const result = await searchSetlistsWithMeta({ artistName: "Radiohead" })

      expect(result.meta.unavailable).toBe(true)
      expect(result.setlists).toEqual([])
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it("test_searchSetlistsWithMeta_with_no_search_params_returns_empty_meta", async () => {
      const { searchSetlistsWithMeta, EMPTY_SETLIST_SEARCH_META } =
        await loadSetlistfm()
      stubAvailableEnv()

      const result = await searchSetlistsWithMeta({})

      expect(result).toEqual({
        setlists: [],
        meta: EMPTY_SETLIST_SEARCH_META,
      })
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it("test_searchSetlistsWithMeta_success_returns_setlists_and_meta", async () => {
      const { searchSetlistsWithMeta } = await loadSetlistfm()
      stubAvailableEnv()
      mockFetch.mockResolvedValueOnce(
        jsonResponse(200, { setlist: [sampleSetlist] })
      )

      const result = await searchSetlistsWithMeta({
        artistName: "Radiohead",
        year: 2020,
        cityName: "Berlin",
      })

      expect(result.setlists).toEqual([sampleSetlist])
      expect(result.meta).toEqual({
        queries: 1,
        emptyCount: 0,
        errorCount: 0,
        unavailable: false,
        httpStatuses: [200],
      })
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("artistName=Radiohead"),
        expect.objectContaining({
          headers: expect.objectContaining({
            "x-api-key": "test-setlist-key",
          }),
        })
      )
    })

    it("test_searchSetlistsWithMeta_prefers_artist_mbid_over_name", async () => {
      const { searchSetlistsWithMeta } = await loadSetlistfm()
      stubAvailableEnv()
      mockFetch.mockResolvedValueOnce(jsonResponse(200, { setlist: [] }))

      await searchSetlistsWithMeta({
        artistMbid: "mbid-1",
        artistName: "Ignored",
        venueName: "Arena",
        countryCode: "DE",
        tourName: "Tour",
      })

      const url = mockFetch.mock.calls[0]?.[0] as string
      expect(url).toContain("artistMbid=mbid-1")
      expect(url).not.toContain("artistName=")
      expect(url).toContain("venueName=Arena")
      expect(url).toContain("countryCode=DE")
      expect(url).toContain("tourName=Tour")
    })

    it("test_searchSetlistsWithMeta_success_with_empty_results_sets_empty_count", async () => {
      const { searchSetlistsWithMeta } = await loadSetlistfm()
      stubAvailableEnv()
      mockFetch.mockResolvedValueOnce(jsonResponse(200, { setlist: [] }))

      const result = await searchSetlistsWithMeta({ artistName: "Nobody" })

      expect(result.setlists).toEqual([])
      expect(result.meta.emptyCount).toBe(1)
    })

    it("test_searchSetlistsWithMeta_normalizes_single_setlist_object", async () => {
      const { searchSetlistsWithMeta } = await loadSetlistfm()
      stubAvailableEnv()
      mockFetch.mockResolvedValueOnce(
        jsonResponse(200, { setlist: sampleSetlist })
      )

      const result = await searchSetlistsWithMeta({ artistName: "Radiohead" })

      expect(result.setlists).toEqual([sampleSetlist])
    })

    it("test_searchSetlistsWithMeta_not_found_sets_empty_count", async () => {
      const { searchSetlistsWithMeta } = await loadSetlistfm()
      stubAvailableEnv()
      mockFetch.mockResolvedValueOnce(jsonResponse(404, null))

      const result = await searchSetlistsWithMeta({ artistName: "Missing" })

      expect(result.setlists).toEqual([])
      expect(result.meta).toEqual({
        queries: 1,
        emptyCount: 1,
        errorCount: 0,
        unavailable: false,
        httpStatuses: [404],
      })
    })

    it("test_searchSetlistsWithMeta_http_error_increments_error_count", async () => {
      const { searchSetlistsWithMeta } = await loadSetlistfm()
      stubAvailableEnv()
      mockFetch.mockResolvedValueOnce(jsonResponse(500, null, "Server Error"))

      const result = await searchSetlistsWithMeta({ artistName: "Broken" })

      expect(result.setlists).toEqual([])
      expect(result.meta.errorCount).toBe(1)
      expect(result.meta.httpStatuses).toEqual([500])
      expect(console.error).toHaveBeenCalled()
    })

    it("test_searchSetlistsWithMeta_network_failure_increments_error_count", async () => {
      const { searchSetlistsWithMeta } = await loadSetlistfm()
      stubAvailableEnv()
      mockFetch.mockRejectedValueOnce(new Error("network down"))

      const result = await searchSetlistsWithMeta({ artistName: "Offline" })

      expect(result.setlists).toEqual([])
      expect(result.meta.errorCount).toBe(1)
      expect(result.meta.httpStatuses).toEqual([])
      expect(console.error).toHaveBeenCalled()
    })

    it("test_searchSetlistsWithMeta_cached_hit_skips_network", async () => {
      const { searchSetlistsWithMeta } = await loadSetlistfm()
      stubAvailableEnv()
      mockFetch.mockResolvedValue(
        jsonResponse(200, { setlist: [sampleSetlist] })
      )

      const first = await searchSetlistsWithMeta({ artistName: "Radiohead" })
      const second = await searchSetlistsWithMeta({ artistName: "Radiohead" })

      expect(first.setlists).toEqual([sampleSetlist])
      expect(second.setlists).toEqual([sampleSetlist])
      expect(second.meta.queries).toBe(0)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it("test_searchSetlistsWithMeta_dedupes_concurrent_requests", async () => {
      const { searchSetlistsWithMeta } = await loadSetlistfm()
      stubAvailableEnv()
      mockFetch.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            setTimeout(
              () => resolve(jsonResponse(200, { setlist: [sampleSetlist] })),
              20
            )
          })
      )

      const p1 = searchSetlistsWithMeta({ artistName: "Radiohead" })
      const p2 = searchSetlistsWithMeta({ artistName: "Radiohead" })
      const [r1, r2] = await Promise.all([p1, p2])

      expect(r1.setlists).toEqual([sampleSetlist])
      expect(r2.setlists).toEqual([sampleSetlist])
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it("test_searchSetlistsWithMeta_does_not_cache_failures", async () => {
      const { searchSetlistsWithMeta } = await loadSetlistfm()
      stubAvailableEnv()
      mockFetch
        .mockResolvedValueOnce(jsonResponse(500, null, "Server Error"))
        .mockResolvedValueOnce(jsonResponse(200, { setlist: [sampleSetlist] }))

      const first = await searchSetlistsWithMeta({ artistName: "Retry Band" })
      const second = await searchSetlistsWithMeta({ artistName: "Retry Band" })

      expect(first.meta.errorCount).toBe(1)
      expect(second.setlists).toEqual([sampleSetlist])
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it("test_searchSetlistsWithMeta_rate_limit_retry_then_success", async () => {
      const { searchSetlistsWithMeta } = await loadSetlistfm()
      vi.useFakeTimers()
      stubAvailableEnv()
      mockFetch
        .mockResolvedValueOnce(jsonResponse(429, null))
        .mockResolvedValueOnce(jsonResponse(200, { setlist: [sampleSetlist] }))

      const promise = searchSetlistsWithMeta({ artistName: "Rate Band" })
      await vi.advanceTimersByTimeAsync(2500)
      const result = await promise

      expect(result.setlists).toEqual([sampleSetlist])
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it("test_searchSetlistsWithMeta_rate_limit_after_retry_opens_circuit", async () => {
      const { searchSetlistsWithMeta } = await loadSetlistfm()
      vi.useFakeTimers()
      stubAvailableEnv()
      mockFetch
        .mockResolvedValueOnce(jsonResponse(429, null))
        .mockResolvedValueOnce(jsonResponse(429, null))

      const promise = searchSetlistsWithMeta({ artistName: "Limited" })
      await vi.advanceTimersByTimeAsync(2500)
      const result = await promise

      expect(result.meta.errorCount).toBe(1)
      expect(result.meta.httpStatuses).toEqual([429])
      expect(console.warn).toHaveBeenCalled()

      mockFetch.mockClear()
      const blocked = await searchSetlistsWithMeta({ artistName: "Blocked" })
      expect(blocked.meta.unavailable).toBe(true)
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it("test_searchSetlistsWithMeta_forbidden_opens_circuit", async () => {
      const { searchSetlistsWithMeta } = await loadSetlistfm()
      stubAvailableEnv()
      mockFetch.mockResolvedValueOnce(jsonResponse(403, null, "Forbidden"))

      const result = await searchSetlistsWithMeta({ artistName: "Forbidden" })

      expect(result.meta.errorCount).toBe(1)
      expect(result.meta.httpStatuses).toEqual([403])
      expect(console.warn).toHaveBeenCalled()
    })

    it("test_searchSetlistsWithMeta_parse_error_increments_error_count", async () => {
      const { searchSetlistsWithMeta } = await loadSetlistfm()
      stubAvailableEnv()
      mockFetch.mockResolvedValueOnce({
        status: 200,
        statusText: "OK",
        ok: true,
        json: vi.fn().mockRejectedValue(new Error("invalid json")),
      })

      const result = await searchSetlistsWithMeta({ artistName: "Bad Json" })

      expect(result.meta.errorCount).toBe(1)
      expect(console.error).toHaveBeenCalled()
    })
  })

  describe("searchSetlists", () => {
    it("test_searchSetlists_returns_setlists_from_meta_wrapper", async () => {
      const { searchSetlists } = await loadSetlistfm()
      stubAvailableEnv()
      mockFetch.mockResolvedValueOnce(
        jsonResponse(200, { setlist: [sampleSetlist] })
      )

      await expect(
        searchSetlists({ artistName: "Radiohead" })
      ).resolves.toEqual([sampleSetlist])
    })
  })

  describe("searchArtists", () => {
    it("test_searchArtists_when_unavailable_returns_empty", async () => {
      const { searchArtists } = await loadSetlistfm()
      vi.stubEnv("ENABLE_CONCERT_AI_SEARCH", "false")

      await expect(searchArtists("Radiohead")).resolves.toEqual([])
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it("test_searchArtists_blank_name_returns_empty", async () => {
      const { searchArtists } = await loadSetlistfm()
      stubAvailableEnv()

      await expect(searchArtists("   ")).resolves.toEqual([])
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it("test_searchArtists_success_returns_artists", async () => {
      const { searchArtists } = await loadSetlistfm()
      stubAvailableEnv()
      mockFetch.mockResolvedValueOnce(
        jsonResponse(200, { artist: [sampleArtist] })
      )

      await expect(searchArtists("Radiohead")).resolves.toEqual([sampleArtist])
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("artistName=Radiohead"),
        expect.any(Object)
      )
    })

    it("test_searchArtists_normalizes_single_artist_object", async () => {
      const { searchArtists } = await loadSetlistfm()
      stubAvailableEnv()
      mockFetch.mockResolvedValueOnce(
        jsonResponse(200, { artist: sampleArtist })
      )

      await expect(searchArtists("Radiohead")).resolves.toEqual([sampleArtist])
    })

    it("test_searchArtists_cache_hit_skips_network", async () => {
      const { searchArtists } = await loadSetlistfm()
      stubAvailableEnv()
      mockFetch.mockResolvedValue(jsonResponse(200, { artist: [sampleArtist] }))

      await searchArtists("Radiohead")
      await searchArtists(" radiohead ")

      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it("test_searchArtists_dedupes_concurrent_requests", async () => {
      const { searchArtists } = await loadSetlistfm()
      stubAvailableEnv()
      mockFetch.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            setTimeout(
              () => resolve(jsonResponse(200, { artist: [sampleArtist] })),
              20
            )
          })
      )

      const [r1, r2] = await Promise.all([
        searchArtists("Radiohead"),
        searchArtists("radiohead"),
      ])

      expect(r1).toEqual([sampleArtist])
      expect(r2).toEqual([sampleArtist])
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it("test_searchArtists_failure_returns_empty_and_is_not_cached", async () => {
      const { searchArtists } = await loadSetlistfm()
      stubAvailableEnv()
      mockFetch
        .mockResolvedValueOnce(jsonResponse(500, null, "Server Error"))
        .mockResolvedValueOnce(jsonResponse(200, { artist: [sampleArtist] }))

      await expect(searchArtists("Retry Artist")).resolves.toEqual([])
      await expect(searchArtists("Retry Artist")).resolves.toEqual([
        sampleArtist,
      ])
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
  })

  describe("getSetlistById", () => {
    it("test_getSetlistById_when_unavailable_returns_null", async () => {
      const { getSetlistById } = await loadSetlistfm()
      vi.stubEnv("ENABLE_CONCERT_AI_SEARCH", "false")

      await expect(getSetlistById("abc123")).resolves.toBeNull()
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it("test_getSetlistById_blank_id_returns_null", async () => {
      const { getSetlistById } = await loadSetlistfm()
      stubAvailableEnv()

      await expect(getSetlistById("   ")).resolves.toBeNull()
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it("test_getSetlistById_success_returns_setlist", async () => {
      const { getSetlistById } = await loadSetlistfm()
      stubAvailableEnv()
      mockFetch.mockResolvedValueOnce(jsonResponse(200, sampleSetlist))

      await expect(getSetlistById("abc123")).resolves.toEqual(sampleSetlist)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/setlist/abc123"),
        expect.any(Object)
      )
    })

    it("test_getSetlistById_encodes_special_characters", async () => {
      const { getSetlistById } = await loadSetlistfm()
      stubAvailableEnv()
      mockFetch.mockResolvedValueOnce(jsonResponse(200, sampleSetlist))

      await getSetlistById("id/with space")
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/setlist/id%2Fwith%20space"),
        expect.any(Object)
      )
    })

    it("test_getSetlistById_not_found_returns_null", async () => {
      const { getSetlistById } = await loadSetlistfm()
      stubAvailableEnv()
      mockFetch.mockResolvedValueOnce(jsonResponse(404, null))

      await expect(getSetlistById("missing")).resolves.toBeNull()
    })

    it("test_getSetlistById_cache_hit_skips_network", async () => {
      const { getSetlistById } = await loadSetlistfm()
      stubAvailableEnv()
      mockFetch.mockResolvedValue(jsonResponse(200, sampleSetlist))

      await getSetlistById("abc123")
      await getSetlistById("abc123")

      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it("test_getSetlistById_dedupes_concurrent_requests", async () => {
      const { getSetlistById } = await loadSetlistfm()
      stubAvailableEnv()
      mockFetch.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(jsonResponse(200, sampleSetlist)), 20)
          })
      )

      const [r1, r2] = await Promise.all([
        getSetlistById("abc123"),
        getSetlistById("abc123"),
      ])

      expect(r1).toEqual(sampleSetlist)
      expect(r2).toEqual(sampleSetlist)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it("test_getSetlistById_does_not_cache_not_found", async () => {
      const { getSetlistById } = await loadSetlistfm()
      stubAvailableEnv()
      mockFetch
        .mockResolvedValueOnce(jsonResponse(404, null))
        .mockResolvedValueOnce(jsonResponse(200, sampleSetlist))

      await expect(getSetlistById("maybe")).resolves.toBeNull()
      await expect(getSetlistById("maybe")).resolves.toEqual(sampleSetlist)
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
  })
})
