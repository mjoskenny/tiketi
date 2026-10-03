import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { categories } from '../data/events'
import { SearchIcon, XIcon, FilterIcon, TagIcon, SparkleIcon, ArrowRightIcon } from '../components/Icon'
import EventCard from '../components/EventCard'
import OrganizerCard from '../components/OrganizerCard'
import type { Event, Organizer } from '../lib/types'
import { ORGANIZER_COVER_PLACEHOLDER } from '../lib/profileMedia'
import { hasEventEnded, getEventEndTimestamp, getEventPhase } from '../lib/eventTime'

type Props = { navigate: (p: string, extra?: unknown) => void }
type QuickFilter = 'all' | 'today' | 'tomorrow' | 'weekend'

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
      className="attendee-filter-chip home-time-filter flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap"
      data-active={active}
    >
      {children}
    </button>
  )
}

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return <div className="home-section-heading flex items-end justify-between mb-5">
    <div>
      <h2 className="text-xl font-bold" style={{ letterSpacing: '-0.025em' }}>{title}</h2>
      {subtitle && <p className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>{subtitle}</p>}
    </div>
  </div>
}

function EmptySection({ message = 'No events available' }: { message?: string }) {
  return <div className="rounded-2xl border border-dashed border-white/10 px-5 py-8 text-center text-sm text-white/45">{message}</div>
}

export default function HomePage({ navigate }: Props) {
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [timeFilter, setTimeFilter] = useState<QuickFilter>('all')
  const [activeCategory, setActiveCategory] = useState('All')
  const [priceFilter, setPriceFilter] = useState<'all' | 'free' | 'paid'>('all')
  const [showFilters, setShowFilters] = useState(false)
  const [currentTime, setCurrentTime] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 15000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const loadEvents = async () => {
      const { data } = await supabase.from('events').select('*, tags, ticket_tiers(id, event_id, name, price, description, quantity, sold, created_at), organizers(id, user_id, name, description, logo_url, website, phone, city, verified, subscription_tier, created_at, profiles!organizers_user_id_fkey(id, full_name, username, profile_image, avatar_url, cover_image, email))').eq('status', 'published').order('created_at', { ascending: false }).limit(24)
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

    const ticketTiersChannel = supabase
      .channel('public-ticket-tier-sales')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ticket_tiers' }, () => { void loadEvents() })
      .subscribe()

    return () => {
      void supabase.removeChannel(eventsChannel)
      void supabase.removeChannel(profilesChannel)
      void supabase.removeChannel(ticketTiersChannel)
    }
  }, [])

  const filtered = events.filter(e => {
    const matchCat = activeCategory === 'All' || e.category === activeCategory
    const q = search.toLowerCase()
    const matchSearch = !q || e.title.toLowerCase().includes(q) || e.venue.toLowerCase().includes(q) || e.category.toLowerCase().includes(q)
    const matchTime = timeFilter === 'all' || (timeFilter === 'today' && isToday(e.date)) || (timeFilter === 'tomorrow' && isTomorrow(e.date)) || (timeFilter === 'weekend' && isWeekend(e.date))
    const minPrice = e.ticket_tiers?.length ? Math.min(...e.ticket_tiers.map(t => t.price)) : 0
    const matchPrice = priceFilter === 'all' || (priceFilter === 'free' && minPrice === 0) || (priceFilter === 'paid' && minPrice > 0)
    return matchCat && matchSearch && matchTime && matchPrice
  })
  const liveNowEvents = filtered
    .filter(e => getEventPhase(e.date, e.time, e.end_time, currentTime) === 'Happening')
    .sort((a, b) => getEventEndTimestamp(a.date, a.time, a.end_time) - getEventEndTimestamp(b.date, b.time, b.end_time))
    .slice(0, 12)
  const liveEvents = filtered.filter(e => !hasEventEnded(e.date, e.time, e.end_time))
  const trendingEvents = [...liveEvents.filter(e => getEventPhase(e.date, e.time, e.end_time, currentTime) === 'Upcoming')]
    .sort((a, b) => {
      const soldA = a.ticket_tiers?.reduce((total, tier) => total + tier.sold, 0) ?? 0
      const soldB = b.ticket_tiers?.reduce((total, tier) => total + tier.sold, 0) ?? 0
      if (soldA !== soldB) return soldB - soldA

      const capacityA = a.ticket_tiers?.reduce((total, tier) => total + tier.quantity, 0) ?? 0
      const capacityB = b.ticket_tiers?.reduce((total, tier) => total + tier.quantity, 0) ?? 0
      const soldRatioA = capacityA > 0 ? soldA / capacityA : 0
      const soldRatioB = capacityB > 0 ? soldB / capacityB : 0
      if (soldRatioA !== soldRatioB) return soldRatioB - soldRatioA

      return getEventEndTimestamp(a.date, a.time, a.end_time) - getEventEndTimestamp(b.date, b.time, b.end_time)
    })
    .slice(0, 6)
  const freeEvents = filtered.filter(e => !e.ticket_tiers?.length || Math.min(...e.ticket_tiers.map(t => t.price)) === 0).slice(0, 4)
  const activeEvents = liveEvents.slice(0, 6)
  const homeAllEvents = filtered.slice(0, 8)
  const organizers = Array.from(
    events.reduce((groups, event) => {
      if (!event.organizers || !(event.organizers.verified || event.organizers.verification_status === 'verified')) return groups
      const current = groups.get(event.organizers.id)
      const organizerCover = event.organizers.profiles?.cover_image ?? null
      groups.set(event.organizers.id, { organizer: event.organizers, eventCount: (current?.eventCount ?? 0) + 1, coverImage: current?.coverImage ?? organizerCover })
      return groups
    }, new Map<string, { organizer: Organizer; eventCount: number; coverImage: string | null }>()),
  ).slice(0, 4)
  const anyActive = search || activeCategory !== 'All' || timeFilter !== 'all' || priceFilter !== 'all'
  const activeFilters = Number(activeCategory !== 'All') + Number(priceFilter !== 'all')

  return <div style={{ background: 'var(--background)', color: 'var(--foreground)', minHeight: '100vh' }}>
    <div className="relative overflow-hidden hero-shell" style={{ paddingTop: 64 }}>
      <div className="hero-blur hero-blur-one" aria-hidden="true" />
      <div className="hero-blur hero-blur-two" aria-hidden="true" />
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 pt-12 pb-10 md:pt-20 md:pb-16">
        <div className="home-hero-content max-w-4xl mx-auto">
          <div className="text-center mb-8 md:mb-10">
            <p className="hero-kicker">Discover what is happening near you</p>
            <h1 className="hero-title">Find <span className="hero-gradient-text">events nearby</span></h1>
            <p className="hero-copy">Discover live experiences, artists, and unforgettable moments all in one place.</p>
          </div>
          <div className="events-filter-row home-search-filter-row mx-auto mb-3 flex w-full min-w-0 justify-center gap-3">
            <div className="relative min-w-0 flex-1 max-w-xl">
              <div className="attendee-control-icon absolute left-4 top-1/2 -translate-y-1/2"><SearchIcon size={16} /></div>
              <input type="text" placeholder="Search events, artists, venues…" aria-label="Search events" value={search} onChange={e => setSearch(e.target.value)} className="attendee-search-input w-full pl-11 pr-10 py-3.5 rounded-xl text-sm outline-none" />
              {search && <button aria-label="Clear search" onClick={() => setSearch('')} className="attendee-control-icon absolute right-3 top-1/2 -translate-y-1/2"><XIcon size={14} /></button>}
            </div>
            <button type="button" onClick={() => setShowFilters(value => !value)} aria-expanded={showFilters} className="attendee-filter-button relative flex shrink-0 items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium" data-active={showFilters}>
              <FilterIcon size={15} className="attendee-control-icon" />
              <span className="hidden sm:inline">Filters</span>
              {activeFilters > 0 && <span className="attendee-filter-count absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full text-xs font-bold">{activeFilters}</span>}
            </button>
          </div>
          <div className="home-filter-row flex w-full min-w-0 justify-center gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {TIME_FILTERS.map(({ key, label }) => <Pill key={key} active={timeFilter === key} onClick={() => setTimeFilter(key)}>{label === 'All events' ? 'Now' : label}</Pill>)}
          </div>
          {showFilters && <div className="events-filter-panel attendee-filter-panel mt-4 w-full min-w-0 box-border rounded-2xl p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-semibold" style={{ color: 'var(--muted-foreground)', letterSpacing: '0.06em' }}>EVENT TYPE</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setActiveCategory('All')} className="attendee-filter-chip rounded-lg px-3 py-1.5 text-xs font-medium" data-active={activeCategory === 'All'}>All types</button>
                  {categories.map(category => <button type="button" key={category.label} onClick={() => setActiveCategory(category.label)} className="attendee-filter-chip rounded-lg px-3 py-1.5 text-xs font-medium" data-active={activeCategory === category.label}>{category.label}</button>)}
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold" style={{ color: 'var(--muted-foreground)', letterSpacing: '0.06em' }}>PRICE</p>
                <div className="flex flex-wrap gap-2">
                  {[{ value: 'all', label: 'All prices' }, { value: 'free', label: 'Free' }, { value: 'paid', label: 'Paid' }].map(option => <button type="button" key={option.value} onClick={() => setPriceFilter(option.value as 'all' | 'free' | 'paid')} className="attendee-filter-chip rounded-lg px-3 py-1.5 text-xs font-medium" data-active={priceFilter === option.value}>{option.label}</button>)}
                </div>
              </div>
            </div>
          </div>}
        </div>
      </div>
    </div>
    <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 pb-8 space-y-12">
      {!anyActive && <>
        <section aria-label="Live events">
          <div className="mb-5">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-400/25 bg-orange-500/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-orange-400">
              <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange-400 shadow-[0_0_10px_#fb923c]" />Live
            </span>
          </div>
          {loading ? <div className="flex gap-4 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>{[1, 2, 3, 4].map(i => <div key={i} className="flex w-[84px] shrink-0 flex-col items-center gap-2"><div className="h-[76px] w-[76px] animate-pulse rounded-full" style={{ background: 'var(--muted)' }} /><div className="h-3 w-16 animate-pulse rounded" style={{ background: 'var(--muted)' }} /></div>)}</div> : liveNowEvents.length > 0 ? <div className="flex gap-4 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
            {liveNowEvents.map(ev => {
              const image = ev.cover_image || ev.organizers?.profiles?.profile_image || ev.organizers?.profiles?.avatar_url || ev.organizers?.logo_url || ORGANIZER_COVER_PLACEHOLDER
              return <button key={ev.id} type="button" onClick={() => navigate('event-detail', ev)} aria-label={`Live now: ${ev.title}`} className="group flex w-[84px] shrink-0 flex-col items-center gap-2 text-center">
                <span className="relative block h-[76px] w-[76px] rounded-full p-[3px] transition-transform duration-200 group-hover:scale-105" style={{ background: 'linear-gradient(110deg, #ff7a18 0%, #ff9e45 45%, #ffd36b 100%)' }}>
                  <span className="block h-full w-full overflow-hidden rounded-full border-2 border-[#111] bg-[#111]"><img src={image} alt="" className="h-full w-full rounded-full object-cover" loading="lazy" /></span>
                  <span className="absolute -bottom-1 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full border border-[#111] bg-orange-500 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-white shadow-lg"><span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />Live</span>
                </span>
                <span className="line-clamp-2 w-full text-[11px] font-semibold leading-tight text-white/85 group-hover:text-white">{ev.title}</span>
              </button>
            })}
          </div> : <p className="rounded-xl border border-dashed border-white/10 px-4 py-4 text-sm text-white/45">No events are live right now. Check back soon.</p>}
        </section>
        {loading ? <section><SectionHeading title="Trending events" subtitle="Popular picks, ranked by live ticket sales" /><div className="flex gap-4 overflow-x-auto pb-3" style={{ scrollbarWidth: 'none' }}>{[1, 2, 3].map(i => <div key={i} className="aspect-[4/5] rounded-[2rem] animate-pulse flex-shrink-0" style={{ width: 327, background: 'var(--muted)' }} />)}</div></section> : trendingEvents.length > 0 ? <section><SectionHeading title="Trending events" subtitle="Popular picks, ranked by live ticket sales" /><div className="flex min-w-0 gap-4 overflow-x-auto pb-3" style={{ scrollbarWidth: 'none' }}>{trendingEvents.map(ev => <EventCard key={ev.id} event={ev} poster listing timerBadge onClick={() => navigate('event-detail', ev)} />)}</div></section> : null}
        {loading ? <section><SectionHeading title="Active events" /><div className="flex gap-4 overflow-x-auto pb-3" style={{ scrollbarWidth: 'none' }}>{[1, 2, 3].map(i => <div key={i} className="aspect-[4/5] rounded-[2rem] animate-pulse flex-shrink-0" style={{ width: 327, background: 'var(--muted)' }} />)}</div></section> : <section><SectionHeading title="Active events" subtitle="Events happening near you" />{activeEvents.length > 0 ? <div className="flex min-w-0 gap-4 overflow-x-auto pb-3" style={{ scrollbarWidth: 'none' }}>{activeEvents.map(ev => <EventCard key={ev.id} event={ev} poster onClick={() => navigate('event-detail', ev)} />)}</div> : <EmptySection />}</section>}
        {freeEvents.length > 0 && <section><SectionHeading title="Free to attend" subtitle="Good times, no ticket required" /><div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-5">{freeEvents.map(ev => <EventCard key={ev.id} event={ev} onClick={() => navigate('event-detail', ev)} />)}</div></section>}
      </>}
      <section>
        <div className="flex items-end justify-between gap-4 mb-5"><div><h2 className="text-xl font-bold" style={{ letterSpacing: '-0.025em' }}>{anyActive ? 'Search results' : 'All events'}</h2><p className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>{loading ? 'Loading...' : `${filtered.length} event${filtered.length !== 1 ? 's' : ''} to explore`}</p></div>{anyActive && !loading && <button onClick={() => { setSearch(''); setActiveCategory('All'); setTimeFilter('all'); setPriceFilter('all') }} className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full" style={{ color: 'var(--accent)', background: 'rgba(199,243,107,0.1)', border: '0' }}><XIcon size={11} />Clear all</button>}</div>
        {loading ? <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-[124px] rounded-2xl animate-pulse" style={{ background: 'var(--muted)' }} />)}</div> : filtered.length > 0 ? <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{homeAllEvents.map(ev => <EventCard key={ev.id} event={ev} listing rowLayout onClick={() => navigate('event-detail', ev)} />)}</div> : <div className="flex flex-col items-center justify-center py-24 gap-4"><div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}><SearchIcon size={22} style={{ color: 'var(--muted-foreground)' }} /></div><p className="font-semibold text-lg" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>No events found</p><p className="text-sm text-center max-w-xs" style={{ color: 'var(--muted-foreground)' }}>{events.length === 0 ? 'No published events yet. Check back soon or create your own.' : 'Try different filters or search terms.'}</p>{events.length > 0 && <button onClick={() => { setSearch(''); setActiveCategory('All'); setTimeFilter('all'); setPriceFilter('all') }} className="gradient-action px-5 py-2.5 rounded-xl text-sm font-semibold transition-all">Clear filters</button>}</div>}
        <div className="mt-6 flex justify-center"><button onClick={() => navigate('events')} className="flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--primary-light)' }}>{filtered.length > homeAllEvents.length ? 'View all events' : 'Explore all events'}<ArrowRightIcon size={15} /></button></div>
      </section>
      {!loading && organizers.length > 0 && <section><SectionHeading title="Meet the organizers" subtitle="Discover the people behind the events" /><div className="flex gap-4 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>{organizers.map(([id, item]) => <OrganizerCard key={id} organizer={item.organizer} eventCount={item.eventCount} coverImage={item.coverImage ?? ORGANIZER_COVER_PLACEHOLDER} onClick={() => navigate('organizer-profile', item.organizer)} />)}</div><div className="mt-6 flex justify-center"><button onClick={() => navigate('explore-organizers')} className="flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--primary-light)' }}>View all organizers<ArrowRightIcon size={15} /></button></div></section>}
      {!loading && <section className="relative rounded-3xl overflow-hidden p-8 md:p-10" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}><div className="absolute inset-0" aria-hidden style={{ background: 'radial-gradient(ellipse 60% 80% at 0% 50%, rgba(158,210,75,0.14) 0%, transparent 70%)' }} /><div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6"><div className="max-w-lg"><div className="flex items-center gap-2 mb-3"><SparkleIcon size={16} style={{ color: 'var(--accent)' }} /><span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--accent)', letterSpacing: '0.1em' }}>For Organizers</span></div><h2 className="text-2xl md:text-3xl font-bold mb-2" style={{ letterSpacing: '-0.02em' }}>Have an event?</h2><p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.58)' }}>Create, sell and manage your tickets in one place. Reach thousands of people across Burundi and beyond.</p></div><div className="flex flex-col sm:flex-row gap-3 flex-shrink-0"><button onClick={() => navigate('auth-organizer')} className="gradient-action px-6 py-3 rounded-xl text-sm font-bold transition-all">Start for free</button><button onClick={() => navigate('organizers')} className="px-6 py-3 rounded-xl text-sm font-semibold transition-all" style={{ background: 'rgba(255,255,255,0.07)', border: '0', color: 'rgba(255,255,255,0.8)' }}>Learn more</button></div></div></section>}
    </div>
  </div>
}
