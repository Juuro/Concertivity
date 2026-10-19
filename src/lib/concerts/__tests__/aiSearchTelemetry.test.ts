import { describe, test, expect, vi, beforeEach } from "vitest"

vi.mock("@sentry/nextjs", () => ({
  captureMessage: vi.fn(),
}))

import * as Sentry from "@sentry/nextjs"
import { logAiSearchNoResult } from "@/lib/concerts/aiSearchTelemetry"

describe("logAiSearchNoResult", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("captures message with prose, parsed fields, and fingerprint by reason", () => {
    logAiSearchNoResult({
      reason: "parse_failed",
      prose: "some vague memory",
      parsed: null,
      hint: "Nothing found.",
    })

    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      "Concert AI search: no results",
      expect.objectContaining({
        level: "info",
        fingerprint: ["concert-ai-search-no-result", "parse_failed"],
        tags: { "concert_ai_search.reason": "parse_failed" },
        extra: expect.objectContaining({
          prose: "some vague memory",
          proseLength: 17,
          parsed: null,
          hint: "Nothing found.",
          fuzzy: false,
        }),
      })
    )
  })

  test("includes setlist context when provided", () => {
    logAiSearchNoResult({
      reason: "setlist_empty",
      prose: "Metallica Berlin 1990",
      parsed: {
        artist: "Metallica",
        artistHints: null,
        city: "Berlin",
        venue: null,
        festival: null,
        countryCode: "DE",
        yearStart: 1990,
        yearEnd: 1990,
        season: null,
        month: null,
      },
      hint: "No matches",
      fuzzy: false,
      setlistSearchParams: {
        artistName: "Metallica",
        cityName: "Berlin",
        countryCode: "DE",
        years: [1990],
      },
      setlistMeta: {
        queries: 1,
        emptyCount: 1,
        errorCount: 0,
        unavailable: false,
        httpStatuses: [404],
      },
      rawSetlistCount: 0,
      candidateCountBeforeFilter: 0,
      candidateCountAfterFilter: 0,
    })

    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      "Concert AI search: no results",
      expect.objectContaining({
        tags: { "concert_ai_search.reason": "setlist_empty" },
        extra: expect.objectContaining({
          setlistSearchParams: expect.objectContaining({
            artistName: "Metallica",
            cityName: "Berlin",
          }),
          setlistMeta: expect.objectContaining({ emptyCount: 1 }),
          rawSetlistCount: 0,
        }),
      })
    )
  })
})
