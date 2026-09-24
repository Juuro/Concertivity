"use client"

import React, { useCallback, useEffect, useRef, useState } from "react"
import type { Concert } from "../types/concert"
import type {
  Map as MaplibreMap,
  GeoJSONSource as MaplibreGeoJSONSource,
} from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"

interface MapClientProps {
  concerts: Concert[]
  allowFullscreen?: boolean
}

type MapPopupRow = {
  name: string
  venue: string
  date: string
  /** Headliner / primary act; popup links to `/band/[slug]` when set. */
  bandSlug: string | null
}

const STYLE_URL =
  process.env.NEXT_PUBLIC_MAP_STYLE_URL ||
  "https://tiles.openfreemap.org/styles/liberty"

import { DATE_LOCALE } from "@/utils/dateLocale"

function getYear(dateInput: string): string {
  return new Date(dateInput).toLocaleDateString(DATE_LOCALE, {
    year: "numeric",
  })
}

function getDate(dateInput: string): string {
  return new Date(dateInput).toLocaleDateString(DATE_LOCALE, {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

function getName(concert: Concert): string {
  if (concert.isFestival) {
    return `${concert.festival?.fields.name || ""} ${getYear(concert.date)}`
  }
  return concert.bands[0]?.name || "Unknown"
}

const COORD_EPS = 1e-5

function getConcertsAtLngLat(
  concerts: Concert[],
  lng: number,
  lat: number
): Concert[] {
  const lngN = Number(lng)
  const latN = Number(lat)
  if (!Number.isFinite(lngN) || !Number.isFinite(latN)) {
    return []
  }
  return concerts.filter((c) => {
    const clon = Number(c.city.lon)
    const clat = Number(c.city.lat)
    return (
      Number.isFinite(clon) &&
      Number.isFinite(clat) &&
      Math.abs(clon - lngN) < COORD_EPS &&
      Math.abs(clat - latN) < COORD_EPS
    )
  })
}

/** Resolve all concerts at the same map point as the clicked feature (matches by stored coordinates, not by venue). */
function getConcertsForClickedPoint(
  concerts: Concert[],
  feature: GeoJSON.Feature
): Concert[] {
  const props = feature.properties as Record<string, unknown> | null
  const rawId = props?.id
  const clickedId = rawId != null && rawId !== "" ? String(rawId) : null

  const coords = (feature.geometry as GeoJSON.Point).coordinates
  const lng = Number(coords[0])
  const lat = Number(coords[1])

  if (clickedId) {
    const anchor = concerts.find((c) => String(c.id) === clickedId)
    if (anchor) {
      const sameSpot = getConcertsAtLngLat(
        concerts,
        anchor.city.lon,
        anchor.city.lat
      )
      return sameSpot.length > 0 ? sameSpot : [anchor]
    }
  }

  return getConcertsAtLngLat(concerts, lng, lat)
}

function appendLinkedTitle(
  parent: HTMLElement,
  name: string,
  bandSlug: string | null
): void {
  if (bandSlug) {
    const a = document.createElement("a")
    a.href = `/band/${encodeURIComponent(bandSlug)}`
    const strong = document.createElement("strong")
    strong.textContent = name
    a.appendChild(strong)
    parent.appendChild(a)
  } else {
    const strong = document.createElement("strong")
    strong.textContent = name
    parent.appendChild(strong)
  }
}

function buildPopupDom(rows: MapPopupRow[]): HTMLElement {
  const root = document.createElement("div")
  root.className = "map-popup-concerts"

  if (rows.length === 0) {
    return root
  }

  if (rows.length === 1) {
    const m = rows[0]
    appendLinkedTitle(root, m.name, m.bandSlug)
    root.appendChild(document.createElement("br"))
    const line = document.createElement("span")
    line.textContent = m.venue.length > 0 ? `${m.venue} on ${m.date}` : m.date
    root.appendChild(line)
    return root
  }

  const count = document.createElement("p")
  count.className = "map-popup-concerts__count"
  count.textContent = `${rows.length} concerts at this location`
  root.appendChild(count)

  const ul = document.createElement("ul")
  ul.className = "map-popup-concerts__list"
  for (const m of rows) {
    const li = document.createElement("li")
    li.className = "map-popup-concerts__item"
    if (m.bandSlug) {
      const a = document.createElement("a")
      a.href = `/band/${encodeURIComponent(m.bandSlug)}`
      a.textContent = m.name
      li.appendChild(a)
    } else {
      const strong = document.createElement("strong")
      strong.textContent = m.name
      li.appendChild(strong)
    }
    li.appendChild(document.createElement("br"))
    const detail = document.createElement("small")
    detail.className = "map-popup-concerts__detail"
    detail.textContent = m.venue.length > 0 ? `${m.venue} · ${m.date}` : m.date
    li.appendChild(detail)
    ul.appendChild(li)
  }
  root.appendChild(ul)

  return root
}

function concertsToGeoJSON(
  concerts: Concert[]
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: concerts.map((concert) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [concert.city.lon, concert.city.lat],
      },
      properties: {
        id: concert.id,
        name: getName(concert),
        venue: concert.venue || "",
        date: getDate(concert.date),
      },
    })),
  }
}

export default function MapClient({
  concerts,
  allowFullscreen,
}: MapClientProps) {
  const mapInstance = useRef<MaplibreMap | null>(null)
  const mapContainer = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev)
  }, [])

  // Resize map when fullscreen toggles
  useEffect(() => {
    if (!mapInstance.current) return
    const timeout = setTimeout(() => {
      mapInstance.current?.resize()
    }, 50)
    return () => clearTimeout(timeout)
  }, [isFullscreen])

  // Main map initialization
  useEffect(() => {
    if (typeof window === "undefined" || !mapContainer.current) return
    if (mapInstance.current) return

    const container = mapContainer.current

    import("maplibre-gl").then((maplibregl) => {
      if (!container || mapInstance.current) return

      const map = new maplibregl.Map({
        container,
        style: STYLE_URL,
        center: [10.447683, 51.163375],
        zoom: 6,
        maxZoom: 18,
      })

      map.addControl(new maplibregl.NavigationControl(), "top-left")

      map.on("load", () => {
        const geojson = concertsToGeoJSON(concerts)

        map.addSource("concerts", {
          type: "geojson",
          data: geojson,
          cluster: true,
          clusterMaxZoom: 14,
          clusterRadius: 50,
        })

        // Cluster circles
        map.addLayer({
          id: "clusters",
          type: "circle",
          source: "concerts",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": [
              "step",
              ["get", "point_count"],
              "#51bbd6",
              10,
              "#f1f075",
              50,
              "#f28cb1",
            ],
            "circle-radius": [
              "step",
              ["get", "point_count"],
              20,
              10,
              30,
              50,
              40,
            ],
          },
        })

        // Cluster count labels
        map.addLayer({
          id: "cluster-count",
          type: "symbol",
          source: "concerts",
          filter: ["has", "point_count"],
          layout: {
            "text-field": "{point_count_abbreviated}",
            "text-size": 12,
          },
        })

        // Individual concert points
        map.addLayer({
          id: "unclustered-point",
          type: "circle",
          source: "concerts",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": "#ff0666",
            "circle-radius": 8,
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
          },
        })

        // Click cluster -> zoom in
        map.on("click", "clusters", async (e) => {
          const features = map.queryRenderedFeatures(e.point, {
            layers: ["clusters"],
          })
          if (!features.length) return
          const clusterId = features[0].properties.cluster_id
          const source = map.getSource("concerts") as MaplibreGeoJSONSource
          const zoom = await source.getClusterExpansionZoom(clusterId)
          map.easeTo({
            center: (features[0].geometry as GeoJSON.Point).coordinates as [
              number,
              number,
            ],
            zoom,
          })
        })

        // Click point -> show popup (all concerts that share this lat/lon)
        map.on("click", "unclustered-point", (e) => {
          if (!e.features?.length) return
          const feature = e.features[0] as GeoJSON.Feature
          const coords = (
            feature.geometry as GeoJSON.Point
          ).coordinates.slice() as [number, number]

          // Handle world-wrap (popup anchor only; matching uses props.id + DB coords)
          while (Math.abs(e.lngLat.lng - coords[0]) > 180) {
            coords[0] += e.lngLat.lng > coords[0] ? 360 : -360
          }

          const atSpot = getConcertsForClickedPoint(concerts, feature)
            .slice()
            .sort(
              (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
            )
          if (atSpot.length === 0) {
            return
          }
          const rows: MapPopupRow[] = atSpot.map((c) => ({
            name: getName(c),
            venue: c.venue || "",
            date: getDate(c.date),
            bandSlug: c.isFestival ? null : (c.bands[0]?.slug ?? null),
          }))

          new maplibregl.Popup({ maxWidth: "320px" })
            .setLngLat(coords)
            .setDOMContent(buildPopupDom(rows))
            .addTo(map)
        })

        // Fit map to show all concert pins
        if (concerts.length === 1) {
          map.setCenter([concerts[0].city.lon, concerts[0].city.lat])
          map.setZoom(12)
        } else if (concerts.length > 1) {
          const bounds = new maplibregl.LngLatBounds()
          for (const concert of concerts) {
            bounds.extend([concert.city.lon, concert.city.lat])
          }
          map.fitBounds(bounds, { padding: 50 })
        }

        // Cursor changes
        map.on("mouseenter", "clusters", () => {
          map.getCanvas().style.cursor = "pointer"
        })
        map.on("mouseleave", "clusters", () => {
          map.getCanvas().style.cursor = ""
        })
        map.on("mouseenter", "unclustered-point", () => {
          map.getCanvas().style.cursor = "pointer"
        })
        map.on("mouseleave", "unclustered-point", () => {
          map.getCanvas().style.cursor = ""
        })
      })

      mapInstance.current = map
    })

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove()
        mapInstance.current = null
      }
    }
  }, [concerts])

  return (
    <div
      className={`map-wrapper${isFullscreen ? " map-wrapper--fullscreen" : ""}`}
    >
      {allowFullscreen && (
        <button
          type="button"
          className="map-wrapper__fullscreen-btn"
          onClick={toggleFullscreen}
          aria-label={isFullscreen ? "Exit fullscreen" : "View fullscreen"}
        >
          {isFullscreen ? "Close" : "Fullscreen"}
        </button>
      )}
      <div className="mapid" ref={mapContainer}></div>
    </div>
  )
}
