import * as Sentry from "@sentry/nextjs"
import { NextRequest, NextResponse } from "next/server"
import { auth, getSession } from "@/lib/auth"
import { headers } from "next/headers"
import { prisma } from "@/lib/prisma"

// POST - Ban a user
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession(await headers())

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params

  // Prevent self-ban
  if (id === session.user.id) {
    return NextResponse.json({ error: "Cannot ban yourself" }, { status: 400 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const { reason, expiresAt } = body

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, banned: true },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    if (user.banned) {
      return NextResponse.json(
        { error: "User is already banned" },
        { status: 400 }
      )
    }

    // Stored as plain text; output escaping is React's job. Stripping tags with
    // a regex is bypassable and gives a false sense of safety.
    const sanitizedReason = reason ? String(reason).slice(0, 500) : null

    // Parse expires date if provided
    const banExpires = expiresAt ? new Date(expiresAt) : null

    // Update user and log activity
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          banned: true,
          banReason: sanitizedReason,
          banExpires,
        },
      })

      await tx.adminActivity.create({
        data: {
          userId: session.user.id,
          action: "user_ban",
          targetType: "user",
          targetId: id,
          details: {
            userName: user.name || user.email,
            reason: sanitizedReason,
            expiresAt: banExpires?.toISOString(),
          },
        },
      })
    })

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        banned: true,
        banReason: sanitizedReason,
        banExpires,
      },
    })
  } catch (error) {
    Sentry.captureException(error)
    console.error("Error banning user:", error)
    return NextResponse.json({ error: "Failed to ban user" }, { status: 500 })
  }
}

// DELETE - Unban a user
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession(await headers())

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params

  try {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        banned: true,
        banReason: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    if (!user.banned) {
      return NextResponse.json({ error: "User is not banned" }, { status: 400 })
    }

    // Update user and log activity
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          banned: false,
          banReason: null,
          banExpires: null,
        },
      })

      await tx.adminActivity.create({
        data: {
          userId: session.user.id,
          action: "user_unban",
          targetType: "user",
          targetId: id,
          details: {
            userName: user.name || user.email,
            previousReason: user.banReason,
          },
        },
      })
    })

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        banned: false,
      },
    })
  } catch (error) {
    Sentry.captureException(error)
    console.error("Error unbanning user:", error)
    return NextResponse.json({ error: "Failed to unban user" }, { status: 500 })
  }
}
