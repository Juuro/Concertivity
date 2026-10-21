import * as Sentry from "@sentry/nextjs"
import { NextRequest, NextResponse } from "next/server"
import { auth, getSession } from "@/lib/auth"
import { headers } from "next/headers"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  const session = await getSession(await headers())

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const searchParams = request.nextUrl.searchParams
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100)
  const offset = parseInt(searchParams.get("offset") || "0")
  const action = searchParams.get("action")
  const targetType = searchParams.get("targetType")

  try {
    const whereClause: Record<string, unknown> = {}
    if (action) whereClause.action = action
    if (targetType) whereClause.targetType = targetType

    const [activities, total] = await Promise.all([
      prisma.adminActivity.findMany({
        where: whereClause,
        select: {
          id: true,
          action: true,
          targetType: true,
          targetId: true,
          details: true,
          createdAt: true,
          user: {
            select: { name: true, email: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.adminActivity.count({ where: whereClause }),
    ])

    return NextResponse.json({
      activities: activities.map((activity) => ({
        id: activity.id,
        action: activity.action,
        targetType: activity.targetType,
        targetId: activity.targetId,
        details: activity.details,
        createdAt: activity.createdAt,
        user: activity.user?.name || activity.user?.email,
      })),
      total,
      limit,
      offset,
    })
  } catch (error) {
    Sentry.captureException(error)
    console.error("Error fetching activity log:", error)
    return NextResponse.json(
      { error: "Failed to fetch activity log" },
      { status: 500 }
    )
  }
}
