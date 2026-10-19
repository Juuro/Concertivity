import React from "react"
import { redirect } from "next/navigation"
import Link from "next/link"
import Layout from "../../src/components/layout-client"
import MapClient from "../../src/components/MapClient"
import { getUserConcerts } from "@/lib/concerts/read"
import { getUserConcertCounts } from "@/lib/concerts/stats"
import { getSession } from "@/lib/auth"
import { headers } from "next/headers"
import type { Metadata } from "next"
import { FEATURE_FLAGS, isFeatureEnabled } from "@/utils/featureFlags"

export const metadata: Metadata = {
  title: "Map | Concertivity",
  description: "Map of all concerts",
}

export default async function MapPage() {
  const session = await getSession(await headers())

  if (!session?.user) {
    redirect("/login")
  }

  const isMapEnabled = isFeatureEnabled(FEATURE_FLAGS.ENABLE_MAP_PAGE, false)
  const userId = session.user.id

  if (!isMapEnabled) {
    const userCounts = await getUserConcertCounts(userId)
    return (
      <Layout concertCounts={userCounts}>
        <section aria-labelledby="map-paywall-title">
          <h1 id="map-paywall-title">Map is a Superfan feature</h1>
          <p>
            The interactive concert map is currently available for Superfan.
            Upgrade to unlock your full concert journey on the map.
          </p>
          <p>
            <Link href="/settings">View plans in settings</Link>
          </p>
        </section>
      </Layout>
    )
  }

  const [userCounts, concerts] = await Promise.all([
    getUserConcertCounts(userId),
    getUserConcerts(userId),
  ])

  // Transform for map
  const concertsFormatted = concerts.map((c) => ({
    ...c,
    bands: c.bands.map((b) => ({
      id: b.id,
      name: b.name,
      slug: b.slug,
      url: b.url,
    })),
    festival: c.festival
      ? {
          fields: {
            name: c.festival.fields.name,
            url: c.festival.fields.url ?? undefined,
          },
        }
      : null,
  }))

  return (
    <Layout concertCounts={userCounts}>
      <MapClient concerts={concertsFormatted} />
    </Layout>
  )
}
