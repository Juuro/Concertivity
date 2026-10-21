/**
 * Feature flags utility for Next.js
 *
 * Feature flags are controlled via environment variables.
 * For static generation, flags are evaluated at build time.
 *
 * Usage:
 *   import { isFeatureEnabled, FEATURE_FLAGS } from '@/utils/featureFlags'
 *
 *   if (isFeatureEnabled(FEATURE_FLAGS.ENABLE_LASTFM)) {
 *     // Last.fm feature code
 *   }
 */

/**
 * Parse boolean environment variable
 */
function parseBoolean(
  value: string | undefined,
  defaultValue = false
): boolean {
  if (value === undefined || value === null) {
    return defaultValue
  }
  const normalized = String(value).toLowerCase().trim()
  return normalized === "true" || normalized === "1" || normalized === "yes"
}

/**
 * Check if a feature flag is enabled
 * @param flagName - Name of the feature flag (env var name)
 * @param defaultValue - Default value if flag is not set
 * @returns boolean
 */
export function isFeatureEnabled(
  flagName: string,
  defaultValue = false
): boolean {
  // In Next.js, server-side env vars are available via process.env
  const value = process.env[flagName]
  return parseBoolean(value, defaultValue)
}

/**
 * Feature flag definitions (for documentation and type safety)
 */
export const FEATURE_FLAGS = {
  ENABLE_LASTFM: "ENABLE_LASTFM",
  ENABLE_GEOCODING: "ENABLE_GEOCODING",
  ENABLE_MUSICBRAINZ: "ENABLE_MUSICBRAINZ",
  ENABLE_EXTERNAL_BAND_SUGGEST: "ENABLE_EXTERNAL_BAND_SUGGEST",
  ENABLE_MAP_PAGE: "ENABLE_MAP_PAGE",
  ENABLE_STATISTICS_WIDGET: "ENABLE_STATISTICS_WIDGET",
  ENABLE_PAYWALL: "ENABLE_PAYWALL",
  // AI-assisted "help me remember" concert backfill (Groq parse + Setlist.fm search).
  // Gates both the API routes and the inline panel. Off by default (opt-in rollout).
  ENABLE_CONCERT_AI_SEARCH: "ENABLE_CONCERT_AI_SEARCH",
} as const
