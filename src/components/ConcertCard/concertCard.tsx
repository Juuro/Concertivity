"use client"

import React from "react"
import Link from "next/link"
import Image from "next/image"
import { cityToSlug, extractCityName } from "../../utils/helpers"
import { DATE_LOCALE } from "../../utils/dateLocale"
import type { TransformedConcert } from "@/lib/concerts/types"
import "./concertCard.scss"

interface ConcertCardProps {
  concert: TransformedConcert
  showEditButton?: boolean
  currentUserId?: string
  animated?: boolean
  currency?: string
  hideLocation?: boolean
  hideCost?: boolean
}

const ConcertCard: React.FC<ConcertCardProps> = ({
  concert,
  showEditButton = false,
  currentUserId,
  animated = false,
  currency = "EUR",
  hideLocation = false,
  hideCost = false,
}) => {
  const heading = () => {
    if (concert.isFestival) {
      return concert.festival?.fields.name || ""
    }
    const mainBand = concert.bands[0]
    if (!mainBand) {
      return "Unknown band"
    }
    return <Link href={`/band/${mainBand.slug}`}>{mainBand.name}</Link>
  }

  const bands = () => {
    const bands = [...concert.bands]
    // TODO: Badges as seperate (tag) component?
    if (concert.isFestival) {
      return bands.map((band) => {
        return (
          <Link
            href={`/band/${band.slug}`}
            key={band.id}
            className="badge bg-primary mr-2"
          >
            {band.name}
          </Link>
        )
      })
    } else {
      bands.shift()
      return bands.map((band) => {
        return (
          <Link
            href={`/band/${band.slug}`}
            key={band.id}
            className="badge bg-primary mr-2"
          >
            {band.name}
          </Link>
        )
      })
    }
  }

  const isInFuture = (now = new Date()) => {
    const concertDate = new Date(concert.date)

    // Use provided now (e.g. for tests) or current time
    const nowDate = typeof now === "string" ? new Date(now) : now

    return concertDate >= nowDate
  }

  const getDate = (now = new Date()) => {
    const date = typeof now === "string" ? new Date(now) : now

    return new Date(concert.date).toLocaleDateString(DATE_LOCALE, {
      year: "numeric",
      month: "long",
      day: "numeric",
    })
  }

  const getImageSrc = () => {
    const url = concert.bands[0]?.imageUrl
    if (!url) return undefined
    if (url.startsWith("//")) return `https:${url}`
    return url
  }

  return (
    <li
      className={`concert-card card ${isInFuture() ? "future" : ""} ${animated ? "concert-card--animated" : ""}`}
    >
      <div className="concert-card-image" aria-hidden="true">
        {getImageSrc() ? (
          <Image
            src={getImageSrc() as string}
            alt=""
            fill
            sizes="(min-width: 1024px) 240px, 33vw"
            className="concert-card-image-img"
          />
        ) : (
          <div className="concert-card-image-placeholder" />
        )}
      </div>
      <div className="concert-card-body">
        <h3 className="card-title">{heading()}</h3>
        <div className="concert-card-meta">
          {!(hideLocation && isInFuture()) && <span>{getDate()}</span>}
          {concert.attendeeCount && concert.attendeeCount > 1 && (
            <span
              className="concert-card-attendees"
              title={
                isInFuture()
                  ? `${concert.attendeeCount} people going`
                  : `${concert.attendeeCount} people attended`
              }
            >
              {isInFuture()
                ? `${concert.attendeeCount} going`
                : `${concert.attendeeCount} attended`}
            </span>
          )}
        </div>
        {bands() && <div className="bands">{bands()}</div>}
      </div>
      <div className="concert-card-location">
        <div>
          {!hideLocation && (
            <>
              <div className="venue">{concert.venue}</div>
              <div className="city">
                <Link
                  href={`/city/${cityToSlug(extractCityName(concert.fields.geocoderAddressFields))}`}
                >
                  {extractCityName(concert.fields.geocoderAddressFields)}
                </Link>
              </div>
            </>
          )}
          {!hideCost && concert.cost && (
            <div className="concert-card-cost">
              {concert.cost} {currency}
            </div>
          )}
        </div>
        {showEditButton &&
          (concert.attendance?.userId === currentUserId ||
            concert.userId === currentUserId) && (
            <Link
              href={`/concerts/edit/${concert.id}`}
              className="concert-card-edit-btn"
            >
              Edit
            </Link>
          )}
      </div>
    </li>
  )
}

export default ConcertCard
