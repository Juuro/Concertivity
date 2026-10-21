import * as Sentry from "@sentry/nextjs"
import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { getSubscriptionSummary } from "@/lib/paddle/entitlement"
import { syncBillingForUser } from "@/lib/paddle/subscription-sync"
import { paddleSyncBodySchema } from "@/lib/validations/paddle"
import { FEATURE_FLAGS, isFeatureEnabled } from "@/utils/featureFlags"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  if (!isFeatureEnabled(FEATURE_FLAGS.ENABLE_PAYWALL, false)) {
    return NextResponse.json({ error: "paywall_disabled" }, { status: 404 })
  }

  const session = await auth.api.getSession({
    headers: await headers(),
  })
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: unknown = {}
  try {
    const text = await request.text()
    if (text.trim()) {
      body = JSON.parse(text) as unknown
    }
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const parsed = paddleSyncBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }

  try {
    const synced = await syncBillingForUser(
      session.user.id,
      parsed.data.transactionId
    )
    const summary = await getSubscriptionSummary(session.user.id, {
      includePortalSession: false,
    })
    return NextResponse.json({ synced, subscription: summary })
  } catch (error) {
    Sentry.captureException(error)
    return NextResponse.json({ error: "sync_failed" }, { status: 502 })
  }
}
