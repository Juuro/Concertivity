/**
 * Utility module for interacting with Last.fm API
 */

import { LastFMArtist } from "lastfm-ts-api"
import { isFeatureEnabled, FEATURE_FLAGS } from "./featureFlags"
import type { LastFMArtistInfoOrNull } from "../types/lastfm"

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function getLastFmErrorCode(error: unknown): number | null {
  const message = getErrorMessage(error)
  // lastfm-ts-api formats as "... (Code 29)" when Last.fm returns an error code
  const match =
    message.match(/\(Code\s+(\d+)\)/i) ?? message.match(/Code\s+(\d+)/i)
  if (!match) return null
  const parsed = Number(match[1])
  return Number.isFinite(parsed) ? parsed : null
}

// Build-time cache to prevent duplicate API calls during static generation
const artistCache = new Map<string, LastFMArtistInfoOrNull>()
// Track pending requests to prevent duplicate concurrent calls
const pendingRequests = new Map<string, Promise<LastFMArtistInfoOrNull>>()
// Track rate limit errors with timestamps for retry logic
const rateLimitErrors = new Map<string, number>()
const MIN_REQUEST_INTERVAL = 1500 // be conservative to avoid hammering Last.fm
const RATE_LIMIT_RETRY_DELAY = 15000 // back off more aggressively after 429-like responses
const GLOBAL_RATE_LIMIT_COOLDOWN = 60000 // if we get rate-limited, pause all Last.fm calls for a while
const MAX_TIMEOUT_RETRIES = 1
const MAX_RATE_LIMIT_RETRIES = 1

let globalRateLimitUntil = 0
let lastGlobalRateLimitLogAt = 0

const MAX_CONCURRENT_REQUESTS = 2
let inFlightRequests = 0
const requestWaiters: Array<() => void> = []
let nextAllowedRequestAt = 0

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function acquireRequestSlot(): Promise<void> {
  if (inFlightRequests < MAX_CONCURRENT_REQUESTS) {
    inFlightRequests += 1
    return
  }
  await new Promise<void>((resolve) => requestWaiters.push(resolve))
  inFlightRequests += 1
}

function releaseRequestSlot(): void {
  inFlightRequests = Math.max(0, inFlightRequests - 1)
  const next = requestWaiters.shift()
  if (next) next()
}

async function waitForNextRequestWindow(): Promise<void> {
  const now = Date.now()
  if (now < nextAllowedRequestAt) {
    await sleep(nextAllowedRequestAt - now)
  }
  nextAllowedRequestAt = Date.now() + MIN_REQUEST_INTERVAL
}

/**
 * Fetch artist information from Last.fm
 */
export const getArtistInfo = async (
  artistName: string,
  retryCount = 0
): Promise<LastFMArtistInfoOrNull> => {
  // Check feature flag first - if disabled, return null immediately
  if (!isFeatureEnabled(FEATURE_FLAGS.ENABLE_LASTFM, true)) {
    return null
  }

  if (!process.env.LASTFM_API_KEY) {
    console.warn("Last.fm API key not configured, skipping artist info fetch")
    return null
  }

  if (!artistName.trim()) {
    return null
  }

  // Global circuit breaker: if we've recently been rate-limited, don't make any calls.
  if (Date.now() < globalRateLimitUntil) {
    // Avoid spamming logs.
    if (Date.now() - lastGlobalRateLimitLogAt > 10000) {
      lastGlobalRateLimitLogAt = Date.now()
      console.warn(
        `Last.fm calls paused due to recent rate limiting (cooldown ends in ${Math.max(0, globalRateLimitUntil - Date.now())}ms)`
      )
    }
    return null
  }

  // Normalize cache key
  const cacheKey = artistName.toLowerCase().trim()

  // Check cache first (prevents duplicate calls during build)
  if (artistCache.has(cacheKey)) {
    const cached = artistCache.get(cacheKey)
    // Return cached result, but if it's a rate limit error, check if we should retry
    if (cached === null && rateLimitErrors.has(cacheKey)) {
      const errorTime = rateLimitErrors.get(cacheKey)
      if (errorTime !== undefined) {
        const timeSinceError = Date.now() - errorTime
        if (timeSinceError < RATE_LIMIT_RETRY_DELAY) {
          // Still in cooldown period, return null
          return null
        }
        // Cooldown expired, clear error and retry
        rateLimitErrors.delete(cacheKey)
        artistCache.delete(cacheKey)
      }
    } else {
      return cached ?? null
    }
  }

  // Check if request is already pending (prevents duplicate concurrent calls)
  if (pendingRequests.has(cacheKey)) {
    return pendingRequests.get(cacheKey)!
  }

  // Create pending request promise
  const requestPromise = (async (): Promise<LastFMArtistInfoOrNull> => {
    await acquireRequestSlot()
    try {
      // Global circuit breaker (checked again inside slot to avoid races).
      if (Date.now() < globalRateLimitUntil) {
        return null
      }

      // Ensure we don't start requests too quickly, even with limited concurrency.
      await waitForNextRequestWindow()

      const apiKey = process.env.LASTFM_API_KEY!
      const secret = process.env.LASTFM_SECRET
      const artist = secret
        ? new LastFMArtist(apiKey, secret)
        : new LastFMArtist(apiKey)
      // In the version of lastfm-ts-api used in this repo, `getInfo` is typed as callback-based.
      // Passing a callback also changes what the returned Promise resolves to, so we wrap the
      // callback into our own Promise and await that instead.
      const data = await new Promise<any>((resolve, reject) => {
        artist.getInfo(
          { artist: artistName, autocorrect: 1 },
          (err: unknown, res: unknown) => {
            if (err) reject(err)
            else resolve(res)
          }
        )
      })

      if (!data || !data.artist) {
        console.warn("No Last.fm data found for %s", artistName)
        artistCache.set(cacheKey, null)
        return null
      }

      const artistData = data.artist

      // Extract image URLs - Last.fm returns images in different sizes
      // Handle both array format and object format
      const images = artistData.image || []
      const imageUrls = {
        small: null as string | null,
        medium: null as string | null,
        large: null as string | null,
        extralarge: null as string | null,
        mega: null as string | null,
      }

      if (Array.isArray(images)) {
        images.forEach((img: any) => {
          const size = img.size || (img["#text"] ? "medium" : null)
          const url = img["#text"] || img.url || null
          if (size && url) {
            if (size === "small") imageUrls.small = url
            else if (size === "medium") imageUrls.medium = url
            else if (size === "large") imageUrls.large = url
            else if (size === "extralarge") imageUrls.extralarge = url
            else if (size === "mega") imageUrls.mega = url
          }
        })
      }

      // Extract genres/tags
      const tags = artistData.tags?.tag || []
      const genres = Array.isArray(tags)
        ? tags.map((tag: any) => (typeof tag === "string" ? tag : tag.name))
        : []

      const result = {
        name: artistData.name,
        url: artistData.url,
        images: imageUrls,
        genres: genres,
        bio: artistData.bio?.summary || null,
      }

      // Cache successful response
      artistCache.set(cacheKey, result)
      return result
    } catch (error: any) {
      const message = getErrorMessage(error)
      const errorCode = getLastFmErrorCode(error)

      // Handle "artist not found" as a normal case
      if (
        errorCode === 6 ||
        errorCode === 7 ||
        /could not be found/i.test(message) ||
        /\bnot found\b/i.test(message)
      ) {
        // Cache null to prevent repeated API calls for missing artists
        artistCache.set(cacheKey, null)
        // Log as warning (not error) since this is expected behavior
        console.warn('Artist "%s" not found in Last.fm database', artistName)
        return null
      }

      // Invalid or suspended key: don't retry, but make it obvious why Last.fm is empty.
      if (errorCode === 10 || errorCode === 26) {
        console.warn(
          `Last.fm API key invalid/suspended (code ${errorCode}). Skipping artist info fetch for "%s".`,
          artistName
        )
        artistCache.set(cacheKey, null)
        return null
      }

      // Handle rate limit errors with retry logic
      if (errorCode === 29 || /rate\s*limit/i.test(message)) {
        const now = Date.now()

        if (retryCount < MAX_RATE_LIMIT_RETRIES) {
          // Compute backoff delay first so the global circuit breaker aligns with the retry window.
          const backoffDelay = Math.min(
            RATE_LIMIT_RETRY_DELAY * Math.pow(2, retryCount),
            60000
          )

          // Trip global circuit breaker for the duration of the backoff to avoid hammering the API.
          globalRateLimitUntil = Math.max(
            globalRateLimitUntil,
            now + backoffDelay
          )

          // Cache rate limit error with timestamp
          rateLimitErrors.set(cacheKey, now)
          artistCache.set(cacheKey, null)

          console.warn(
            `Last.fm rate limit exceeded for %s. Retrying after ${backoffDelay}ms...`,
            artistName
          )

          // Clear pending request before retrying
          pendingRequests.delete(cacheKey)

          await new Promise((resolve) => setTimeout(resolve, backoffDelay))

          // Retry the request (will create new pending request)
          return getArtistInfo(artistName, retryCount + 1)
        }

        // No more retries left: trip a longer global cooldown and return null.
        globalRateLimitUntil = Math.max(
          globalRateLimitUntil,
          now + GLOBAL_RATE_LIMIT_COOLDOWN
        )
        console.warn(
          "Last.fm rate limit exceeded for %s. Skipping to avoid clogging the API.",
          artistName
        )
        rateLimitErrors.set(cacheKey, now)
        artistCache.set(cacheKey, null)
        return null
      }

      // Handle timeout errors with retry
      if (
        error?.name === "AbortError" ||
        error.code === "ETIMEDOUT" ||
        /timeout/i.test(message) ||
        /timed out/i.test(message)
      ) {
        if (retryCount < MAX_TIMEOUT_RETRIES) {
          const retryDelay = 1000 * (retryCount + 1) // 1s, 2s, 3s
          console.warn(
            `Last.fm timeout for %s. Retrying after ${retryDelay}ms... (attempt ${retryCount + 1}/${MAX_TIMEOUT_RETRIES})`,
            artistName
          )

          // Clear pending request before retrying
          pendingRequests.delete(cacheKey)

          await new Promise((resolve) => setTimeout(resolve, retryDelay))

          // Retry the request (will create new pending request)
          return getArtistInfo(artistName, retryCount + 1)
        } else {
          console.error(
            `Last.fm timeout for %s after ${MAX_TIMEOUT_RETRIES} retries. Giving up.`,
            artistName
          )
          artistCache.set(cacheKey, null)
          return null
        }
      }

      // Log actual errors (network issues, API problems, etc.)
      console.error("Error fetching Last.fm data for %s:", artistName, error)
      artistCache.set(cacheKey, null)
      return null
    } finally {
      // Remove from pending requests
      pendingRequests.delete(cacheKey)
      releaseRequestSlot()
    }
  })()

  // Store pending request
  pendingRequests.set(cacheKey, requestPromise)

  return requestPromise
}

export interface LastFmArtistSearchHit {
  name: string
  listeners?: number
}

/**
 * Last.fm artist.search for autosuggest. Returns [] when disabled, rate-limited, or on error.
 */
export async function searchLastFmArtists(
  query: string,
  limit: number
): Promise<LastFmArtistSearchHit[]> {
  if (!isFeatureEnabled(FEATURE_FLAGS.ENABLE_LASTFM, true)) {
    return []
  }

  if (!process.env.LASTFM_API_KEY) {
    return []
  }

  const trimmed = query.trim()
  if (!trimmed || limit <= 0) {
    return []
  }

  if (Date.now() < globalRateLimitUntil) {
    return []
  }

  const safeLimit = Math.min(Math.max(limit, 1), 30)

  await acquireRequestSlot()
  try {
    if (Date.now() < globalRateLimitUntil) {
      return []
    }
    await waitForNextRequestWindow()

    const apiKey = process.env.LASTFM_API_KEY!
    const secret = process.env.LASTFM_SECRET
    const artist = secret
      ? new LastFMArtist(apiKey, secret)
      : new LastFMArtist(apiKey)

    const data = await new Promise<Record<string, unknown>>(
      (resolve, reject) => {
        artist.search(
          { artist: trimmed, limit: safeLimit },
          (err: unknown, res: unknown) => {
            if (err) reject(err)
            else resolve((res as Record<string, unknown>) ?? {})
          }
        )
      }
    )

    const results = data.results as Record<string, unknown> | undefined
    const matches = results?.artistmatches as
      | Record<string, unknown>
      | undefined
    const raw = matches?.artist

    if (!raw) {
      return []
    }

    const list = Array.isArray(raw) ? raw : [raw]

    return list
      .map((item): LastFmArtistSearchHit | null => {
        if (!item || typeof item !== "object") return null
        const o = item as Record<string, unknown>
        const name = typeof o.name === "string" ? o.name : null
        if (!name) return null
        const listenersRaw = o.listeners
        const listeners =
          typeof listenersRaw === "string"
            ? parseInt(listenersRaw, 10)
            : typeof listenersRaw === "number"
              ? listenersRaw
              : undefined
        return {
          name,
          listeners: Number.isFinite(listeners) ? listeners : undefined,
        }
      })
      .filter((x): x is LastFmArtistSearchHit => x !== null)
  } catch (error: unknown) {
    const errorCode = getLastFmErrorCode(error)
    if (errorCode === 29 || /rate\s*limit/i.test(getErrorMessage(error))) {
      globalRateLimitUntil = Math.max(
        globalRateLimitUntil,
        Date.now() + GLOBAL_RATE_LIMIT_COOLDOWN
      )
    }
    if (errorCode !== 6 && errorCode !== 7) {
      console.error('Last.fm artist.search error for "%s":', trimmed, error)
    }
    return []
  } finally {
    releaseRequestSlot()
  }
}
