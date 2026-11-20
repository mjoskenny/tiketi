import { useState, useEffect, useRef } from 'react'
import { Briefcase, Flame, GraduationCap, Mic, Music, Palette, PartyPopper, Trophy, type LucideIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { categories } from '../data/events'
import { SearchIcon, XIcon, FilterIcon, TagIcon, SparkleIcon, ArrowRightIcon, GridIcon, ListIcon } from '../components/Icon'
import EventCard from '../components/EventCard'
import OrganizerCard from '../components/OrganizerCard'
import type { Event, Organizer } from '../lib/types'
import { ORGANIZER_COVER_PLACEHOLDER } from '../lib/profileMedia'
import { hasEventEnded, getEventEndTimestamp, getEventPhase, getEventStartTimestamp } from '../lib/eventTime'

type Props = { navigate: (p: string, extra?: unknown) => void }
type QuickFilter = 'all' | 'today' | 'tomorrow' | 'weekend'

const HOME_EVENT_SELECT = '*, tags, ticket_tiers(id, event_id, name, price, description, quantity, sold, created_at), organizers(id, user_id, name, description, logo_url, website, phone, city, verified, subscription_tier, created_at, profiles!organizers_user_id_fkey(id, full_name, username, profile_image, avatar_url, cover_image, email))'
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Music,
  Parties: PartyPopper,
  Sports: Trophy,
  Comedy: Mic,
  Conferences: GraduationCap,
  Culture: Palette,
  Business: Briefcase,
  Festivals: Flame,
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

function upcomingBeforePast(events: Event[], now: number) {
  return [...events].sort((a, b) => {
    const aUpcoming = getEventEndTimestamp(a.date, a.time, a.end_time) >= now
    const bUpcoming = getEventEndTimestamp(b.date, b.time, b.end_time) >= now
    return aUpcoming === bUpcoming ? 0 : aUpcoming ? -1 : 1
  })
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

function SectionHeading({ title, onSeeAll }: { title: string; onSeeAll?: () => void }) {
  return <div className="home-section-heading flex items-end justify-between mb-2.5">
    <h2 className="text-base font-bold">{title}</h2>
    {onSeeAll && <button type="button" className="home-section-see-all" onClick={onSeeAll}>See all <ArrowRightIcon size={15} /></button>}
  </div>
}

function EmptySection({ message = 'No events available' }: { message?: string }) {
  return <div className="rounded-2xl border border-dashed border-white/10 px-5 py-8 text-center text-sm text-white/45">{message}</div>
}

export default function HomePage({ navigate }: Props) {
  const [events, setEvents] = useState<Event[]>([])
  const [trendingEvents, setTrendingEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [timeFilter, setTimeFilter] = useState<QuickFilter>('all')
  const [activeCategory, setActiveCategory] = useState('All')
  const [priceFilter, setPriceFilter] = useState<'all' | 'free' | 'paid'>('all')
  const [showFilters, setShowFilters] = useState(false)
  const [currentTime, setCurrentTime] = useState(() => Date.now())
  const [allEventsView, setAllEventsView] = useState<'list' | 'grid'>('list')
  const [allEventsPage, setAllEventsPage] = useState(1)
  const [allEventsTab, setAllEventsTab] = useState<'upcoming' | 'past'>('upcoming')
  const [activeEventsSlide, setActiveEventsSlide] = useState(0)
  const allEventsCarouselRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setAllEventsPage(1)
  }, [search, timeFilter, activeCategory, priceFilter])

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 15000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const loadEvents = async () => {
      const { data } = await supabase.from('events').select(HOME_EVENT_SELECT).eq('status', 'published').order('created_at', { ascending: false }).limit(24)
      const loadedEvents = (data ?? []) as Event[]
      const organizerUserIds = [...new Set(loadedEvents.map(event => event.organizers?.user_id).filter((id): id is string => Boolean(id)))]
      const { data: publicProfiles } = organizerUserIds.length
        ? await supabase.from('public_profiles').select('id, full_name, username, profile_image, avatar_url, cover_image').in('id', organizerUserIds)
        : { data: [] }
      const profilesById = new Map((publicProfiles ?? []).map(profile => [profile.id, profile]))
      setEvents(loadedEvents.map(event => {
        if (!event.organizers) return event
        const publicProfile = profilesById.get(event.organizers.user_id)
        return publicProfile
          ? { ...event, organizers: { ...event.organizers, profiles: { ...event.organizers.profiles, ...publicProfile } } }
          : event
      }))
      setLoading(false)
    }
    let trendingRequest = 0
    const loadTrendingEvents = async () => {
      const request = ++trendingRequest
      const { data: rankedRows, error: rankingError } = await supabase.rpc('get_trending_event_ids', { p_limit: 6 })
      if (request !== trendingRequest) return
      if (rankingError) {
        console.error('Unable to load trending events', rankingError)
        setTrendingEvents([])
        return
      }
      const rankedIds = ((rankedRows ?? []) as Array<{ event_id: string }>).map(row => row.event_id)
      if (!rankedIds.length) { setTrendingEvents([]); return }

      const { data } = await supabase.from('events').select(HOME_EVENT_SELECT).eq('status', 'published').in('id', rankedIds)
      if (request !== trendingRequest) return
      const eventsById = new Map(((data ?? []) as Event[]).map(event => [event.id, event]))
      setTrendingEvents(rankedIds.flatMap(id => {
        const event = eventsById.get(id)
        return event ? [event] : []
      }))
    }
    void loadEvents()
    void loadTrendingEvents()

    // Subscribe to real-time updates for events
    const eventsChannel = supabase
      .channel('public-events')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events', filter: 'status=eq.published' }, () => { void loadEvents(); void loadTrendingEvents() })
      .subscribe()

    // Subscribe to real-time updates for organizer profiles
    const profilesChannel = supabase
      .channel('public-profiles')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => { void loadEvents(); void loadTrendingEvents() })
      .subscribe()

    const ticketTiersChannel = supabase
      .channel('public-ticket-tier-sales')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ticket_tiers' }, () => { void loadTrendingEvents() })
      .subscribe()

    return () => {
      trendingRequest += 1
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
  const freeEvents = upcomingBeforePast(filtered.filter(e => !e.ticket_tiers?.length || Math.min(...e.ticket_tiers.map(t => t.price)) === 0), currentTime).slice(0, 4)
  const activeEvents = liveEvents.slice(0, 6)
  const upcomingHomeEvents = filtered
    .filter(event => getEventEndTimestamp(event.date, event.time, event.end_time) >= currentTime)
    .sort((a, b) => getEventStartTimestamp(a.date, a.time) - getEventStartTimestamp(b.date, b.time))
  const pastHomeEvents = filtered
    .filter(event => getEventEndTimestamp(event.date, event.time, event.end_time) < currentTime)
    .sort((a, b) => getEventStartTimestamp(b.date, b.time) - getEventStartTimestamp(a.date, a.time))
  const homeEvents = allEventsTab === 'upcoming' ? upcomingHomeEvents : pastHomeEvents
  const homeEventSlides = Array.from({ length: Math.min(4, Math.ceil(homeEvents.length / 4)) }, (_, slideIndex) => homeEvents.slice(slideIndex * 4, slideIndex * 4 + 4))
  const scrollToEventsSlide = (slideIndex: number) => {
    const carousel = allEventsCarouselRef.current
    if (!carousel) return
    carousel.scrollTo({ left: slideIndex * carousel.clientWidth, behavior: 'smooth' })
    setActiveEventsSlide(slideIndex)
  }
  const handleEventsCarouselScroll = () => {
    const carousel = allEventsCarouselRef.current
    if (!carousel) return
    setActiveEventsSlide(Math.min(homeEventSlides.length - 1, Math.round(carousel.scrollLeft / carousel.clientWidth)))
  }
  useEffect(() => {
    setActiveEventsSlide(0)
    allEventsCarouselRef.current?.scrollTo({ left: 0, behavior: 'instant' })
  }, [allEventsTab, search, timeFilter, activeCategory, priceFilter])
  const organizers = Array.from(
    events.reduce((groups, event) => {
      if (!event.organizers || !(event.organizers.verified || event.organizers.verification_status === 'verified')) return groups
      const current = groups.get(event.organizers.id)
      const organizerCover = event.organizers.profiles?.cover_image ?? (event.organizers as Organizer & { cover_image?: string | null }).cover_image ?? null
      groups.set(event.organizers.id, {
        organizer: event.organizers,
        eventCount: (current?.eventCount ?? 0) + 1,
        coverImage: current?.coverImage ?? organizerCover,
      })
      return groups
    }, new Map<string, { organizer: Organizer; eventCount: number; coverImage: string | null }>()),
  ).slice(0, 4)
  const anyActive = search || activeCategory !== 'All' || timeFilter !== 'all' || priceFilter !== 'all'
  const activeFilters = Number(activeCategory !== 'All') + Number(priceFilter !== 'all')

  return <div style={{ background: 'var(--background)', color: 'var(--foreground)', minHeight: '100vh' }}>
    <div className="relative overflow-hidden hero-shell" style={{ paddingTop: 48 }}>
      <div className="hero-blur hero-blur-one" aria-hidden="true" />
      <div className="hero-blur hero-blur-two" aria-hidden="true" />
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 pt-8 pb-6 md:pt-12 md:pb-6">
        <div className="home-hero-content max-w-4xl mx-auto">
          <div className="text-center mb-8 md:mb-10">
            <h1 className="hero-title">Find <span className="hero-gradient-text">events nearby</span></h1>
            <p className="hero-copy">Discover live experiences, artists, and unforgettable moments all in one place.</p>
          </div>
          <div className="events-filter-row home-search-filter-row mx-auto mb-4 flex w-full min-w-0 justify-center gap-3">
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
    <div className="home-discovery-content max-w-7xl mx-auto px-4 sm:px-6  pb-8 space-y-6">
      {!anyActive && <>
        {!loading && trendingEvents.length > 0 && <section className="home-trending-section"><SectionHeading title="Trending right now" /><div className="trending-events-marquee" aria-label="Trending events" tabIndex={0}><div className="trending-events-track">{trendingEvents.map(ev => <EventCard key={ev.id} event={ev} trending compact listing onClick={() => navigate('event-detail', ev)} />)}</div></div></section>}
        <section className="home-categories-section">
          <SectionHeading title="Explore by category" onSeeAll={() => navigate('events')} />
          <div className="home-category-rail">
            {categories.map(category => {
              const Icon = CATEGORY_ICONS[category.label]
              return <button
                key={category.label}
                type="button"
                className="home-category-card"
                data-active={activeCategory === category.label}
                aria-pressed={activeCategory === category.label}
                onClick={() => setActiveCategory(current => current === category.label ? 'All' : category.label)}
              >
                <span aria-hidden="true" className="home-category-icon">{Icon && <Icon size={16} strokeWidth={1.8} />}</span>
                <span>{category.label}</span>
              </button>
            })}
          </div>
        </section>
        {loading ? <section className="home-active-events-section"><SectionHeading title="Active events" /><div className="home-active-events-rail flex gap-5 overflow-x-auto pb-3" style={{ scrollbarWidth: 'none' }}>{[1, 2, 3, 4].map(i => <div key={i} className="aspect-[4/5] w-[min(327px,84vw)] shrink-0 rounded-[2rem] animate-pulse" style={{ background: 'var(--muted)' }} />)}</div></section> : <section className="home-active-events-section"><SectionHeading title="Active events" />{activeEvents.length > 0 ? <div className="home-active-events-rail flex gap-5 overflow-x-auto pb-3" style={{ scrollbarWidth: 'none' }}>{activeEvents.map(ev => <EventCard key={ev.id} event={ev} compact listing onClick={() => navigate('event-detail', ev)} />)}</div> : <EmptySection />}</section>}
      </>}
      <section>
        <div className="home-section-heading home-all-events-heading flex items-center justify-between gap-4 mb-1">
          <h2 className="text-base font-bold">{anyActive ? 'Search results' : 'All events'}</h2>
          <div className="flex items-center gap-2">
            {anyActive && !loading && <button onClick={() => { setSearch(''); setActiveCategory('All'); setTimeFilter('all'); setPriceFilter('all') }} className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full" style={{ color: 'var(--accent)', background: 'rgba(199,243,107,0.1)', border: '0' }}><XIcon size={11} />Clear all</button>}
            <button type="button" className="home-section-see-all" onClick={() => navigate('events')}>See all <ArrowRightIcon size={15} /></button>
          </div>
        </div>
        <div className="home-all-events-tabs">
          <div className="home-all-events-tab-options" role="tablist" aria-label="All events date range">
            {([['upcoming', 'Upcoming', upcomingHomeEvents.length], ['past', 'Past', pastHomeEvents.length]] as const).map(([tab, label, count]) => <button
              key={tab}
              type="button"
              role="tab"
              id={`home-events-tab-${tab}`}
              aria-selected={allEventsTab === tab}
              aria-controls="home-events-tabpanel"
              className="home-all-events-tab"
              data-active={allEventsTab === tab}
              onClick={() => setAllEventsTab(tab)}
            >{label}<span>{count}</span></button>)}
          </div>
          <div className="home-events-view-toggle flex items-center rounded-full p-1" role="group" aria-label="All events layout">
            <button type="button" onClick={() => setAllEventsView('list')} aria-label="List view" title="List view" aria-pressed={allEventsView === 'list'} className="home-events-view-button" data-active={allEventsView === 'list'}><ListIcon size={16} />{allEventsView === 'list' && <span>List</span>}</button>
            <button type="button" onClick={() => setAllEventsView('grid')} aria-label="Card grid view" title="Card grid view" aria-pressed={allEventsView === 'grid'} className="home-events-view-button" data-active={allEventsView === 'grid'}><GridIcon size={16} />{allEventsView === 'grid' && <span>Grid</span>}</button>
          </div>
        </div>
        {loading ? <div className="grid grid-cols-1 gap-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-[124px] rounded-2xl animate-pulse" style={{ background: 'var(--muted)' }} />)}</div> : homeEvents.length > 0 ? <div id="home-events-tabpanel" role="tabpanel" aria-labelledby={`home-events-tab-${allEventsTab}`}>
          <div ref={allEventsCarouselRef} className="home-all-events-carousel" onScroll={handleEventsCarouselScroll} aria-label={`${allEventsTab === 'upcoming' ? 'Upcoming' : 'Past'} events carousel`}>
            <div className="home-all-events-carousel-track">
              {homeEventSlides.map((slideEvents, slideIndex) => <div className="home-all-events-slide" key={`${allEventsTab}-slide-${slideIndex}`} aria-label={`Slide ${slideIndex + 1} of ${homeEventSlides.length}`}>
                <div className={`home-events-slide-content ${allEventsView === 'list' ? 'home-agenda-list' : 'home-all-events-grid'}`}>
                  {slideEvents.map(event => <EventCard key={event.id} event={event} {...(allEventsView === 'list' ? { agenda: true, listing: true } : { compact: true, listing: true })} onClick={() => navigate('event-detail', event)} />)}
                </div>
              </div>)}
            </div>
          </div>
          {homeEventSlides.length > 1 && <nav className="home-all-events-indicators" aria-label="Choose events slide">
            {homeEventSlides.map((_, slideIndex) => <button key={slideIndex} type="button" aria-label={`Go to events slide ${slideIndex + 1}`} aria-current={activeEventsSlide === slideIndex ? 'true' : undefined} data-active={activeEventsSlide === slideIndex} onClick={() => scrollToEventsSlide(slideIndex)} />)}
          </nav>}
        </div> : <div id="home-events-tabpanel" role="tabpanel" aria-labelledby={`home-events-tab-${allEventsTab}`} className="py-10"><EmptySection message={allEventsTab === 'upcoming' ? 'No upcoming events found.' : 'No past events found.'} /></div>}
      </section>
      {!loading && organizers.length > 0 && <section><SectionHeading title="Meet the organizers" onSeeAll={() => navigate('explore-organizers')} /><div className="flex gap-4 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>{organizers.map(([id, item]) => <OrganizerCard key={id} organizer={item.organizer} eventCount={item.eventCount} coverImage={item.coverImage ?? null} onClick={() => navigate('organizer-profile', item.organizer)} />)}</div></section>}
      {!loading && <section className="home-organizer-banner relative overflow-hidden rounded-3xl border p-8 md:p-10"><div className="home-organizer-banner-glow absolute inset-0" aria-hidden /><div className="relative z-10 flex flex-col items-start justify-between gap-6 md:flex-row md:items-center"><div className="max-w-lg"><div className="mb-3 flex items-center gap-2"><SparkleIcon size={16} className="home-organizer-banner-kicker" /><span className="home-organizer-banner-kicker text-xs font-semibold uppercase tracking-widest">For Organizers</span></div><h2 className="mb-2 text-2xl font-bold md:text-3xl" style={{ letterSpacing: '-0.02em' }}>Have an event?</h2><p className="home-organizer-banner-copy text-sm leading-relaxed">Create, sell and manage your tickets in one place. Reach thousands of people across Burundi and beyond.</p></div><div className="flex flex-shrink-0 flex-col gap-3 sm:flex-row"><button onClick={() => navigate('auth-organizer')} className="home-organizer-banner-primary rounded-xl px-6 py-3 text-sm font-bold transition-all">Start for free</button><button onClick={() => navigate('organizers')} className="home-organizer-banner-secondary rounded-xl px-6 py-3 text-sm font-semibold transition-all">Learn more</button></div></div></section>}
    </div>
  </div>
}
