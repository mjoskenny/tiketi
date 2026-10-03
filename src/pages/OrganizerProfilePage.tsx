import { useEffect, useState } from 'react'
import { ArrowLeftIcon, CheckIcon, UserIcon, CalendarIcon, MailIcon, MapPinIcon, ShareNodesIcon, UsersIcon } from '../components/Icon'
import EventCard from '../components/EventCard'
import ShareDialog from '../components/ShareDialog'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Event, Organizer } from '../lib/types'
import { ORGANIZER_COVER_PLACEHOLDER } from '../lib/profileMedia'
import { getEventEndTimestamp, hasEventEnded } from '../lib/eventTime'
import { organizerShareUrl } from '../lib/share'
import { currentLocale, formatLocaleDate } from '../lib/locale'
import i18n from '../lib/i18n'

type Props = { organizer: Organizer; navigate: (p: string, extra?: unknown) => void }

function formatEventDate(date: string) {
  return formatLocaleDate(date, { day: 'numeric', month: 'short', year: '2-digit' })
}

function formatPrice(value: number) {
  if (!value) return 'Free entry'
  return `BIF ${value.toLocaleString()}`
}

function getMinPrice(event: Event) {
  if (!event.ticket_tiers?.length) return 0
  return Math.min(...event.ticket_tiers.map((tier) => tier.price))
}

function getEventPhase(date: string, time: string, endTime?: string | null) {
  return hasEventEnded(date, time, endTime) ? 'past' : 'active'
}

export default function OrganizerProfilePage({ organizer: initialOrganizer, navigate }: Props) {
  const { user } = useAuth()
  const [organizer, setOrganizer] = useState<Organizer>(initialOrganizer)
  const [events, setEvents] = useState<Event[]>([])
  const [eventsLoading, setEventsLoading] = useState(true)
  const [eventsError, setEventsError] = useState<string | null>(null)
  const [eventsRetryToken, setEventsRetryToken] = useState(0)
  const [followerCount, setFollowerCount] = useState(0)
  const [isFollowing, setIsFollowing] = useState(false)
  const [followBusy, setFollowBusy] = useState(false)
  const [followError, setFollowError] = useState('')
  const [shareOpen, setShareOpen] = useState(false)
  const [locale, setLocale] = useState(currentLocale())
  const displayName = organizer.profiles?.full_name?.trim() || organizer.name
  const localizedDescription = locale === 'fr-FR'
    ? organizer.description_fr || organizer.description
    : organizer.description_en || organizer.description

  useEffect(() => {
    const updateLocale = () => setLocale(currentLocale())
    i18n.on('languageChanged', updateLocale)
    return () => { i18n.off('languageChanged', updateLocale) }
  }, [])

  useEffect(() => {
    if (!organizer.id) return
    const loadFollowers = async () => {
      const { data, error } = await supabase.from('organizer_followers').select('user_id').eq('organizer_id', organizer.id)
      if (error) { setFollowError(error.message); return }
      const visibleFollowers = (data ?? []).filter(follower => follower.user_id !== organizer.user_id)
      setFollowerCount(visibleFollowers.length)
      setIsFollowing(!!user && !!visibleFollowers.some(follower => follower.user_id === user.id))
    }
    void loadFollowers()
    const channel = supabase.channel(`organizer-followers:${organizer.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'organizer_followers', filter: `organizer_id=eq.${organizer.id}` }, () => { void loadFollowers() })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [organizer.id, user?.id])

  const toggleFollow = async () => {
    if (!user) { navigate('auth-customer'); return }
    if (user.id === organizer.user_id) return
    setFollowBusy(true)
    setFollowError('')
    const result = isFollowing
      ? await supabase.from('organizer_followers').delete().eq('organizer_id', organizer.id).eq('user_id', user.id)
      : await supabase.from('organizer_followers').insert({ organizer_id: organizer.id, user_id: user.id })
    if (!result.error) {
      setIsFollowing(!isFollowing)
      setFollowerCount(count => Math.max(0, count + (isFollowing ? -1 : 1)))
    } else setFollowError(result.error.code === '23505' ? 'You are already following this organizer.' : result.error.message)
    setFollowBusy(false)
  }

  const emailOrganizer = () => {
    const recipient = organizer.profiles?.email
    if (!recipient) return
    const composeUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(recipient)}`
    const composeWindow = window.open(composeUrl, '_blank')
    if (composeWindow) composeWindow.opener = null
    if (!composeWindow) window.location.assign(composeUrl)
  }
  useEffect(() => {
    if (!organizer.user_id) return

    const loadOrganizerProfile = async () => {
      const [{ data: profile }, { data: localizedBio }] = await Promise.all([supabase
        .from('profiles')
        .select('id, full_name, username, profile_image, avatar_url, cover_image, email')
        .eq('id', organizer.user_id)
        .maybeSingle(), supabase
        .from('organizers')
        .select('description, description_en, description_fr')
        .eq('id', organizer.id)
        .maybeSingle()])

      if (profile || localizedBio) {
        setOrganizer(current => ({ ...current, ...(localizedBio ?? {}), profiles: profile ?? current.profiles }))
      }
    }

    void loadOrganizerProfile()

    // Subscribe to profile changes for this organizer
    const profileChannel = supabase
      .channel(`organizer-profile:${organizer.user_id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'profiles',
        filter: `id=eq.${organizer.user_id}`,
      }, async () => {
        // Refresh organizer data with updated profile
        await loadOrganizerProfile()
      })
      .subscribe()

    return () => {
      void supabase.removeChannel(profileChannel)
    }
  }, [organizer.id, organizer.user_id])

  useEffect(() => {
    let mounted = true

    if (!organizer.id) {
      setEventsError('This organizer could not be identified.')
      setEventsLoading(false)
      return () => { mounted = false }
    }

    const loadEvents = async () => {
      if (mounted) {
        setEventsLoading(true)
        setEventsError(null)
      }

      const { data, error } = await supabase
        .from('events')
        .select('*, organizers(id, user_id, name, description, logo_url, website, phone, city, verified, subscription_tier, created_at, profiles!organizers_user_id_fkey(id, full_name, username, profile_image, avatar_url, cover_image, email))')
        .eq('organizer_id', organizer.id)
        .eq('status', 'published')
        .order('date', { ascending: true })

      if (error) {
        if (mounted) {
          setEventsError(error.message)
          setEventsLoading(false)
        }
        return
      }

      const baseEvents = (data as Event[]) ?? []
      const eventIds = baseEvents.map((event) => event.id)
      const { data: tiers, error: tierError } = eventIds.length
        ? await supabase.from('ticket_tiers').select('*').in('event_id', eventIds)
        : { data: [], error: null }

      if (mounted) {
        if (tierError) setEventsError(tierError.message)
        setEvents(baseEvents.map((event) => ({ ...event, ticket_tiers: (tiers ?? []).filter((tier) => tier.event_id === event.id) })))
        setEventsLoading(false)
      }
    }

    void loadEvents()

    const channel = supabase
      .channel(`organizer-events:${organizer.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'events',
        filter: `organizer_id=eq.${organizer.id}`,
      }, () => {
        void loadEvents()
      })
      .subscribe()

    return () => {
      mounted = false
      void supabase.removeChannel(channel)
    }
  }, [organizer.id, eventsRetryToken])
  const organizerUsername = organizer.profiles?.username?.trim().replace(/^@/, '') || null
  const organizerCover = organizer.profiles?.cover_image || ORGANIZER_COVER_PLACEHOLDER
  const organizerAvatar = organizer.profiles?.profile_image || organizer.profiles?.avatar_url || organizer.logo_url || null
  const initials = displayName.slice(0, 1).toUpperCase()
  const sortedEvents = [...events].sort((a, b) => {
    const aTime = getEventEndTimestamp(a.date, a.time, a.end_time)
    const bTime = getEventEndTimestamp(b.date, b.time, b.end_time)
    const aUpcoming = aTime >= Date.now()
    const bUpcoming = bTime >= Date.now()

    if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1
    if (aUpcoming) return aTime - bTime
    return bTime - aTime
  })
  const activeEvents = sortedEvents.filter((event) => getEventPhase(event.date, event.time, event.end_time) === 'active')
  const pastEvents = sortedEvents.filter((event) => getEventPhase(event.date, event.time, event.end_time) === 'past')
  return (
    <main className="sinc-organizer-profile organizer-profile-refresh">
      <section className="sinc-organizer-header">
        <div className="sinc-organizer-cover" style={organizerCover ? { backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.10), rgba(0,0,0,0.65)), url(${organizerCover})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
          <button type="button" className="sinc-organizer-back" onClick={() => navigate('events')} aria-label="Back to events">
            <ArrowLeftIcon size={17} />
          </button>
        </div>
        <div className="sinc-organizer-cover-content">
          <div className="sinc-organizer-avatar"><span className="sinc-organizer-avatar-image">{organizerAvatar ? <img src={organizerAvatar} alt={displayName} /> : initials}</span>{(organizer.verified || organizer.verification_status === 'verified') && <span className="verified-profile-badge sinc-organizer-verified" aria-label="Verified organizer"><CheckIcon size={13} /></span>}</div>
          <div className="sinc-organizer-actions">
            <button type="button" className="share-action-button sinc-organizer-action-icon" onClick={() => setShareOpen(true)} aria-label={`Share ${displayName}`} title="Share organizer">
              <ShareNodesIcon size={16} />
            </button>
            {organizer.profiles?.email && <button type="button" className="share-action-button sinc-organizer-action-icon" onClick={emailOrganizer} aria-label={`Email ${displayName}`} title={user?.email ? `Email ${displayName} from your mail app` : 'Sign in to email this organizer'}><MailIcon size={16} /></button>}
            <button type="button" className={`sinc-organizer-follow ${isFollowing ? 'is-following' : ''}`} onClick={user?.id === organizer.user_id ? () => navigate('profile') : toggleFollow} disabled={followBusy} aria-pressed={user?.id !== organizer.user_id ? isFollowing : undefined}>{user?.id === organizer.user_id ? 'Your profile' : followBusy ? 'Saving…' : isFollowing ? 'Following' : 'Follow'}</button>
          </div>
        </div>
        <div className="sinc-organizer-identities">
          <p className="sinc-organizer-kicker">Organizer profile</p><h1 data-locale-ignore>{displayName}</h1>
          {organizerUsername && <p style={{ color: 'var(--accent)' }}>@{organizerUsername}</p>}
          <div className="sinc-organizer-profile-meta"><span><UsersIcon size={14} /> {`${followerCount} ${followerCount === 1 ? 'follower' : 'followers'}`}</span><span><CalendarIcon size={14} /> {`${events.length} ${events.length === 1 ? 'published event' : 'published events'}`}</span>{organizer.city && <span><MapPinIcon size={14} /> {organizer.city}</span>}</div>
          {localizedDescription && <p className="sinc-organizer-description" data-locale-ignore>{localizedDescription}</p>}
          {followError && <p style={{ color: '#fca5a5' }}>{followError}</p>}
        </div>
      </section>

      <section className="sinc-organizer-content">
        <div className="sinc-organizer-events-heading"><div><p className="sinc-organizer-kicker">What&apos;s on</p><h2 className="sinc-organizer-events-title">Events</h2></div><span>{`${activeEvents.length} upcoming`}</span></div>

        <div className="sinc-organizer-event-list">
          {activeEvents.length > 0 && (
            <div className="sinc-organizer-group">
              <p className="sinc-organizer-group-label">Active events</p>
              <div className="sinc-organizer-event-grid">{activeEvents.map((event) => <EventCard key={event.id} event={event} poster fullWidthMobile onClick={() => navigate('event-detail', event)} />)}</div>
            </div>
          )}

          {pastEvents.length > 0 && (
            <div className="sinc-organizer-group">
              <p className="sinc-organizer-group-label">Past events</p>
              <div className="sinc-organizer-event-grid">{pastEvents.map((event) => <EventCard key={event.id} event={event} poster fullWidthMobile onClick={() => navigate('event-detail', event)} />)}</div>
            </div>
          )}

          {eventsLoading && (
            <div className="organizer-no-events"><p>Loading events...</p></div>
          )}

          {!eventsLoading && eventsError && (
            <div className="organizer-no-events"><p>Unable to load events right now.</p><p className="mt-1 text-xs" style={{ color: 'var(--muted-foreground)' }}>{eventsError}</p><button onClick={() => setEventsRetryToken(current => current + 1)} className="mt-3 rounded-xl px-4 py-2 text-xs font-bold" style={{ background: 'var(--primary)', color: '#000' }}>Try again</button></div>
          )}

          {!eventsLoading && !eventsError && events.length === 0 && (
            <div className="organizer-no-events">
              <UserIcon size={24} />
              <p>No upcoming events yet.</p>
            </div>
          )}
        </div>

      </section>
      <ShareDialog open={shareOpen} title={displayName} url={organizerShareUrl(organizer)} onClose={() => setShareOpen(false)} />
    </main>
  )
}
