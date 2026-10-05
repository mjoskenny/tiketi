import type { CookiePreferences } from './cookies'

type TrackingConfiguration = {
  preferences: CookiePreferences
  googleAnalyticsId: string
  metaPixelId: string
}

type TrackingParams = Record<string, unknown>

type Gtag = (...args: unknown[]) => void
type Fbq = ((...args: unknown[]) => void) & { callMethod?: (...args: unknown[]) => void; queue?: unknown[]; loaded?: boolean; version?: string; push?: Fbq }

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: Gtag
    fbq?: Fbq
    _fbq?: Fbq
  }
}

let configuredGoogleId = ''
let configuredMetaId = ''
let analyticsAllowed = false
let marketingAllowed = false
let lastAnalyticsPath = ''
let lastMarketingPath = ''

function loadScript(id: string, src: string) {
  if (document.getElementById(id)) return
  const script = document.createElement('script')
  script.id = id
  script.async = true
  script.src = src
  document.head.appendChild(script)
}

function ensureGtag(measurementId: string) {
  if (!window.gtag) {
    window.dataLayer = window.dataLayer ?? []
    window.gtag = (...args: unknown[]) => window.dataLayer?.push(args)
    window.gtag('consent', 'default', {
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    })
    window.gtag('js', new Date())
  }

  if (configuredGoogleId !== measurementId) {
    loadScript('qpassa-google-analytics', `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`)
    window.gtag('config', measurementId, { send_page_view: false })
    configuredGoogleId = measurementId
    lastAnalyticsPath = ''
  }
}

function ensureFbq(pixelId: string) {
  if (!window.fbq) {
    const fbq = ((...args: unknown[]) => {
      if (fbq.callMethod) fbq.callMethod(...args)
      else fbq.queue?.push(args)
    }) as Fbq
    fbq.queue = []
    fbq.loaded = true
    fbq.version = '2.0'
    fbq.push = fbq
    window.fbq = fbq
    window._fbq = fbq
    loadScript('qpassa-meta-pixel', 'https://connect.facebook.net/en_US/fbevents.js')
  }

  if (configuredMetaId !== pixelId) {
    window.fbq('init', pixelId)
    configuredMetaId = pixelId
    lastMarketingPath = ''
  }
}

export function configureConsentTracking({ preferences, googleAnalyticsId, metaPixelId }: TrackingConfiguration) {
  const googleId = googleAnalyticsId.trim()
  const pixelId = metaPixelId.trim()
  const validGoogleId = /^G-[A-Z0-9]+$/i.test(googleId) ? googleId : ''
  const validPixelId = /^\d{5,20}$/.test(pixelId) ? pixelId : ''

  analyticsAllowed = Boolean(preferences.analytics && validGoogleId)
  marketingAllowed = Boolean(preferences.marketing && validPixelId)

  if (analyticsAllowed) {
    ensureGtag(validGoogleId)
    window.gtag?.('consent', 'update', {
      analytics_storage: 'granted',
      ad_storage: preferences.marketing ? 'granted' : 'denied',
      ad_user_data: preferences.marketing ? 'granted' : 'denied',
      ad_personalization: preferences.marketing ? 'granted' : 'denied',
    })
  } else if (configuredGoogleId) {
    window.gtag?.('consent', 'update', {
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    })
    lastAnalyticsPath = ''
  }

  if (marketingAllowed) {
    ensureFbq(validPixelId)
    window.fbq?.('consent', 'grant')
  } else if (configuredMetaId) {
    window.fbq?.('consent', 'revoke')
    lastMarketingPath = ''
  }
}

export function trackConsentedPageView(path: string, title: string) {
  if (analyticsAllowed && configuredGoogleId && lastAnalyticsPath !== path) {
    window.gtag?.('event', 'page_view', { page_path: path, page_title: title })
    lastAnalyticsPath = path
  }

  if (marketingAllowed && configuredMetaId && lastMarketingPath !== path) {
    window.fbq?.('track', 'PageView')
    lastMarketingPath = path
  }
}

export function trackConsentedEvent(name: string, params: TrackingParams = {}) {
  if (analyticsAllowed && configuredGoogleId) {
    const safeParams = Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined))
    window.gtag?.('event', name, safeParams)
  }
}

export function trackConsentedMarketingEvent(name: string, params: TrackingParams = {}) {
  if (!marketingAllowed || !configuredMetaId) return
  const safeParams = Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined))
  window.fbq?.('track', name, safeParams)
}
