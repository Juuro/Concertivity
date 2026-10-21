export const PADDLE_CONSENT_STORAGE_KEY = "concertivity_paddle_consent_v1"
export const PADDLE_CONSENT_EVENT = "concertivity:paddle-consent-changed"

export type PaddleConsentState = "granted" | "denied" | null

export function getPaddleConsentState(): PaddleConsentState {
  if (typeof window === "undefined") return null

  try {
    const value = window.localStorage.getItem(PADDLE_CONSENT_STORAGE_KEY)
    if (value === "granted" || value === "denied") return value
    return null
  } catch {
    return null
  }
}

export function setPaddleConsentState(
  state: Exclude<PaddleConsentState, null>
): boolean {
  if (typeof window === "undefined") return false

  try {
    window.localStorage.setItem(PADDLE_CONSENT_STORAGE_KEY, state)
    window.dispatchEvent(new Event(PADDLE_CONSENT_EVENT))
    return true
  } catch {
    return false
  }
}
