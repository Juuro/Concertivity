import React from "react"
import Layout from "@/components/layout-client"
import type { Metadata } from "next"
import styles from "./privacy.module.scss"

export const metadata: Metadata = {
  title: "Privacy Policy | Concertivity",
  description:
    "Privacy policy and data protection information for Concertivity, in accordance with GDPR and DSGVO.",
}

export default function PrivacyPage() {
  return (
    <Layout>
      <main>
        <article className={styles.privacy}>
          <h1>Privacy Policy</h1>
          <p className={styles.intro}>
            This privacy policy explains how we collect, use, store, and protect
            your personal data when you use Concertivity. It complies with the
            EU General Data Protection Regulation (GDPR) and the German Federal
            Data Protection Act (BDSG). Last updated: 7 June 2026.
          </p>

          <section aria-labelledby="controller-heading">
            <h2 id="controller-heading">1. Controller Identity and Contact</h2>
            <p>
              The controller responsible for data processing is Juuronina GbR
              (Sebastian Engel, Janina Michl). For contact details, including
              our data protection contact, see our{" "}
              <a href="/imprint">Imprint</a>. For data subject requests, you may
              contact us at{" "}
              <a href="mailto:privacy@concertivity.app">
                privacy@concertivity.app
              </a>
              .
            </p>
            <p>
              We are currently not obliged to appoint a data protection officer
              under the GDPR; therefore, no data protection officer has been
              designated. If this changes, we will update this privacy policy
              with the relevant contact details.
            </p>
          </section>

          <section aria-labelledby="purposes-heading">
            <h2 id="purposes-heading">
              2. Purposes and Legal Basis of Processing
            </h2>
            <p>
              We process your personal data for the following purposes and legal
              bases (Art. 6 GDPR):
            </p>
            <ul>
              <li>
                <strong>Account creation and login:</strong> To provide the
                service, we process your email, name, password (hashed), and
                optional username. <em>Legal basis:</em> Contract performance
                (Art. 6(1)(b) GDPR).
              </li>
              <li>
                <strong>Authentication via GitHub:</strong> If you sign in with
                GitHub, we receive your GitHub profile data (e.g. name, email,
                profile picture) from GitHub. <em>Legal basis:</em> Contract
                performance (Art. 6(1)(b) GDPR) and your consent when you
                authorise GitHub.
              </li>
              <li>
                <strong>Email verification and password reset:</strong> We send
                verification and password reset emails via our email provider.{" "}
                <em>Legal basis:</em> Contract performance (Art. 6(1)(b) GDPR).
              </li>
              <li>
                <strong>Concert and profile data:</strong> Your concert
                attendance, band preferences, profile settings (including public
                profile option), currency, and visibility settings are processed
                to provide the service. <em>Legal basis:</em> Contract
                performance (Art. 6(1)(b) GDPR).
              </li>
              <li>
                <strong>Session cookies:</strong> Session cookies are used to
                keep you logged in. <em>Legal basis:</em> Legitimate interest in
                secure and reliable authentication (Art. 6(1)(f) GDPR).
              </li>
              <li>
                <strong>Admin functions and audit logs:</strong> For
                administrative and security purposes, we may log actions (e.g.
                band edits, user bans) to ensure security, abuse prevention, and
                accountability. <em>Legal basis:</em> Legitimate interest (Art.
                6(1)(f) GDPR).
              </li>
              <li>
                <strong>Product feedback:</strong> When you use the in-app
                feedback form, we process the text you enter, the feedback type
                you select (bug report, feature request, or general), the page
                path you were on (if provided by the app), and the browser
                user-agent string to understand and improve the service. If you
                are logged in, we also store your account identifier with the
                submission. <em>Legal basis:</em> Legitimate interest in
                improving the service (Art. 6(1)(f) GDPR) and, where you are
                logged in, contract performance (Art. 6(1)(b) GDPR).
              </li>
              <li>
                <strong>Admin triage and escalation:</strong> Authorized admins
                may process feedback internally (status, priority, notes,
                ownership) and may, when necessary to resolve product issues,
                create a linked GitHub issue from selected feedback. We aim to
                minimize exported data and avoid unnecessary personal
                identifiers. <em>Legal basis:</em> Legitimate interest in secure
                service operation and product improvement (Art. 6(1)(f) GDPR).
              </li>
              <li>
                <strong>Technical logs and security monitoring:</strong> Our
                hosting and infrastructure providers temporarily process IP
                addresses, timestamps, User-Agent information, requested URLs,
                and error logs to detect misuse, defend against attacks, and
                ensure the stability of the service. <em>Legal basis:</em>{" "}
                Legitimate interest in security, fraud prevention, and service
                reliability (Art. 6(1)(f) GDPR).
              </li>
              <li>
                <strong>Error and performance monitoring:</strong> We use a
                third-party service (Sentry) to detect, diagnose and fix errors,
                and to monitor application performance. When you are logged in
                and have not opted out, an internal user identifier (no email or
                name) may be included in error reports so we can associate
                issues with accounts and fix them faster. You can turn off
                inclusion of your identifier in error reports at any time in{" "}
                <a href="/settings">Settings</a>. <em>Legal basis:</em>{" "}
                Legitimate interest in service stability and quality (Art.
                6(1)(f) GDPR).
              </li>
              <li>
                <strong>
                  Concert memory search (&ldquo;Help me remember&rdquo;):
                </strong>{" "}
                When you use the optional search assistant on the add-concert
                page, we process the free-text description you enter (for
                example artist, city, venue, or approximate date) to suggest
                matching public setlists. We send your description to our AI
                provider (Groq) to extract structured search parameters and,
                when several matches share the same place and time window, to
                rank candidates by how well the headliner fits your description.
                We query Setlist.fm with structured parameters derived from that
                parsing (artist name, city, venue, year — not your full
                description). When you add a suggested show, we fetch the
                corresponding setlist details from Setlist.fm using its public
                setlist identifier. Your description is processed only for the
                search request and is not stored in our database. When a search
                finds no matching setlists, we may send your description and the
                structured parameters we derived to our error and performance
                monitoring provider (Sentry, Functional Software Inc.) so we can
                analyse how the assistant is used and improve it; this does not
                apply to unexpected technical error reports from that service.
                <em>Legal basis:</em> Contract performance (Art. 6(1)(b) GDPR)
                for running the search; legitimate interest in improving the
                optional assistant (Art. 6(1)(f) GDPR) for no-result analysis
                sent to Sentry.
              </li>
            </ul>
          </section>

          <section aria-labelledby="recipients-heading">
            <h2 id="recipients-heading">3. Recipients and Processors</h2>
            <p>
              Your data may be processed by or shared with the following
              categories of processors. All processors act on our instructions
              under data processing agreements (DPAs) in accordance with Art. 28
              GDPR.
            </p>
            <ul>
              <li>
                <strong>Hosting:</strong> Vercel Inc. (USA) – application
                hosting. Data transfer is governed by the EU-US Data Privacy
                Framework or Standard Contractual Clauses.
              </li>
              <li>
                <strong>Database:</strong> PostgreSQL database (e.g. Prisma
                Postgres / Vercel Postgres, or your configured provider). Data
                may be stored in the EU or USA depending on configuration.
              </li>
              <li>
                <strong>Email:</strong> Resend Inc. – transactional emails
                (verification, password reset). Resend processes data in the
                USA; transfers are governed by Standard Contractual Clauses or
                equivalent safeguards.
              </li>
              <li>
                <strong>GitHub:</strong> For OAuth sign-in, GitHub (GitHub Inc.)
                processes your profile data. Their privacy policy applies:{" "}
                <a
                  href="https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  GitHub Privacy Statement
                </a>
              </li>
              <li>
                <strong>Error and performance monitoring:</strong> Sentry
                (Sentry Inc. / Functional Software Inc.) – we send error reports
                and performance data to Sentry. When you are logged in and have
                not opted out in Settings, an internal user ID (no email) is
                included so we can correlate errors with accounts. Data may be
                processed in the USA; transfers are governed by Standard
                Contractual Clauses or the EU-US Data Privacy Framework. We have
                a data processing agreement with Sentry in accordance with Art.
                28 GDPR.
              </li>
              <li>
                <strong>Optional services</strong> (only if enabled in your
                deployment):
                <ul>
                  <li>
                    <strong>Last.fm:</strong> Band metadata enrichment (no
                    personal user data sent; only band identifiers).
                  </li>
                  <li>
                    <strong>Photon (OpenStreetMap):</strong> Venue search and
                    reverse geocoding (only venue/city-related data).
                    Approximate geographic coordinates derived from your IP
                    address may be used to bias venue search results toward your
                    location. This data is not stored.
                  </li>
                  <li>
                    <strong>Map tiles:</strong> Map tiles may be loaded from
                    third parties (e.g. OpenFreeMap); typically no personal data
                    is sent.
                  </li>
                  <li>
                    <strong>Concert memory search — Groq:</strong> Groq, Inc.
                    (USA) — natural-language parsing and optional result ranking
                    for the &ldquo;Help me remember&rdquo; assistant. We
                    transmit the text you enter (and, for ranking, a list of
                    candidate artist names from Setlist.fm). Groq processes this
                    data solely to provide inference on our behalf under their{" "}
                    <a
                      href="https://console.groq.com/docs/legal/customer-data-processing-addendum"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Data Processing Addendum
                    </a>{" "}
                    (Art. 28 GDPR). Data may be processed in the USA; transfers
                    are governed by Standard Contractual Clauses or the EU-US
                    Data Privacy Framework. Further information:{" "}
                    <a
                      href="https://groq.com/privacy-policy"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Groq Privacy Policy
                    </a>
                    .
                  </li>
                  <li>
                    <strong>Concert memory search — Setlist.fm:</strong>{" "}
                    Setlist.fm (Live Nation Entertainment, Inc., USA) — public
                    concert and setlist lookup. We send structured search
                    parameters derived from your description (for example artist
                    name, city, venue, year) and, when you add a show, a
                    Setlist.fm setlist identifier. We do not send your account
                    email or name. Our server&apos;s IP address is visible to
                    Setlist.fm as part of the API request. Their privacy policy
                    applies:{" "}
                    <a
                      href="https://www.setlist.fm/help/privacy"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Setlist.fm Privacy Policy
                    </a>
                    .
                  </li>
                </ul>
              </li>
            </ul>
          </section>

          <section aria-labelledby="third-countries-heading">
            <h2 id="third-countries-heading">
              4. Transfers to Third Countries
            </h2>
            <p>
              Some processors (e.g. Vercel, Resend, GitHub, Sentry, Groq,
              Setlist.fm / Live Nation Entertainment) may process data in the
              USA or other non‑EEA countries. We ensure appropriate safeguards
              such as adequacy decisions, Standard Contractual Clauses, or the
              EU-US Data Privacy Framework where applicable, in addition to the
              data processing agreements mentioned above.
            </p>
          </section>

          <section aria-labelledby="retention-heading">
            <h2 id="retention-heading">5. Retention Periods</h2>
            <ul>
              <li>
                <strong>Sessions:</strong> Session data is retained for the
                duration of your session; session cookies expire after 7 days of
                inactivity.
              </li>
              <li>
                <strong>Account data:</strong> Retained until you delete your
                account. After account deletion, data is removed within 30 days,
                subject to legal retention requirements.
              </li>
              <li>
                <strong>Concert and band data:</strong> Retained as long as
                associated with your account or until deletion.
              </li>
              <li>
                <strong>Admin audit logs:</strong> Retained as needed for
                security and legal compliance, typically for 12 months and no
                longer than 24 months where necessary for the establishment,
                exercise, or defence of legal claims or for the investigation of
                security incidents.
              </li>
              <li>
                <strong>Technical logs and IP data:</strong> Log files (such as
                IP address, timestamps, request URLs, and User-Agent
                information) are generally retained for 7–30 days, unless a
                longer retention period is required in the context of specific
                security incidents or legal obligations.
              </li>
              <li>
                <strong>Product feedback submissions:</strong> Stored until they
                are no longer needed for handling your request and improving the
                service, typically for up to 24 months, unless a shorter or
                longer period is required for legal claims or compliance.
              </li>
              <li>
                <strong>Concert memory search descriptions:</strong> Not stored
                by Concertivity; processed only for the duration of the search
                request. Groq may retain request data according to its own
                settings and Data Processing Addendum.
              </li>
              <li>
                <strong>Setlist.fm API responses:</strong> Cached in server
                memory for up to 60 minutes to reduce API load; not linked to
                your account unless you choose to add a matched concert to your
                log.
              </li>
            </ul>
          </section>

          <section aria-labelledby="rights-heading">
            <h2 id="rights-heading">6. Your Rights (Art. 15–22 GDPR)</h2>
            <p>You have the following data subject rights:</p>
            <ul>
              <li>
                <strong>Right of access (Art. 15):</strong> Obtain confirmation
                as to whether we process your data and a copy of your data.
              </li>
              <li>
                <strong>Right to rectification (Art. 16):</strong> Request
                correction of inaccurate or incomplete data.
              </li>
              <li>
                <strong>Right to erasure (Art. 17):</strong> Request deletion of
                your data under certain conditions (e.g. withdrawal of consent,
                unlawful processing).
              </li>
              <li>
                <strong>Right to restriction (Art. 18):</strong> Request
                restriction of processing in specific situations.
              </li>
              <li>
                <strong>Right to data portability (Art. 20):</strong> Receive
                your data in a structured, machine-readable format and, where
                technically feasible, have it transmitted to another controller.
              </li>
              <li>
                <strong>Right to object (Art. 21):</strong> Object to processing
                based on legitimate interest. We will cease processing unless we
                demonstrate compelling legitimate grounds.
              </li>
              <li>
                <strong>Withdrawal of consent (Art. 7(3)):</strong> If
                processing is based on consent, you may withdraw it at any time
                without affecting the lawfulness of processing before
                withdrawal.
              </li>
              <li>
                <strong>Right to lodge a complaint (Art. 77):</strong> You have
                the right to lodge a complaint with a supervisory authority in
                your country. For Germany: the competent
                Landesdatenschutzbehörde or the Federal Commissioner for Data
                Protection (BfDI),{" "}
                <a
                  href="https://www.bfdi.bund.de"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  www.bfdi.bund.de
                </a>
                .
              </li>
            </ul>
            <p>
              To exercise these rights, contact us at{" "}
              <a href="mailto:privacy@concertivity.app">
                privacy@concertivity.app
              </a>{" "}
              or via the address in our <a href="/imprint">Imprint</a>.
            </p>
          </section>

          <section aria-labelledby="necessity-heading">
            <h2 id="necessity-heading">
              7. Statutory or Contractual Requirement
            </h2>
            <p>
              The provision of personal data for account creation and use of the
              service is necessary to perform the contract. Without it, we
              cannot provide the service. There is no obligation to provide data
              for optional features (e.g. public profile, username).
            </p>
          </section>

          <section aria-labelledby="automated-heading">
            <h2 id="automated-heading">
              8. Automated Decision-Making and Profiling
            </h2>
            <p>
              We do not use automated decision-making or profiling that produces
              legal effects concerning you or similarly significantly affects
              you.
            </p>
          </section>

          <section aria-labelledby="cookies-heading">
            <h2 id="cookies-heading">9. Cookies and usage analytics</h2>
            <p>
              We use strictly necessary cookies for authentication (session
              cookies). These are required for the service to function. Session
              cookies typically expire after 7 days of inactivity. Strictly
              necessary cookies such as session cookies do not require consent
              under § 25(2) TTDSG where they are essential to provide a service
              explicitly requested by you.
            </p>
            <p>
              For aggregated usage measurement (for example which pages are
              viewed and how users navigate the app), we use{" "}
              <strong>PostHog</strong> (PostHog Inc.), hosted in the{" "}
              <strong>European Union</strong> (EU Cloud). PostHog receives
              pseudonymous identifiers (for example a random distinct id stored
              in <code>localStorage</code> on your device), technical metadata
              related to your visit (such as browser type and coarse network
              information as processed by PostHog), and page URLs. If you are
              signed in, we link events to your <strong>internal user</strong>{" "}
              identifier only — we do not send your email address or name to
              PostHog for this purpose. We configure PostHog without DOM
              autocapture of clicks or form fields. If you explicitly consent
              and session replay is enabled in our deployment configuration, we
              may also process session replay data (for example, page
              transitions, interaction timeline, and technical rendering state)
              to diagnose usability and reliability issues.
            </p>
            <p>
              PostHog acts as a <strong>processor</strong> on our instructions.
              Their privacy information and data processing agreement are
              available at{" "}
              <a
                href="https://posthog.com/privacy"
                rel="noopener noreferrer"
                target="_blank"
              >
                posthog.com/privacy
              </a>{" "}
              and{" "}
              <a
                href="https://posthog.com/dpa"
                rel="noopener noreferrer"
                target="_blank"
              >
                posthog.com/dpa
              </a>
              . Analytics is only active when we enable it in our deployment
              configuration and when you have granted consent. You can withdraw
              consent at any time in <a href="/settings">Settings</a>.
            </p>
            <p>
              For paid <strong>Superfan</strong> subscriptions, payments and
              subscription management are processed by{" "}
              <strong>Paddle.com Market Ltd.</strong> as{" "}
              <strong>merchant of record</strong>. Paddle receives the data
              required to complete checkout, issue invoices, calculate and
              collect applicable taxes, and provide customer billing support.
              Paddle acts as a <strong>processor</strong> for this purpose on
              our instructions. Their privacy policy is available at{" "}
              <a
                href="https://www.paddle.com/legal/privacy"
                rel="noopener noreferrer"
                target="_blank"
              >
                paddle.com/legal/privacy
              </a>
              .
            </p>
            <p>
              <strong>Legal basis:</strong> Consent (Art. 6(1)(a) GDPR and,
              where applicable, § 25 TTDSG for storage/access on your end
              device). We do not activate PostHog analytics or session replay
              before your consent. You may withdraw consent at any time for
              future processing, without affecting processing performed before
              withdrawal.
            </p>
            <p>
              The use of storage and similar technologies is carried out in
              accordance with the GDPR and the German
              Telekommunikation-Telemedien-Datenschutz-Gesetz (TTDSG).
            </p>
          </section>

          <section aria-labelledby="changes-heading">
            <h2 id="changes-heading">10. Changes to This Privacy Policy</h2>
            <p>
              We may update this privacy policy from time to time. Material
              changes will be communicated via the website or by email where
              appropriate. Continued use of the service after changes
              constitutes acceptance of the updated policy.
            </p>
          </section>
        </article>
      </main>
    </Layout>
  )
}
