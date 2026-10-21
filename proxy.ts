import { NextResponse } from "next/server"
import { getSessionCookie } from "better-auth/cookies"

/**
 * Build Sentry security report URL from DSN for CSP report-uri / report-to.
 * Parsed once at module load. Returns null if DSN is missing or invalid.
 */
function getSentryCspReportUrl(): string | null {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN
  if (!dsn || typeof dsn !== "string") return null
  try {
    const url = new URL(dsn)
    const key = url.username
    const host = url.hostname
    const projectId = url.pathname.replace(/^\//, "").replace(/\/$/, "")
    if (!key || !host || !projectId) return null
    const reportUrl = new URL(`https://${host}/api/${projectId}/security/`)
    reportUrl.searchParams.set("sentry_key", decodeURIComponent(key))
    const env = process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV
    if (env) reportUrl.searchParams.set("sentry_environment", env)
    const release = process.env.SENTRY_RELEASE
    if (release) reportUrl.searchParams.set("sentry_release", release)
    return reportUrl.toString()
  } catch {
    return null
  }
}

const sentryCspReportUrl = getSentryCspReportUrl()

const protectedRoutes = ["/concerts/new", "/concerts/edit", "/settings", "/map"]

const authRoutes = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/resend-verification",
]

const POSTHOG_DEFAULT_HOST = "https://eu.i.posthog.com"

function isPostHogAnalyticsEnabled(): boolean {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim()
  if (!key) return false
  const flag = process.env.NEXT_PUBLIC_POSTHOG_ENABLED?.toLowerCase()
  return flag === "true" || flag === "1" || flag === "yes"
}

function getPostHogConnectSrc(): string {
  if (!isPostHogAnalyticsEnabled()) return ""

  const host =
    process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || POSTHOG_DEFAULT_HOST
  let apiOrigin: string
  try {
    apiOrigin = new URL(host).origin
  } catch {
    apiOrigin = POSTHOG_DEFAULT_HOST
  }
  // posthog-js loads remote config from {region}-assets.i.posthog.com (e.g. eu-assets),
  // not only from the API host; *.i.posthog.com covers EU/US asset endpoints.
  return ` ${apiOrigin} https://*.i.posthog.com`
}

function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV === "development"
  const postHogConnectSrc = getPostHogConnectSrc()

  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""} https://cdn.paddle.com https://sandbox-cdn.paddle.com`,
    "style-src 'self' 'unsafe-inline' https://cdn.paddle.com https://sandbox-cdn.paddle.com",
    `connect-src 'self' https://*.ingest.sentry.io https://tiles.openfreemap.org https://api.paddle.com https://sandbox-api.paddle.com${postHogConnectSrc}`,
    "img-src 'self' blob: data: https://upload.wikimedia.org https://avatars.githubusercontent.com https://tiles.openfreemap.org",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "worker-src 'self' blob:",
    "frame-src 'self' https://checkout.paddle.com https://sandbox-checkout.paddle.com https://buy.paddle.com https://sandbox-buy.paddle.com",
  ]

  if (sentryCspReportUrl) {
    directives.push(
      `report-uri ${sentryCspReportUrl}`,
      "report-to csp-endpoint"
    )
  }

  return directives.join("; ")
}

function setCspReportingHeaders(res: NextResponse): void {
  if (!sentryCspReportUrl) return
  res.headers.set(
    "Report-To",
    JSON.stringify({
      group: "csp-endpoint",
      max_age: 10886400,
      endpoints: [{ url: sentryCspReportUrl }],
      include_subdomains: true,
    })
  )
  res.headers.set("Reporting-Endpoints", `csp-endpoint="${sentryCspReportUrl}"`)
}

export async function proxy(request: Request) {
  const url = new URL(request.url)
  const { pathname } = url

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64")
  const csp = buildCsp(nonce)

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-nonce", nonce)
  requestHeaders.set("Content-Security-Policy", csp)

  const sessionCookie = getSessionCookie(request)
  const isAuthenticated = !!sessionCookie

  if (authRoutes.some((route) => pathname.startsWith(route))) {
    if (isAuthenticated) {
      const res = NextResponse.redirect(new URL("/", request.url))
      res.headers.set("Content-Security-Policy", csp)
      setCspReportingHeaders(res)
      return res
    }
    const res = NextResponse.next({ request: { headers: requestHeaders } })
    res.headers.set("Content-Security-Policy", csp)
    setCspReportingHeaders(res)
    return res
  }

  if (protectedRoutes.some((route) => pathname.startsWith(route))) {
    if (!isAuthenticated) {
      const loginUrl = new URL("/login", request.url)
      loginUrl.searchParams.set("callbackUrl", pathname)
      const res = NextResponse.redirect(loginUrl)
      res.headers.set("Content-Security-Policy", csp)
      setCspReportingHeaders(res)
      return res
    }
  }

  const res = NextResponse.next({ request: { headers: requestHeaders } })
  res.headers.set("Content-Security-Policy", csp)
  setCspReportingHeaders(res)
  return res
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
}
