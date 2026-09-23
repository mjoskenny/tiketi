import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { ArrowLeftIcon, CalendarIcon, CheckIcon, ClockIcon, FacebookIcon, HeartIcon, InstagramIcon, LinkIcon, MinusIcon, PlusIcon, ShareIcon, TwitterXIcon, UserIcon, WhatsAppIcon, XIcon } from '../components/Icon'
import EventCard from '../components/EventCard'
import type { Event, TicketTier } from '../lib/types'
import { isFavoriteEvent, toggleFavoriteEvent } from '../lib/favorites'

type Props = { event: Event; navigate: (p: string, extra?: unknown) => void; onRequireAuth?: (title: string, message: string, mode?: 'customer' | 'organizer') => void }

type CheckoutSettings = {
  ticket_sales_enabled: boolean
  checkout_notice: string | null
}

const DEFAULT_CHECKOUT_SETTINGS: CheckoutSettings = {
  ticket_sales_enabled: true,
  checkout_notice: null,
}

const FALLBACK = 'https://images.unsplash.com/photo-1506157786151-b8491531f063?w=1600&h=500&fit=crop&auto=format'

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function formatPrice(value: number) { return value === 0 ? 'Free' : `BIF ${value.toLocaleString()}` }

function eventHasEnded(event: Event) {
  return new Date(`${event.date}T${event.end_time || '23:59:59'}`).getTime() < Date.now()
}

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

function countdownParts(event: Event) {
  const distance = Math.max(0, new Date(`${event.date}T${event.time || '00:00'}`).getTime() - Date.now())
  return [Math.floor(distance / 86400000), Math.floor((distance / 3600000) % 24), Math.floor((distance / 60000) % 60), Math.floor((distance / 1000) % 60)]
}

export default function EventDetailPage({ event, navigate, onRequireAuth }: Props) {
  const { user } = useAuth()
  const tiers: TicketTier[] = event.ticket_tiers ?? []
  const [eventTags, setEventTags] = useState<string[]>(event.tags ?? [])
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [related, setRelated] = useState<Event[]>([])
  const [relatedError, setRelatedError] = useState('')
  const [relatedRetryToken, setRelatedRetryToken] = useState(0)
  const [liked, setLiked] = useState(() => isFavoriteEvent(event.id))
  const [copied, setCopied] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [countdown, setCountdown] = useState(() => countdownParts(event))
  const [isFollowingOrganizer, setIsFollowingOrganizer] = useState(false)
  const [followBusy, setFollowBusy] = useState(false)
  const [followError, setFollowError] = useState('')
  const [checkoutSettings, setCheckoutSettings] = useState<CheckoutSettings>(DEFAULT_CHECKOUT_SETTINGS)

  useEffect(() => {
    let isMounted = true
    const loadCheckoutSettings = async () => {
      const { data } = await supabase.rpc('get_public_platform_checkout_settings')
      const settings = Array.isArray(data) ? data[0] : data
      if (!isMounted || !settings) return
      setCheckoutSettings({
        ticket_sales_enabled: settings.ticket_sales_enabled ?? true,
        checkout_notice: settings.checkout_notice ?? null,
      })
    }
    void loadCheckoutSettings()
    return () => { isMounted = false }
  }, [])

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
    const organizerId = event.organizers?.id
    if (!organizerId || !user) return
    supabase.from('organizer_followers').select('id').eq('organizer_id', organizerId).eq('user_id', user.id).maybeSingle().then(({ data, error }) => {
      if (error) setFollowError(error.message)
      else setIsFollowingOrganizer(!!data)
    })
  }, [event.organizers?.id, user?.id])

  useEffect(() => {
    const loadTags = async () => {
      const { data } = await supabase.from('events').select('tags').eq('id', event.id).maybeSingle()
      if (data?.tags) setEventTags(Array.isArray(data.tags) ? data.tags : String(data.tags).split(',').map(tag => tag.trim()).filter(Boolean))
    }

    void loadTags()
  }, [event.id])

  const toggleOrganizerFollow = async () => {
    const organizerId = event.organizers?.id
    if (!organizerId) return
    if (!user) {
      onRequireAuth?.('Sign in to follow organizers', 'Create an account to follow your favorite event hosts and get updates from them.')
      return
    }
    if (user.id === event.organizers?.user_id) return
    setFollowBusy(true)
    setFollowError('')
    const result = isFollowingOrganizer
      ? await supabase.from('organizer_followers').delete().eq('organizer_id', organizerId).eq('user_id', user.id)
      : await supabase.from('organizer_followers').insert({ organizer_id: organizerId, user_id: user.id })
    if (!result.error) setIsFollowingOrganizer(!isFollowingOrganizer)
    else setFollowError(result.error.code === '23505' ? 'You are already following this organizer.' : result.error.message)
    setFollowBusy(false)
  }

  const toggleFavorite = async () => {
    if (!user) {
      onRequireAuth?.('Sign in to save events', 'Create an account to bookmark events you love.')
      return
    }
    setLiked(await toggleFavoriteEvent(event.id))
  }

  useEffect(() => {
    const loadRelated = async () => {
      setRelatedError('')
      const { data, error } = await supabase.from('events').select('*, tags, ticket_tiers(id, event_id, name, price, description, ticket_type, extra_info, expires_at, group_size, quantity, sold, created_at), organizers(id, user_id, name, description, logo_url, website, phone, city, verified, subscription_tier, created_at, profiles!organizers_user_id_fkey(id, full_name, username, profile_image, avatar_url, cover_image, email))').eq('status', 'published').neq('id', event.id).limit(8)
      if (error) { setRelatedError(error.message); return }
      setRelated(sortUpcomingFirst((data as Event[]) ?? []))
    }
    void loadRelated()
    const profilesChannel = supabase.channel(`public-profiles-event-detail:${event.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => { void loadRelated() })
      .subscribe()
    return () => { void supabase.removeChannel(profilesChannel) }
  }, [event.id, relatedRetryToken])

  useEffect(() => {
    const timer = window.setInterval(() => setCountdown(countdownParts(event)), 1000)
    return () => window.clearInterval(timer)
  }, [event])

  const totalTickets = Object.values(quantities).reduce((sum, quantity) => sum + quantity, 0)
  const subtotal = useMemo(() => tiers.reduce((sum, tier) => sum + (quantities[tier.id] || 0) * tier.price, 0), [quantities, tiers])
  const total = subtotal
  const organizerName = event.organizers?.profiles?.full_name?.trim() || event.organizers?.name || 'Tiketi events'
  const organizerUsername = event.organizers?.profiles?.username?.trim().replace(/^@/, '') || null
  const organizerAvatar = event.organizers?.profiles?.profile_image ?? event.organizers?.profiles?.avatar_url ?? event.organizers?.logo_url ?? null
  const soldPercent = event.capacity ? Math.round((tiers.reduce((sum, tier) => sum + tier.sold, 0) / event.capacity) * 100) : 0
  const ended = eventHasEnded(event)
  const hasVenueCoordinates = typeof event.venue_latitude === 'number' && typeof event.venue_longitude === 'number'
  const venueMapQuery = hasVenueCoordinates ? `${event.venue_latitude},${event.venue_longitude}` : `${event.venue}, ${event.city}`
  const venueMapUrl = hasVenueCoordinates
    ? `https://www.google.com/maps/search/?api=1&query=${event.venue_latitude},${event.venue_longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venueMapQuery)}`

  const copyLink = () => {
    navigator.clipboard?.writeText(window.location.href)
    setCopied(true)
    setShareOpen(false)
    window.setTimeout(() => setCopied(false), 1800)
  }

  const shareUrl = encodeURIComponent(window.location.href)
  const shareTitle = encodeURIComponent(event.title)

  const changeQuantity = (tier: TicketTier, direction: number) => {
    if (ended) return
    const remaining = Math.max(0, tier.quantity - tier.sold)
    setQuantities(current => ({ ...current, [tier.id]: Math.min(10, remaining, Math.max(0, (current[tier.id] || 0) + direction)) }))
  }

  const checkout = () => {
    if (!user) {
      onRequireAuth?.('Sign in to continue', 'Create an account to reserve tickets and manage your event purchases.')
      return
    }
    if (ended || !totalTickets) return
    if (!checkoutSettings.ticket_sales_enabled) {
      window.alert(checkoutSettings.checkout_notice || 'Ticket sales are currently paused. Please try again later.')
      return
    }
    navigate('checkout', { event, quantities: Object.fromEntries(tiers.filter(tier => quantities[tier.id] > 0).map(tier => [tier.name, quantities[tier.id]])), subtotal, total })
  }

  return (
    <main className={`sinc-event-page ${ended ? 'sinc-ended-page' : ''}`} style={{ '--event-cover-image': `url(${event.cover_image || FALLBACK})` } as React.CSSProperties}>
      <section className="sinc-event-cover" style={{ backgroundImage: `linear-gradient(180deg, rgba(0,0,0,.05), rgba(0,0,0,.7)), url(${event.cover_image || FALLBACK})` }}>
        <button className="sinc-cover-back" onClick={() => navigate('events')} aria-label="Back to events"><ArrowLeftIcon size={18} /></button>
      </section>

      <section className="sinc-event-identity">
        <div className="sinc-event-toolbar"><div className="sinc-event-actions"><button onClick={() => void toggleFavorite()} aria-label={liked ? 'Remove event from favorites' : 'Save event'} aria-pressed={liked}><HeartIcon size={18} filled={liked} /></button><span className="sinc-share-wrap"><button onClick={() => setShareOpen(value => !value)} aria-label="Share event" aria-expanded={shareOpen}>{copied ? <CheckIcon size={17} /> : <ShareIcon size={17} />}</button>{shareOpen && <><button className="sinc-share-backdrop" aria-label="Close share sheet" onClick={() => setShareOpen(false)} /><div className="sinc-share-popover"><div className="sinc-share-heading"><div><strong>Share this event</strong><small>Send it to someone who would love it.</small></div><button className="sinc-share-close" onClick={() => setShareOpen(false)} aria-label="Close share sheet"><XIcon size={17} /></button></div><div className="sinc-share-options"><a href={`https://wa.me/?text=${shareTitle}%20${shareUrl}`} target="_blank" rel="noreferrer"><WhatsAppIcon size={22} /><span>WhatsApp</span></a><a href={`https://www.facebook.com/sharer/sharer.php?u=${shareUrl}`} target="_blank" rel="noreferrer"><FacebookIcon size={22} /><span>Facebook</span></a><a href="https://www.instagram.com/" target="_blank" rel="noreferrer"><InstagramIcon size={22} /><span>Instagram</span></a><a href={`https://twitter.com/intent/tweet?text=${shareTitle}&url=${shareUrl}`} target="_blank" rel="noreferrer"><TwitterXIcon size={20} /><span>X</span></a><button onClick={copyLink}><LinkIcon size={21} /><span>{copied ? 'Copied' : 'Copy link'}</span></button></div></div></>}</span></div></div>
        {eventTags.length > 0 && <div className="sinc-event-chip-row">{eventTags.map((tag) => <span key={tag} className="sinc-chip">#{tag}</span>)}</div>}
        <div className="sinc-countdown"><p><span /> STARTS IN</p><div>{countdown.map((value, index) => <span key={index}><strong>{String(value).padStart(2, '0')}</strong><small>{['Days', 'Hrs', 'Min', 'Sec'][index]}</small></span>)}</div></div>
        <div className="sinc-title-row"><h1>{event.title}</h1>{ended && <span className="sinc-ended-badge">Event ended</span>}</div>
        <div className="sinc-organizer">
          <span className="sinc-organizer-logo">{organizerAvatar ? <img src={organizerAvatar} alt={organizerName} /> : organizerName.slice(0, 1).toUpperCase()}</span>
          <span><small>Organizer</small><b>{organizerUsername ? `@${organizerUsername}` : organizerName}</b></span>
        </div>
        <div className="sinc-profile-actions"><button onClick={() => event.organizers && navigate('organizer-profile', event.organizers)}>View Profile</button><button onClick={user?.id === event.organizers?.user_id ? () => navigate('profile') : toggleOrganizerFollow} disabled={followBusy}>{user?.id === event.organizers?.user_id ? 'Your profile' : isFollowingOrganizer ? 'Following' : 'Follow'}</button></div>{followError && <p className="text-xs mt-2" style={{ color: '#fca5a5' }}>{followError}</p>}
        <section className="sinc-details-section sinc-details-under-actions"><h2>Event details</h2><div className="sinc-detail-grid"><div><CalendarIcon size={17} /><span><small>Date</small><b>{formatDate(event.date)}</b></span></div><div><ClockIcon size={17} /><span><small>Time</small><b>{event.time?.slice(0, 5) || 'TBA'}</b></span></div><div><UserIcon size={17} /><span><small>Organizer</small><b>{organizerName}</b></span></div></div><div className="sinc-policy-row"><CheckIcon size={15} /> {event.refund_policy || 'Tickets are non-refundable'} <CheckIcon size={15} /> {event.entry_policy || 'Valid ID required at entry'}</div></section>
      </section>

      <section className="sinc-event-body">
        <div className="sinc-event-description"><h2>About this event</h2><p>{event.description || 'Join us for an unforgettable experience.'}</p></div>
        <section className="sinc-ticket-section"><div className="sinc-ticket-heading"><h2>Get tickets</h2></div><div className="sinc-ticket-content"><p>Choose your ticket type to continue</p><div className="sinc-ticket-list">{tiers.length === 0 && <div className="sinc-empty-tickets">Tickets will be available soon.</div>}{tiers.map(tier => { const remaining = Math.max(0, tier.quantity - tier.sold); const soldOut = remaining === 0; const tierType = tier.ticket_type === 'non_consumable' ? 'Non-consumable' : 'Consumable'; const expiry = tier.expires_at ? `Expires ${new Date(`${tier.expires_at}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : null; return <div className={`sinc-ticket-row ${soldOut || ended ? 'is-sold-out' : ''}`} key={tier.id}><div className="sinc-ticket-copy"><strong>{tier.name}</strong><span>{tier.price === 0 ? 'Free' : formatPrice(tier.price)}</span><small>{[tier.description, tier.extra_info, tierType, (tier.group_size ?? 1) > 1 ? `${tier.group_size} tickets per purchase` : null, expiry].filter(Boolean).join(' · ')}</small></div>{ended ? <span className="sinc-ended-row-label">EVENT ENDED</span> : soldOut ? <span className="sinc-sold-stamp">SOLD OUT</span> : <div className="sinc-ticket-quantity"><button onClick={() => changeQuantity(tier, -1)} aria-label={`Remove ${tier.name}`}><MinusIcon size={14} /></button><b>{quantities[tier.id] || 0}</b><button onClick={() => changeQuantity(tier, 1)} aria-label={`Add ${tier.name}`}><PlusIcon size={14} /></button></div>}</div> })}</div><p className="sinc-contact-note">{ended ? 'This event has ended and tickets are no longer available.' : <>Questions about tickets? <span>Contact the organizer.</span></>}</p>{subtotal > 0 && <div className="sinc-total-row"><span>Total <small>{totalTickets} ticket{totalTickets === 1 ? '' : 's'} · no customer service fee</small></span><strong>{formatPrice(total)}</strong></div>}<button className="sinc-continue-button" onClick={checkout} disabled={ended || !totalTickets}>{ended ? 'Event ended' : 'Continue'}</button></div></section>

        <section className="sinc-location-section"><div className="sinc-section-title"><h2>Location</h2><a href={venueMapUrl} target="_blank" rel="noreferrer">View on map</a></div><p>{event.venue}</p><div className="sinc-map"><iframe title={`${event.venue} map`} src={`https://www.google.com/maps?q=${encodeURIComponent(venueMapQuery)}&output=embed`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" /></div></section>

        {(related.length > 0 || relatedError) && <section className="sinc-related-section"><div className="sinc-section-title"><h2>Related events</h2><button onClick={() => navigate('events')}>View all</button></div>{relatedError ? <div className="rounded-xl border px-4 py-5 text-sm" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}><p>Related events could not be loaded.</p><p className="mt-1 text-xs">{relatedError}</p><button onClick={() => setRelatedRetryToken(current => current + 1)} className="mt-3 rounded-lg px-3 py-1.5 text-xs font-bold" style={{ background: 'var(--primary)', color: '#000' }}>Try again</button></div> : <div className="sinc-related-grid">{related.map(item => <EventCard key={item.id} event={item} compact onClick={() => navigate('event-detail', item)} />)}</div>}</section>}
      </section>
    </main>
  )
}
