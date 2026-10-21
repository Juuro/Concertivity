import Link from "next/link"
import React from "react"
import { FEATURE_FLAGS, isFeatureEnabled } from "@/utils/featureFlags"
import ConcertCount from "../ConcertCount/concertCount"
import HeaderAuth from "./HeaderAuth"
import "./header.scss"

interface HeaderProps {
  siteTitle?: string
  concertCounts?: {
    past: number
    future: number
  }
}

const Header: React.FC<HeaderProps> = ({ siteTitle = "", concertCounts }) => {
  const showMapLink = isFeatureEnabled(FEATURE_FLAGS.ENABLE_MAP_PAGE, false)

  return (
    <header className="site-header">
      <div className="container">
        <h1>
          <Link href="/">{siteTitle}</Link>
        </h1>
        <wbr />
        {concertCounts && <ConcertCount counts={concertCounts} />}

        <nav>
          <Link href="/">Home</Link>
          <Link href="/pricing">Pricing</Link>
          <HeaderAuth showMapLink={showMapLink} />
        </nav>
      </div>
    </header>
  )
}

export default Header
