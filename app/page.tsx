import React, { Suspense } from "react"
import Link from "next/link"
import Layout from "../src/components/layout-client"
import HeroBanner from "@/components/HeroBanner/heroBanner"
import LandingFeatures from "@/components/landing/LandingFeatures"
import LandingPricingSection from "@/components/landing/LandingPricingSection"
import StatisticsWidgetServer from "../src/components/StatisticsWidget/StatisticsWidgetServer"
import StatCard from "@/components/StatCard/StatCard"
import { ConcertListInfinite } from "../src/components/ConcertList"
import {
  getUserConcertStatistics,
  getUserConcertCounts,
  getGlobalAppStats,
  getUserUniqueBandCount,
  getUserDashboardCounts,
} from "@/lib/concerts/stats"
import { getUserTotalSpentCached } from "@/lib/concerts/spending"
import { getConcertsPaginated } from "@/lib/concerts/pagination"
import { getSession } from "@/lib/auth"
import { isTrialOfferConfigured } from "@/lib/paddle/config"
import { FEATURE_FLAGS, isFeatureEnabled } from "@/utils/featureFlags"
import { headers } from "next/headers"
import type { Metadata } from "next"
import "./home.scss"

export const metadata: Metadata = {
  title: "Concertivity",
  description: "Track your concert history.",
}

interface HomePageProps {
  searchParams: Promise<{ cursor?: string }>
}

function HomePageFallback() {
  return (
    <Layout>
      <main>
        <div className="container">
          <p aria-live="polite">Loading…</p>
        </div>
      </main>
    </Layout>
  )
}

async function HomeContent({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>
}) {
  const { cursor } = await searchParams
  const session = await getSession(await headers())

  if (session?.user) {
    return <LoggedInHome userId={session.user.id} cursor={cursor} />
  }

  return <LandingPage />
}

export default function HomePage({ searchParams }: HomePageProps) {
  return (
    <Suspense fallback={<HomePageFallback />}>
      <HomeContent searchParams={searchParams} />
    </Suspense>
  )
}

async function LoggedInHome({
  userId,
  cursor,
}: {
  userId: string
  cursor?: string
}) {
  const showStatisticsWidget = isFeatureEnabled(
    FEATURE_FLAGS.ENABLE_STATISTICS_WIDGET,
    false
  )

  const [
    initialData,
    uniqueBands,
    dashboardCounts,
    userStats,
    userCounts,
    totalSpent,
  ] = await Promise.all([
    getConcertsPaginated(cursor, 20, "forward", { userId }),
    getUserUniqueBandCount(userId),
    getUserDashboardCounts(userId),
    showStatisticsWidget
      ? getUserConcertStatistics(userId)
      : Promise.resolve(null),
    getUserConcertCounts(userId),
    getUserTotalSpentCached(userId),
  ])

  return (
    <Layout concertCounts={userCounts}>
      <main>
        <div className="container">
          <div className="home-header">
            <h2>Concerts</h2>
            <Link href="/concerts/new" className="home-btn">
              + Add Concert
            </Link>
          </div>

          {showStatisticsWidget && userStats && userStats.totalPast > 0 && (
            <StatisticsWidgetServer statistics={userStats} />
          )}

          <div className="home-dashboard-stats">
            <StatCard value={userCounts.past} label="Concerts" />
            <StatCard value={uniqueBands} label="Bands" />
            <StatCard value={dashboardCounts.uniqueCities} label="Cities" />
            <StatCard value={dashboardCounts.uniqueYears} label="Years" />
            {totalSpent.total > 0 && (
              <StatCard
                value={Math.round(totalSpent.total)}
                label={totalSpent.currency}
              />
            )}
          </div>

          {initialData.items.length === 0 && !cursor ? (
            <div className="home-empty">
              <h2>No concerts yet</h2>
              <p>
                Start building your concert collection by adding your first
                concert.
              </p>
              <Link href="/concerts/new" className="home-btn">
                Add Your First Concert
              </Link>
            </div>
          ) : (
            <ConcertListInfinite
              initialConcerts={initialData.items}
              initialNextCursor={initialData.nextCursor}
              initialHasMore={initialData.hasMore}
              initialHasPrevious={initialData.hasPrevious}
              filterParams={{ userOnly: "true" }}
              showEditButtons={true}
              currentUserId={userId}
              currency={totalSpent.currency}
            />
          )}
        </div>
      </main>
    </Layout>
  )
}

async function LandingPage() {
  const stats = await getGlobalAppStats()
  const paywallEnabled = isFeatureEnabled(FEATURE_FLAGS.ENABLE_PAYWALL, false)

  return (
    <Layout>
      <main className="home-landing">
        <div className="container">
          <HeroBanner />

          {stats && (
            <section
              className="home-stats"
              aria-labelledby="home-stats-heading"
            >
              <h3 id="home-stats-heading">Join the community</h3>
              <div className="home-stats__grid">
                <StatCard
                  value={stats.concertCount.toLocaleString()}
                  label="Concerts tracked"
                />
                <StatCard
                  value={stats.bandCount.toLocaleString()}
                  label="Bands"
                />
                <StatCard
                  value={stats.userCount.toLocaleString()}
                  label="Music fans"
                />
              </div>
            </section>
          )}

          <LandingFeatures />

          <LandingPricingSection
            paywallEnabled={paywallEnabled}
            trialOffered={
              paywallEnabled &&
              (isTrialOfferConfigured("monthly") ||
                isTrialOfferConfigured("yearly"))
            }
          />

          <section className="home-cta" aria-labelledby="home-cta-heading">
            <h3 id="home-cta-heading">
              Your next show deserves a spot in your diary
            </h3>
            <p>
              Sign up free in minutes. Upgrade to Superfan only if you want to
              support Concertivity and get early access to premium features.
            </p>
            <div className="home-cta__actions">
              <Link href="/register" className="home-btn">
                Start free
              </Link>
              <Link href="/pricing" className="home-btn home-btn--secondary">
                View pricing
              </Link>
            </div>
          </section>
        </div>
      </main>
    </Layout>
  )
}
