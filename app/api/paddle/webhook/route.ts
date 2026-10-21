import * as Sentry from "@sentry/nextjs"
import { NextRequest, NextResponse } from "next/server"
import { getPaddleEnvConfig } from "@/lib/paddle/config"
import { processPaddleWebhookEvent } from "@/lib/paddle/webhook-handler"
import { verifyPaddleWebhookSignature } from "@/lib/paddle/webhook-verify"
import { paddleWebhookEnvelope } from "@/lib/validations/paddle"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  let cfg: ReturnType<typeof getPaddleEnvConfig>
  try {
    cfg = getPaddleEnvConfig()
  } catch {
    return NextResponse.json(
      { error: "Paddle is not configured" },
      { status: 503 }
    )
  }

  const rawBody = await request.text()
  const signature =
    request.headers.get("paddle-signature") ??
    request.headers.get("Paddle-Signature")

  const verified = verifyPaddleWebhookSignature(
    rawBody,
    signature,
    cfg.paddleWebhookSecret
  )
  if (!verified.ok) {
    return NextResponse.json({ error: verified.reason }, { status: 401 })
  }

  let json: unknown
  try {
    json = JSON.parse(rawBody) as unknown
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const parsed = paddleWebhookEnvelope.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_envelope" }, { status: 400 })
  }

  try {
    const { duplicate } = await processPaddleWebhookEvent(parsed.data)
    return NextResponse.json({ ok: true, duplicate })
  } catch (error) {
    Sentry.captureException(error)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
