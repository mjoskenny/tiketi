import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarIcon, CheckIcon, FacebookIcon, HeartIcon, InstagramIcon, LinkIcon, MapPinIcon, ShareNodesIcon, TwitterXIcon, WhatsAppIcon, XIcon } from './Icon'
import type { Event } from '../lib/types'
import { getEventPhase, getEventStartTimestamp } from '../lib/eventTime'
import { isFavoriteEvent, toggleFavoriteEvent } from '../lib/favorites'
import { useAuth } from '../context/AuthContext'
import { formatLocaleDate, formatLocaleTime } from '../lib/locale'

const FALLBACK: Record<string, string> = {
  Music: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=900&h=1200&fit=crop&auto=format',
  Parties: 'https://images.unsplash.com/photo-1595239094544-cd47f94236d7?w=900&h=1200&fit=crop&auto=format',
  Sports: 'https://images.unsplash.com/photo-1603910234616-3b5f4a6be2b4?w=900&h=1200&fit=crop&auto=format',
  Comedy: 'https://images.unsplash.com/photo-1559228461-4fa1e7eb677c?w=900&h=1200&fit=crop&auto=format',
  Conferences: 'https://images.unsplash.com/photo-1665035212282-3e117d618b36?w=900&h=1200&fit=crop&auto=format',
  Culture: 'https://images.unsplash.com/photo-1519530782816-ba0c305fbb0d?w=900&h=1200&fit=crop&auto=format',
  Business: 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=900&h=1200&fit=crop&auto=format',
  Festivals: 'https://images.unsplash.com/photo-1778847195158-18f3137a07a8?w=900&h=1200&fit=crop&auto=format',
}

type Props = {
  event: Event
  onClick?: () => void
  size?: 'sm' | 'md' | 'lg'
  compact?: boolean
  poster?: boolean
  fullWidthMobile?: boolean
  listing?: boolean
  timerBadge?: boolean
  rowLayout?: boolean
}

function fmtPrice(n: number, listing: boolean) {
  if (n === 0) return 'Free'
  const price = `${n.toLocaleString()} BIF`
  return listing ? price : `From ${price}`
}

function eventShareUrl(event: Event) {
  const slug = event.title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `${window.location.origin}/events/${event.id}/${slug}`
}

function formatTimeUntil(timestamp: number, now: number) {
  const totalSeconds = Math.max(0, Math.floor((timestamp - now) / 1000))
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return `${String(days).padStart(2, '0')}d ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`
}

export default function EventCard({ event, onClick, size = 'md', compact = false, poster = false, fullWidthMobile = false, listing = true, timerBadge = false, rowLayout = false }: Props) {
  const { user } = useAuth()
  const [liked, setLiked] = useState(() => isFavoriteEvent(event.id))
  const [shared, setShared] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [timerNow, setTimerNow] = useState(Date.now())
  const img = event.cover_image || FALLBACK[event.category] || FALLBACK.Music
  const minPrice = event.ticket_tiers?.length ? Math.min(...event.ticket_tiers.map(tier => tier.price)) : 0
  const status = getEventPhase(event.date, event.time, event.end_time, timerBadge ? timerNow : Date.now())
  const ended = status === 'Ended'
  const startsAt = getEventStartTimestamp(event.date, event.time)
  const sold = event.ticket_tiers?.reduce((total, tier) => total + tier.sold, 0) ?? 0
  const capacity = event.ticket_tiers?.reduce((total, tier) => total + tier.quantity, 0) ?? 0
  const highDemand = capacity > 0 && sold / capacity >= 0.7 && status !== 'Ended'
  const organizerName = event.organizers?.profiles?.full_name?.trim() || event.organizers?.name || 'Tiketi events'
  const organizerAvatar = event.organizers?.profiles?.profile_image || event.organizers?.profiles?.avatar_url || event.organizers?.logo_url || null
  const organizerVerified = event.organizers?.verified || event.organizers?.verification_status === 'verified'
  const dateTime = new Date(`${event.date}T${event.time || '00:00'}`)
  const formattedDateTime = `${formatLocaleDate(dateTime, { weekday: 'short', month: 'short', day: 'numeric' })} • ${formatLocaleTime(dateTime, { hour: 'numeric', minute: '2-digit' })}`

  const shareUrl = encodeURIComponent(eventShareUrl(event))
  const shareTitle = encodeURIComponent(event.title)

  useEffect(() => {
    if (!timerBadge) return
    const interval = window.setInterval(() => setTimerNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [timerBadge])

  const copyEventLink = async () => {
    try {
      await navigator.clipboard.writeText(decodeURIComponent(shareUrl))
      setShared(true)
      window.setTimeout(() => setShared(false), 1800)
    } catch {
      window.prompt('Copy the event link', decodeURIComponent(shareUrl))
    }
  }

  useEffect(() => {
    const refreshFavorite = () => setLiked(isFavoriteEvent(event.id))
    window.addEventListener('tiketi:favorites-changed', refreshFavorite)
    window.addEventListener('storage', refreshFavorite)
    return () => {
      window.removeEventListener('tiketi:favorites-changed', refreshFavorite)
      window.removeEventListener('storage', refreshFavorite)
    }
  }, [event.id])

  useEffect(() => {
    if (!shareOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShareOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [shareOpen])

  if (rowLayout) {
    return <article onClick={onClick} className={`group flex min-h-[124px] cursor-pointer items-center gap-4 overflow-hidden rounded-2xl border p-3 transition-all duration-200 sm:min-h-[132px] sm:gap-5 sm:p-3.5 ${ended ? 'border-white/15 bg-[#080808] hover:border-white/25 hover:bg-[#080808]' : 'border-white/[0.06] bg-[#101010] hover:border-white/15 hover:bg-[#151515]'}`}>
      <img src={img} alt={event.title} className={`h-[96px] w-[96px] shrink-0 rounded-xl object-cover sm:h-[104px] sm:w-[104px] ${ended ? 'grayscale opacity-50' : ''}`} loading="lazy" />
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 py-1">
        <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-white/55">
          <MapPinIcon size={13} className="shrink-0 text-white/45" />
          <span data-locale-ignore className="truncate">{event.venue}</span>
        </div>
        <div className="flex min-w-0 items-center justify-between gap-2">
          <h3 data-locale-ignore className={`min-w-0 truncate text-[12px] font-medium leading-snug text-white transition-colors ${ended ? 'group-hover:text-white' : 'group-hover:text-[var(--primary-light)]'}`}>{event.title}</h3>
          {ended && <span className="shrink-0 rounded-full bg-rose-600 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-white">Ended</span>}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/55">
          <span className="truncate font-medium text-white/75">{fmtPrice(minPrice, false)}</span>
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><CalendarIcon size={12} className="shrink-0 text-white/45" />{formattedDateTime}</span>
        </div>
      </div>
    </article>
  }

  const width = poster ? 327 : size === 'lg' ? 360 : size === 'sm' ? 250 : 300
  const cardWidth = compact || fullWidthMobile ? '100%' : `min(100%, ${width}px)`
  return <>
  <article onClick={onClick} className={`tixian-event-card group relative isolate flex aspect-[4/5] shrink-0 cursor-pointer flex-col overflow-hidden rounded-[2rem] border bg-[#111] transition-all duration-500 ${ended ? 'tixian-event-card-ended border-white/15 hover:-translate-y-0 hover:border-white/25 hover:shadow-[0_20px_45px_-24px_rgba(255,255,255,0.2)]' : 'border-white/5 hover:-translate-y-1 hover:border-white/15 hover:shadow-[0_24px_55px_-20px_rgba(255,120,40,0.28)]'} ${listing ? 'tixian-event-card-listing' : ''} ${fullWidthMobile ? 'event-card-full-mobile' : ''}`} style={{ width: cardWidth }}>
    <div className="absolute inset-0 overflow-hidden">
      <img src={img} alt={event.title} className={`h-full w-full object-cover transition-all duration-700 ease-out ${ended ? 'grayscale opacity-45' : 'opacity-70 group-hover:scale-110 group-hover:opacity-100'}`} loading="lazy" />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/10 to-transparent opacity-80" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-transparent to-transparent" />
    </div>

    <div className="absolute left-4 right-4 top-4 z-20 flex items-start justify-between gap-3 sm:left-5 sm:right-5 sm:top-5">
      <span className={`event-card-status inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${timerBadge && status === 'Upcoming' ? 'border border-white/20 bg-black/60 text-white shadow-lg backdrop-blur-xl' : ended ? 'bg-rose-600 text-white' : status === 'Happening' ? 'bg-[var(--primary)] text-[#17100a]' : 'bg-emerald-400/90 text-black'}`} title={timerBadge && status === 'Upcoming' ? 'Countdown until the event starts' : undefined}>
        {timerBadge && status === 'Upcoming' ? <><span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#f6a000] shadow-[0_0_8px_#f6a000]" /><span className="whitespace-nowrap text-[#ffdbb6] tracking-normal">{formatTimeUntil(startsAt, timerNow)}</span></> : status}
      </span>
      <span className={`event-card-price max-w-[55%] truncate rounded-2xl border px-3 py-1.5 text-[11px] font-black uppercase tracking-wider shadow-2xl backdrop-blur-xl ${ended ? 'border-white/25 bg-black/75 text-white' : 'border-white/10 bg-black/45 text-[#ffdbb6]'}`} style={ended ? { color: '#fff' } : undefined}>
        {fmtPrice(minPrice, listing)}
      </span>
    </div>

    <button onClick={e => { e.stopPropagation(); if (!user) { window.dispatchEvent(new CustomEvent('tiketi:require-auth', { detail: { title: 'Sign in to save events', message: 'Create an account to bookmark events you love.' } })); return; } void toggleFavoriteEvent(event.id).then(setLiked) }} aria-label={liked ? 'Remove from favorites' : 'Save event'} aria-pressed={liked} className="event-card-action absolute right-4 top-[3.75rem] z-20 flex h-9 w-9 items-center justify-center rounded-2xl border border-white/10 bg-black/45 text-white backdrop-blur-xl transition-all duration-300 hover:bg-white/15 active:scale-95 sm:right-5 sm:top-[4rem]" style={{ color: liked && !ended ? '#ff9d70' : undefined }}>
      <HeartIcon size={16} filled={liked} />
    </button>

    {highDemand && <span className="absolute right-5 top-[4.25rem] z-10 rounded-full border border-[#ffdbb6]/20 bg-black/60 px-3 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-[#ffdbb6] backdrop-blur-xl">High demand</span>}

    <div className={`event-card-details absolute inset-x-3 bottom-3 z-10 rounded-[2rem] border p-4 shadow-2xl backdrop-blur-xl transition-all duration-500 sm:inset-x-3.5 sm:bottom-3.5 sm:p-4 ${ended ? 'border-white/15 bg-black/75 group-hover:-translate-y-0 group-hover:border-white/20' : `border-white/5 group-hover:-translate-y-1 ${listing ? 'bg-black/35 group-hover:border-white/20 group-hover:bg-black/45' : 'bg-[#111]/85 group-hover:border-white/20 group-hover:bg-[#111]/95'}`}`} style={listing ? { paddingBottom: '1.5rem' } : undefined}>
      <div className={listing ? 'space-y-2.5' : 'space-y-3'}>
        <div className={listing ? 'space-y-2' : 'space-y-1'}>
          <h3 data-locale-ignore className={`line-clamp-1 text-base font-black uppercase italic leading-none tracking-tighter text-white transition-colors md:text-lg ${ended ? 'group-hover:text-white' : listing ? 'group-hover:text-[var(--primary-light)]' : 'group-hover:text-[#ffdbb6]'}`}>{event.title}</h3>
          {listing ? <div className="flex min-w-0 items-center gap-3 whitespace-nowrap text-[9px] font-black uppercase tracking-[0.04em] text-white/65 sm:gap-3 sm:text-[10px]">
            <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap"><CalendarIcon size={13} className="shrink-0 text-white/55" /><span>{formattedDateTime}</span></span>
            <span className="flex min-w-0 items-center gap-1.5"><MapPinIcon size={14} className={`shrink-0 ${ended ? 'text-white/60' : 'text-[var(--primary-light)]'}`} /><span className="truncate">{event.venue}</span></span>
          </div> : <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-white/50">
            <CalendarIcon size={14} />
            <span className="truncate">{formattedDateTime}</span>
          </div>}
        </div>
        {!listing && <div className="flex items-center gap-2 border-t border-white/5 pt-3 text-[10px] font-black uppercase tracking-[0.12em] text-white/65">
          <MapPinIcon size={16} className={`shrink-0 ${ended ? 'text-white/60' : 'text-[#ffdbb6]'}`} />
          <span className="truncate">{event.venue}</span>
        </div>}
        {listing && <div className="flex min-w-0 items-center gap-2 border-t border-white/5 pt-2.5 text-[10px] font-black uppercase tracking-[0.1em] text-white/70">
          <span className="relative grid h-7 w-7 shrink-0 place-items-center overflow-visible rounded-full border border-white/10 bg-white/10 text-[10px] text-white">
            {organizerAvatar ? <img src={organizerAvatar} alt="" className={`h-full w-full rounded-full object-cover ${ended ? 'grayscale' : ''}`} loading="lazy" /> : organizerName.slice(0, 1).toUpperCase()}
            {organizerVerified && <span className={`absolute -bottom-1 -right-1 flex h-[15px] w-[15px] items-center justify-center rounded-full border-2 border-[#161412] text-white shadow-md ${ended ? 'bg-white text-black' : 'bg-[#1689ff]'}`} aria-label="Verified organizer"><CheckIcon size={8} /></span>}
          </span>
          <span data-locale-ignore className="min-w-0 flex-1 truncate">{organizerName}</span>
          <button type="button" onClick={e => { e.stopPropagation(); setShareOpen(true) }} aria-label="Share event" aria-expanded={shareOpen} title="Share event" className={`share-action-button event-card-action flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/25 transition-colors focus-visible:outline focus-visible:outline-2 ${ended ? 'text-white/75 focus-visible:outline-white' : 'text-white/75 hover:border-[var(--primary)]/50 hover:bg-[var(--primary)]/15 hover:text-[var(--primary-light)] focus-visible:outline-[var(--primary-light)]'}`}>
            {shared ? <CheckIcon size={15} /> : <ShareNodesIcon size={16} />}
          </button>
        </div>}
      </div>
    </div>
  </article>
  {listing && shareOpen && createPortal(
    <div className="event-share-overlay" onMouseDown={e => { if (e.target === e.currentTarget) setShareOpen(false) }}>
      <section className="event-share-dialog" role="dialog" aria-modal="true" aria-labelledby={`event-share-title-${event.id}`}>
        <div className="event-share-heading">
          <div><strong id={`event-share-title-${event.id}`}>Share this event</strong><small>Send it to someone who would love it.</small></div>
          <button type="button" className="event-share-close" onClick={() => setShareOpen(false)} aria-label="Close share dialog"><XIcon size={17} /></button>
        </div>
        <div className="event-share-options">
          <a href={`https://wa.me/?text=${shareTitle}%20${shareUrl}`} target="_blank" rel="noreferrer"><WhatsAppIcon size={22} /><span>WhatsApp</span></a>
          <a href={`https://www.facebook.com/sharer/sharer.php?u=${shareUrl}`} target="_blank" rel="noreferrer"><FacebookIcon size={22} /><span>Facebook</span></a>
          <a href="https://www.instagram.com/" target="_blank" rel="noreferrer"><InstagramIcon size={22} /><span>Instagram</span></a>
          <a href={`https://twitter.com/intent/tweet?text=${shareTitle}&url=${shareUrl}`} target="_blank" rel="noreferrer"><TwitterXIcon size={20} /><span>X</span></a>
          <button type="button" onClick={() => void copyEventLink()}><LinkIcon size={21} /><span>{shared ? 'Copied!' : 'Copy link'}</span></button>
        </div>
      </section>
    </div>,
    document.body,
  )}
  </>
}
