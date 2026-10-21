import React from "react"
import { ChartIcon, MapIcon, MusicNoteIcon } from "./LandingIcons"
import styles from "./LandingFeatures.module.scss"

const features = [
  {
    icon: MusicNoteIcon,
    title: "Track every show",
    description:
      "Log concerts with dates, venues, cities, and lineups. Build your complete concert history.",
  },
  {
    icon: ChartIcon,
    title: "Discover patterns",
    description:
      "See your top bands, favorite cities, and busiest years with charts and statistics.",
  },
  {
    icon: MapIcon,
    title: "Map your journey",
    description:
      "Visualize all your concerts on an interactive map. See how far your music has taken you.",
  },
] as const

export default function LandingFeatures() {
  return (
    <section
      className={styles.features}
      aria-labelledby="landing-features-heading"
    >
      <div className={styles.header}>
        <p className={styles.eyebrow}>Built for gig-goers</p>
        <h3 id="landing-features-heading">
          Everything you need to remember the night
        </h3>
        <p className={styles.lead}>
          Concertivity helps you capture live music memories — free to start, no
          credit card required.
        </p>
      </div>
      <ul className={styles.grid}>
        {features.map(({ icon: Icon, title, description }) => (
          <li key={title} className={styles.card}>
            <span className={styles.iconWrap}>
              <Icon className={styles.icon} />
            </span>
            <h4>{title}</h4>
            <p>{description}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
