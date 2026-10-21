import * as Sentry from "@sentry/nextjs"
import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { runPaddleReconciliation } from "@/lib/paddle/reconcile"

export const runtime = "nodejs"

function timingSafeBearerMatch(header: string | null, secret: string): boolean {
  if (!header || !header.startsWith("Bearer ")) return false
  const token = header.slice("Bearer ".length)
  const a = Buffer.from(token)
  const b = Buffer.from(secret)
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 503 }
    )
  }

  const authHeader = request.headers.get("authorization")
  if (!timingSafeBearerMatch(authHeader, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const result = await runPaddleReconciliation()
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    Sentry.captureException(error)
    return NextResponse.json(
      { ok: false, error: "paddle_reconcile_failed" },
      { status: 500 }
    )
  }
}
