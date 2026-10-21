"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useTypedSession } from "@/lib/auth-client"
import {
  getPostHogConsentState,
  setPostHogConsentState,
} from "@/lib/posthog-consent"
import { applyPostHogConsentState } from "@/lib/posthog-client"
import { isPostHogSessionReplayEnabled } from "@/lib/posthog-env"
import { useToast } from "@/components/Toast/Toast"
import Dialog from "@/components/Dialog/Dialog"
import { getExportFilename } from "@/lib/export"
import { SubscriptionSection } from "@/components/subscription/SubscriptionSection"
import "./settings.scss"

export default function SettingsPage() {
  const router = useRouter()
  const { data: session, isPending } = useTypedSession()
  const { showToast } = useToast()
  const [username, setUsername] = useState(session?.user?.username || "")
  const [isPublic, setIsPublic] = useState(session?.user?.isPublic || false)
  const [hideLocationPublic, setHideLocationPublic] = useState(
    session?.user?.hideLocationPublic ?? true
  )
  const [hideCostPublic, setHideCostPublic] = useState(
    session?.user?.hideCostPublic ?? true
  )
  const [includeUserIdInErrorReports, setIncludeUserIdInErrorReports] =
    useState(session?.user?.includeUserIdInErrorReports ?? true)
  const [currency, setCurrency] = useState(session?.user?.currency || "EUR")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [analyticsConsent, setAnalyticsConsent] = useState(false)
  const [copied, setCopied] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isExporting, setIsExporting] = useState<"json" | "csv" | null>(null)
  const [isUpdatingAnalyticsConsent, setIsUpdatingAnalyticsConsent] =
    useState(false)

  useEffect(() => {
    if (session?.user) {
      setUsername(session.user.username || "")
      setIsPublic(session.user.isPublic || false)
      setCurrency(session.user.currency || "EUR")
      setHideLocationPublic(session.user.hideLocationPublic ?? true)
      setHideCostPublic(session.user.hideCostPublic ?? true)
      setIncludeUserIdInErrorReports(
        session.user.includeUserIdInErrorReports ?? true
      )
    }
  }, [session?.user])

  useEffect(() => {
    setAnalyticsConsent(getPostHogConsentState() === "granted")
  }, [])

  if (isPending) {
    return (
      <div className="settings">
        <p>Loading...</p>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const res = await fetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          isPublic,
          currency,
          hideLocationPublic,
          hideCostPublic,
          includeUserIdInErrorReports,
        }),
      })

      if (res.ok) {
        showToast({ type: "success", message: "Settings saved successfully!" })
        router.refresh()
      } else {
        const data = await res.json()
        showToast({
          type: "error",
          message: data.error || "Failed to save settings",
        })
      }
    } catch (err) {
      showToast({ type: "error", message: "An unexpected error occurred" })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleExport = async (format: "json" | "csv") => {
    setIsExporting(format)
    try {
      const res = await fetch(`/api/user/export?format=${format}`)
      if (!res.ok) {
        showToast({ type: "error", message: "Failed to export data" })
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = getExportFilename(format)
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.setTimeout(() => {
        URL.revokeObjectURL(url)
      }, 1000)
    } catch (err) {
      showToast({ type: "error", message: "An unexpected error occurred" })
    } finally {
      setIsExporting(null)
    }
  }

  const handleDeleteAccount = async () => {
    setIsDeleting(true)
    try {
      const res = await fetch("/api/user/account", { method: "DELETE" })
      if (res.ok) {
        setIsDeleteDialogOpen(false)
        router.push("/")
      } else {
        const data = await res.json()
        showToast({
          type: "error",
          message: data.error || "Failed to delete account",
        })
      }
    } catch (err) {
      showToast({ type: "error", message: "An unexpected error occurred" })
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="settings">
      <h1>Settings</h1>
      <p className="settings__subtitle">Manage your profile and preferences</p>

      <form className="settings__form" onSubmit={handleSubmit}>
        <div className="settings__section">
          <h2>Profile</h2>

          <div className="settings__field">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              value={session?.user?.email || ""}
              disabled
            />
            <span className="settings__hint">Email cannot be changed</span>
          </div>

          <div className="settings__field">
            <label htmlFor="name">Name</label>
            <input
              type="text"
              id="name"
              value={session?.user?.name || ""}
              disabled
            />
          </div>

          <div className="settings__field">
            <label htmlFor="username">Username</label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Choose a username for your public profile"
              pattern="[a-z0-9-]+"
              title="Only lowercase letters, numbers, and hyphens allowed"
              disabled={isSubmitting}
            />
          </div>
        </div>

        <div className="settings__section">
          <h2>Preferences</h2>

          <div className="settings__field">
            <label htmlFor="currency">Currency</label>
            <select
              id="currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              disabled={isSubmitting}
            >
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
              <option value="GBP">GBP</option>
              <option value="SEK">SEK</option>
              <option value="NOK">NOK</option>
              <option value="DKK">DKK</option>
              <option value="CHF">CHF</option>
              <option value="PLN">PLN</option>
              <option value="CZK">CZK</option>
              <option value="HUF">HUF</option>
            </select>
          </div>
        </div>

        <div className="settings__section">
          <h2>Privacy</h2>

          <div className="settings__field settings__checkbox">
            <label>
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                disabled={isSubmitting}
              />
              Make my profile public
            </label>
            <span className="settings__hint">
              When enabled, others can view your concert history at your public
              profile URL
            </span>
          </div>

          <div
            className={`settings__url-display ${isPublic ? "settings__url-display--visible" : ""}`}
          >
            <div className="settings__url-display-inner">
              {username ? (
                <>
                  <span className="settings__url-label">
                    Your public profile URL:
                  </span>
                  <div className="settings__url-row">
                    <Link
                      href={`/u/${username}`}
                      className="settings__url-link"
                    >
                      /u/{username}
                    </Link>
                    <button
                      type="button"
                      className={`settings__url-copy ${copied ? "settings__url-copy--copied" : ""}`}
                      onClick={() => {
                        navigator.clipboard
                          .writeText(`${window.location.origin}/u/${username}`)
                          .then(() => {
                            setCopied(true)
                            setTimeout(() => setCopied(false), 2000)
                          })
                      }}
                    >
                      {copied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </>
              ) : (
                <span className="settings__url-warning">
                  Set a username above to get a public profile URL.
                </span>
              )}
            </div>
          </div>

          <div
            className={`settings__privacy-options ${isPublic ? "settings__privacy-options--visible" : ""}`}
          >
            <div className="settings__privacy-options-inner">
              <div className="settings__field settings__checkbox">
                <label>
                  <input
                    type="checkbox"
                    checked={hideLocationPublic}
                    onChange={(e) => setHideLocationPublic(e.target.checked)}
                    disabled={isSubmitting}
                  />
                  Hide location data on public profile
                </label>
                <span className="settings__hint">
                  Venue names, city names, the city statistics chart, the
                  concert map, and dates of future concerts will be hidden from
                  your public profile.
                </span>
                <div className="settings__info-warning">
                  <strong>Privacy note:</strong> Sharing location data for
                  future concerts reveals when you will be at specific venues
                  and when you are not at home. Even just a band name and date
                  is enough to find the exact venue and time. We recommend
                  keeping this enabled.
                </div>
              </div>

              <div className="settings__field settings__checkbox">
                <label>
                  <input
                    type="checkbox"
                    checked={hideCostPublic}
                    onChange={(e) => setHideCostPublic(e.target.checked)}
                    disabled={isSubmitting}
                  />
                  Hide money spent on public profile
                </label>
                <span className="settings__hint">
                  Concert ticket costs will be hidden from your public profile.
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="settings__section">
          <h2>Diagnostics and Analytics</h2>

          <div className="settings__field settings__checkbox">
            <label>
              <input
                type="checkbox"
                checked={includeUserIdInErrorReports}
                onChange={(e) =>
                  setIncludeUserIdInErrorReports(e.target.checked)
                }
                disabled={isSubmitting}
              />
              Include my account identifier in error reports (helps us fix
              issues faster)
            </label>
            <span className="settings__hint">
              When enabled, we associate error reports with your account so we
              can fix problems; you can turn this off at any time.
            </span>
          </div>

          <div className="settings__field settings__checkbox">
            <label>
              <input
                type="checkbox"
                checked={analyticsConsent}
                onChange={async (e) => {
                  const consented = e.target.checked
                  const previousConsented = analyticsConsent

                  setAnalyticsConsent(consented)
                  const persisted = setPostHogConsentState(
                    consented ? "granted" : "denied"
                  )

                  if (!persisted) {
                    setAnalyticsConsent(previousConsented)
                    return
                  }

                  setIsUpdatingAnalyticsConsent(true)
                  try {
                    await applyPostHogConsentState(consented)
                  } catch (error) {
                    console.error(
                      "Failed to apply PostHog consent state",
                      error
                    )
                    setAnalyticsConsent(previousConsented)
                    setPostHogConsentState(
                      previousConsented ? "granted" : "denied"
                    )
                  } finally {
                    setIsUpdatingAnalyticsConsent(false)
                  }
                }}
                disabled={isSubmitting || isUpdatingAnalyticsConsent}
              />
              {isPostHogSessionReplayEnabled()
                ? "Allow analytics and session replay"
                : "Allow analytics"}
            </label>
            <span className="settings__hint">
              Uses PostHog for page analytics
              {isPostHogSessionReplayEnabled()
                ? " and optional session replay"
                : ""}
              . You can change this at any time.
            </span>
          </div>
        </div>

        <div className="settings__actions">
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>

      <SubscriptionSection />

      <div className="settings__panel">
        <div className="settings__section">
          <h2>Export Your Data</h2>
          <p className="settings__hint settings__hint--block">
            Download all your concert attendance data. Your export includes your
            profile information and the full list of concerts you have attended,
            with dates, venues, bands, and ticket costs.
          </p>
          <div className="settings__export-actions">
            <button
              type="button"
              className="settings__btn-secondary"
              onClick={() => handleExport("json")}
              disabled={isExporting !== null}
              aria-label="Download data as JSON"
            >
              {isExporting === "json" ? "Exporting…" : "Download JSON"}
            </button>
            <button
              type="button"
              className="settings__btn-secondary"
              onClick={() => handleExport("csv")}
              disabled={isExporting !== null}
              aria-label="Download data as CSV"
            >
              {isExporting === "csv" ? "Exporting…" : "Download CSV"}
            </button>
          </div>
        </div>
      </div>

      <div className="settings__panel settings__panel--danger">
        <div className="settings__section">
          <h2>Delete Account</h2>
          <p className="settings__hint settings__hint--block">
            Permanently delete your account and all associated data. This action
            cannot be undone.
          </p>
          <ul className="settings__delete-list">
            <li>Your profile and login credentials</li>
            <li>Your concert attendance records (including costs and notes)</li>
            <li>Your active sessions</li>
          </ul>
          <p className="settings__hint settings__hint--block">
            Shared data such as concerts, bands, and festivals you have created
            will remain in the database and can still be used by other users.
          </p>
          <button
            type="button"
            className="settings__btn-danger"
            onClick={() => setIsDeleteDialogOpen(true)}
            aria-label="Delete my account"
          >
            Delete My Account
          </button>
        </div>
      </div>

      <Dialog
        open={isDeleteDialogOpen}
        onClose={() => !isDeleting && setIsDeleteDialogOpen(false)}
        title="Delete Account"
      >
        <p>
          Are you sure you want to permanently delete your account? The
          following personal data will be removed:
        </p>
        <ul className="settings__delete-list">
          <li>Your profile and login credentials</li>
          <li>Your concert attendance records (including costs and notes)</li>
          <li>Your active sessions</li>
        </ul>
        <p>
          <strong>This action cannot be undone.</strong> Consider{" "}
          <button
            type="button"
            className="settings__inline-link"
            onClick={() => {
              setIsDeleteDialogOpen(false)
              handleExport("json")
            }}
          >
            downloading your data
          </button>{" "}
          before proceeding.
        </p>
        <div className="settings__dialog-actions">
          <button
            type="button"
            className="settings__btn-secondary"
            onClick={() => setIsDeleteDialogOpen(false)}
            disabled={isDeleting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="settings__btn-danger"
            onClick={handleDeleteAccount}
            disabled={isDeleting}
          >
            {isDeleting ? "Deleting…" : "Yes, delete my account"}
          </button>
        </div>
      </Dialog>
    </div>
  )
}
