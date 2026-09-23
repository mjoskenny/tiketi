import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { categories } from '../data/events'
import { SearchIcon, XIcon, FilterIcon, TagIcon, SparkleIcon, CalendarIcon, MapPinIcon, ArrowRightIcon, CheckIcon } from '../components/Icon'
import EventCard from '../components/EventCard'
import type { Event, Organizer } from '../lib/types'
import { ORGANIZER_COVER_PLACEHOLDER } from '../lib/profileMedia'

type Props = { navigate: (p: string, extra?: unknown) => void }
type QuickFilter = 'all' | 'today' | 'tomorrow' | 'weekend'

function sortUpcomingFirst(events: Event[]) {
  return [...events].sort((a, b) => {
    const aTime = new Date(`${a.date}T${a.end_time || a.time || '23:59:59'}`).getTime()
    const bTime = new Date(`${b.date}T${b.end_time || b.time || '23:59:59'}`).getTime()
    const aUpcoming = aTime >= Date.now()
    const bUpcoming = bTime >= Date.now()

    if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1
    if (aUpcoming) return aTime - bTime
    return bTime - aTime
  })
}

function isToday(d: string) {
  const today = new Date(); const ed = new Date(d)
  return ed.toDateString() === today.toDateString()
}
function isTomorrow(d: string) {
  const t = new Date(); t.setDate(t.getDate() + 1); const ed = new Date(d)
  return ed.toDateString() === t.toDateString()
}
function isWeekend(d: string) {
  const ed = new Date(d); const day = ed.getDay()
  const now = new Date()
  const daysUntilSat = (6 - now.getDay() + 7) % 7
  const sat = new Date(now); sat.setDate(now.getDate() + daysUntilSat)
  const sun = new Date(sat); sun.setDate(sat.getDate() + 1)
  return ed.toDateString() === sat.toDateString() || ed.toDateString() === sun.toDateString()
}

const TIME_FILTERS: { key: QuickFilter; label: string }[] = [
  { key: 'all', label: 'All events' },
  { key: 'today', label: 'Today' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'weekend', label: 'This weekend' },
]

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className="flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap"
      style={{
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
                background: active ? 'rgba(249,112,21,0.2)' : 'rgba(255,255,255,0.06)',
                border: `1px solid ${active ? 'rgba(249,112,21,0.55)' : 'rgba(255,255,255,0.14)'}`,
        color: active ? '#ffad78' : 'rgba(255,255,255,0.72)',
        boxShadow: active ? '0 0 12px rgba(249,112,21,0.16)' : 'none',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.09)' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
    >
      {children}
    </button>
  )
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}
function fmtPrice(n: number) { return n === 0 ? 'Free' : n.toLocaleString() + ' BIF' }

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return <div className="home-section-heading flex items-end justify-between mb-5">
    <div>
      <h2 className="text-xl font-bold" style={{ letterSpacing: '-0.025em' }}>{title}</h2>
      {subtitle && <p className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>{subtitle}</p>}
    </div>
  </div>
}

function FeaturedCard({ event, onClick }: { event: Event; onClick: () => void }) {
  const img = event.cover_image || 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=900&h=500&fit=crop&auto=format'
  const minPrice = event.ticket_tiers?.length ? Math.min(...event.ticket_tiers.map(t => t.price)) : 0

  return (
    <article onClick={onClick} className="relative rounded-2xl overflow-hidden cursor-pointer flex-shrink-0"
      style={{ width: 340, minHeight: 240, background: 'var(--card)', border: '1px solid var(--border)', transition: 'transform 0.2s, box-shadow 0.2s' }}
      onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.transform = 'translateY(-4px)'; el.style.boxShadow = '0 24px 60px rgba(0,0,0,0.6)' }}
      onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.transform = ''; el.style.boxShadow = '' }}>
      <img src={img} alt={event.title} className="w-full h-52 object-cover" />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.95) 30%, rgba(0,0,0,0.05) 70%)' }} />
      <div className="absolute top-3 left-3">
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
              style={{ background: 'rgba(249,112,21,0.82)', backdropFilter: 'blur(12px)', color: '#fff', border: '1px solid rgba(249,112,21,0.3)' }}>
          Featured
        </span>
      </div>
      <div className="absolute bottom-0 left-0 right-0 p-4">
        <h3 className="font-bold text-base leading-snug mb-1.5 line-clamp-2" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{event.title}</h3>
        <div className="flex items-center gap-3 text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>
          <span className="flex items-center gap-1"><CalendarIcon size={11} /> {fmtDate(event.date)}</span>
          <span className="flex items-center gap-1"><MapPinIcon size={11} /> {event.venue}</span>
        </div>
        <div className="flex items-center justify-between mt-3">
          <span className="text-sm font-bold" style={{ color: 'var(--primary)' }}>{minPrice === 0 ? 'Free' : `From ${fmtPrice(minPrice)}`}</span>
          <span className="text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ background: 'rgba(249,112,21,0.16)', color: '#ffad78', border: '1px solid rgba(249,112,21,0.35)' }}>Get tickets</span>
        </div>
      </div>
    </article>
  )
}

function EmptySection({ message = 'No events available' }: { message?: string }) {
  return <div className="rounded-2xl border border-dashed border-white/10 px-5 py-8 text-center text-sm text-white/45">{message}</div>
}

function OrganizerProfileCard({ organizer, eventCount, coverImage, onClick }: { organizer: Organizer; eventCount: number; coverImage: string | null; onClick: () => void }) {
  const organizerName = organizer.profiles?.full_name?.trim() || organizer.name
  const initials = organizerName.slice(0, 1).toUpperCase()
  const bannerImage = organizer.profiles?.cover_image ?? coverImage ?? ORGANIZER_COVER_PLACEHOLDER
  const profileImage = organizer.profiles?.profile_image ?? organizer.profiles?.avatar_url ?? organizer.logo_url ?? null
  const username = organizer.profiles?.username?.trim().replace(/^@/, '') || null
  return (
    <button onClick={onClick} className="home-organizer-card group relative flex min-w-[300px] flex-1 flex-col overflow-hidden rounded-2xl border text-left transition-all" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
      <span className="relative block h-32 w-full shrink-0" style={{ background: 'var(--muted)' }}>
        {bannerImage && <img src={bannerImage} alt="" className="h-full w-full rounded-t-2xl object-cover opacity-75 transition-transform duration-300 group-hover:scale-105" />}
        <span className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
        <span className="absolute bottom-0 left-4 translate-y-1/2">
          {profileImage ? <img src={profileImage} alt={organizerName} className="h-14 w-14 rounded-full border-4 border-[var(--card)] object-cover" /> : <span className="flex h-14 w-14 items-center justify-center rounded-full border-4 border-[var(--card)] text-lg font-semibold" style={{ background: 'rgba(249,112,21,0.9)', color: '#fff' }}>{initials}</span>}
        </span>
      </span>
      <span className="flex min-w-0 flex-1 items-start gap-3 px-4 pb-4 pt-9">
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 truncate text-base font-semibold text-white">{organizerName}{(organizer.verified || organizer.verification_status === 'verified') && <span className="event-verified inline-flex items-center gap-1" title="Verified organizer"><CheckIcon size={10} /></span>}</span>
          {username && <span className="mt-0.5 block truncate text-xs" style={{ color: 'var(--muted-foreground)' }}>@{username}</span>}
          <span className="mt-2 block truncate text-xs" style={{ color: 'var(--muted-foreground)' }}>{organizer.description || `${eventCount} published event${eventCount === 1 ? '' : 's'}`}</span>
        </span>
        <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-transform group-hover:translate-x-0.5" style={{ borderColor: 'var(--border)', color: 'var(--primary-light)' }} aria-hidden="true"><ArrowRightIcon size={15} /></span>
      </span>
    </button>
  )
}

export default function HomePage({ navigate }: Props) {
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [retryToken, setRetryToken] = useState(0)
  const [search, setSearch] = useState('')
  const [timeFilter, setTimeFilter] = useState<QuickFilter>('all')
  const [activeCategory, setActiveCategory] = useState('All')
  const [priceFilter, setPriceFilter] = useState<'all' | 'free' | 'paid'>('all')
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const loadEvents = async () => {
      setLoading(true)
      setLoadError('')
      const { data, error } = await supabase.from('events').select('*, tags, ticket_tiers(id, event_id, name, price, description, ticket_type, extra_info, expires_at, group_size, quantity, sold, created_at), organizers(id, user_id, name, description, logo_url, website, phone, city, verified, subscription_tier, created_at, profiles!organizers_user_id_fkey(id, full_name, username, profile_image, avatar_url, cover_image, email))').eq('status', 'published').order('created_at', { ascending: false }).limit(24)
      if (error) { setLoadError(error.message); setLoading(false); return }
      setEvents(data ?? [])
      setLoading(false)
    }
    void loadEvents()

    // Subscribe to real-time updates for events
    const eventsChannel = supabase
      .channel('public-events')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events', filter: 'status=eq.published' }, () => { void loadEvents() })
      .subscribe()

    // Subscribe to real-time updates for organizer profiles
    const profilesChannel = supabase
      .channel('public-profiles')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => { void loadEvents() })
      .subscribe()

    return () => {
      void supabase.removeChannel(eventsChannel)
      void supabase.removeChannel(profilesChannel)
    }
  }, [retryToken])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const filtered = sortUpcomingFirst(events.filter(e => {
    const matchCat = activeCategory === 'All' || e.category === activeCategory
    const q = search.toLowerCase()
    const matchSearch = !q || e.title.toLowerCase().includes(q) || e.venue.toLowerCase().includes(q) || e.category.toLowerCase().includes(q)
    const matchTime = timeFilter === 'all' || (timeFilter === 'today' && isToday(e.date)) || (timeFilter === 'tomorrow' && isTomorrow(e.date)) || (timeFilter === 'weekend' && isWeekend(e.date))
    const minPrice = e.ticket_tiers?.length ? Math.min(...e.ticket_tiers.map(t => t.price)) : 0
    const matchPrice = priceFilter === 'all' || (priceFilter === 'free' && minPrice === 0) || (priceFilter === 'paid' && minPrice > 0)
    return matchCat && matchSearch && matchTime && matchPrice
  }))
  const liveEvents = filtered.filter(e => new Date(`${e.date}T${e.end_time || '23:59:59'}`).getTime() > now)
  const featured = liveEvents.filter(e => e.is_featured).slice(0, 6)
  const happeningToday = filtered.filter(e => isToday(e.date)).slice(0, 4)
  const weekendEvents = filtered.filter(e => isWeekend(e.date)).slice(0, 4)
  const freeEvents = filtered.filter(e => !e.ticket_tiers?.length || Math.min(...e.ticket_tiers.map(t => t.price)) === 0).slice(0, 4)
  const activeEvents = liveEvents.slice(0, 6)
  const organizers = Array.from(
    events.reduce((groups, event) => {
      if (!event.organizers) return groups
      const current = groups.get(event.organizers.id)
      const organizerCover = event.organizers.profiles?.cover_image ?? null
      groups.set(event.organizers.id, { organizer: event.organizers, eventCount: (current?.eventCount ?? 0) + 1, coverImage: current?.coverImage ?? organizerCover })
      return groups
    }, new Map<string, { organizer: Organizer; eventCount: number; coverImage: string | null }>()),
  ).slice(0, 4)
  const anyActive = search || activeCategory !== 'All' || timeFilter !== 'all' || priceFilter !== 'all'

  return <div style={{ background: 'var(--background)', color: 'var(--foreground)', minHeight: '100vh' }}>
    <div className="relative overflow-hidden hero-shell" style={{ paddingTop: 64 }}>
      <div className="hero-blur hero-blur-one" aria-hidden="true" />
      <div className="hero-blur hero-blur-two" aria-hidden="true" />
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 pt-12 pb-10 md:pt-20 md:pb-16">
        <div className="home-hero-content max-w-4xl mx-auto">
          <div className="text-center mb-8 md:mb-10">
            <p className="hero-kicker">Your next great night starts here</p>
            <h1 className="hero-title">Find <span>live moments</span> worth showing up for</h1>
            <p className="hero-copy">Discover concerts, cultural nights, community events, and unforgettable experiences across Burundi.</p>
          </div>
          <div className="relative mb-4 rounded-[1.35rem] search-shell">
            <div className="absolute left-5 top-1/2 -translate-y-1/2" style={{ color: 'rgba(255,255,255,0.54)' }}><SearchIcon size={19} /></div>
            <input type="text" placeholder="Search events..." aria-label="Search events" value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-12 pr-11 py-4 rounded-xl text-sm outline-none search-input" onFocus={e => { e.currentTarget.style.boxShadow = '0 0 0 4px rgba(249,112,21,0.12)' }} onBlur={e => { e.currentTarget.style.boxShadow = 'none' }} />
            {search && <button aria-label="Clear search" onClick={() => setSearch('')} className="absolute right-5 top-1/2 -translate-y-1/2" style={{ color: 'rgba(255,255,255,0.5)' }}><XIcon size={15} /></button>}
          </div>
          <div className="home-filter-row flex w-full min-w-0 justify-start gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {TIME_FILTERS.map(({ key, label }) => <Pill key={key} active={timeFilter === key} onClick={() => setTimeFilter(key)}>{label === 'All events' ? 'Now' : label}</Pill>)}
            <span className="mx-1 h-7 w-px flex-shrink-0 self-center" style={{ background: 'rgba(255,255,255,0.18)' }} aria-hidden="true" />
            <div className="relative flex-shrink-0">
              <FilterIcon size={13} className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2" style={{ color: activeCategory !== 'All' ? '#ffad78' : 'rgba(255,255,255,0.72)' }} />
              <select value={activeCategory} onChange={e => setActiveCategory(e.target.value)} aria-label="Filter by event type" className="relative z-0 rounded-full py-2 pl-8 pr-8 text-sm font-medium outline-none" style={{ appearance: 'none', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', background: activeCategory !== 'All' ? 'rgba(249,112,21,0.2)' : 'rgba(255,255,255,0.06)', border: `1px solid ${activeCategory !== 'All' ? 'rgba(249,112,21,0.55)' : 'rgba(255,255,255,0.14)'}`, borderRadius: '999px', color: activeCategory !== 'All' ? '#ffad78' : 'rgba(255,255,255,0.72)', boxShadow: activeCategory !== 'All' ? '0 0 12px rgba(249,112,21,0.16)' : 'none' }}>
                <option value="All">All Types</option>
                {categories.map(category => <option key={category.label} value={category.label}>{category.label}</option>)}
              </select>
            </div>
            <div className="relative flex-shrink-0">
              <TagIcon size={13} className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2" style={{ color: priceFilter !== 'all' ? '#ffad78' : 'rgba(255,255,255,0.72)' }} />
              <select value={priceFilter} onChange={e => setPriceFilter(e.target.value as 'all' | 'free' | 'paid')} aria-label="Filter by price" className="relative z-0 rounded-full py-2 pl-8 pr-8 text-sm font-medium outline-none" style={{ appearance: 'none', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', background: priceFilter !== 'all' ? 'rgba(249,112,21,0.2)' : 'rgba(255,255,255,0.06)', border: `1px solid ${priceFilter !== 'all' ? 'rgba(249,112,21,0.55)' : 'rgba(255,255,255,0.14)'}`, borderRadius: '999px', color: priceFilter !== 'all' ? '#ffad78' : 'rgba(255,255,255,0.72)', boxShadow: priceFilter !== 'all' ? '0 0 12px rgba(249,112,21,0.16)' : 'none' }}>
                <option value="all">All Prices</option>
                <option value="free">Free</option>
                <option value="paid">Paid</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 pb-8 space-y-12">
      {!anyActive && <>
        {loading ? <section><SectionHeading title="Featured events" subtitle="Handpicked experiences worth leaving home for" /><div className="flex gap-4 overflow-x-auto pb-3" style={{ scrollbarWidth: 'none' }}>{[1, 2, 3].map(i => <div key={i} className="rounded-2xl animate-pulse flex-shrink-0" style={{ width: 340, height: 280, background: 'var(--muted)' }} />)}</div></section> : featured.length > 0 ? <section><SectionHeading title="✨ Featured events" subtitle="Handpicked experiences worth leaving home for" /><div className="flex gap-4 overflow-x-auto pb-3" style={{ scrollbarWidth: 'none' }}>{featured.map(ev => <FeaturedCard key={ev.id} event={ev} onClick={() => navigate('event-detail', ev)} />)}</div></section> : null}
        {loading ? <section><SectionHeading title="Active events" /><div className="flex gap-4 overflow-x-auto pb-3" style={{ scrollbarWidth: 'none' }}>{[1, 2, 3].map(i => <div key={i} className="rounded-2xl animate-pulse flex-shrink-0" style={{ width: 327, height: 480, background: 'var(--muted)' }} />)}</div></section> : <section><SectionHeading title="Active events" subtitle="Events happening near you" />{activeEvents.length > 0 ? <div className="flex min-w-0 gap-4 overflow-x-auto pb-3" style={{ scrollbarWidth: 'none' }}>{activeEvents.map(ev => <EventCard key={ev.id} event={ev} poster onClick={() => navigate('event-detail', ev)} />)}</div> : <EmptySection />}</section>}
        {happeningToday.length > 0 && <section><SectionHeading title="Happening today" subtitle="Make tonight count" /><div className="flex min-w-0 gap-4 overflow-x-auto pb-3" style={{ scrollbarWidth: 'none' }}>{happeningToday.map(ev => <EventCard key={ev.id} event={ev} poster onClick={() => navigate('event-detail', ev)} />)}</div></section>}
        {weekendEvents.length > 0 && <section><SectionHeading title="This weekend" subtitle="Plans worth making" /><div className="flex min-w-0 gap-4 overflow-x-auto pb-3" style={{ scrollbarWidth: 'none' }}>{weekendEvents.map(ev => <EventCard key={ev.id} event={ev} poster onClick={() => navigate('event-detail', ev)} />)}</div></section>}
        {freeEvents.length > 0 && <section><SectionHeading title="Free to attend" subtitle="Good times, no ticket required" /><div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-5">{freeEvents.map(ev => <EventCard key={ev.id} event={ev} onClick={() => navigate('event-detail', ev)} />)}</div></section>}
      </>}
      <section>
        <div className="flex items-end justify-between gap-4 mb-5"><div><h2 className="text-xl font-bold" style={{ letterSpacing: '-0.025em' }}>{anyActive ? 'Search results' : 'All events'}</h2><p className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>{loading ? 'Loading...' : `${filtered.length} event${filtered.length !== 1 ? 's' : ''} to explore`}</p></div>{anyActive && !loading && <button onClick={() => { setSearch(''); setActiveCategory('All'); setTimeFilter('all'); setPriceFilter('all') }} className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full" style={{ color: 'var(--accent)', background: 'rgba(199,243,107,0.1)', border: '0' }}><XIcon size={11} />Clear all</button>}</div>
        {loading ? <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="rounded-2xl animate-pulse" style={{ background: 'var(--muted)', height: 288 }} />)}</div> : loadError ? <div className="flex flex-col items-center justify-center py-24 gap-4"><p className="font-semibold text-lg">Unable to load events</p><p className="max-w-sm text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>{loadError}</p><button onClick={() => setRetryToken(current => current + 1)} className="px-5 py-2.5 rounded-xl text-sm font-semibold" style={{ background: 'var(--primary)', color: '#000' }}>Try again</button></div> : filtered.length > 0 ? <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">{filtered.map(ev => <EventCard key={ev.id} event={ev} compact onClick={() => navigate('event-detail', ev)} />)}</div> : <div className="flex flex-col items-center justify-center py-24 gap-4"><div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}><SearchIcon size={22} style={{ color: 'var(--muted-foreground)' }} /></div><p className="font-semibold text-lg" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>No events found</p><p className="text-sm text-center max-w-xs" style={{ color: 'var(--muted-foreground)' }}>{events.length === 0 ? 'No published events yet. Check back soon or create your own.' : 'Try different filters or search terms.'}</p>{events.length > 0 && <button onClick={() => { setSearch(''); setActiveCategory('All'); setTimeFilter('all'); setPriceFilter('all') }} className="gradient-action px-5 py-2.5 rounded-xl text-sm font-semibold transition-all">Clear filters</button>}</div>}
        <div className="mt-6 flex justify-center"><button onClick={() => navigate('events')} className="flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--primary-light)' }}>View all events<ArrowRightIcon size={15} /></button></div>
      </section>
      {!loading && organizers.length > 0 && <section><SectionHeading title="Meet the organizers" subtitle="Discover the people behind the events" /><div className="flex gap-4 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>{organizers.map(([id, item]) => <OrganizerProfileCard key={id} organizer={item.organizer} eventCount={item.eventCount} coverImage={item.coverImage} onClick={() => navigate('organizer-profile', item.organizer)} />)}</div><div className="mt-6 flex justify-center"><button onClick={() => navigate('explore-organizers')} className="flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--primary-light)' }}>View all organizers<ArrowRightIcon size={15} /></button></div></section>}
      {!loading && <section className="relative rounded-3xl overflow-hidden p-8 md:p-10" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}><div className="absolute inset-0" aria-hidden style={{ background: 'radial-gradient(ellipse 60% 80% at 0% 50%, rgba(158,210,75,0.14) 0%, transparent 70%)' }} /><div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6"><div className="max-w-lg"><div className="flex items-center gap-2 mb-3"><SparkleIcon size={16} style={{ color: 'var(--accent)' }} /><span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--accent)', letterSpacing: '0.1em' }}>For Organizers</span></div><h2 className="text-2xl md:text-3xl font-bold mb-2" style={{ letterSpacing: '-0.02em' }}>Have an event?</h2><p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.58)' }}>Create, sell and manage your tickets in one place. Reach thousands of people across Burundi and beyond.</p></div><div className="flex flex-col sm:flex-row gap-3 flex-shrink-0"><button onClick={() => navigate('auth-organizer')} className="gradient-action px-6 py-3 rounded-xl text-sm font-bold transition-all">Start for free</button><button onClick={() => navigate('organizers')} className="px-6 py-3 rounded-xl text-sm font-semibold transition-all" style={{ background: 'rgba(255,255,255,0.07)', border: '0', color: 'rgba(255,255,255,0.8)' }}>Learn more</button></div></div></section>}
    </div>
  </div>
}
