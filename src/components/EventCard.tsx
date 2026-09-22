import { useEffect, useState } from 'react'
import { CalendarIcon, HeartIcon, MapPinIcon, TagIcon } from './Icon'
import type { Event } from '../lib/types'
import { isFavoriteEvent, toggleFavoriteEvent } from '../lib/favorites'
import { useAuth } from '../context/AuthContext'

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
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtPrice(n: number) {
  return n === 0 ? 'Free' : `From ${n.toLocaleString()} BIF`
}

function fmtCompactPrice(n: number) {
  if (n === 0) return 'Free'
  if (n >= 1000) {
    const value = n >= 10000 ? Math.round(n / 1000) : (n / 1000).toFixed(1).replace('.0', '')
    return `From BIF ${value}K`
  }
  return `From BIF ${n.toLocaleString()}`
}

function fmtCompactDateTime(date: string, time: string) {
  const day = new Date(`${date}T${time || '00:00'}`).toLocaleDateString('en-US', { weekday: 'short' })
  const formattedTime = new Date(`${date}T${time || '00:00'}`).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${day}, ${formattedTime}`
}

function countdown(date: string, time: string) {
  const target = new Date(`${date}T${time || '00:00'}`)
  const difference = Math.max(0, target.getTime() - Date.now())
  const days = Math.floor(difference / 86_400_000)
  const hours = Math.floor((difference % 86_400_000) / 3_600_000)
  const minutes = Math.floor((difference % 3_600_000) / 60_000)
  return [days, hours, minutes].map(value => String(value).padStart(2, '0'))
}

function eventStatus(date: string, time: string, endTime?: string | null) {
  const target = new Date(`${date}T${endTime || '23:59:59'}`)
  const today = new Date()
  const isToday = target.toDateString() === today.toDateString()
  if (target.getTime() < Date.now()) return 'Ended'
  if (isToday) return 'Happening'
  return null
}

function OrganizerMark({ name, avatar }: { name: string; avatar?: string | null }) {
  if (avatar) {
    return <img src={avatar} alt={name} className="h-5 w-5 shrink-0 rounded-full object-cover" loading="lazy" />
  }

  return <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[9px] font-black text-black">{name.slice(0, 1).toUpperCase()}</span>
}

export default function EventCard({ event, onClick, size = 'md', compact = false, poster = false, fullWidthMobile = false }: Props) {
  const { user } = useAuth()
  const [liked, setLiked] = useState(() => isFavoriteEvent(event.id))
  const img = event.cover_image || FALLBACK[event.category] || FALLBACK.Music
  const minPrice = event.ticket_tiers?.length ? Math.min(...event.ticket_tiers.map(tier => tier.price)) : 0
  const organizer = event.organizers?.profiles?.full_name?.trim() || event.organizers?.name || 'Tiketi events'
  const organizerCover = event.organizers?.profiles?.cover_image ?? event.organizers?.logo_url ?? event.cover_image ?? null
  const organizerAvatar = event.organizers?.profiles?.profile_image ?? event.organizers?.profiles?.avatar_url ?? event.organizers?.logo_url ?? null
  const [days, hours, minutes] = countdown(event.date, event.time)
  const status = eventStatus(event.date, event.time, event.end_time)

  useEffect(() => {
    const refreshFavorite = () => setLiked(isFavoriteEvent(event.id))
    window.addEventListener('tiketi:favorites-changed', refreshFavorite)
    window.addEventListener('storage', refreshFavorite)
    return () => {
      window.removeEventListener('tiketi:favorites-changed', refreshFavorite)
      window.removeEventListener('storage', refreshFavorite)
    }
  }, [event.id])

  if (compact) {
    return <article onClick={onClick} className={`group relative flex h-[132px] cursor-pointer items-center gap-4 overflow-hidden rounded-2xl border p-3 transition ${status === 'Ended' ? 'event-ended-card' : 'event-active-card'}`} style={{ background: '#0d0d0d', borderColor: 'rgba(255,255,255,0.06)' }} onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)' }} onMouseLeave={e => { e.currentTarget.style.transform = '' }}>
      <img src={img} alt={event.title} className="h-24 w-24 shrink-0 rounded-xl object-cover" loading="lazy" />
      <button onClick={e => { e.stopPropagation(); if (!user) { window.dispatchEvent(new CustomEvent('tiketi:require-auth', { detail: { title: 'Sign in to save events', message: 'Create an account to bookmark events you love.' } })); return; } void toggleFavoriteEvent(event.id).then(setLiked) }} aria-label={liked ? 'Remove from favorites' : 'Save event'} className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-black/60 text-white/85 backdrop-blur-md" style={{ color: liked ? '#ff9d70' : undefined }}><HeartIcon size={15} filled={liked} /></button>
      <div className="min-w-0 flex-1 py-0.5">
        {status && <span className={`mb-1 inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${status === 'Ended' ? 'bg-red-500/15 text-red-400' : 'bg-[#ff9a55]/15 text-[#ffad78]'}`}>{status}</span>}
        <p className="flex items-center gap-1.5 truncate text-xs text-white/65"><MapPinIcon size={13} />{event.venue}</p>
        <h3 className="mt-2 line-clamp-2 text-[15px] font-bold leading-snug text-white">{event.title}</h3>
        <div className="mt-2 flex items-center gap-3 text-xs text-white/60">
          <span className="truncate font-medium text-[var(--primary)]">{fmtCompactPrice(minPrice)}</span>
          <span className="flex shrink-0 items-center gap-1"><CalendarIcon size={12} />{fmtCompactDateTime(event.date, event.time)}</span>
        </div>
      </div>
    </article>
  }

  const width = poster ? 327 : size === 'lg' ? 360 : size === 'sm' ? 250 : 300
  return <article onClick={onClick} className={`${fullWidthMobile ? 'event-card-full-mobile' : ''} group relative flex shrink-0 cursor-pointer flex-col overflow-hidden shadow-[0_15px_35px_rgba(0,0,0,0.22)] transition duration-200 ${poster ? 'aspect-[0.66] rounded-[20px] border-0' : 'rounded-[22px] border border-white/10'} ${status === 'Ended' ? 'event-ended-card' : 'event-active-card'}`} style={{ width: `min(100%, ${width}px)`, backgroundColor: '#030302', backgroundImage: poster ? 'none' : `linear-gradient(180deg, rgba(12,12,11,0.08) 0%, rgba(27,20,15,0.16) 42%, rgba(8,7,6,1) 100%), url(${img})`, backgroundSize: 'cover', backgroundPosition: 'center' }} onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-5px)'; e.currentTarget.style.boxShadow = '0 24px 54px rgba(0,0,0,0.44)' }} onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 15px 35px rgba(0,0,0,0.22)' }}>
    <div className={`overflow-hidden bg-[#372014] ${poster ? 'absolute inset-0' : 'relative aspect-[0.88]'}`}>
      <img src={img} alt={event.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]" loading="lazy" />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.3) 0%, transparent 28%, rgba(5,4,3,0.44) 54%, rgba(3,3,2,1) 100%)' }} />
      {!status && <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-lg bg-black/50 px-2.5 py-1.5 text-white shadow-lg backdrop-blur-md">
        <span className="h-2.5 w-2.5 rounded-full bg-[#f6a000] shadow-[0_0_10px_#f6a000]" />
        <div className="flex gap-2.5 text-center leading-none">
          {[{ value: days, label: 'Days' }, { value: hours, label: 'Hrs' }, { value: minutes, label: 'Min' }].map(part => <span key={part.label}><b className="block text-sm font-extrabold tabular-nums text-white">{part.value}</b><small className="mt-1 block text-[8px] font-bold text-white">{part.label}</small></span>)}
        </div>
      </div>}
      {status && <span className={`absolute right-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide backdrop-blur-md ${status === 'Ended' ? 'bg-black/60 text-red-400' : 'bg-[#ff9a55]/75 text-[#17100a]'}`}>{status}</span>}
      <button onClick={e => { e.stopPropagation(); if (!user) { window.dispatchEvent(new CustomEvent('tiketi:require-auth', { detail: { title: 'Sign in to save events', message: 'Create an account to bookmark events you love.' } })); return; } void toggleFavoriteEvent(event.id).then(setLiked) }} aria-label={liked ? 'Remove from favorites' : 'Save event'} className={`absolute right-3 ${status ? 'top-14' : 'top-3'} z-10 flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-black/55 text-white/85 backdrop-blur-md`} style={{ color: liked ? '#ff9d70' : undefined }}><HeartIcon size={15} filled={liked} /></button>
      {!poster && <div className="absolute bottom-3 left-3 right-3 flex items-center gap-1.5 text-xs font-semibold text-white"><MapPinIcon size={14} /><span className="truncate">{event.venue}</span></div>}
    </div>
    <div className={`${poster ? 'absolute bottom-0 left-0 right-0 z-10 px-3.5 pb-4 pt-16' : 'min-w-0 px-3.5 pb-3.5 pt-3'}`}>
      {poster && <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-white/90"><MapPinIcon size={14} /><span className="truncate">{event.venue}</span></div>}
      <h3 className={`line-clamp-2 font-extrabold leading-[1.18] text-white ${poster ? 'text-[18px]' : 'text-[17px]'}`}>{event.title}</h3>
      <div className="mt-3 flex items-center justify-between gap-2 text-xs">
        <span className="flex min-w-0 items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 text-white" style={{ background: 'rgba(255,255,255,0.13)', border: '1px solid rgba(255,255,255,0.16)', backdropFilter: 'blur(10px)' }}><OrganizerMark name={organizer} avatar={organizerAvatar} /><span className="truncate">{organizer}</span></span>
        <span className="flex shrink-0 items-center gap-1 font-semibold text-white"><TagIcon size={13} />{fmtPrice(minPrice)}</span>
      </div>
    </div>
  </article>
}
