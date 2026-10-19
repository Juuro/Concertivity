import { headers } from "next/headers"
import * as Sentry from "@sentry/nextjs"
import { getSession } from "@/lib/auth"
import FeedbackModal from "@/components/FeedbackModal/FeedbackModal"
import PostHogConsentBanner from "@/components/PostHogConsentBanner/PostHogConsentBanner"
import PostHogUserSync from "@/components/PostHogUserSync/PostHogUserSync"
import SentryUserSetter from "@/components/SentryUserSetter/SentryUserSetter"

export default async function SessionAwareShell({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession(await headers())

  const sentryUserId =
    session?.user && session.user.includeUserIdInErrorReports !== false
      ? session.user.id
      : null

  const postHogUserId = session?.user?.id ?? null

  Sentry.setUser(sentryUserId ? { id: sentryUserId } : null)

  return (
    <>
      <SentryUserSetter userId={sentryUserId} />
      <PostHogConsentBanner />
      <PostHogUserSync userId={postHogUserId} />
      <FeedbackModal />
      {children}
    </>
  )
}
