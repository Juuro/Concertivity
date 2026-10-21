import * as Sentry from "@sentry/nextjs"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { prisma } from "@/lib/prisma"
import { erasePaddleDataForUser } from "@/lib/paddle/gdpr"

export async function DELETE() {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user.id

  try {
    await erasePaddleDataForUser(userId)

    // Delete the user record; cascades handle sessions, accounts, and
    // userConcerts automatically (onDelete: Cascade). AdminActivity rows now
    // use onDelete SetNull on userId so Paddle erasure audits are preserved.
    // Concert.createdById / updatedById and Band / Festival audit fields use
    // onDelete: SetNull, so shared data is preserved.
    // AppFeedback rows use onDelete: SetNull and stay for audit purposes.
    await prisma.user.delete({ where: { id: userId } })

    // Sign the user out by revoking the current session token.
    // After the user record is gone the session cookie is invalid anyway,
    // but this ensures the response clears the cookie on the client side.
    try {
      await auth.api.signOut({ headers: await headers() })
    } catch {
      // Ignore sign-out errors – the user is already deleted.
    }

    return NextResponse.json(
      { message: "Your account and all associated data have been deleted." },
      { status: 200 }
    )
  } catch (error) {
    Sentry.captureException(error)
    console.error("Error deleting user account:", error)
    return NextResponse.json(
      { error: "Failed to delete account. Please try again." },
      { status: 500 }
    )
  }
}
