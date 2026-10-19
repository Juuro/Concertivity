import React from "react"
import { notFound, redirect } from "next/navigation"
import Layout from "../../../src/components/layout-client"
import ConcertListInfinite from "../../../src/components/ConcertList/ConcertListInfinite"
import ConcertCount from "../../../src/components/ConcertCount/concertCount"
import { getAllCities } from "@/lib/concerts/read"
import { getConcertsPaginated } from "@/lib/concerts/pagination"
import { getUserTotalSpent } from "@/lib/concerts/spending"
import { getUserConcertCounts } from "@/lib/concerts/stats"
import { getStartOfToday } from "@/lib/concerts/date"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth"
import { headers } from "next/headers"
import { cityToSlug, findCityBySlug } from "../../../src/utils/helpers"
import type { Metadata } from "next"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const cities = await getAllCities()
  const city = findCityBySlug(slug, cities)

  return {
    title: `${city || slug} | Concerts`,
  }
}

export default async function CityPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ cursor?: string }>
}) {
  const { slug } = await params
  const { cursor } = await searchParams
  const cities = await getAllCities()
  const cityName = findCityBySlug(slug, cities)

  if (!cityName) {
    notFound()
  }

  const session = await getSession(await headers())

  if (!session?.user) {
    redirect("/login")
  }

  const userId = session.user.id
  const now = getStartOfToday()

  const [userCounts, initialData, pastCount, futureCount, citySpent] =
    await Promise.all([
      getUserConcertCounts(userId),
      getConcertsPaginated(cursor, 20, "forward", { city: cityName, userId }),
      prisma.userConcert.count({
        where: {
          userId,
          concert: { normalizedCity: cityName, date: { lt: now } },
        },
      }),
      prisma.userConcert.count({
        where: {
          userId,
          concert: { normalizedCity: cityName, date: { gte: now } },
        },
      }),
      getUserTotalSpent(userId, { city: cityName }),
    ])

  const cityConcertCounts = {
    past: pastCount,
    future: futureCount,
  }

  return (
    <Layout concertCounts={userCounts}>
      <main>
        <div className="container">
          <h2>
            {cityName}
            <ConcertCount counts={cityConcertCounts} />
          </h2>
          {citySpent.total > 0 && (
            <p
              style={{
                fontSize: "0.9rem",
                color: "rgba(0,0,0,0.55)",
                margin: "4px 0 16px",
              }}
            >
              {citySpent.total.toFixed(2)} {citySpent.currency} spent
            </p>
          )}

          <ConcertListInfinite
            initialConcerts={initialData.items}
            initialNextCursor={initialData.nextCursor}
            initialHasMore={initialData.hasMore}
            initialHasPrevious={initialData.hasPrevious}
            filterParams={{ city: cityName, userOnly: "true" }}
            currency={citySpent.currency}
            showEditButtons={true}
            currentUserId={userId}
          />
        </div>
      </main>
    </Layout>
  )
}
