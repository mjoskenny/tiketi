export type CookieCategory = 'essential' | 'analytics' | 'marketing' | 'personalization'

export type CookiePreferences = Record<CookieCategory, boolean>

const COOKIE_KEY = 'tiketi-cookie-preferences'

export const DEFAULT_COOKIE_PREFERENCES: CookiePreferences = {
  essential: true,
  analytics: false,
  marketing: false,
  personalization: false,
}

function isBrowser() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

export function getCookiePreferences(): CookiePreferences {
  if (!isBrowser()) return { ...DEFAULT_COOKIE_PREFERENCES }

  try {
    const saved = window.localStorage.getItem(COOKIE_KEY)
    if (!saved) return { ...DEFAULT_COOKIE_PREFERENCES }

    const parsed = JSON.parse(saved) as Partial<CookiePreferences>
    return {
      essential: true,
      analytics: Boolean(parsed.analytics),
      marketing: Boolean(parsed.marketing),
      personalization: Boolean(parsed.personalization),
    }
  } catch {
    return { ...DEFAULT_COOKIE_PREFERENCES }
  }
}

export function hasSavedCookieConsent() {
  return isBrowser() && Boolean(window.localStorage.getItem(COOKIE_KEY))
}

export function saveCookiePreferences(next: Partial<CookiePreferences>): CookiePreferences {
  const merged: CookiePreferences = {
    ...DEFAULT_COOKIE_PREFERENCES,
    ...getCookiePreferences(),
    ...next,
    essential: true,
  }

  if (isBrowser()) {
    window.localStorage.setItem(COOKIE_KEY, JSON.stringify(merged))
    window.dispatchEvent(new CustomEvent('tiketi:cookie-preferences-updated', { detail: { preferences: merged } }))
  }

  return merged
}

export function resetCookiePreferences(): CookiePreferences {
  const defaults = { ...DEFAULT_COOKIE_PREFERENCES }

  if (isBrowser()) {
    window.localStorage.removeItem(COOKIE_KEY)
    window.dispatchEvent(new CustomEvent('tiketi:cookie-preferences-updated', { detail: { preferences: defaults } }))
  }

  return defaults
}

export function hasCookieConsent(category: Exclude<CookieCategory, 'essential'>): boolean {
  return getCookiePreferences()[category] === true
}
