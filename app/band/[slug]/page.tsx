import React from "react"
import { notFound, redirect } from "next/navigation"
import Layout from "../../../src/components/layout-client"
import ConcertListInfinite from "../../../src/components/ConcertList/ConcertListInfinite"
import ConcertCount from "../../../src/components/ConcertCount/concertCount"
import {
  getUserConcertCounts,
  getUserBandConcertCounts,
} from "@/lib/concerts/stats"
import { getConcertsPaginated } from "@/lib/concerts/pagination"
import { getUserTotalSpent } from "@/lib/concerts/spending"
import { getStartOfToday } from "@/lib/concerts/date"
import { getBandBySlugLight, enrichBandData } from "@/lib/bands"
import { after } from "next/server"
import { getSession } from "@/lib/auth"
import { headers } from "next/headers"
import type { Metadata } from "next"
import styles from "./page.module.scss"
import BandEditToggle from "./BandEditToggle"
import RetryEnrichButton from "./RetryEnrichButton"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const band = await getBandBySlugLight(slug)

  return {
    title: `${band?.name || slug} | Concerts`,
  }
}

export default async function BandPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ cursor?: string }>
}) {
  const { slug } = await params
  const { cursor } = await searchParams

  const [band, session] = await Promise.all([
    getBandBySlugLight(slug),
    getSession(await headers()),
  ])

  if (!session?.user) {
    redirect("/login")
  }

  if (!band) {
    notFound()
  }

  // Lazy image enrichment: fetch from MusicBrainz in the background
  // if no image exists and no previous enrichment was attempted
  if (!band.imageUrl && !band.imageEnrichedAt) {
    after(() => enrichBandData(band.id, band.name, { imageOnly: true }))
  }

  const userId = session.user.id
  const isAdmin = session.user.role === "admin"

  // Fetch user-scoped data for this band
  const now = getStartOfToday()
  const [userCounts, initialData, bandSpent, bandConcertCounts] =
    await Promise.all([
      getUserConcertCounts(userId),
      getConcertsPaginated(cursor, 20, "forward", { bandSlug: slug, userId }),
      getUserTotalSpent(userId, { bandSlug: slug }),
      getUserBandConcertCounts(userId, band.id, now),
    ])

  const hasGenres = band.lastfm?.genres && band.lastfm.genres.length > 0
  const hasLastfmUrl = Boolean(band.lastfm?.url)
  const hasWebsiteUrl = Boolean(band.websiteUrl)

  return (
    <Layout concertCounts={userCounts}>
      <main>
        <div className="container">
          <div className={styles.headerRow}>
            <div>
              <h2>
                {band.name}
                <ConcertCount counts={bandConcertCounts} />
              </h2>
              <div className={styles.metaRow}>
                {hasGenres && (
                  <span className={styles.genreBadges}>
                    {band.lastfm!.genres!.slice(0, 5).map((genre) => (
                      <span key={genre} className={styles.genreBadge}>
                        {genre}
                      </span>
                    ))}
                  </span>
                )}
                {hasWebsiteUrl && (
                  <a
                    className={styles.websiteLink}
                    href={band.websiteUrl!}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Visit website"
                    title="Visit website"
                  >
                    <svg
                      aria-hidden="true"
                      focusable="false"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        cx="12"
                        cy="12"
                        r="9"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      />
                      <path
                        d="M12 3c-2 2.5-3 5-3 9s1 6.5 3 9M12 3c2 2.5 3 5 3 9s-1 6.5-3 9M3.5 9h17M3.5 15h17"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      />
                    </svg>
                  </a>
                )}
                {hasLastfmUrl && (
                  <a
                    className={styles.lastfmLink}
                    href={band.lastfm!.url!}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="View on Last.fm"
                    title="View on Last.fm"
                  >
                    <svg
                      aria-hidden="true"
                      focusable="false"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        cx="12"
                        cy="12"
                        r="9"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      />
                      <text
                        x="12"
                        y="12"
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize="7.5"
                        fontWeight="700"
                        fontFamily="sans-serif"
                        fill="currentColor"
                      >
                        lfm
                      </text>
                    </svg>
                  </a>
                )}
                {isAdmin && (
                  <BandEditToggle
                    band={{
                      slug: band.slug,
                      name: band.name,
                      websiteUrl: band.websiteUrl ?? undefined,
                      imageUrl: band.imageUrl ?? undefined,
                    }}
                  />
                )}
                {isAdmin && (!band.imageUrl || !hasLastfmUrl) && (
                  <RetryEnrichButton slug={band.slug} />
                )}
              </div>
              {bandSpent.total > 0 && (
                <p className={styles.spendingStat}>
                  {bandSpent.total.toFixed(2)} {bandSpent.currency} spent
                </p>
              )}
            </div>
          </div>

          <ConcertListInfinite
            initialConcerts={initialData.items}
            initialNextCursor={initialData.nextCursor}
            initialHasMore={initialData.hasMore}
            initialHasPrevious={initialData.hasPrevious}
            filterParams={{ bandSlug: slug, userOnly: "true" }}
            currency={bandSpent.currency}
            showEditButtons={true}
            currentUserId={userId}
          />
        </div>
      </main>
    </Layout>
  )
}
