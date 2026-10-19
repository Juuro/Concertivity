import * as Sentry from "@sentry/nextjs"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { isFeatureEnabled, FEATURE_FLAGS } from "@/utils/featureFlags"
import { createRateLimiter, clientIpFrom } from "@/lib/rateLimit"
import { searchConcertCandidates } from "@/lib/concerts/aiSearch"
import { MAX_PROSE_LENGTH } from "@/lib/concerts/aiParse"

export const dynamic = "force-dynamic"

// Per-user (primary) + per-IP (backstop) limits. Each call spends Groq tokens
// and Setlist.fm quota, so these are cost controls, not just abuse controls.
const userLimiter = createRateLimiter({ windowMs: 60_000, max: 10 })
const ipLimiter = createRateLimiter({ windowMs: 60_000, max: 20 })

const bodySchema = z
  .object({
    prose: z.string().trim().min(3, "Tell me a bit more").max(MAX_PROSE_LENGTH),
  })
  .strict()

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!isFeatureEnabled(FEATURE_FLAGS.ENABLE_CONCERT_AI_SEARCH, false)) {
    return NextResponse.json(
      { error: "Feature not available" },
      { status: 403 }
    )
  }

  if (
    !userLimiter.check(session.user.id) ||
    !ipLimiter.check(clientIpFrom(request.headers))
  ) {
    return NextResponse.json(
      { error: "Too many searches. Please slow down a moment." },
      { status: 429, headers: { "Retry-After": "60" } }
    )
  }

  let json: unknown
  try {
    json = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid input"
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  try {
    const result = await searchConcertCandidates(
      parsed.data.prose,
      session.user.id
    )
    return NextResponse.json(result)
  } catch (error) {
    // Never attach prose to exception reports; no-result telemetry is handled in
    // searchConcertCandidates (see aiSearchTelemetry).
    Sentry.captureException(error)
    console.error("Concert AI search failed")
    return NextResponse.json(
      { error: "Search is unavailable right now. Please use the form below." },
      { status: 503, headers: { "Retry-After": "30" } }
    )
  }
}
