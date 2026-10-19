import * as Sentry from "@sentry/nextjs"
import type { ParsedConcertQuery } from "@/types/concertAiSearch"
import type { SetlistSearchMeta } from "@/utils/setlistfm"

export type AiSearchNoResultReason =
  | "parse_failed"
  | "insufficient_anchors"
  | "fuzzy_missing_place"
  | "fuzzy_missing_date"
  | "setlist_unavailable"
  | "setlist_api_error"
  | "setlist_empty"
  | "setlist_filtered_empty"
  | "setlist_unparseable_dates"

/** Sanitized Setlist.fm query shape for analytics (no API keys). */
export interface AiSearchTelemetrySetlistParams {
  artistMbid?: string
  artistName?: string
  cityName?: string
  venueName?: string
  countryCode?: string
  tourName?: string
  years: number[] | null
}

export interface LogAiSearchNoResultPayload {
  reason: AiSearchNoResultReason
  prose: string
  parsed: ParsedConcertQuery | null
  hint: string
  fuzzy?: boolean
  setlistSearchParams?: AiSearchTelemetrySetlistParams
  setlistMeta?: SetlistSearchMeta
  rawSetlistCount?: number
  candidateCountBeforeFilter?: number
  candidateCountAfterFilter?: number
}

/**
 * Emit a Sentry message when AI concert search returns zero candidates.
 * Includes full prose for product-improvement analysis (see privacy policy).
 */
export function logAiSearchNoResult(payload: LogAiSearchNoResultPayload): void {
  const { reason, prose, parsed, hint } = payload

  Sentry.captureMessage("Concert AI search: no results", {
    level: "info",
    fingerprint: ["concert-ai-search-no-result", reason],
    tags: {
      "concert_ai_search.reason": reason,
    },
    extra: {
      prose,
      proseLength: prose.length,
      parsed,
      hint,
      fuzzy: payload.fuzzy ?? false,
      setlistSearchParams: payload.setlistSearchParams,
      setlistMeta: payload.setlistMeta,
      rawSetlistCount: payload.rawSetlistCount,
      candidateCountBeforeFilter: payload.candidateCountBeforeFilter,
      candidateCountAfterFilter: payload.candidateCountAfterFilter,
    },
  })
}
