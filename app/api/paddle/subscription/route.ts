import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { getSubscriptionSummary } from "@/lib/paddle/entitlement"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  })
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const skipPortal =
    request.nextUrl.searchParams.get("portal") === "0" ||
    request.nextUrl.searchParams.get("portal") === "false"

  const acceptLanguage = request.headers.get("accept-language") ?? ""
  const summary = await getSubscriptionSummary(session.user.id, {
    includePortalSession: !skipPortal,
    locale: acceptLanguage.toLowerCase().includes("de") ? "de-DE" : "en-US",
  })
  if (!summary) {
    return NextResponse.json({ subscription: null })
  }

  return NextResponse.json({ subscription: summary })
}
