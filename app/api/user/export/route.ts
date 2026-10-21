import * as Sentry from "@sentry/nextjs"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { prisma } from "@/lib/prisma"
import { parseSupportingActIds } from "@/lib/concerts/transform"
import { getSubscriptionExportData } from "@/lib/paddle/gdpr"
import { redactWebhookPayload } from "@/lib/paddle/webhook-handler"
import { getExportFilename } from "@/lib/export"

const exportQuerySchema = z.object({
  format: z.enum(["json", "csv"]).default("json"),
})

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const queryResult = exportQuerySchema.safeParse({
    format: searchParams.get("format") ?? undefined,
  })

  if (!queryResult.success) {
    return NextResponse.json(
      { error: "Invalid format. Use json or csv." },
      { status: 400 }
    )
  }

  const format = queryResult.data.format

  try {
    const userId = session.user.id

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        username: true,
        isPublic: true,
        currency: true,
        hideLocationPublic: true,
        hideCostPublic: true,
        paddleCustomerId: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const userConcerts = await prisma.userConcert.findMany({
      where: { userId },
      include: {
        concert: {
          include: {
            bands: {
              include: { band: { select: { name: true, slug: true } } },
              orderBy: { sortOrder: "asc" },
            },
            festival: { select: { name: true, slug: true, url: true } },
          },
        },
      },
      orderBy: { concert: { date: "desc" } },
    })

    const subscriptionExport = await getSubscriptionExportData(userId)

    const webhookCandidates = await prisma.paddleWebhookEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, eventType: true, createdAt: true, payload: true },
    })
    const userIdMarker = `"user_id":"${userId}"`
    const paddleWebhookSample = webhookCandidates
      .filter((e) => JSON.stringify(e.payload).includes(userIdMarker))
      .slice(0, 10)
      .map((e) => ({
        id: e.id,
        eventType: e.eventType,
        createdAt: e.createdAt.toISOString(),
        payload: redactWebhookPayload(e.payload),
      }))

    // Resolve all unique supporting-act band IDs in a single batch query.
    const allSupportingActIds = new Set<string>()
    for (const uc of userConcerts) {
      const acts = parseSupportingActIds(uc.supportingActIds)
      if (acts) {
        for (const act of acts) allSupportingActIds.add(act.bandId)
      }
    }
    const supportingBands =
      allSupportingActIds.size > 0
        ? await prisma.band.findMany({
            where: { id: { in: Array.from(allSupportingActIds) } },
            select: { id: true, name: true, slug: true },
          })
        : []
    const bandsById = new Map(supportingBands.map((b) => [b.id, b]))

    /**
     * Export data structure containing user profile and concert attendance records.
     * Implements GDPR Article 15 (Right of Access) — includes all personal data
     * and related concert attendance history without sensitive internal fields.
     *
     * Fields included:
     * - exportedAt: ISO timestamp of export generation
     * - user: Profile data (id, email, name, username, preferences, privacy settings)
     * - concerts: Complete concert attendance history with venues, dates, bands, costs, notes
     *
     * Excluded: internalNotes, ownerUserId (triage fields), admin activity logs
     */
    const exportData = {
      exportedAt: new Date().toISOString(),
      user,
      subscription: subscriptionExport,
      paddleWebhookSample,
      concerts: userConcerts.map((uc) => {
        const supportingActs = (
          parseSupportingActIds(uc.supportingActIds) ?? []
        ).map((act) => {
          const b = bandsById.get(act.bandId)
          return {
            bandId: act.bandId,
            name: b?.name ?? null,
            slug: b?.slug ?? null,
            sortOrder: act.sortOrder,
          }
        })

        return {
          id: uc.concert.id,
          date: uc.concert.date.toISOString(),
          venue: uc.concert.venue,
          city: uc.concert.normalizedCity,
          latitude: uc.concert.latitude,
          longitude: uc.concert.longitude,
          isFestival: uc.concert.isFestival,
          festival: uc.concert.festival
            ? {
                name: uc.concert.festival.name,
                slug: uc.concert.festival.slug,
                url: uc.concert.festival.url,
              }
            : null,
          headliners: uc.concert.bands
            .filter((cb) => cb.isHeadliner)
            .map((cb) => ({
              name: cb.band.name,
              slug: cb.band.slug,
            })),
          supportingActs,
          cost: uc.cost ? uc.cost.toString() : null,
          notes: uc.notes,
        }
      }),
    }

    if (format === "csv") {
      const rows: string[][] = [
        [
          "Date",
          "Venue",
          "City",
          "Latitude",
          "Longitude",
          "Is Festival",
          "Festival Name",
          "Headliners",
          "Supporting Acts",
          "Cost",
          "Currency",
          "Notes",
        ],
      ]

      for (const concert of exportData.concerts) {
        const headlinerNames = concert.headliners.map((b) => b.name).join("; ")
        const supportingNames = concert.supportingActs
          .map((b) => b.name ?? b.bandId)
          .join("; ")

        rows.push([
          concert.date.split("T")[0],
          concert.venue ?? "",
          concert.city ?? "",
          concert.latitude.toString(),
          concert.longitude.toString(),
          concert.isFestival ? "Yes" : "No",
          concert.festival?.name ?? "",
          headlinerNames,
          supportingNames,
          concert.cost ?? "",
          user?.currency ?? "EUR",
          concert.notes ?? "",
        ])
      }

      const csv = rows
        .map((row) =>
          row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")
        )
        .join("\n")

      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${getExportFilename("csv")}"`,
        },
      })
    }

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${getExportFilename("json")}"`,
      },
    })
  } catch (error) {
    Sentry.captureException(error)
    console.error("Error exporting user data:", error)
    return NextResponse.json(
      { error: "Failed to export data" },
      { status: 500 }
    )
  }
}
