import { useState, useEffect } from 'react'
import { useAuth } from './context/AuthContext'
import Nav from './components/Nav'
import HomePage from './pages/HomePage'
import EventsPage from './pages/EventsPage'
import EventDetailPage from './pages/EventDetailPage.tsx'
import CheckoutPage from './pages/CheckoutPage'
import DigitalTicketPage from './pages/DigitalTicketPage'
import AgentTicketPage from './pages/AgentTicketPage'
import MyTicketsPage from './pages/MyTicketsPage'
import OrganizersPage from './pages/OrganizersPage'
import ExploreOrganizersPage from './pages/ExploreOrganizersPage.tsx'
import OrganizerDashboardPage from './pages/OrganizerDashboardPage'
import AgentDashboardPage from './pages/AgentDashboardPage'
import AdminDashboardPage from './pages/AdminDashboardPage'
import CheckInPage from './pages/CheckInPage'
import AuthPage from './pages/AuthPage'
import ProfilePage from './pages/ProfilePage'
import NotificationsPage from './pages/NotificationsPage'
import FavoritesPage from './pages/FavoritesPage'
import OrganizerProfilePage from './pages/OrganizerProfilePage'
import AboutPage from './pages/AboutPage'
import AboutInfoPage from './pages/AboutInfoPage'
import InfoPage from './pages/InfoPage'
import BottomNav from './components/BottomNav'
import Footer from './components/Footer'
import { replaceFavoriteEventIds, setFavoriteUser } from './lib/favorites'
import { supabase } from './lib/supabase'
import { type Event, type Organizer } from './lib/types'
import { FEATURES } from './lib/features'

type Page =
  | 'home'
  | 'events'
  | 'event-detail'
  | 'checkout'
  | 'ticket'
  | 'agent-ticket'
  | 'my-tickets'
  | 'organizers'
  | 'explore-organizers'
  | 'dashboard'
  | 'agent-dashboard'
  | 'admin-dashboard'
  | 'checkin'
  | 'auth-customer'
  | 'auth-organizer'
  | 'profile'
  | 'notifications'
  | 'favorites'
  | 'organizer-profile'
  | 'about'
  | 'marketing'
  | 'help'
  | 'contact'
  | 'terms'
  | 'privacy'
  | 'refunds'

const NO_NAV: Set<Page> = new Set(['checkin', 'auth-customer', 'auth-organizer', 'dashboard', 'agent-dashboard', 'admin-dashboard', 'agent-ticket'])
const EVENTS_PLATFORM_PAGES: Set<Page> = new Set(['home', 'events', 'event-detail', 'checkout', 'ticket', 'my-tickets', 'profile', 'notifications', 'favorites', 'organizer-profile'])
const MARKETPLACE_PAGES: Set<Page> = new Set(['home', 'events', 'event-detail', 'organizers', 'explore-organizers', 'organizer-profile'])

type PublicPlatformSettings = {
  platform_name: string
  support_email: string
  maintenance_mode: boolean
  maintenance_message: string
  marketplace_enabled: boolean
}

const DEFAULT_PUBLIC_PLATFORM_SETTINGS: PublicPlatformSettings = {
  platform_name: 'Tiketi',
  support_email: 'hello@tiketi.events',
  maintenance_mode: false,
  maintenance_message: '',
  marketplace_enabled: true,
}

const PAGE_PATHS: Record<Page, string> = {
  home: '/',
  events: '/discover-events',
  'event-detail': '/event',
  checkout: '/checkout',
  ticket: '/ticket',
  'agent-ticket': '/agent-ticket',
  'my-tickets': '/my-tickets',
  organizers: '/organizers',
  'explore-organizers': '/explore-organizers',
  dashboard: '/dashboard',
  'agent-dashboard': '/agent-dashboard/overview',
  'admin-dashboard': '/admin-dashboard',
  checkin: '/check-in',
  'auth-customer': '/sign-in',
  'auth-organizer': '/organizer-sign-in',
  profile: '/profile',
  notifications: '/notifications',
  favorites: '/favorites',
  'organizer-profile': '/organizer',
  about: '/about',
  marketing: '/marketing',
  help: '/help',
  contact: '/contact',
  terms: '/terms',
  privacy: '/privacy',
  refunds: '/refunds',
}

const PATH_PAGES = Object.entries(PAGE_PATHS).reduce<Record<string, Page>>((pages, [page, path]) => {
  pages[path] = page as Page
  return pages
}, {})

function pageFromPath(pathname: string): Page {
  const normalizedPath = pathname.replace(/\/$/, '') || '/'
  if (!FEATURES.refunds && normalizedPath === '/refunds') return 'home'
  if (normalizedPath.startsWith('/events/') || normalizedPath.startsWith('/event/')) return 'event-detail'
  if (normalizedPath.startsWith('/organizers/') || normalizedPath.startsWith('/organizer/')) return 'organizer-profile'
  if (normalizedPath.startsWith('/checkout/')) return 'checkout'
  if (normalizedPath === '/dashboard' || normalizedPath.startsWith('/dashboard/')) return 'dashboard'
  if (normalizedPath === '/agent-dashboard' || normalizedPath.startsWith('/agent-dashboard/')) return 'agent-dashboard'
  if (normalizedPath === '/admin-dashboard' || normalizedPath.startsWith('/admin-dashboard/')) return 'admin-dashboard'
  if (normalizedPath === '/agent-ticket') return 'agent-ticket'
  return PATH_PAGES[normalizedPath] ?? 'home'
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function pathForPage(page: Page, extra?: unknown) {
  if (page === 'event-detail' && extra && typeof extra === 'object' && 'id' in extra) {
    const event = extra as { id: string; title?: string; name?: string }
    return `/events/${event.id}/${slugify(event.title ?? event.name ?? 'event')}`
  }
  if (page === 'organizer-profile' && extra && typeof extra === 'object' && 'id' in extra) {
    const organizer = extra as { id: string; name?: string }
    return `/organizers/${organizer.id}/${slugify(organizer.name ?? 'organizer')}`
  }
  if (page === 'checkout' && extra && typeof extra === 'object' && 'event' in extra) {
    const checkout = extra as { event: { id: string }; checkoutStep?: number }
    const steps = ['tickets', 'info', 'payment']
    return `/checkout/${checkout.event.id}/${steps[(checkout.checkoutStep ?? 1) - 1] ?? steps[0]}`
  }
  if (page === 'ticket' && extra && typeof extra === 'object' && 'event' in extra) {
    return `/ticket/${(extra as { event: { id: string } }).event.id}`
  }
  if (page === 'agent-dashboard') return '/agent-dashboard/overview'
  return PAGE_PATHS[page]
}

export default function App() {
  const { user, profile, organizer, loading, profileLoading, isOrganizer, teamMembership, agentAssignments, agentInvitations } = useAuth()
  const [page, setPage] = useState<Page>(() => pageFromPath(window.location.pathname))
  const [eventDetail, setEventDetail] = useState<Event | null>(null)
  const [resourceError, setResourceError] = useState('')
  const [resourceRetryToken, setResourceRetryToken] = useState(0)
  const [authPrompt, setAuthPrompt] = useState<{ title: string; message: string; mode: 'customer' | 'organizer' } | null>(null)
  const [organizerDetail, setOrganizerDetail] = useState<Organizer | null>(null)
  const [publicPlatformSettings, setPublicPlatformSettings] = useState<PublicPlatformSettings>(DEFAULT_PUBLIC_PLATFORM_SETTINGS)
  const [checkoutData, setCheckoutData] = useState<{
    event: Event
    quantities: Record<string, number>
    subtotal: number
    total: number
  } | null>(null)
  const [ticketData, setTicketData] = useState<{
    event: Event
    info: { name: string; phone: string; email: string }
  } | null>(null)

  useEffect(() => {
    let isMounted = true
    const loadPublicPlatformSettings = async () => {
      const { data } = await supabase.rpc('get_public_platform_checkout_settings')
      const settings = Array.isArray(data) ? data[0] : data
      if (!isMounted || !settings) return
      setPublicPlatformSettings({
        platform_name: settings.platform_name ?? DEFAULT_PUBLIC_PLATFORM_SETTINGS.platform_name,
        support_email: settings.support_email ?? DEFAULT_PUBLIC_PLATFORM_SETTINGS.support_email,
        maintenance_mode: settings.maintenance_mode ?? false,
        maintenance_message: settings.maintenance_message ?? '',
        marketplace_enabled: settings.marketplace_enabled ?? true,
      })
    }
    void loadPublicPlatformSettings()
    return () => { isMounted = false }
  }, [])

  // After sign-in, redirect away from auth pages once profile is confirmed loaded
  useEffect(() => {
    if (loading || profileLoading) return
    const intent = new URLSearchParams(window.location.search).get('intent')
    if (user && (page === 'auth-customer' || page === 'auth-organizer')) {
      const hasPendingInvitation = teamMembership?.status === 'pending'
      const hasPendingAgentInvitation = agentInvitations.length > 0
      const nextPage: Page = (isOrganizer || hasPendingInvitation || intent === 'organizer') ? 'dashboard' : agentAssignments.length || hasPendingAgentInvitation ? 'agent-dashboard' : 'home'
      setPage(nextPage)
      window.history.replaceState({}, '', PAGE_PATHS[nextPage])
    } else if (intent) {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [loading, profileLoading, user, isOrganizer, teamMembership?.status, agentAssignments.length])

  useEffect(() => {
    const handlePopState = () => setPage(pageFromPath(window.location.pathname))
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    const pathParts = window.location.pathname.split('/').filter(Boolean)
    const resourceId = pathParts[1]
    if (!resourceId || (page !== 'event-detail' && page !== 'organizer-profile')) return
    setResourceError('')

    const loadSharedResource = async () => {
      if (page === 'event-detail' && (!eventDetail || eventDetail.id !== resourceId)) {
        setEventDetail(null)
        const { data, error } = await supabase.from('events').select('*, ticket_tiers(*), organizers(*, profiles!organizers_user_id_fkey(*))').eq('id', resourceId).single()
        if (error) { setResourceError(error.message); return }
        if (data) setEventDetail(data as Event)
      }
      if (page === 'organizer-profile' && (!organizerDetail || organizerDetail.id !== resourceId)) {
        setOrganizerDetail(null)
        const { data, error } = await supabase.from('organizers').select('*, profiles!organizers_user_id_fkey(*)').eq('id', resourceId).single()
        if (error) { setResourceError(error.message); return }
        if (data) setOrganizerDetail(data as Organizer)
      }
    }
    void loadSharedResource()
  }, [page, eventDetail, organizerDetail, resourceRetryToken])

  useEffect(() => {
    if (!NO_NAV.has(page)) window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [page])

  useEffect(() => {
    setFavoriteUser(user?.id ?? null)
  }, [user?.id])

  useEffect(() => {
    const handleRequireAuth = (event: globalThis.Event) => {
      const detail = (event as CustomEvent<{ title?: string; message?: string; mode?: 'customer' | 'organizer' }>).detail ?? {}
      requestAuth(detail.title ?? 'Sign in to continue', detail.message ?? 'Create an account to keep going.', detail.mode ?? 'customer')
    }

    window.addEventListener('tiketi:require-auth', handleRequireAuth)
    return () => window.removeEventListener('tiketi:require-auth', handleRequireAuth)
  }, [])

  useEffect(() => {
    if (!user) return
    const loadFavorites = async () => {
      const { data } = await supabase.from('event_favorites').select('event_id').eq('user_id', user.id)
      if (data) replaceFavoriteEventIds(data.map(row => row.event_id))
    }
    void loadFavorites()
    const channel = supabase.channel(`event-favorites:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_favorites', filter: `user_id=eq.${user.id}` }, () => { void loadFavorites() })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [user?.id])

  const navigate = (target: string, extra?: unknown) => {
    const p = target as Page
    if (p === 'event-detail' && extra) setEventDetail(extra as Event)
    if (p === 'organizer-profile' && extra) setOrganizerDetail(extra as Organizer)
    if (p === 'checkout' && extra) setCheckoutData(extra as typeof checkoutData)
    if ((p === 'ticket' || p === 'agent-ticket') && extra) setTicketData(extra as typeof ticketData)
    setPage(p)
    const path = pathForPage(p, extra)
    if (path && window.location.pathname !== path) window.history.pushState({}, '', path)
  }

  const requestAuth = (title: string, message: string, mode: 'customer' | 'organizer' = 'customer') => {
    setAuthPrompt({ title, message, mode })
  }

  const handleAuthPromptSignIn = () => {
    if (!authPrompt) return
    setAuthPrompt(null)
    navigate(authPrompt.mode === 'organizer' ? 'auth-organizer' : 'auth-customer')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: 'var(--background)' }}>
        <div className="flex flex-col items-center gap-4">
          <div className="text-3xl font-black" style={{ fontFamily: 'Outfit, sans-serif', color: 'var(--primary)' }}>TIKETI</div>
          <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }} />
        </div>
      </div>
    )
  }

  // Auth pages — full screen, no nav
  if (page === 'auth-customer') return <AuthPage defaultMode="customer" />
  if (page === 'auth-organizer') return <AuthPage defaultMode="organizer" />

  const isPlatformAdmin = profile?.role === 'admin'
  const statusTitle = publicPlatformSettings.maintenance_mode ? 'We’ll be back shortly' : 'The marketplace is temporarily unavailable'
  const statusMessage = publicPlatformSettings.maintenance_mode
    ? publicPlatformSettings.maintenance_message || 'We are making a few improvements to the platform. Please check back shortly.'
    : 'Event discovery is temporarily paused. Your existing tickets and account remain available.'
  const shouldShowPlatformStatus = !profileLoading
    && !isPlatformAdmin
    && (publicPlatformSettings.maintenance_mode || (!publicPlatformSettings.marketplace_enabled && MARKETPLACE_PAGES.has(page)))

  if (shouldShowPlatformStatus) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center" style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
        <div className="w-full max-w-lg rounded-3xl border p-8 shadow-2xl" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
          <p className="text-xs font-black uppercase tracking-[0.24em]" style={{ color: 'var(--primary)' }}>{publicPlatformSettings.platform_name}</p>
          <h1 className="mt-3 text-3xl font-black" style={{ fontFamily: 'Outfit, sans-serif' }}>{statusTitle}</h1>
          <p className="mt-4 text-sm leading-6" style={{ color: 'var(--muted-foreground)' }}>{statusMessage}</p>
          <p className="mt-4 text-xs" style={{ color: 'var(--muted-foreground)' }}>Need help? {publicPlatformSettings.support_email}</p>
          {!publicPlatformSettings.maintenance_mode && (user ? <button type="button" onClick={() => navigate('my-tickets')} className="mt-6 rounded-xl px-5 py-3 text-sm font-bold" style={{ background: 'var(--primary)', color: '#000' }}>View my tickets</button> : <button type="button" onClick={() => navigate('auth-customer')} className="mt-6 rounded-xl px-5 py-3 text-sm font-bold" style={{ background: 'var(--primary)', color: '#000' }}>Sign in</button>)}
        </div>
      </div>
    )
  }

  // Check-in is limited to organizer owners and team roles with checkin access.
  if (page === 'checkin') {
    const isOrganizerOwner = isOrganizer && organizer?.user_id === profile?.id
    const isAuthorizedTeamMember = teamMembership?.status === 'active' && (teamMembership.organizer_roles?.permissions?.all === true || teamMembership.organizer_roles?.permissions?.checkin === true)
    const canCheckIn = isOrganizerOwner || isAuthorizedTeamMember
    return canCheckIn
      ? <CheckInPage navigate={navigate} />
      : <div className="flex min-h-screen items-center justify-center p-6 text-center" style={{ background: 'var(--background)', color: 'var(--foreground)' }}><div><p className="text-xl font-bold">Check-in access required</p><p className="mt-2 text-sm" style={{ color: 'var(--muted-foreground)' }}>Ask the organizer to assign the check-in permission to your role.</p><button onClick={() => navigate('dashboard')} className="mt-5 rounded-xl px-5 py-3 text-sm font-bold" style={{ background: 'var(--primary)', color: '#000' }}>Back to dashboard</button></div></div>
  }

  return (
    <div style={{ background: 'var(--background)', minHeight: '100%' }}>
      {!NO_NAV.has(page) && page !== 'agent-ticket' && <Nav current={page} navigate={navigate} profile={profile} user={user} />}
      {EVENTS_PLATFORM_PAGES.has(page) && page !== 'agent-ticket' && <BottomNav current={page} navigate={navigate} />}

      {authPrompt && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" style={{ background: 'rgba(2,2,2,0.72)', backdropFilter: 'blur(16px)' }}>
          <div className="w-full max-w-md rounded-[28px] border p-6 text-center shadow-2xl"
            style={{ background: 'rgba(19,19,19,0.96)', borderColor: 'rgba(255,255,255,0.08)', boxShadow: '0 28px 80px rgba(0,0,0,0.5)' }}>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full text-lg font-black"
              style={{ background: 'linear-gradient(135deg, rgba(249,112,21,0.24), rgba(249,112,21,0.08))', color: '#ffbf8a' }}>
              t
            </div>
            <p className="text-[10px] font-medium uppercase tracking-[0.24em]" style={{ color: 'rgba(255,255,255,0.5)' }}>Required</p>
            <h3 className="mt-2 text-2xl font-bold" style={{ fontFamily: 'Inter, sans-serif', letterSpacing: '-0.04em' }}>{authPrompt.title}</h3>
            <p className="mt-3 text-sm leading-6" style={{ color: 'var(--muted-foreground)' }}>{authPrompt.message}</p>
            <div className="mt-6 flex gap-3">
              <button onClick={() => setAuthPrompt(null)} className="flex-1 rounded-2xl border px-4 py-3 text-sm font-semibold"
                style={{ background: 'transparent', borderColor: 'rgba(255,255,255,0.08)', color: 'var(--foreground)' }}>
                Later
              </button>
              <button onClick={handleAuthPromptSignIn} className="flex-1 rounded-2xl px-4 py-3 text-sm font-bold"
                style={{ background: 'linear-gradient(135deg, #ff7a18 0%, #ff9e45 45%, #ffd36b 100%)', color: '#17100a', boxShadow: '0 10px 24px rgba(249,112,21,0.22)' }}>
                Sign in
              </button>
            </div>
          </div>
        </div>
      )}

      {page === 'home' && <HomePage navigate={navigate} />}
      {page === 'events' && <EventsPage navigate={navigate} />}
      {page === 'event-detail' && eventDetail && <EventDetailPage event={eventDetail as any} navigate={navigate} onRequireAuth={requestAuth} />}
      {page === 'event-detail' && !eventDetail && (
        <div className="flex items-center justify-center min-h-screen flex-col gap-4 pt-16">
          <p className="text-xl font-bold">{resourceError ? 'Unable to load this event' : 'Loading event...'}</p>
          <p className="max-w-md text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>{resourceError || 'Please wait while we load the event details.'}</p>
          <div className="flex gap-3"><button onClick={() => setResourceRetryToken(current => current + 1)} className="rounded-xl px-5 py-3 text-sm font-bold" style={{ background: 'var(--primary)', color: '#000' }}>Try again</button><button onClick={() => navigate('events')} className="rounded-xl px-5 py-3 text-sm font-bold" style={{ background: 'var(--muted)', color: 'var(--foreground)' }}>Browse Events</button></div>
        </div>
      )}
      {page === 'checkout' && checkoutData && <CheckoutPage data={checkoutData as any} navigate={navigate} />}
      {page === 'checkout' && !checkoutData && (
        <div className="flex items-center justify-center min-h-screen flex-col gap-4 pt-16">
          <p className="text-xl font-bold">No tickets selected</p>
          <button onClick={() => navigate('events')} className="px-6 py-3 rounded-xl font-bold" style={{ background: 'var(--primary)', color: '#000' }}>Browse Events</button>
        </div>
      )}
      {page === 'ticket' && ticketData && <DigitalTicketPage data={ticketData as any} navigate={navigate} />}
      {page === 'agent-ticket' && ticketData && <AgentTicketPage data={ticketData as any} navigate={navigate} />}
      {page === 'my-tickets' && (
        user
          ? <MyTicketsPage navigate={navigate} />
          : <div className="flex items-center justify-center min-h-screen flex-col gap-4 pt-16">
              <p className="text-xl font-bold">Sign in to view your tickets</p>
              <button onClick={() => navigate('auth-customer')} className="px-6 py-3 rounded-xl font-bold" style={{ background: 'var(--primary)', color: '#fff' }}>Sign In</button>
            </div>
      )}
      {page === 'organizers' && <OrganizersPage navigate={navigate} />}
      {page === 'explore-organizers' && <ExploreOrganizersPage navigate={navigate} />}
      {page === 'profile' && <ProfilePage navigate={navigate} />}
      {page === 'notifications' && <NotificationsPage navigate={navigate} />}
      {page === 'favorites' && <FavoritesPage navigate={navigate} />}
      {page === 'organizer-profile' && organizerDetail && <OrganizerProfilePage organizer={organizerDetail} navigate={navigate} />}
      {page === 'organizer-profile' && !organizerDetail && (
        <div className="flex min-h-screen items-center justify-center flex-col gap-4 pt-16">
          <p className="text-xl font-bold">{resourceError ? 'Unable to load this organizer' : 'Loading organizer...'}</p>
          <p className="max-w-md text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>{resourceError || 'Please wait while we load the organizer profile.'}</p>
          <div className="flex gap-3"><button onClick={() => setResourceRetryToken(current => current + 1)} className="rounded-xl px-5 py-3 text-sm font-bold" style={{ background: 'var(--primary)', color: '#000' }}>Try again</button><button onClick={() => navigate('organizers')} className="rounded-xl px-5 py-3 text-sm font-bold" style={{ background: 'var(--muted)', color: 'var(--foreground)' }}>Browse organizers</button></div>
        </div>
      )}
      {page === 'marketing' && <AboutPage navigate={navigate} />}
      {page === 'about' && <AboutInfoPage navigate={navigate} />}
      {(['help', 'contact', 'terms', ...(FEATURES.refunds ? ['refunds' as const] : []), 'privacy'] as const).includes(page as 'help' | 'contact' | 'terms' | 'privacy' | 'refunds') && <InfoPage kind={page as 'help' | 'contact' | 'terms' | 'privacy' | 'refunds'} navigate={navigate} />}
      {page === 'dashboard' && (
        !user
          ? <div className="flex items-center justify-center min-h-screen flex-col gap-4 pt-16">
              <p className="text-xl font-bold">Sign in to access the dashboard</p>
              <button onClick={() => navigate('auth-organizer')} className="px-6 py-3 rounded-xl font-bold" style={{ background: 'var(--primary)', color: '#fff' }}>Sign in as Organizer</button>
            </div>
          : profileLoading
            // Profile still loading from server — never flash "access denied"
            ? <div className="flex items-center justify-center min-h-screen flex-col gap-3 pt-16">
                <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }} />
                <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Loading your dashboard…</p>
              </div>
            : (isOrganizer || teamMembership?.status === 'pending')
              ? <OrganizerDashboardPage navigate={navigate} />
              : <div className="flex items-center justify-center min-h-screen flex-col gap-4 pt-16">
                  <p className="text-xl font-bold">Organizer access required</p>
                  <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>This account is not registered as an organizer.</p>
                  <button onClick={() => navigate('home')} className="px-6 py-3 rounded-xl font-bold" style={{ background: 'var(--primary)', color: '#fff' }}>Go Home</button>
                </div>
      )}
      {page === 'admin-dashboard' && (
        !user
          ? <div className="flex min-h-screen items-center justify-center flex-col gap-4 pt-16"><p className="text-xl font-bold">Sign in to access admin tools</p><button onClick={() => navigate('auth-customer')} className="px-6 py-3 rounded-xl font-bold" style={{ background: 'var(--primary)', color: '#fff' }}>Sign In</button></div>
          : profileLoading
            ? <div className="flex min-h-screen items-center justify-center"><div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }} /></div>
            : profile?.role === 'admin'
              ? <AdminDashboardPage navigate={navigate} />
              : <div className="flex min-h-screen items-center justify-center flex-col gap-4"><p className="text-xl font-bold">Admin access required.</p><p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>This account does not have platform admin privileges.</p></div>
      )}
      {page === 'agent-dashboard' && (
        !user
          ? <div className="flex min-h-screen items-center justify-center flex-col gap-4 pt-16"><p className="text-xl font-bold">Sign in to access agent tools</p><button onClick={() => navigate('auth-customer')} className="px-6 py-3 rounded-xl font-bold" style={{ background: 'var(--primary)', color: '#fff' }}>Sign In</button></div>
          : profileLoading
            ? <div className="flex min-h-screen items-center justify-center"><div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }} /></div>
            : agentAssignments.length > 0 || agentInvitations.length > 0
              ? <AgentDashboardPage navigate={navigate} />
              : <div className="flex min-h-screen items-center justify-center flex-col gap-4"><p className="text-xl font-bold">Agent access required.</p><p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>This account does not have an active agent assignment.</p></div>
      )}
      {!['auth-customer', 'auth-organizer', 'checkin', 'dashboard', 'agent-dashboard', 'agent-ticket', 'admin-dashboard'].includes(page) && <Footer navigate={navigate} />}
    </div>
  )
}
