import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { BellIcon, TicketIcon, CalendarIcon, DollarSignIcon, TagIcon, UsersIcon } from '../components/Icon'

type Props = { navigate: (p: string) => void }
type NotifTab = 'all' | 'tickets' | 'events' | 'payments' | 'promotions' | 'team'

type Notif = {
  id: string
  type: 'ticket' | 'event' | 'payment' | 'promotion' | 'team' | 'follower'
  title: string
  body: string
  time: string
  createdAt: string
  read: boolean
  eventId: string | null
  ticketId: string | null
  recipientScope: 'attendee' | 'organizer'
}

const SAMPLE: Notif[] = []

export default function NotificationsPage({ navigate }: Props) {
  const { user, organizer, isOrganizer, teamMembership } = useAuth()
  const [tab, setTab] = useState<NotifTab>('all')
  const [notifs, setNotifs] = useState<Notif[]>(SAMPLE)
  const [loadError, setLoadError] = useState('')
  const [retryToken, setRetryToken] = useState(0)

  useEffect(() => {
    if (!user) return
    const loadNotifications = async () => {
      setLoadError('')
      const { data, error } = await supabase
        .from('notifications')
        .select('id, type, title, body, read_at, created_at, event_id, ticket_id, recipient_scope')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      if (error) { setLoadError('Notifications are not available yet. Apply the notifications database migration.'); return }
      setLoadError('')
      setNotifs((data ?? []).map(item => ({ id: item.id, type: item.type as Notif['type'], title: item.title, body: item.body, time: new Date(item.created_at).toLocaleString(), createdAt: item.created_at, read: !!item.read_at, eventId: item.event_id ?? null, ticketId: item.ticket_id ?? null, recipientScope: item.recipient_scope === 'organizer' ? 'organizer' : 'attendee' })).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()))
    }
    void loadNotifications()
    const channel = supabase.channel(`notifications:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, () => { void loadNotifications() })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [user?.id, retryToken])

  const markAllRead = async () => {
    if (!user) return
    const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', user.id).is('read_at', null)
    if (error) { setLoadError('Notifications are not available yet. Apply the notifications database migration.'); return }
    setNotifs(current => current.map(notification => ({ ...notification, read: true })))
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center flex-col gap-4 pt-16"
        style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
        <p className="font-bold text-xl">Sign in to see notifications</p>
        <button onClick={() => navigate('auth-customer')} className="px-6 py-3 rounded-xl font-bold text-sm"
          style={{ background: 'var(--primary)', color: '#fff' }}>
          Sign In
        </button>
      </div>
    )
  }

  const TABS: { key: NotifTab; label: string; Icon: typeof BellIcon }[] = [
    { key: 'all', label: 'All', Icon: BellIcon },
    { key: 'tickets', label: 'Tickets', Icon: TicketIcon },
    { key: 'events', label: 'Events', Icon: CalendarIcon },
    { key: 'payments', label: 'Payments', Icon: DollarSignIcon },
    { key: 'promotions', label: 'Offers', Icon: TagIcon },
    { key: 'team', label: 'Team', Icon: UsersIcon },
  ]

  const typeForTab: Record<Exclude<NotifTab, 'all'>, Notif['type']> = { tickets: 'ticket', events: 'event', payments: 'payment', promotions: 'promotion', team: 'team' }
  const filtered = tab === 'all' ? notifs : notifs.filter(n => n.type === typeForTab[tab])
  const unreadCount = notifs.filter(n => !n.read).length

  const openNotification = async (notification: Notif) => {
    if (!notification.read) {
      const readQuery = supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', notification.id)
      const { error: readError } = isOrganizer && organizer?.id
        ? await readQuery.eq('organizer_id', organizer.id)
        : await readQuery.eq('user_id', user.id)
      if (readError) { setLoadError(readError.message); return }
      setNotifs(current => current.map(item => item.id === notification.id ? { ...item, read: true } : item))
    }
    if (notification.ticketId) {
      const { data: ticket, error: ticketError } = await supabase.from('tickets').select('*, events(*), ticket_tiers(*)').eq('id', notification.ticketId).maybeSingle()
      if (ticketError) { setLoadError(ticketError.message); return }
      if (ticket?.events) navigate('ticket', { event: ticket.events, info: { name: ticket.holder_name ?? 'Guest', phone: ticket.holder_phone ?? '', email: ticket.holder_email ?? '' }, ticket: ticket.qr_code, ticketStatus: ticket.status, ticketType: ticket.ticket_tiers?.name, ticketKind: ticket.ticket_tiers?.ticket_type, ticketPrice: ticket.ticket_tiers?.price, purchasedAt: ticket.created_at, ticketExtraInfo: ticket.ticket_tiers?.extra_info, ticketExpiry: ticket.ticket_tiers?.expires_at, ticketGroupSize: ticket.ticket_tiers?.group_size })
    } else if (notification.eventId && notification.recipientScope === 'attendee') {
      const { data: event, error: eventError } = await supabase
        .from('events')
        .select('*, tags, ticket_tiers(id, event_id, name, price, description, ticket_type, extra_info, expires_at, group_size, quantity, sold, created_at), organizers(id, user_id, name, description, logo_url, website, phone, city, verified, subscription_tier, created_at, profiles!organizers_user_id_fkey(id, full_name, username, profile_image, avatar_url, cover_image, email))')
        .eq('id', notification.eventId)
        .maybeSingle()
      if (eventError) { setLoadError(eventError.message); return }
      if (event) navigate('event-detail', event)
    } else if (notification.recipientScope === 'organizer') navigate('dashboard')
    else if (notification.type === 'team') navigate('agent-dashboard')
    else if (notification.type === 'ticket' || notification.type === 'payment') navigate('my-tickets')
  }

  return (
    <div className="min-h-screen pt-24 pb-16" style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
      <div className="max-w-2xl mx-auto px-4 sm:px-6">

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-black" style={{ fontFamily: 'Outfit, sans-serif' }}>Notifications</h1>
            {unreadCount > 0 && (
              <p className="text-sm mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{unreadCount} unread</p>
            )}
          </div>
          {unreadCount > 0 && (
            <button onClick={markAllRead} className="text-xs font-medium px-3 py-1.5 rounded-full"
              style={{ color: 'var(--accent)', background: 'rgba(249,112,21,0.1)', border: '1px solid rgba(249,112,21,0.22)' }}>
              Mark all read
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1 mb-5" style={{ scrollbarWidth: 'none' }}>
          {TABS.map(({ key, label, Icon }) => (
            <button key={key} onClick={() => setTab(key)}
              className="flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap"
              style={{
                background: tab === key ? 'rgba(249,112,21,0.15)' : 'var(--muted)',
                color: tab === key ? 'var(--accent)' : 'var(--muted-foreground)',
                border: `1px solid ${tab === key ? 'rgba(249,112,21,0.35)' : 'var(--border)'}`,
              }}>
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>

        {/* Notifications list */}
        {loadError && <div className="mb-5 rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', color: '#fca5a5' }}><p>{loadError}</p><button onClick={() => setRetryToken(current => current + 1)} className="mt-3 rounded-lg px-3 py-1.5 text-xs font-bold" style={{ background: 'var(--primary)', color: '#000' }}>Try again</button></div>}
        {filtered.length === 0 ? (
          <div className="text-center py-24">
            <div className="w-16 h-16 mx-auto mb-5 rounded-2xl flex items-center justify-center"
              style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}>
              <BellIcon size={26} style={{ color: 'var(--muted-foreground)' }} />
            </div>
            <p className="font-bold text-xl mb-2">No notifications yet</p>
            <p className="text-sm max-w-xs mx-auto" style={{ color: 'var(--muted-foreground)' }}>
              When there are updates about your tickets, events, or payments, you will see them here.
            </p>
            <button onClick={() => navigate('events')} className="mt-6 px-6 py-3 rounded-xl text-sm font-bold"
              style={{ background: 'var(--primary)', color: '#fff' }}>
              Browse Events
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(n => {
              const Icon = n.type === 'ticket' ? TicketIcon : n.type === 'event' ? CalendarIcon : n.type === 'payment' ? DollarSignIcon : n.type === 'team' || n.type === 'follower' ? UsersIcon : TagIcon
              return (
                <button key={n.id} type="button" onClick={() => void openNotification(n)} className="w-full flex items-start gap-4 p-4 rounded-2xl text-left transition-all"
                  style={{ background: n.read ? 'var(--card)' : 'rgba(249,112,21,0.08)', border: `1px solid ${n.read ? 'var(--border)' : 'rgba(249,112,21,0.22)'}` }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(249,112,21,0.12)', color: 'var(--accent)' }}>
                    <Icon size={17} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm leading-snug">{n.title}</p>
                    <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>{n.body}</p>
                    <p className="text-xs mt-1.5" style={{ color: 'var(--muted-foreground)' }}>{n.time}</p>
                  </div>
                  {!n.read && (
                    <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: 'var(--primary)' }} />
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
