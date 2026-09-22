import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { categories } from '../data/events'
import { CATEGORY_ICONS, SearchIcon, XIcon, FilterIcon, SortIcon } from '../components/Icon'
import EventCard from '../components/EventCard'
import type { Event } from '../lib/types'

type Props = { navigate: (p: string, extra?: unknown) => void }

function sortUpcomingFirst(events: Event[]) {
  return [...events].sort((a, b) => {
    const aDate = new Date(`${a.date}T${a.end_time || a.time || '23:59:59'}`).getTime()
    const bDate = new Date(`${b.date}T${b.end_time || b.time || '23:59:59'}`).getTime()
    const aIsUpcoming = aDate >= Date.now()
    const bIsUpcoming = bDate >= Date.now()

    if (aIsUpcoming !== bIsUpcoming) return aIsUpcoming ? -1 : 1
    if (aIsUpcoming) return aDate - bDate
    return bDate - aDate
  })
}

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'date', label: 'By date' },
  { value: 'price-asc', label: 'Price: Low to high' },
  { value: 'price-desc', label: 'Price: High to low' },
]
const EVENTS_PER_PAGE = 10

export default function EventsPage({ navigate }: Props) {
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [retryToken, setRetryToken] = useState(0)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [sort, setSort] = useState('newest')
  const [priceFilter, setPriceFilter] = useState('any')
  const [showFilters, setShowFilters] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)

  useEffect(() => {
    const loadEvents = async () => {
      setLoading(true)
      setLoadError('')
      let q = supabase
        .from('events')
        .select('*, tags, ticket_tiers(id, event_id, name, price, description, ticket_type, extra_info, expires_at, group_size, quantity, sold, created_at), organizers(id, user_id, name, description, logo_url, website, phone, city, verified, subscription_tier, created_at, profiles(id, full_name, username, profile_image, avatar_url, cover_image, email))')
        .eq('status', 'published')

      if (sort === 'newest') q = q.order('created_at', { ascending: false })
      else if (sort === 'date') q = q.order('date', { ascending: true })

      const { data, error } = await q.limit(1000)
      if (error) { setLoadError(error.message); setLoading(false); return }
      setEvents(data ?? [])
      setLoading(false)
    }

    void loadEvents()
    const profilesChannel = supabase.channel('public-profiles-events')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => { void loadEvents() })
      .subscribe()
    const eventsChannel = supabase.channel('public-events-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events', filter: 'status=eq.published' }, () => { void loadEvents() })
      .subscribe()

    return () => {
      void supabase.removeChannel(profilesChannel)
      void supabase.removeChannel(eventsChannel)
    }
  }, [sort, retryToken])

  const filtered = sortUpcomingFirst(
    events.filter(e => {
      const matchCat = category === 'All' || e.category === category
      const q = search.toLowerCase()
      const matchSearch = !q || e.title.toLowerCase().includes(q) || e.venue.toLowerCase().includes(q) || e.tags?.some(tag => tag.toLowerCase().includes(q))
      const minPrice = e.ticket_tiers?.length ? Math.min(...e.ticket_tiers.map(t => t.price)) : 0
      const matchPrice =
        priceFilter === 'any' ||
        (priceFilter === 'free' && minPrice === 0) ||
        (priceFilter === 'under25k' && minPrice < 25000) ||
        (priceFilter === 'under50k' && minPrice < 50000) ||
        (priceFilter === 'over50k' && minPrice >= 50000)
      return matchCat && matchSearch && matchPrice
    })
  ).sort((a, b) => {
      if (sort === 'price-asc') {
        const ap = a.ticket_tiers?.length ? Math.min(...a.ticket_tiers.map(t => t.price)) : 0
        const bp = b.ticket_tiers?.length ? Math.min(...b.ticket_tiers.map(t => t.price)) : 0
        return ap - bp
      }
      if (sort === 'price-desc') {
        const ap = a.ticket_tiers?.length ? Math.min(...a.ticket_tiers.map(t => t.price)) : 0
        const bp = b.ticket_tiers?.length ? Math.min(...b.ticket_tiers.map(t => t.price)) : 0
        return bp - ap
      }
      return 0
    })

  const totalPages = Math.max(1, Math.ceil(filtered.length / EVENTS_PER_PAGE))
  const visibleEvents = filtered.slice((currentPage - 1) * EVENTS_PER_PAGE, currentPage * EVENTS_PER_PAGE)
  const pageNumbers = Array.from(new Set([
    1,
    totalPages,
    currentPage - 1,
    currentPage,
    currentPage + 1,
  ].filter(pageNumber => pageNumber >= 1 && pageNumber <= totalPages)))

  useEffect(() => {
    setCurrentPage(page => Math.min(page, totalPages))
  }, [totalPages])

  useEffect(() => {
    setCurrentPage(1)
  }, [search, category, priceFilter, sort])

  const changeFilter = (update: () => void) => {
    update()
    setCurrentPage(1)
  }

  const headerImg = 'https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?w=1400&h=500&fit=crop&auto=format'
  const activeFilters = [search, category !== 'All' ? category : '', priceFilter !== 'any' ? priceFilter : ''].filter(Boolean).length

  return (
    <div style={{ background: 'var(--background)', color: 'var(--foreground)', minHeight: '100vh' }}>

      {/* Blurred header */}
      <div className="relative overflow-hidden" style={{ paddingTop: 64 }}>
        <div className="absolute inset-0 -top-8">
          <img src={headerImg} alt="" className="w-full h-full object-cover"
            style={{ filter: 'blur(60px) saturate(0.4) brightness(0.2)', transform: 'scale(1.1)' }} aria-hidden />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(9,9,11,0.5) 0%, rgba(9,9,11,0.9) 70%, rgba(9,9,11,1) 100%)' }} />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 pt-10 pb-8">
          <p className="text-xs font-medium mb-1" style={{ color: 'var(--muted-foreground)', letterSpacing: '0.08em' }}>DISCOVER</p>
          <h1 className="text-3xl md:text-4xl font-bold mb-6" style={{ fontFamily: 'Outfit, sans-serif', letterSpacing: '-0.02em' }}>
            Find your next event
          </h1>

          {/* Search + filter row */}
          <div className="events-filter-row flex min-w-0 gap-3">
            <div className="relative min-w-0 flex-1 max-w-xl">
              <div className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted-foreground)' }}>
                <SearchIcon size={16} />
              </div>
              <input
                type="text"
                placeholder="Search events, artists, venues…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-11 pr-10 py-3.5 rounded-xl text-sm outline-none"
                style={{ background: 'rgba(12,12,12,0.62)', border: '0', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.14)', backdropFilter: 'blur(16px)', color: '#fff' }}
                onFocus={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')}
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted-foreground)' }}>
                  <XIcon size={14} />
                </button>
              )}
            </div>

            <button
              onClick={() => setShowFilters(v => !v)}
              className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium flex-shrink-0 relative"
              style={{
                background: showFilters ? 'rgba(249,112,21,0.2)' : 'rgba(255,255,255,0.07)',
                border: '0',
                backdropFilter: 'blur(16px)',
                color: showFilters ? '#ffad78' : 'rgba(255,255,255,0.8)',
              }}
            >
              <FilterIcon size={15} />
              <span className="hidden sm:inline">Filters</span>
              {activeFilters > 0 && (
                <span className="w-4 h-4 text-xs font-bold rounded-full flex items-center justify-center absolute -top-1 -right-1"
                  style={{ background: 'var(--accent)', color: 'var(--accent-foreground)' }}>
                  {activeFilters}
                </span>
              )}
            </button>

            <select
              value={sort}
              onChange={e => setSort(e.target.value)}
              className="px-4 py-3 rounded-xl text-sm outline-none flex-shrink-0 hidden sm:block"
              style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(16px)', color: 'rgba(255,255,255,0.8)' }}
            >
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* Expanded filters */}
          {showFilters && (
            <div className="events-filter-panel mt-4 w-full min-w-0 box-border rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(16px)' }}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold mb-2" style={{ color: 'var(--muted-foreground)', letterSpacing: '0.06em' }}>PRICE RANGE</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { v: 'any', l: 'Any price' },
                      { v: 'free', l: 'Free' },
                      { v: 'under25k', l: 'Under 25K BIF' },
                      { v: 'under50k', l: 'Under 50K BIF' },
                      { v: 'over50k', l: '50K+ BIF' },
                    ].map(({ v, l }) => (
                      <button key={v} onClick={() => setPriceFilter(v)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium"
                        style={{ background: priceFilter === v ? 'var(--primary)' : 'rgba(255,255,255,0.07)', color: priceFilter === v ? 'var(--primary-foreground)' : 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="sm:hidden">
                  <p className="text-xs font-semibold mb-2" style={{ color: 'var(--muted-foreground)', letterSpacing: '0.06em' }}>SORT BY</p>
                  <div className="flex flex-wrap gap-2">
                    {SORT_OPTIONS.map(o => (
                      <button key={o.value} onClick={() => setSort(o.value)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium"
                        style={{ background: sort === o.value ? 'var(--primary)' : 'rgba(255,255,255,0.07)', color: sort === o.value ? 'var(--primary-foreground)' : 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Category strip */}
          <div className="flex gap-2 overflow-x-auto mt-5 pb-1 -mb-1" style={{ scrollbarWidth: 'none' }}>
            <button onClick={() => setCategory('All')}
              className="flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium"
              style={{ background: category === 'All' ? 'var(--primary)' : 'rgba(255,255,255,0.07)', color: category === 'All' ? 'var(--primary-foreground)' : 'rgba(255,255,255,0.7)', border: '1px solid', borderColor: category === 'All' ? 'transparent' : 'rgba(255,255,255,0.08)', backdropFilter: 'blur(8px)' }}>
              All
            </button>
            {categories.map(cat => {
              const CatIcon = CATEGORY_ICONS[cat.label]
              const active = category === cat.label
              return (
                <button key={cat.label} onClick={() => setCategory(active ? 'All' : cat.label)}
                  className="flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium"
                  style={{ background: active ? 'var(--primary)' : 'rgba(255,255,255,0.07)', color: active ? 'var(--primary-foreground)' : 'rgba(255,255,255,0.7)', border: '1px solid', borderColor: active ? 'transparent' : 'rgba(255,255,255,0.08)', backdropFilter: 'blur(8px)' }}>
                  {CatIcon && <CatIcon size={13} />}
                  {cat.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
            {loading ? 'Loading…' : `${filtered.length} event${filtered.length !== 1 ? 's' : ''}`}
          </p>
          {activeFilters > 0 && (
            <button onClick={() => changeFilter(() => { setSearch(''); setCategory('All'); setPriceFilter('any') })}
              className="flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--accent)' }}>
              <XIcon size={12} /> Clear all
            </button>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-2xl animate-pulse" style={{ background: 'var(--muted)', height: 320 }} />
            ))}
          </div>
        ) : filtered.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {visibleEvents.map(ev => (
              <EventCard key={ev.id} event={ev} poster fullWidthMobile onClick={() => navigate('event-detail', ev)} />
            ))}
          </div>
        ) : null}

        {!loading && filtered.length > 0 && totalPages > 1 ? (
          <nav className="mt-8 flex flex-wrap items-center justify-center gap-2" aria-label="Events pagination">
            <button onClick={() => setCurrentPage(page => Math.max(1, page - 1))} disabled={currentPage === 1} className="rounded-lg px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-35" style={{ background: 'var(--muted)', color: 'var(--foreground)' }}>Previous</button>
            {pageNumbers.map((pageNumber, index) => {
              const previous = pageNumbers[index - 1]
              return <span key={pageNumber} className="flex items-center gap-2">{previous && pageNumber - previous > 1 && <span className="px-1 text-sm" style={{ color: 'var(--muted-foreground)' }}>...</span>}<button onClick={() => setCurrentPage(pageNumber)} aria-current={currentPage === pageNumber ? 'page' : undefined} className="h-9 min-w-9 rounded-lg px-2 text-sm font-bold" style={{ background: currentPage === pageNumber ? 'var(--primary)' : 'var(--muted)', color: currentPage === pageNumber ? '#000' : 'var(--foreground)' }}>{pageNumber}</button></span>
            })}
            <button onClick={() => setCurrentPage(page => Math.min(totalPages, page + 1))} disabled={currentPage === totalPages} className="rounded-lg px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-35" style={{ background: 'var(--muted)', color: 'var(--foreground)' }}>Next</button>
          </nav>
        ) : !loading && loadError ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <p className="font-semibold text-lg">Unable to load events</p>
            <p className="max-w-sm text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>{loadError}</p>
            <button onClick={() => setRetryToken(current => current + 1)} className="px-5 py-2.5 rounded-xl text-sm font-semibold" style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>Try again</button>
          </div>
        ) : !loading && filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'var(--muted)' }}>
              <SearchIcon size={24} style={{ color: 'var(--muted-foreground)' }} />
            </div>
            <p className="font-semibold text-lg">No events found</p>
            <p className="text-sm text-center max-w-xs" style={{ color: 'var(--muted-foreground)' }}>
              Try different filters or search terms, or check back later.
            </p>
            <button onClick={() => changeFilter(() => { setSearch(''); setCategory('All'); setPriceFilter('any') })}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold" style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
              Clear filters
            </button>
          </div>
        ) : null}
      </div>

    </div>
  )
}
