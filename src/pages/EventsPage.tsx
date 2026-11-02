import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { categories } from '../data/events'
import { CATEGORY_ICONS, CalendarIcon, ChevronLeftIcon, ChevronRightIcon, SearchIcon, XIcon, FilterIcon } from '../components/Icon'
import EventCard from '../components/EventCard'
import type { Event } from '../lib/types'
import { getEventEndTimestamp, getEventStartTimestamp } from '../lib/eventTime'

type Props = { navigate: (p: string, extra?: unknown) => void }

function sortUpcomingFirst(events: Event[]) {
  return [...events].sort((a, b) => {
    const aDate = getEventEndTimestamp(a.date, a.time, a.end_time)
    const bDate = getEventEndTimestamp(b.date, b.time, b.end_time)
    const aIsUpcoming = aDate >= Date.now()
    const bIsUpcoming = bDate >= Date.now()

    if (aIsUpcoming !== bIsUpcoming) return aIsUpcoming ? -1 : 1
    if (aIsUpcoming) return getEventStartTimestamp(a.date, a.time) - getEventStartTimestamp(b.date, b.time)
    return getEventStartTimestamp(b.date, b.time) - getEventStartTimestamp(a.date, a.time)
  })
}

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'date', label: 'By date' },
  { value: 'price-asc', label: 'Price: Low to high' },
  { value: 'price-desc', label: 'Price: High to low' },
]

function eventDateKey(date: string) {
  return date.slice(0, 10)
}

function todayDateKey() {
  const today = new Date()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${today.getFullYear()}-${month}-${day}`
}

function calendarDate(dateKey: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(undefined, options).format(new Date(`${dateKey}T12:00:00`))
}

function localDateKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function upcomingWeekendDateKeys() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const daysUntilSaturday = (6 - today.getDay() + 7) % 7
  const saturday = new Date(today)
  saturday.setDate(today.getDate() + daysUntilSaturday)
  const sunday = new Date(saturday)
  sunday.setDate(saturday.getDate() + 1)
  return [localDateKey(saturday), localDateKey(sunday)]
}

function monthDateKeys(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number)
  if (!year || !month) return []
  const daysInMonth = new Date(year, month, 0).getDate()
  return Array.from({ length: daysInMonth }, (_, index) => `${monthKey}-${String(index + 1).padStart(2, '0')}`)
}

export default function EventsPage({ navigate }: Props) {
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [retryToken, setRetryToken] = useState(0)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [sort, setSort] = useState('date')
  const [priceFilter, setPriceFilter] = useState('any')
  const [dateFilter, setDateFilter] = useState('')
  const [datePreset, setDatePreset] = useState<'all' | 'today' | 'weekend'>('all')
  const [calendarMonth, setCalendarMonth] = useState(() => todayDateKey().slice(0, 7))
  const [showFilters, setShowFilters] = useState(false)
  const [showMonthPicker, setShowMonthPicker] = useState(false)
  const [monthPickerYear, setMonthPickerYear] = useState(() => Number(todayDateKey().slice(0, 4)))
  const dateSectionRefs = useRef<Record<string, HTMLElement | null>>({})
  const calendarDayRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const today = todayDateKey()
  const weekendDates = upcomingWeekendDateKeys()
  const todayEventCount = useMemo(
    () => events.filter(event => eventDateKey(event.date) === today).length,
    [events, today],
  )
  const weekendEventCount = useMemo(
    () => events.filter(event => weekendDates.includes(eventDateKey(event.date))).length,
    [events, weekendDates],
  )

  useEffect(() => {
    const loadEvents = async () => {
      setLoading(true)
      setLoadError('')
      let q = supabase
        .from('events')
        .select('*, tags, ticket_tiers(id, event_id, name, price, description, ticket_type, extra_info, expires_at, group_size, quantity, sold, created_at), organizers(id, user_id, name, description, logo_url, website, phone, city, verified, subscription_tier, created_at, profiles!organizers_user_id_fkey(id, full_name, username, profile_image, avatar_url, cover_image, email))')
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
      const eventDate = eventDateKey(e.date)
      const matchDate = !dateFilter || eventDate === dateFilter
      const matchMonth = !calendarMonth || eventDate.startsWith(calendarMonth)
      const matchPreset = datePreset === 'all' || (datePreset === 'today' && eventDate === today) || (datePreset === 'weekend' && weekendDates.includes(eventDate))
      const minPrice = e.ticket_tiers?.length ? Math.min(...e.ticket_tiers.map(t => t.price)) : 0
      const matchPrice =
        priceFilter === 'any' ||
        (priceFilter === 'free' && minPrice === 0) ||
        (priceFilter === 'under25k' && minPrice < 25000) ||
        (priceFilter === 'under50k' && minPrice < 50000) ||
        (priceFilter === 'over50k' && minPrice >= 50000)
      return matchCat && matchSearch && matchPrice && matchDate && matchMonth && matchPreset
    })
  ).sort((a, b) => {
      const aIsUpcoming = getEventEndTimestamp(a.date, a.time, a.end_time) >= Date.now()
      const bIsUpcoming = getEventEndTimestamp(b.date, b.time, b.end_time) >= Date.now()
      if (aIsUpcoming !== bIsUpcoming) return aIsUpcoming ? -1 : 1

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

  const dateGroups = useMemo(() => {
    const groups = new Map<string, Event[]>()
    filtered.forEach(event => {
      const key = eventDateKey(event.date)
      groups.set(key, [...(groups.get(key) ?? []), event].sort((left, right) => getEventStartTimestamp(left.date, left.time) - getEventStartTimestamp(right.date, right.time)))
    })
    const today = todayDateKey()
    return [...groups.entries()].sort(([left], [right]) => {
      const leftUpcoming = left >= today
      const rightUpcoming = right >= today
      if (leftUpcoming !== rightUpcoming) return leftUpcoming ? -1 : 1
      return leftUpcoming ? left.localeCompare(right) : right.localeCompare(left)
    })
  }, [filtered])

  const calendarDays = useMemo(() => monthDateKeys(calendarMonth), [calendarMonth])
  const eventsByDate = useMemo(() => new Map(dateGroups.map(([date, eventsOnDate]) => [date, eventsOnDate.length])), [dateGroups])

  useEffect(() => {
    const focusDate = calendarMonth === today.slice(0, 7) ? today : `${calendarMonth}-01`
    const frame = window.requestAnimationFrame(() => {
      calendarDayRefs.current[focusDate]?.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [calendarMonth, calendarDays.length, loading, today])

  const scrollToDate = (date: string) => {
    dateSectionRefs.current[date]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const selectDatePreset = (preset: 'today' | 'weekend') => {
    if (datePreset === preset) {
      setDatePreset('all')
      return
    }
    setDatePreset(preset)
    setDateFilter('')
    setCalendarMonth((preset === 'today' ? today : weekendDates[0]).slice(0, 7))
  }

  const selectCalendarMonth = (month: string) => {
    if (!month) return
    setCalendarMonth(month)
    setDatePreset('all')
    setDateFilter('')
  }

  const selectMonthFromPicker = (monthIndex: number) => {
    selectCalendarMonth(`${monthPickerYear}-${String(monthIndex + 1).padStart(2, '0')}`)
    setShowMonthPicker(false)
  }

  const headerImg = 'https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?w=1400&h=500&fit=crop&auto=format'
  const activeFilters = [search, category !== 'All' ? category : '', priceFilter !== 'any' ? priceFilter : '', dateFilter, datePreset !== 'all' ? datePreset : ''].filter(Boolean).length
  return (
    <div className="attendee-events-page" style={{ background: 'var(--background)', color: 'var(--foreground)', minHeight: '100vh' }}>

      {/* Blurred header */}
      <div className="relative overflow-hidden" style={{ paddingTop: 64 }}>
        <div className="events-page-hero-bg absolute inset-0 -top-8">
          <img src={headerImg} alt="" className="w-full h-full object-cover"
            style={{ filter: 'blur(60px) saturate(0.4) brightness(0.2)', transform: 'scale(1.1)' }} aria-hidden />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(9,9,11,0.5) 0%, rgba(9,9,11,0.9) 70%, rgba(9,9,11,1) 100%)' }} />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 pt-10 pb-4">
          <p className="text-xs font-medium mb-1" style={{ color: 'var(--muted-foreground)', letterSpacing: '0.08em' }}>DISCOVER</p>
          <h1 className="text-3xl md:text-4xl font-bold mb-6" style={{ fontFamily: 'Outfit, sans-serif', letterSpacing: '-0.02em' }}>
            Find your next event
          </h1>

          {/* Search + filter row */}
          <div className="events-filter-row flex min-w-0 gap-3">
            <div className="relative min-w-0 flex-1 max-w-xl">
              <div className="attendee-control-icon absolute left-4 top-1/2 -translate-y-1/2">
                <SearchIcon size={16} />
              </div>
              <input
                type="text"
                placeholder="Search events, artists, venues…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="attendee-search-input w-full pl-11 pr-10 py-3.5 rounded-xl text-sm outline-none"
              />
              {search && (
                <button onClick={() => setSearch('')} className="attendee-control-icon absolute right-3 top-1/2 -translate-y-1/2">
                  <XIcon size={14} />
                </button>
              )}
            </div>

            <button
              onClick={() => setShowFilters(v => !v)}
              className="attendee-filter-button flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium flex-shrink-0 relative"
              data-active={showFilters}
            >
              <FilterIcon size={15} className="attendee-control-icon" />
              <span className="hidden sm:inline">Filters</span>
              {activeFilters > 0 && (
                <span className="attendee-filter-count w-4 h-4 text-xs font-bold rounded-full flex items-center justify-center absolute -top-1 -right-1">
                  {activeFilters}
                </span>
              )}
            </button>

          </div>

          {/* Expanded filters */}
          {showFilters && (
            <div className="events-filter-panel attendee-filter-panel mt-4 w-full min-w-0 box-border rounded-2xl p-4">
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
                        className="attendee-filter-chip px-3 py-1.5 rounded-lg text-xs font-medium"
                        data-active={priceFilter === v}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold mb-2" style={{ color: 'var(--muted-foreground)', letterSpacing: '0.06em' }}>DATE</p>
                  <label className="events-calendar-input flex h-9 max-w-xs items-center gap-2 rounded-lg px-3 text-xs font-medium">
                    <CalendarIcon size={14} />
                    <input type="date" value={dateFilter} onChange={event => { const value = event.target.value; setDateFilter(value); setDatePreset('all'); if (value) setCalendarMonth(value.slice(0, 7)) }} aria-label="Filter events by date" className="min-w-0 flex-1 bg-transparent outline-none" />
                    {dateFilter && <button type="button" onClick={() => setDateFilter('')} aria-label="Clear date filter" className="shrink-0"><XIcon size={13} /></button>}
                  </label>
                </div>
                <div>
                  <p className="text-xs font-semibold mb-2" style={{ color: 'var(--muted-foreground)', letterSpacing: '0.06em' }}>SORT BY</p>
                  <div className="flex flex-wrap gap-2">
                    {SORT_OPTIONS.map(o => (
                      <button key={o.value} onClick={() => setSort(o.value)}
                        className="attendee-filter-chip px-3 py-1.5 rounded-lg text-xs font-medium"
                        data-active={sort === o.value}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Category strip */}
          <div className="events-category-strip flex gap-2 overflow-x-auto mt-5 pb-1 -mb-1" style={{ scrollbarWidth: 'none' }}>
            <button onClick={() => setCategory('All')}
              className="attendee-filter-chip flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium"
              data-active={category === 'All'}>
              All
            </button>
            {categories.map(cat => {
              const CatIcon = CATEGORY_ICONS[cat.label]
              const active = category === cat.label
              return (
                <button key={cat.label} onClick={() => setCategory(active ? 'All' : cat.label)}
                  className="attendee-filter-chip flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium"
                  data-active={active}>
                  {CatIcon && <CatIcon size={13} className="attendee-control-icon" />}
                  {cat.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="events-calendar-results mx-auto max-w-7xl px-4 sm:px-6 pt-4 pb-8">
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
            {loading ? 'Loading…' : `${filtered.length} event${filtered.length !== 1 ? 's' : ''}`}
          </p>
          {activeFilters > 0 && (
            <button onClick={() => { setSearch(''); setCategory('All'); setPriceFilter('any'); setDateFilter(''); setDatePreset('all'); setCalendarMonth(today.slice(0, 7)) }}
              className="flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--accent)' }}>
              <XIcon size={12} /> Clear all
            </button>
          )}
        </div>

        {!loading && calendarDays.length > 0 && <div className="events-calendar-navigation mb-8">
          <div className="events-calendar-filter-row mb-5 flex flex-col items-start" role="group" aria-label="Calendar filters">
            <div className="events-calendar-period-filters flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => selectDatePreset('today')} className="events-calendar-filter-card inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold" data-active={datePreset === 'today'}>
                Today
                {todayEventCount > 0 && <span className="events-calendar-period-count">{todayEventCount}</span>}
              </button>
              <button type="button" onClick={() => selectDatePreset('weekend')} className="events-calendar-filter-card inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold" data-active={datePreset === 'weekend'}>
                This weekend
                {weekendEventCount > 0 && <span className="events-calendar-period-count">{weekendEventCount}</span>}
              </button>
            </div>
            <div className="events-calendar-month-filter relative">
              <button
                type="button"
                className="events-calendar-filter-card events-calendar-month-trigger inline-flex max-w-36 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold"
                onClick={() => {
                  setMonthPickerYear(Number(calendarMonth.slice(0, 4)))
                  setShowMonthPicker(open => !open)
                }}
                aria-expanded={showMonthPicker}
                aria-haspopup="dialog"
                aria-controls="events-month-picker"
              >
                <CalendarIcon size={16} />
                <span className="truncate">{calendarDate(`${calendarMonth}-01`, { month: 'short', year: 'numeric' })}</span>
              </button>

              {showMonthPicker && (
                <div id="events-month-picker" role="dialog" aria-label="Choose event month" className="events-month-picker" onKeyDown={event => { if (event.key === 'Escape') setShowMonthPicker(false) }}>
                  <div className="events-month-picker-header flex items-center justify-between gap-2">
                    <button type="button" onClick={() => setMonthPickerYear(year => year - 1)} aria-label="Previous year" className="events-month-picker-year-button"><ChevronLeftIcon size={16} /></button>
                    <span className="text-sm font-bold">{monthPickerYear}</span>
                    <button type="button" onClick={() => setMonthPickerYear(year => year + 1)} aria-label="Next year" className="events-month-picker-year-button"><ChevronRightIcon size={16} /></button>
                  </div>
                  <div className="events-month-picker-grid">
                    {Array.from({ length: 12 }, (_, monthIndex) => {
                      const monthKey = `${monthPickerYear}-${String(monthIndex + 1).padStart(2, '0')}`
                      const isSelected = monthKey === calendarMonth
                      return <button key={monthKey} type="button" onClick={() => selectMonthFromPicker(monthIndex)} className="events-month-picker-option" data-active={isSelected}>
                        {calendarDate(`${monthKey}-01`, { month: 'short' })}
                      </button>
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">{calendarDate(`${calendarMonth}-01`, { month: 'long', year: 'numeric' })}</p>
              <p className="mt-0.5 text-xs" style={{ color: 'var(--muted-foreground)' }}>Choose a day with events to jump to its section.</p>
            </div>
            <span className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>{dateGroups.length} date{dateGroups.length === 1 ? '' : 's'} with events</span>
          </div>
          <div className="events-calendar-days flex gap-2 overflow-x-auto pb-2" role="navigation" aria-label="Jump to an event date" style={{ scrollbarWidth: 'none' }}>
            {calendarDays.map(date => {
              const eventCount = eventsByDate.get(date) ?? 0
              const hasEvents = eventCount > 0
              return <button key={date} ref={node => { calendarDayRefs.current[date] = node }} type="button" onClick={() => scrollToDate(date)} disabled={!hasEvents} className="events-calendar-day flex min-w-16 shrink-0 flex-col items-center rounded-2xl px-3 py-2 text-center" data-has-events={hasEvents} aria-label={`${calendarDate(date, { weekday: 'long', month: 'long', day: 'numeric' })}${hasEvents ? `, ${eventCount} event${eventCount === 1 ? '' : 's'}` : ', no events'}`}>
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em]">{calendarDate(date, { weekday: 'short' })}</span>
                <strong className="mt-0.5 text-base leading-none">{calendarDate(date, { day: 'numeric' })}</strong>
                <span className="mt-1 text-[10px]">{hasEvents ? `${eventCount} event${eventCount === 1 ? '' : 's'}` : '—'}</span>
              </button>
            })}
          </div>
        </div>}

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-[4/5] rounded-[2rem] animate-pulse" style={{ background: 'var(--muted)' }} />
            ))}
          </div>
        ) : filtered.length > 0 ? (
          <div className="space-y-8 md:space-y-10">
            {dateGroups.map(([date, eventsOnDate]) => <section key={date} id={`events-date-${date}`} ref={node => { dateSectionRefs.current[date] = node }} className="events-date-section scroll-mt-28">
              <header className="events-date-heading mb-3 flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: date === today ? 'var(--primary-light)' : 'var(--muted-foreground)' }}>{date === today ? 'Today' : calendarDate(date, { weekday: 'long' })}</p>
                  <h2 className="mt-1 text-2xl font-bold">{calendarDate(date, { month: 'long', day: 'numeric', year: 'numeric' })}</h2>
                </div>
                <span className="text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>{eventsOnDate.length} event{eventsOnDate.length === 1 ? '' : 's'}</span>
              </header>
              <div className="qpassa-agenda-grid grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                {eventsOnDate.map(event => <EventCard key={event.id} event={event} agenda fullWidthMobile listing onClick={() => navigate('event-detail', event)} />)}
              </div>
            </section>)}
          </div>
        ) : null}

        {!loading && loadError ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <p className="font-semibold text-lg">Unable to load events</p>
            <p className="max-w-sm text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>{loadError}</p>
            <button onClick={() => setRetryToken(current => current + 1)} className="events-empty-action px-5 py-2.5 rounded-xl text-sm font-semibold">Try again</button>
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
            <button onClick={() => { setSearch(''); setCategory('All'); setPriceFilter('any'); setDateFilter(''); setDatePreset('all'); setCalendarMonth(today.slice(0, 7)) }}
              className="events-empty-action px-5 py-2.5 rounded-xl text-sm font-semibold">
              Clear filters
            </button>
          </div>
        ) : null}
      </div>

    </div>
  )
}
