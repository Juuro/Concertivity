/**
 * Setlist.fm REST API client (rest/1.0).
 *
 * House style (mirrors src/utils/photon.ts and src/utils/lastfm.ts):
 * - API key read from env at call time; missing key -> graceful null/[].
 * - Single-file request pacing for the free-tier 2 req/sec limit
 *   (reserve the next slot BEFORE awaiting — the photon DA2 race fix).
 * - Global circuit breaker on HTTP 429/403.
 * - AbortController timeout; never throws across the boundary (returns null/[]).
 * - In-memory TTL cache of SUCCESSFUL responses only (failures are not cached,
 *   so a transient 429 never pins "nothing found" for the cache window).
 */

import { isFeatureEnabled, FEATURE_FLAGS } from "@/utils/featureFlags"
import type {
  SetlistfmArtist,
  SetlistfmSearchArtistsResponse,
  SetlistfmSearchSetlistsResponse,
  SetlistfmSetlist,
} from "@/types/setlistfm"

const BASE_URL = "https://api.setlist.fm/rest/1.0"
const USER_AGENT = "Concertivity/1.0 (https://github.com/Juuro/Concertivity)"
const MIN_REQUEST_INTERVAL = 600 // ms — safely under Setlist.fm's 2 req/s cap
const TIMEOUT_MS = 8000
const CIRCUIT_COOLDOWN_MS = 60_000
const RATE_LIMIT_RETRY_DELAY_MS = 1500

const SEARCH_TTL_MS = 10 * 60 * 1000 // setlists are historical; cache 10 min
const SETLIST_TTL_MS = 60 * 60 * 1000 // a single setlist is effectively immutable
const MAX_CACHE_ENTRIES = 500

let nextAvailableAt = 0
let circuitOpenUntil = 0
/** Serializes pacing so concurrent callers cannot burst past the rate limit. */
let paceQueue: Promise<void> = Promise.resolve()

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

function makeCache<T>() {
  const map = new Map<string, CacheEntry<T>>()
  return {
    get(key: string): T | undefined {
      const entry = map.get(key)
      if (!entry) return undefined
      if (entry.expiresAt < Date.now()) {
        map.delete(key)
        return undefined
      }
      return entry.value
    },
    set(key: string, value: T, ttl: number): void {
      if (map.size >= MAX_CACHE_ENTRIES) map.clear()
      map.set(key, { value, expiresAt: Date.now() + ttl })
    },
  }
}

const searchCache = makeCache<SetlistfmSetlist[]>()
const artistCache = makeCache<SetlistfmArtist[]>()
const setlistCache = makeCache<SetlistfmSetlist | null>()

interface SetlistSearchWithMetaResult {
  setlists: SetlistfmSetlist[]
  meta: SetlistSearchMeta
}

const pendingSearch = new Map<string, Promise<SetlistSearchWithMetaResult>>()
const pendingArtists = new Map<string, Promise<SetlistfmArtist[]>>()
const pendingSetlist = new Map<string, Promise<SetlistfmSetlist | null>>()

export type SetlistfmErrorKind =
  | "rate_limit"
  | "forbidden"
  | "http"
  | "network"
  | "parse"
  | "missing_key"
  | "feature_disabled"
  | "circuit_open"

export type SetlistfmOutcome =
  | { kind: "success"; httpStatus: number }
  | { kind: "not_found"; httpStatus: 404 }
  | {
      kind: "error"
      httpStatus: number | null
      errorKind: SetlistfmErrorKind
    }
  | {
      kind: "unavailable"
      errorKind: "missing_key" | "feature_disabled" | "circuit_open"
    }

export interface SetlistSearchMeta {
  queries: number
  emptyCount: number
  errorCount: number
  unavailable: boolean
  httpStatuses: number[]
}

export const EMPTY_SETLIST_SEARCH_META: SetlistSearchMeta = {
  queries: 0,
  emptyCount: 0,
  errorCount: 0,
  unavailable: false,
  httpStatuses: [],
}

function getUnavailableReason():
  | "missing_key"
  | "feature_disabled"
  | "circuit_open"
  | null {
  if (!isFeatureEnabled(FEATURE_FLAGS.ENABLE_CONCERT_AI_SEARCH, false)) {
    return "feature_disabled"
  }
  if (!process.env.SETLISTFM_API_KEY) return "missing_key"
  if (Date.now() < circuitOpenUntil) return "circuit_open"
  return null
}

function isAvailable(): boolean {
  return getUnavailableReason() === null
}

/** Merge Setlist.fm call metadata across multiple year-scoped queries. */
export function mergeSetlistSearchMeta(
  a: SetlistSearchMeta,
  b: SetlistSearchMeta
): SetlistSearchMeta {
  return {
    queries: a.queries + b.queries,
    emptyCount: a.emptyCount + b.emptyCount,
    errorCount: a.errorCount + b.errorCount,
    unavailable: a.unavailable || b.unavailable,
    httpStatuses: [...a.httpStatuses, ...b.httpStatuses],
  }
}

function metaFromOutcome(outcome: SetlistfmOutcome): SetlistSearchMeta {
  if (outcome.kind === "unavailable") {
    return {
      queries: 0,
      emptyCount: 0,
      errorCount: 0,
      unavailable: true,
      httpStatuses: [],
    }
  }

  if (outcome.kind === "success") {
    return {
      queries: 1,
      emptyCount: 0,
      errorCount: 0,
      unavailable: false,
      httpStatuses: [outcome.httpStatus],
    }
  }

  if (outcome.kind === "not_found") {
    return {
      queries: 1,
      emptyCount: 1,
      errorCount: 0,
      unavailable: false,
      httpStatuses: [outcome.httpStatus],
    }
  }

  return {
    queries: 1,
    emptyCount: 0,
    errorCount: 1,
    unavailable: false,
    httpStatuses: outcome.httpStatus != null ? [outcome.httpStatus] : [],
  }
}

function metaFromCachedHit(setlistCount: number): SetlistSearchMeta {
  return {
    queries: 0,
    emptyCount: setlistCount === 0 ? 1 : 0,
    errorCount: 0,
    unavailable: false,
    httpStatuses: [],
  }
}

async function pace(): Promise<void> {
  const turn = paceQueue.then(async () => {
    const now = Date.now()
    const waitMs = Math.max(0, nextAvailableAt - now)
    nextAvailableAt = now + waitMs + MIN_REQUEST_INTERVAL
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs))
    }
  })
  paceQueue = turn.catch(() => undefined)
  await turn
}

/** Setlist.fm sometimes returns a single object instead of a one-element array. */
function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

/**
 * Perform a single GET against Setlist.fm.
 * Returns the response on success, or `null` on network/timeout failure.
 */
async function fetchSetlistfm(
  path: string,
  url: string,
  apiKey: string
): Promise<Response | null> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    return await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "x-api-key": apiKey,
        "User-Agent": USER_AGENT,
      },
      signal: controller.signal,
    })
  } catch (error) {
    console.error(`Setlist.fm fetch failed for ${path}:`, error)
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}

async function setlistfmGet<T>(
  path: string,
  search?: URLSearchParams
): Promise<{ data: T | null; outcome: SetlistfmOutcome }> {
  const unavailable = getUnavailableReason()
  if (unavailable) {
    if (unavailable === "missing_key") {
      console.warn(
        "SETLISTFM_API_KEY not configured; Setlist.fm lookups disabled"
      )
    }
    return {
      data: null,
      outcome: { kind: "unavailable", errorKind: unavailable },
    }
  }

  const apiKey = process.env.SETLISTFM_API_KEY!
  const qs = search?.toString()
  const url = qs ? `${BASE_URL}${path}?${qs}` : `${BASE_URL}${path}`

  await pace()
  let res = await fetchSetlistfm(path, url, apiKey)
  if (!res) {
    return {
      data: null,
      outcome: {
        kind: "error",
        httpStatus: null,
        errorKind: "network",
      },
    }
  }

  if (res.status === 429) {
    await new Promise((resolve) =>
      setTimeout(resolve, RATE_LIMIT_RETRY_DELAY_MS)
    )
    await pace()
    res = await fetchSetlistfm(path, url, apiKey)
    if (!res) {
      return {
        data: null,
        outcome: {
          kind: "error",
          httpStatus: 429,
          errorKind: "network",
        },
      }
    }
  }

  if (res.status === 429) {
    circuitOpenUntil = Date.now() + CIRCUIT_COOLDOWN_MS
    console.warn(
      `Setlist.fm rate limit (${res.status}); circuit open for ${CIRCUIT_COOLDOWN_MS}ms`
    )
    return {
      data: null,
      outcome: {
        kind: "error",
        httpStatus: res.status,
        errorKind: "rate_limit",
      },
    }
  }

  if (res.status === 403) {
    circuitOpenUntil = Date.now() + CIRCUIT_COOLDOWN_MS
    console.warn(
      `Setlist.fm forbidden (${res.status}); circuit open for ${CIRCUIT_COOLDOWN_MS}ms`
    )
    return {
      data: null,
      outcome: {
        kind: "error",
        httpStatus: res.status,
        errorKind: "forbidden",
      },
    }
  }

  if (res.status === 404) {
    return {
      data: null,
      outcome: { kind: "not_found", httpStatus: 404 },
    }
  }

  if (!res.ok) {
    console.error(`Setlist.fm request failed: ${res.status} ${res.statusText}`)
    return {
      data: null,
      outcome: {
        kind: "error",
        httpStatus: res.status,
        errorKind: "http",
      },
    }
  }

  try {
    const data = (await res.json()) as T
    return {
      data,
      outcome: { kind: "success", httpStatus: res.status },
    }
  } catch (error) {
    console.error("Failed to parse Setlist.fm response:", error)
    return {
      data: null,
      outcome: {
        kind: "error",
        httpStatus: res.status,
        errorKind: "parse",
      },
    }
  }
}

export interface SetlistSearchParams {
  artistName?: string
  artistMbid?: string
  cityName?: string
  venueName?: string
  countryCode?: string
  tourName?: string
  year?: number
}

function buildSearchParams(params: SetlistSearchParams): URLSearchParams {
  const search = new URLSearchParams()
  if (params.artistMbid) search.set("artistMbid", params.artistMbid)
  else if (params.artistName) search.set("artistName", params.artistName)
  if (params.cityName) search.set("cityName", params.cityName)
  if (params.venueName) search.set("venueName", params.venueName)
  if (params.countryCode) search.set("countryCode", params.countryCode)
  if (params.tourName) search.set("tourName", params.tourName)
  if (params.year) search.set("year", String(params.year))
  return search
}

/**
 * Search setlists (page 1) with call-outcome metadata for AI search telemetry.
 * Returns `[]` on no-match OR failure at the setlist level; see `meta` for why.
 */
export async function searchSetlistsWithMeta(
  params: SetlistSearchParams
): Promise<SetlistSearchWithMetaResult> {
  const unavailable = getUnavailableReason()
  if (unavailable) {
    return {
      setlists: [],
      meta: {
        queries: 0,
        emptyCount: 0,
        errorCount: 0,
        unavailable: true,
        httpStatuses: [],
      },
    }
  }

  const search = buildSearchParams(params)
  const key = search.toString()
  if (!key) {
    return { setlists: [], meta: EMPTY_SETLIST_SEARCH_META }
  }

  const cached = searchCache.get(key)
  if (cached) {
    return {
      setlists: cached,
      meta: metaFromCachedHit(cached.length),
    }
  }

  const inflight = pendingSearch.get(key)
  if (inflight) return inflight

  const promise = (async (): Promise<SetlistSearchWithMetaResult> => {
    const { data, outcome } =
      await setlistfmGet<SetlistfmSearchSetlistsResponse>(
        "/search/setlists",
        search
      )
    const setlists = asArray(data?.setlist)
    if (outcome.kind === "success") {
      searchCache.set(key, setlists, SEARCH_TTL_MS)
    }
    const meta = metaFromOutcome(outcome)
    if (outcome.kind === "success" && setlists.length === 0) {
      meta.emptyCount = 1
    }
    return { setlists, meta }
  })()

  pendingSearch.set(key, promise)
  try {
    return await promise
  } finally {
    pendingSearch.delete(key)
  }
}

/**
 * Search setlists (page 1). Returns `[]` on no-match OR failure (callers can't
 * distinguish, by design — both mean "nothing to show"). Successful responses
 * are cached for 10 minutes; failures are not cached.
 */
export async function searchSetlists(
  params: SetlistSearchParams
): Promise<SetlistfmSetlist[]> {
  return (await searchSetlistsWithMeta(params)).setlists
}

/**
 * Resolve an artist name to MBID candidates (relevance-sorted). Used to pin
 * searches by `artistMbid` so a name query doesn't return unrelated artists.
 */
export async function searchArtists(
  artistName: string
): Promise<SetlistfmArtist[]> {
  if (!isAvailable()) return []
  const trimmed = artistName.trim()
  if (!trimmed) return []

  const key = trimmed.toLowerCase()
  const cached = artistCache.get(key)
  if (cached) return cached

  const inflight = pendingArtists.get(key)
  if (inflight) return inflight

  const search = new URLSearchParams({ artistName: trimmed, sort: "relevance" })
  const promise = (async () => {
    const { data, outcome } =
      await setlistfmGet<SetlistfmSearchArtistsResponse>(
        "/search/artists",
        search
      )
    const artists = asArray(data?.artist)
    if (outcome.kind === "success") {
      artistCache.set(key, artists, SEARCH_TTL_MS)
    }
    return artists
  })()

  pendingArtists.set(key, promise)
  try {
    return await promise
  } finally {
    pendingArtists.delete(key)
  }
}

/**
 * Authoritative single-setlist fetch by id — used by the one-click add flow so
 * the concert is created from fresh server-side data, never a stale client
 * payload. Returns `null` on not-found or failure.
 */
export async function getSetlistById(
  setlistId: string
): Promise<SetlistfmSetlist | null> {
  if (!isAvailable()) return null
  const id = setlistId.trim()
  if (!id) return null

  const cached = setlistCache.get(id)
  if (cached !== undefined) return cached

  const inflight = pendingSetlist.get(id)
  if (inflight) return inflight

  const promise = (async () => {
    const { data, outcome } = await setlistfmGet<SetlistfmSetlist>(
      `/setlist/${encodeURIComponent(id)}`
    )
    if (outcome.kind === "success" && data) {
      setlistCache.set(id, data, SETLIST_TTL_MS)
    }
    return data
  })()

  pendingSetlist.set(id, promise)
  try {
    return await promise
  } finally {
    pendingSetlist.delete(id)
  }
}
