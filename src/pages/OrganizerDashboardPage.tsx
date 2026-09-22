import { useState, useEffect, useCallback } from 'react'
import { signOut, supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { formatPrice } from '../data/events'
import { BarChartIcon, BellIcon, CalendarIcon, ClipboardIcon, UsersIcon, UserIcon, KeyIcon, TagIcon, DollarSignIcon, TicketIcon, TrendingUpIcon, CheckIcon, ArrowLeftIcon, EyeIcon, LinkIcon } from '../components/Icon'
import type { Event, Order, Customer, Transaction, OrganizerMember, OrganizerRole, Subscription, Ticket, AgentAssignment, OrganizerWithdrawal } from '../lib/types'
import { FEATURES } from '../lib/features'

type Section = 'overview' | 'events' | 'orders' | 'customers' | 'followers' | 'members' | 'roles' | 'subscriptions' | 'transactions' | 'refunds' | 'checkin' | 'notifications'
type AnalyticsRange = 'all' | 'day' | 'week' | 'month' | 'year' | 'custom'
type NotificationFilter = 'all' | 'unread' | 'events' | 'sales' | 'followers' | 'team'
type OrganizerNotification = { id: string; type: string; title: string; body: string; created_at: string; read_at: string | null; event_id?: string | null; recipient_scope?: string }
type AgentOrderMeta = { order_id: string; agent_user_id: string; payment_mode: 'digital' | 'cash'; status: string; quantity: number; profiles?: { full_name: string | null; email: string | null } | null }
type AgentCommission = { sale_id: string; amount: number; status: 'pending' | 'available' | 'paid' | 'reversed'; agent_sales?: { order_id: string } | Array<{ order_id: string }> | null }
type RefundRequest = { id: string; order_id: string; ticket_id: string | null; customer_id: string; reason: string; status: 'pending' | 'approved' | 'rejected' | 'processed'; created_at: string; profiles?: { full_name: string | null; email: string | null } | null; events?: { title: string | null } | null }

type Props = { navigate: (p: string, extra?: unknown) => void }

const NAV_ICONS: Record<Section, React.FC<{ size?: number }>> = {
  overview: BarChartIcon,
  events: CalendarIcon,
  orders: ClipboardIcon,
  customers: UsersIcon,
  followers: UsersIcon,
  members: UserIcon,
  roles: KeyIcon,
  subscriptions: TagIcon,
  transactions: DollarSignIcon,
  refunds: DollarSignIcon,
  checkin: TicketIcon,
  notifications: BellIcon,
}

const NAV: { key: Section; label: string }[] = [
  { key: 'overview', label: 'Analytics' },
  { key: 'events', label: 'Events' },
  { key: 'orders', label: 'Orders' },
  { key: 'customers', label: 'Customers' },
  { key: 'followers', label: 'Followers' },
  { key: 'members', label: 'Members' },
  { key: 'roles', label: 'Roles' },
  { key: 'transactions', label: 'Transactions' },
  ...(FEATURES.refunds ? [{ key: 'refunds' as Section, label: 'Refund requests' }] : []),
  { key: 'checkin', label: 'Check-in' },
  { key: 'notifications', label: 'Notifications' },
]

const SECTION_PATHS: Record<Section, string> = {
  overview: '/dashboard/analytics',
  events: '/dashboard/events',
  orders: '/dashboard/orders',
  customers: '/dashboard/customers',
  followers: '/dashboard/followers',
  members: '/dashboard/team',
  roles: '/dashboard/roles',
  subscriptions: '/dashboard/subscriptions',
  transactions: '/dashboard/transactions',
  refunds: '/dashboard/refunds',
  checkin: '/dashboard/check-in',
  notifications: '/dashboard/notifications',
}

function sectionFromPath(pathname: string): Section {
  const slug = pathname.split('/').filter(Boolean)[1]
  const match = Object.entries(SECTION_PATHS).find(([, path]) => path.split('/').pop() === slug)
  return (match?.[0] as Section | undefined) ?? 'overview'
}

const STATUS_COLORS: Record<string, string> = {
  published: '#22c55e', draft: '#F0A500', cancelled: '#ef4444', completed: '#888',
  confirmed: '#22c55e', pending: '#F0A500', refunded: '#ef4444',
  active: '#22c55e', inactive: '#888',
  completed_t: '#22c55e', failed: '#ef4444', pending_t: '#F0A500',
  payment: 'var(--primary)', refund: '#ef4444', payout: 'var(--accent)', fee: '#888',
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold capitalize"
      style={{ background: `${color}18`, color }}>
      {label}
    </span>
  )
}

function StatCard({ Icon, label, value, sub, color = 'var(--foreground)' }: { Icon: React.FC<{ size?: number }>; label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="dashboard-stat-card rounded-2xl p-5" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
      <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-4"
        style={{ background: 'var(--muted)', color: 'var(--muted-foreground)', border: '1px solid var(--border)' }}>
        <Icon size={16} />
      </div>
      <p className="dashboard-stat-value text-2xl font-bold leading-tight mb-0.5" style={{ fontFamily: 'Outfit, sans-serif', color }}>{value}</p>
      <p className="dashboard-stat-label text-xs font-medium" style={{ color: 'var(--muted-foreground)' }}>{label}</p>
      {sub && <p className="dashboard-stat-sub text-xs mt-1" style={{ color: 'var(--accent)' }}>{sub}</p>}
    </div>
  )
}

function RevenueTrendChart({ data }: { data: Array<{ day: string; revenue: number }> }) {
  const width = 640
  const height = 190
  const padding = { top: 18, right: 12, bottom: 30, left: 12 }
  const max = Math.max(...data.map(point => point.revenue), 1)
  const points = data.map((point, index) => {
    const x = padding.left + (index * (width - padding.left - padding.right)) / Math.max(data.length - 1, 1)
    const y = padding.top + (1 - point.revenue / max) * (height - padding.top - padding.bottom)
    return { ...point, x, y }
  })
  const line = points.map(point => `${point.x},${point.y}`).join(' ')
  const area = `${padding.left},${height - padding.bottom} ${line} ${width - padding.right},${height - padding.bottom}`

  return (
    <div className="relative h-48 w-full min-w-[420px]">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full overflow-visible" role="img" aria-label="Revenue trend for the last seven days">
        {[0, 1, 2, 3].map(gridline => {
          const y = padding.top + (gridline / 3) * (height - padding.top - padding.bottom)
          return <line key={gridline} x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="rgba(255,255,255,0.08)" strokeDasharray="3 5" />
        })}
        <polygon points={area} fill="url(#revenue-area)" />
        <polyline points={line} fill="none" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {points.map(point => (
          <g key={point.day}>
            <circle cx={point.x} cy={point.y} r="5" fill="var(--card)" stroke="var(--primary)" strokeWidth="2" />
            <text x={point.x} y={height - 8} textAnchor="middle" fill="var(--muted-foreground)" fontSize="11">{point.day}</text>
          </g>
        ))}
        <defs>
          <linearGradient id="revenue-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--primary)" stopOpacity=".24" />
            <stop offset="1" stopColor="var(--primary)" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  )
}

function EventPerformanceChart({ events, orders, getRevenue }: { events: Event[]; orders: Order[]; getRevenue: (order: Order) => number }) {
  const eventTitles = new Map(events.map(event => [event.id, event.title]))
  const revenueByEvent = new Map<string, number>()
  orders.forEach(order => revenueByEvent.set(order.event_id, (revenueByEvent.get(order.event_id) ?? 0) + getRevenue(order)))
  const data = [...revenueByEvent.entries()].map(([eventId, revenue]) => ({
    title: eventTitles.get(eventId) ?? 'Unknown event',
    revenue,
  })).sort((a, b) => b.revenue - a.revenue).slice(0, 5)
  const max = Math.max(...data.map(event => event.revenue), 1)

  return (
    <div className="space-y-4">
      {data.map(event => (
        <div key={event.title}>
          <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
            <span className="truncate font-medium">{event.title}</span>
            <span className="shrink-0 font-bold" style={{ color: 'var(--primary)' }}>{formatPrice(event.revenue)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full" style={{ background: 'var(--muted)' }}>
            <div className="h-full rounded-full" style={{ width: `${Math.max((event.revenue / max) * 100, event.revenue ? 5 : 0)}%`, background: 'linear-gradient(90deg, var(--primary), var(--accent))' }} />
          </div>
        </div>
      ))}
      {data.length === 0 && <p className="py-8 text-center text-xs" style={{ color: 'var(--muted-foreground)' }}>Publish an event to see performance here</p>}
    </div>
  )
}

export default function OrganizerDashboardPage({ navigate }: Props) {
  const { user, profile, organizer, teamMembership } = useAuth()
  const [section, setSection] = useState<Section>(() => sectionFromPath(window.location.pathname))
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [utilityPopup, setUtilityPopup] = useState<'notifications' | 'calendar' | 'profile' | null>(null)

  // Data
  const [events, setEvents] = useState<Event[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [agentOrderMeta, setAgentOrderMeta] = useState<Record<string, AgentOrderMeta>>({})
  const [agentAssignments, setAgentAssignments] = useState<AgentAssignment[]>([])
  const [agentCommissions, setAgentCommissions] = useState<AgentCommission[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [followers, setFollowers] = useState<Array<{ id: string; user_id: string; created_at: string; profiles?: { full_name: string | null; username: string | null; avatar_url: string | null } | null }>>([])
  const [members, setMembers] = useState<OrganizerMember[]>([])
  const [roles, setRoles] = useState<OrganizerRole[]>([])
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [withdrawals, setWithdrawals] = useState<OrganizerWithdrawal[]>([])
  const [refundRequests, setRefundRequests] = useState<RefundRequest[]>([])
  const [checkinTickets, setCheckinTickets] = useState<Ticket[]>([])
  const [organizerNotifications, setOrganizerNotifications] = useState<OrganizerNotification[]>([])
  const [dataLoading, setDataLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [analyticsRange, setAnalyticsRange] = useState<AnalyticsRange>('all')
  const [analyticsStart, setAnalyticsStart] = useState('')
  const [analyticsEnd, setAnalyticsEnd] = useState('')
  const [analyticsDayInterval, setAnalyticsDayInterval] = useState(2)
  const [analyticsMonthInterval, setAnalyticsMonthInterval] = useState(1)
  const [notificationFilter, setNotificationFilter] = useState<NotificationFilter>('all')

  // Modals
  const [showNewEvent, setShowNewEvent] = useState(false)
  const [editingEvent, setEditingEvent] = useState<Event | null>(null)
  const [editingRole, setEditingRole] = useState<OrganizerRole | null>(null)
  const [showInviteMember, setShowInviteMember] = useState(false)
  const [showInviteAgent, setShowInviteAgent] = useState(false)
  const [showNewRole, setShowNewRole] = useState(false)
  const [actionError, setActionError] = useState('')
  const [dashboardLoadError, setDashboardLoadError] = useState(false)
  const [verificationStatus, setVerificationStatus] = useState<'unverified' | 'pending' | 'verified'>(organizer?.verification_status ?? (organizer?.verified ? 'verified' : 'unverified'))
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [editingAgentAssignment, setEditingAgentAssignment] = useState<AgentAssignment | null>(null)
  const [showWithdrawal, setShowWithdrawal] = useState(false)
  const [withdrawalForm, setWithdrawalForm] = useState({ amount: '', paymentMethod: 'mobile_money' as 'mobile_money' | 'bank', paymentReference: '' })
  const [withdrawalSaving, setWithdrawalSaving] = useState(false)

  const orgId = organizer?.id
  const isOwner = !!organizer && organizer.user_id === profile?.id
  const membershipPermissions = (teamMembership?.organizer_roles?.permissions ?? {}) as Record<string, boolean>
  const canAccessSection = (key: Section) => isOwner || membershipPermissions.all === true || membershipPermissions[key] === true || (key === 'overview' && membershipPermissions.analytics === true) || (key === 'checkin' && membershipPermissions.checkin === true)
  const canUseCalendar = isOwner || membershipPermissions.all === true || membershipPermissions.calendar === true
  const canViewEvents = isOwner || membershipPermissions.all === true || membershipPermissions.events === true
  const canCheckIn = isOwner || membershipPermissions.all === true || membershipPermissions.checkin === true
  const visibleNav = NAV.filter(item => canAccessSection(item.key))

  useEffect(() => {
    const handlePathChange = () => setSection(sectionFromPath(window.location.pathname))
    window.addEventListener('popstate', handlePathChange)
    return () => window.removeEventListener('popstate', handlePathChange)
  }, [])

  const selectSection = (nextSection: Section) => {
    if (!canAccessSection(nextSection)) return
    setSection(nextSection)
    setSidebarOpen(false)
    const nextPath = SECTION_PATHS[nextSection]
    if (window.location.pathname !== nextPath) window.history.pushState({}, '', nextPath)
  }

  useEffect(() => {
    if (visibleNav.length && !canAccessSection(section)) selectSection(visibleNav[0].key)
  }, [section, visibleNav.length, teamMembership?.id])

  useEffect(() => {
    const nextStatus = organizer?.verification_status ?? (organizer?.verified ? 'verified' : 'unverified')
    setVerificationStatus(nextStatus)
  }, [organizer?.id, organizer?.verification_status, organizer?.verified])

  useEffect(() => {
    if (!orgId) return
    const channel = supabase.channel(`organizer-verification:${orgId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'organizers', filter: `id=eq.${orgId}` }, payload => {
        const next = payload.new as { verification_status?: 'unverified' | 'pending' | 'verified'; verified?: boolean }
        setVerificationStatus(next.verification_status ?? (next.verified ? 'verified' : 'unverified'))
      })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [orgId])

  useEffect(() => {
    if (!orgId || !user?.id) return
    const loadOrganizerNotifications = async () => {
      const { data } = await supabase
        .from('notifications')
        .select('id, type, title, body, created_at, read_at, event_id, recipient_scope')
        .eq('user_id', user.id)
        .eq('recipient_scope', 'organizer')
        .order('created_at', { ascending: false })
        .limit(50)
      setOrganizerNotifications((data ?? []) as OrganizerNotification[])
    }
    void loadOrganizerNotifications()
    const channel = supabase.channel(`organizer-notifications:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, () => { void loadOrganizerNotifications() })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [orgId, user?.id])

  const openOrganizerNotification = async (notification: OrganizerNotification) => {
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', notification.id)
    setOrganizerNotifications(current => current.map(item => item.id === notification.id ? { ...item, read_at: new Date().toISOString() } : item))
    setUtilityPopup(null)
    const title = notification.title.toLowerCase()
    if (title.includes('member') || title.includes('role') || title.includes('permission') || title.includes('invite')) selectSection('members')
    else if (title.includes('order') || title.includes('ticket') || title.includes('inventory') || title.includes('sold out')) selectSection('events')
    else if (title.includes('transaction') || title.includes('payment')) selectSection('transactions')
    else if (title.includes('follower')) selectSection('followers')
    else if (title.includes('event')) selectSection('events')
    else selectSection('notifications')
  }

  const markAllOrganizerNotificationsRead = async () => {
    if (!user?.id) return
    const readAt = new Date().toISOString()
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: readAt })
      .eq('user_id', user.id)
      .eq('recipient_scope', 'organizer')
      .is('read_at', null)
    if (error) { setActionError(error.message); return }
    setOrganizerNotifications(current => current.map(notification => ({ ...notification, read_at: notification.read_at ?? readAt })))
  }

  const requestVerification = async () => {
    if (!orgId || verificationStatus !== 'unverified') return
    const { error } = await supabase.from('organizers').update({ verification_status: 'pending', verification_requested_at: new Date().toISOString() }).eq('id', orgId)
    if (error) setActionError(error.message)
    else setVerificationStatus('pending')
  }

  const requestWithdrawal = async () => {
    const amount = Number(withdrawalForm.amount)
    const paymentReference = withdrawalForm.paymentReference.trim()
    if (!isOwner) { setActionError('Only the organizer owner can request a withdrawal.'); return }
    if (!Number.isInteger(amount) || amount <= 0) { setActionError('Enter a whole withdrawal amount greater than zero.'); return }
    if (amount > availableWithdrawalBalance) { setActionError(`The amount exceeds your available balance of ${formatPrice(availableWithdrawalBalance)}.`); return }
    if (!paymentReference) { setActionError('Enter the receiving phone number or bank account reference.'); return }

    setWithdrawalSaving(true)
    setActionError('')
    const { error } = await supabase.rpc('request_organizer_withdrawal', {
      p_amount: amount,
      p_payment_method: withdrawalForm.paymentMethod,
      p_payment_reference: paymentReference,
    })
    setWithdrawalSaving(false)
    if (error) { setActionError(error.message); return }
    setShowWithdrawal(false)
    setWithdrawalForm({ amount: '', paymentMethod: 'mobile_money', paymentReference: '' })
    void load()
  }

  const cancelWithdrawal = async (withdrawalId: string) => {
    const { error } = await supabase.rpc('cancel_organizer_withdrawal', { p_withdrawal_id: withdrawalId })
    if (error) { setActionError(error.message); return }
    void load()
  }

  const load = useCallback(async () => {
    if (!orgId) return
    setDataLoading(true)
    setDashboardLoadError(false)
    const [ev, ord, cust, mem, rol, sub, txn, withdrawalRows, tickets, agentSales, assignments, refunds, commissions] = await Promise.all([
      supabase.from('events').select('*, tags, ticket_tiers(id, event_id, name, price, description, ticket_type, extra_info, expires_at, group_size, quantity, sold, created_at)').eq('organizer_id', orgId).order('created_at', { ascending: false }),
      supabase.from('orders').select('*, events(title), profiles(full_name, email)').eq('organizer_id', orgId).order('created_at', { ascending: false }),
      supabase.from('customers').select('*').eq('organizer_id', orgId).order('total_spent', { ascending: false }),
      supabase.from('organizer_members').select('*, profiles(full_name, email, username, profile_image, avatar_url), organizer_roles(name)').eq('organizer_id', orgId),
      supabase.from('organizer_roles').select('*').eq('organizer_id', orgId),
      supabase.from('subscriptions').select('*').eq('organizer_id', orgId).order('created_at', { ascending: false }),
      supabase.from('transactions').select('*, orders(id)').eq('organizer_id', orgId).order('created_at', { ascending: false }),
      supabase.from('organizer_withdrawals').select('*').eq('organizer_id', orgId).order('requested_at', { ascending: false }),
      supabase.from('tickets').select('*, events(id, title, organizer_id)').eq('events.organizer_id', orgId).order('checked_in_at', { ascending: false }),
      supabase.from('agent_sales').select('order_id, agent_user_id, payment_mode, status, quantity, profiles(full_name, email)').eq('organizer_id', orgId).order('created_at', { ascending: false }),
      supabase.from('agent_assignments').select('*, events(*, ticket_tiers(*)), profiles(full_name, email)').eq('organizer_id', orgId).order('created_at', { ascending: false }),
      supabase.from('refund_requests').select('*, profiles!customer_id(full_name, email), events(title)').eq('organizer_id', orgId).order('created_at', { ascending: false }),
      supabase.from('commissions').select('sale_id, amount, status, agent_sales!inner(order_id)').eq('organizer_id', orgId),
    ])
    const failedQueries = [
      ['events', ev.error], ['orders', ord.error], ['customers', cust.error], ['team', mem.error], ['roles', rol.error],
      ['subscriptions', sub.error], ['transactions', txn.error], ['withdrawals', withdrawalRows.error], ['tickets', tickets.error], ['agent sales', agentSales.error],
      ['assignments', assignments.error], ['refunds', refunds.error], ['commissions', commissions.error],
    ].filter(([, error]) => error).map(([name, error]) => `${name}: ${(error as { message: string }).message}`)
    if (failedQueries.length) {
      setDashboardLoadError(true)
      setActionError(`Some dashboard data could not be loaded. ${failedQueries.join(' | ')}`)
    }
    const loadedOrders = (ord.data ?? []) as Order[]
    const orderItemsResult = loadedOrders.length
      ? await supabase.from('order_items').select('id, order_id, ticket_tier_id, quantity, unit_price, total_price').in('order_id', loadedOrders.map(order => order.id))
      : { data: [], error: null }
    const itemsByOrder = new Map<string, NonNullable<Order['order_items']>>()
    ;(orderItemsResult.data ?? []).forEach(item => {
      const items = itemsByOrder.get(item.order_id) ?? []
      items.push(item)
      itemsByOrder.set(item.order_id, items)
    })
    setEvents(ev.data ?? [])
    setOrders(loadedOrders.map(order => ({ ...order, order_items: itemsByOrder.get(order.id) ?? [] })))
    setAgentOrderMeta(Object.fromEntries(((agentSales.data ?? []) as unknown as AgentOrderMeta[]).map(item => [item.order_id, item])))
    setAgentAssignments((assignments.data ?? []) as AgentAssignment[])
    setAgentCommissions((commissions.data ?? []) as AgentCommission[])
    setCustomers(cust.data ?? [])
    setMembers(mem.data ?? [])
    setRoles(rol.data ?? [])
    setSubscriptions(sub.data ?? [])
    setTransactions(txn.data ?? [])
    setWithdrawals((withdrawalRows.data ?? []) as OrganizerWithdrawal[])
    setRefundRequests((refunds.data ?? []) as RefundRequest[])
    setCheckinTickets((tickets.data ?? []) as Ticket[])
    setLastUpdated(new Date())
    setDataLoading(false)
  }, [orgId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!orgId) return
    const channel = supabase.channel(`dashboard-events:${orgId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events', filter: `organizer_id=eq.${orgId}` }, () => { void load() })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [orgId, load])

  useEffect(() => {
    if (!orgId) return
    const channel = supabase.channel(`organizer-dashboard:${orgId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `organizer_id=eq.${orgId}` }, () => { void load() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_sales', filter: `organizer_id=eq.${orgId}` }, () => { void load() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_assignments', filter: `organizer_id=eq.${orgId}` }, () => { void load() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: `organizer_id=eq.${orgId}` }, () => { void load() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'organizer_withdrawals', filter: `organizer_id=eq.${orgId}` }, () => { void load() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'refund_requests', filter: `organizer_id=eq.${orgId}` }, () => { void load() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers', filter: `organizer_id=eq.${orgId}` }, () => { void load() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'organizer_roles', filter: `organizer_id=eq.${orgId}` }, () => { void load() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'organizer_members', filter: `organizer_id=eq.${orgId}` }, () => { void load() })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [orgId, load])

  useEffect(() => {
    if (!orgId) return
    const loadFollowers = async () => {
      const { data } = await supabase
        .from('organizer_followers')
        .select('id, user_id, created_at')
        .eq('organizer_id', orgId)
        .order('created_at', { ascending: false })
      const rows = data ?? []
      const { data: profiles } = rows.length
        ? await supabase.from('profiles').select('id, full_name, username, avatar_url').in('id', rows.map(row => row.user_id))
        : { data: [] }
      const profileById = new Map((profiles ?? []).map(profile => [profile.id, profile]))
      setFollowers(rows.map(row => ({ ...row, profiles: profileById.get(row.user_id) ?? null })) as typeof followers)
    }
    void loadFollowers()
    const channel = supabase.channel(`dashboard-followers:${orgId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'organizer_followers', filter: `organizer_id=eq.${orgId}` }, () => { void loadFollowers() })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [orgId])

  const localDateStart = (value: string) => {
    const [year, month, day] = value.split('-').map(Number)
    return new Date(year, month - 1, day, 0, 0, 0, 0)
  }
  const rangeEnd = new Date()
  const rangeStart = new Date(rangeEnd)
  if (analyticsRange === 'all') {
    const firstOrderDate = orders.reduce((earliest, order) => {
      const createdAt = new Date(order.created_at)
      return Number.isFinite(createdAt.getTime()) && createdAt < earliest ? createdAt : earliest
    }, new Date(rangeEnd))
    rangeStart.setTime(firstOrderDate.getTime())
    rangeStart.setHours(0, 0, 0, 0)
    rangeEnd.setHours(23, 59, 59, 999)
  } else if (analyticsRange === 'day') {
    rangeStart.setHours(0, 0, 0, 0)
    rangeEnd.setHours(23, 59, 59, 999)
  } else if (analyticsRange === 'week') {
    const daysFromMonday = (rangeEnd.getDay() + 6) % 7
    rangeStart.setDate(rangeEnd.getDate() - daysFromMonday)
    rangeStart.setHours(0, 0, 0, 0)
    rangeEnd.setDate(rangeStart.getDate() + 6)
    rangeEnd.setHours(23, 59, 59, 999)
  } else if (analyticsRange === 'month') {
    rangeStart.setDate(1)
    rangeStart.setHours(0, 0, 0, 0)
    rangeEnd.setMonth(rangeEnd.getMonth() + 1, 0)
    rangeEnd.setHours(23, 59, 59, 999)
  } else if (analyticsRange === 'year') {
    rangeStart.setMonth(0, 1)
    rangeStart.setHours(0, 0, 0, 0)
    rangeEnd.setMonth(11, 31)
    rangeEnd.setHours(23, 59, 59, 999)
  }
  if (analyticsRange === 'custom') {
    if (analyticsStart) rangeStart.setTime(localDateStart(analyticsStart).getTime())
    if (analyticsEnd) {
      const selectedEnd = localDateStart(analyticsEnd)
      selectedEnd.setHours(23, 59, 59, 999)
      rangeEnd.setTime(selectedEnd.getTime())
    } else if (analyticsStart) {
      rangeEnd.setTime(rangeStart.getTime())
      rangeEnd.setHours(23, 59, 59, 999)
    }
    if (rangeStart > rangeEnd) {
      const selectedStart = new Date(rangeStart)
      rangeStart.setTime(rangeEnd.getTime())
      rangeEnd.setTime(selectedStart.getTime())
    }
  }
  const analyticsRangeLabel = analyticsRange === 'custom'
    ? analyticsStart || analyticsEnd
      ? `${analyticsStart || analyticsEnd} to ${analyticsEnd || analyticsStart}`
      : 'Select dates'
    : analyticsRange === 'all' ? 'All time' : analyticsRange.charAt(0).toUpperCase() + analyticsRange.slice(1)
  const filteredOrders = orders.filter(order => {
    const createdAt = new Date(order.created_at)
    return createdAt >= rangeStart && createdAt <= rangeEnd
  })

  // Customers pay the ticket value. Platform fees, processed ticket refunds,
  // and non-reversed agent commissions are deducted from organizer proceeds.
  const ticketsById = new Map(checkinTickets.map(ticket => [ticket.id, ticket]))
  const ordersById = new Map(orders.map(order => [order.id, order]))
  const processedRefunds = refundRequests.filter(request => request.status === 'processed')
  const refundAmountByOrder = new Map<string, number>()
  processedRefunds.forEach(request => {
    const ticket = request.ticket_id ? ticketsById.get(request.ticket_id) : undefined
    const order = ordersById.get(request.order_id)
    const item = ticket ? order?.order_items?.find(orderItem => orderItem.ticket_tier_id === ticket.ticket_tier_id) : undefined
    const refundAmount = Number(item?.unit_price) || 0
    refundAmountByOrder.set(request.order_id, (refundAmountByOrder.get(request.order_id) ?? 0) + refundAmount)
  })
  const commissionAmountByOrder = new Map<string, number>()
  agentCommissions.filter(commission => ['pending', 'available', 'paid'].includes(commission.status)).forEach(commission => {
    const sale = Array.isArray(commission.agent_sales) ? commission.agent_sales[0] : commission.agent_sales
    if (sale?.order_id) commissionAmountByOrder.set(sale.order_id, (commissionAmountByOrder.get(sale.order_id) ?? 0) + (Number(commission.amount) || 0))
  })
  const ticketSalesForOrder = (order: Order) => Number(order.subtotal) || order.order_items?.reduce((sum, item) => sum + (Number(item.total_price) || 0), 0) || 0
  const platformFeeForOrder = (order: Order) => Math.max(0, Number(order.service_fee) || 0)
  const netTicketRevenueForOrder = (order: Order) => Math.max(0, ticketSalesForOrder(order) - platformFeeForOrder(order) - (refundAmountByOrder.get(order.id) ?? 0) - (commissionAmountByOrder.get(order.id) ?? 0))
  const confirmedOrders = filteredOrders.filter(order => order.status === 'confirmed')
  const netRevenueOrders = confirmedOrders.filter(order => netTicketRevenueForOrder(order) > 0)
  const totalRevenue = netRevenueOrders.reduce((sum, order) => sum + netTicketRevenueForOrder(order), 0)
  const totalPlatformFees = confirmedOrders.reduce((sum, order) => sum + platformFeeForOrder(order), 0)
  // The withdrawal balance deliberately uses the ledger instead of the order
  // table. This makes completed fees, refunds, and paid/held withdrawals part
  // of the same calculation that is enforced by request_organizer_withdrawal.
  const completedCustomerPayments = transactions.filter(transaction => transaction.type === 'payment' && transaction.status === 'completed').reduce((sum, transaction) => sum + (Number(transaction.amount) || 0), 0)
  const completedPlatformFees = transactions.filter(transaction => transaction.type === 'fee' && transaction.status === 'completed').reduce((sum, transaction) => sum + (Number(transaction.amount) || 0), 0)
  const completedRefunds = transactions.filter(transaction => transaction.type === 'refund' && transaction.status === 'completed').reduce((sum, transaction) => sum + (Number(transaction.amount) || 0), 0)
  const outstandingAgentCommissions = agentCommissions.filter(commission => ['pending', 'available', 'paid'].includes(commission.status)).reduce((sum, commission) => sum + (Number(commission.amount) || 0), 0)
  const lifetimeNetRevenue = Math.max(0, completedCustomerPayments - completedPlatformFees - completedRefunds - outstandingAgentCommissions)
  const withdrawnAmount = transactions.filter(transaction => transaction.type === 'payout' && transaction.status === 'completed').reduce((sum, transaction) => sum + (Number(transaction.amount) || 0), 0)
  const reservedWithdrawalAmount = transactions.filter(transaction => transaction.type === 'payout' && transaction.status === 'pending').reduce((sum, transaction) => sum + (Number(transaction.amount) || 0), 0)
  const availableWithdrawalBalance = Math.max(0, lifetimeNetRevenue - withdrawnAmount - reservedWithdrawalAmount)
  const refundedTicketCount = new Set(processedRefunds
    .filter(request => confirmedOrders.some(order => order.id === request.order_id))
    .map(request => request.ticket_id)
    .filter((ticketId): ticketId is string => Boolean(ticketId))).size
  const totalTicketsSold = Math.max(0, confirmedOrders.reduce((total, order) => total + (order.order_items?.reduce((sum, item) => sum + item.quantity, 0) ?? 0), 0) - refundedTicketCount)
  const publishedEvents = events.filter(e => e.status === 'published').length
  const avgOrderValue = netRevenueOrders.length ? Math.round(totalRevenue / netRevenueOrders.length) : 0
  const eventAnalytics = new Map<string, { tickets: number; revenue: number }>()
  netRevenueOrders.forEach(order => {
    const current = eventAnalytics.get(order.event_id) ?? { tickets: 0, revenue: 0 }
    current.tickets += order.order_items?.reduce((sum, item) => sum + item.quantity, 0) ?? 0
    current.revenue += netTicketRevenueForOrder(order)
    eventAnalytics.set(order.event_id, current)
  })

  const chartData = (() => {
    if (analyticsRange === 'day') {
      const bucketSizeMs = analyticsDayInterval * 60 * 60 * 1000
      const buckets: Array<{ day: string; revenue: number; count: number }> = []
      const bucketStart = new Date(rangeStart)
      const bucketEndLimit = new Date(rangeEnd.getTime() + 1)

      for (let bucketFrom = new Date(bucketStart); bucketFrom < bucketEndLimit; bucketFrom = new Date(bucketFrom.getTime() + bucketSizeMs)) {
        const bucketTo = new Date(Math.min(bucketFrom.getTime() + bucketSizeMs, bucketEndLimit.getTime()))
        const bucketOrders = filteredOrders.filter(order => {
          const time = new Date(order.created_at)
          return time >= bucketFrom && time < bucketTo
        })
        buckets.push({
          day: `${bucketFrom.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} - ${bucketTo.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`,
          revenue: bucketOrders.filter(order => netRevenueOrders.includes(order)).reduce((sum, order) => sum + netTicketRevenueForOrder(order), 0),
          count: bucketOrders.filter(order => netRevenueOrders.includes(order)).length,
        })
      }
      return buckets
    }

    if (analyticsRange === 'month') {
      const bucketSizeMs = analyticsMonthInterval * 7 * 24 * 60 * 60 * 1000
      const bucketCount = Math.max(1, Math.ceil((rangeEnd.getTime() - rangeStart.getTime() + 1) / bucketSizeMs))
      return Array.from({ length: bucketCount }, (_, index) => {
        const bucketFrom = new Date(rangeStart.getTime() + (index * bucketSizeMs))
        const bucketTo = new Date(Math.min(bucketFrom.getTime() + bucketSizeMs, rangeEnd.getTime() + 1))
        const bucketOrders = filteredOrders.filter(order => {
          const time = new Date(order.created_at)
          return time >= bucketFrom && time < bucketTo
        })
        return {
          day: `${bucketFrom.toLocaleDateString('en', { month: 'short', day: 'numeric' })} - ${new Date(bucketTo.getTime() - 1).toLocaleDateString('en', { month: 'short', day: 'numeric' })}`,
          revenue: bucketOrders.filter(order => netRevenueOrders.includes(order)).reduce((sum, order) => sum + netTicketRevenueForOrder(order), 0),
          count: bucketOrders.filter(order => netRevenueOrders.includes(order)).length,
        }
      })
    }

    if (analyticsRange === 'custom') {
      const dayCount = Math.max(1, Math.ceil((rangeEnd.getTime() - rangeStart.getTime() + 1) / (24 * 60 * 60 * 1000)))
      if (dayCount <= 7) {
        return Array.from({ length: dayCount }, (_, index) => {
          const bucketFrom = new Date(rangeStart)
          bucketFrom.setDate(rangeStart.getDate() + index)
          const bucketTo = new Date(bucketFrom)
          bucketTo.setDate(bucketFrom.getDate() + 1)
          const bucketOrders = filteredOrders.filter(order => {
            const time = new Date(order.created_at)
            return time >= bucketFrom && time < bucketTo
          })
          return {
            day: bucketFrom.toLocaleDateString('en', { weekday: 'short' }),
            revenue: bucketOrders.filter(order => netRevenueOrders.includes(order)).reduce((sum, order) => sum + netTicketRevenueForOrder(order), 0),
            count: bucketOrders.filter(order => netRevenueOrders.includes(order)).length,
          }
        })
      }

      if (dayCount <= 62) {
        const weekStart = new Date(rangeStart)
        weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7))
        const weekCount = Math.max(1, Math.ceil((rangeEnd.getTime() - weekStart.getTime() + 1) / (7 * 24 * 60 * 60 * 1000)))
        return Array.from({ length: weekCount }, (_, index) => {
          const bucketFrom = new Date(weekStart)
          bucketFrom.setDate(weekStart.getDate() + index * 7)
          const bucketTo = new Date(bucketFrom)
          bucketTo.setDate(bucketFrom.getDate() + 7)
          const bucketOrders = filteredOrders.filter(order => {
            const time = new Date(order.created_at)
            return time >= bucketFrom && time < bucketTo
          })
          return {
            day: `Week ${index + 1}`,
            revenue: bucketOrders.filter(order => netRevenueOrders.includes(order)).reduce((sum, order) => sum + netTicketRevenueForOrder(order), 0),
            count: bucketOrders.filter(order => netRevenueOrders.includes(order)).length,
          }
        })
      }

      const monthCount = Math.max(1, Math.ceil((rangeEnd.getFullYear() - rangeStart.getFullYear()) * 12 + rangeEnd.getMonth() - rangeStart.getMonth() + 1))
      return Array.from({ length: monthCount }, (_, index) => {
        const bucketFrom = new Date(rangeStart.getFullYear(), rangeStart.getMonth() + index, 1)
        const bucketTo = new Date(bucketFrom.getFullYear(), bucketFrom.getMonth() + 1, 1)
        const bucketOrders = filteredOrders.filter(order => {
          const time = new Date(order.created_at)
          return time >= bucketFrom && time < bucketTo
        })
        return {
          day: bucketFrom.toLocaleDateString('en', { month: 'short', year: 'numeric' }),
          revenue: bucketOrders.filter(order => netRevenueOrders.includes(order)).reduce((sum, order) => sum + netTicketRevenueForOrder(order), 0),
          count: bucketOrders.filter(order => netRevenueOrders.includes(order)).length,
        }
      })
    }

    const bucketCount = analyticsRange === 'week' ? 7 : 12
    return Array.from({ length: bucketCount }, (_, index) => {
      const bucket = new Date(rangeStart)
      if (analyticsRange === 'week') bucket.setDate(rangeStart.getDate() + index)
      else bucket.setMonth(rangeStart.getMonth() + index)
      const nextBucket = new Date(bucket)
      if (analyticsRange === 'week') nextBucket.setDate(bucket.getDate() + 1)
      else nextBucket.setMonth(bucket.getMonth() + 1)
      const bucketOrders = filteredOrders.filter(order => { const time = new Date(order.created_at); return time >= bucket && time < nextBucket })
      return {
        day: analyticsRange === 'week' ? bucket.toLocaleDateString('en', { weekday: 'long' }) : bucket.toLocaleDateString('en', { month: 'long' }),
        revenue: bucketOrders.filter(order => netRevenueOrders.includes(order)).reduce((sum, order) => sum + netTicketRevenueForOrder(order), 0),
        count: bucketOrders.filter(order => netRevenueOrders.includes(order)).length,
      }
    })
  })()
  const maxRevenue = Math.max(...chartData.map(d => d.revenue), 1)
  const maxOrders = Math.max(...chartData.map(d => d.count), 1)

  const toggleEventStatus = async (ev: Event) => {
    const newStatus = ev.status === 'published' ? 'draft' : 'published'
    const { error } = await supabase.from('events').update({ status: newStatus }).eq('id', ev.id)
    if (error) { setActionError(error.message); return }
    setEvents(prev => prev.map(e => e.id === ev.id ? { ...e, status: newStatus } : e))
  }

  const deleteEvent = async (id: string) => {
    if (!confirm('Delete this event?')) return
    const { error } = await supabase.from('events').delete().eq('id', id)
    if (error) { setActionError(error.message); return }
    setEvents(prev => prev.filter(e => e.id !== id))
  }

  const deleteRole = async (id: string) => {
    const role = roles.find(item => item.id === id)
    if (role?.name.trim().toLowerCase() === 'admin') { setActionError('The Admin role cannot be deleted.'); return }
    if (!confirm('Delete this role?')) return
    const { error } = await supabase.from('organizer_roles').delete().eq('id', id)
    if (error) { setActionError(error.message); return }
    setRoles(prev => prev.filter(r => r.id !== id))
  }

  const removeFollower = async (id: string) => {
    if (!confirm('Remove this follower?')) return
    const { error } = await supabase.from('organizer_followers').delete().eq('id', id)
    if (error) { setActionError(error.message); return }
    setFollowers(prev => prev.filter(follower => follower.id !== id))
  }

  const handleSignOut = async () => {
    await signOut()
    navigate('home')
  }

  const deleteMember = async (id: string) => {
    if (!confirm('Remove this team member?')) return
    const { error } = await supabase.from('organizer_members').delete().eq('id', id)
    if (error) { setActionError(error.message); return }
    setMembers(prev => prev.filter(member => member.id !== id))
  }

  const updateMemberRole = async (memberId: string, roleId: string) => {
    const { error } = await supabase.from('organizer_members').update({ role_id: roleId || null }).eq('id', memberId)
    if (error) { setActionError(error.message); return }
    setMembers(prev => prev.map(member => member.id === memberId ? { ...member, role_id: roleId || null, organizer_roles: roles.find(role => role.id === roleId) } : member))
  }

  const updateMemberStatus = async (memberId: string, status: 'active' | 'inactive') => {
    const member = members.find(item => item.id === memberId)
    if (!member) { setActionError('This team member is no longer available.'); return }
    if (status === 'inactive' && member.status === 'active' && !confirm('Deactivate this team member? They will lose access immediately.')) return
    if (status === 'active' && member.status === 'pending' && !confirm('Activate this pending team invitation?')) return
    const { error } = await supabase.from('organizer_members').update({ status }).eq('id', memberId)
    if (error) { setActionError(error.message); return }
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, status } : m))
  }

  const acceptMembership = async () => {
    if (!teamMembership || teamMembership.status !== 'pending') return
    const { error } = await supabase.from('organizer_members').update({ status: 'active' }).eq('id', teamMembership.id)
    if (error) { setActionError(error.message); return }
    window.location.reload()
  }

  const changeSubscription = async (tier: Subscription['tier'], price: number) => {
    setActionError('')
    const current = subscriptions[0]
    const result = current
      ? await supabase.from('subscriptions').update({ tier, price, status: 'active' }).eq('id', current.id).select().single()
      : await supabase.from('subscriptions').insert({ organizer_id: orgId, tier, price, status: 'active' }).select().single()
    if (result.error) { setActionError(result.error.message); return }
    await load()
  }

  const confirmAgentOrder = async (order: Order) => {
    setActionError('')
    const { error } = await supabase.rpc('confirm_agent_cash_sale', { p_order_id: order.id })
    if (error) { setActionError(error.message); return }
    setSelectedOrder(null)
    await load()
  }

  const reviewRefundRequest = async (request: RefundRequest, status: 'approved' | 'rejected') => {
    const note = window.prompt(status === 'approved' ? 'Optional note for the customer' : 'Reason for declining this request') ?? ''
    if (status === 'rejected' && !note.trim()) return
    setActionError('')
    const { error } = await supabase.rpc('review_ticket_refund', { p_request_id: request.id, p_status: status, p_note: note.trim() || null })
    if (error) { setActionError(error.message); return }
    setRefundRequests(current => current.map(item => item.id === request.id ? { ...item, status } : item))
  }

  if (!organizer) {
    return (
      <div className="flex items-center justify-center min-h-screen flex-col gap-4 pt-16" style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
        <p className="text-2xl font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>No organizer account found</p>
        <p style={{ color: 'var(--muted-foreground)' }}>Sign in as an organizer to access the dashboard.</p>
        <button onClick={() => navigate('auth-organizer')} className="px-6 py-3 rounded-xl font-bold" style={{ background: 'var(--primary)', color: '#000' }}>
          Sign in as Organizer
        </button>
      </div>
    )
  }

  if (teamMembership && !isOwner && teamMembership.status === 'pending') {
    return (
      <div className="flex min-h-screen items-center justify-center p-6" style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
        <div className="w-full max-w-md rounded-2xl border p-6 text-center" style={{ background: '#1a1d1d', borderColor: 'var(--border)' }}>
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--muted-foreground)' }}>Team invitation</p>
          <h1 className="mt-2 text-2xl font-black">Join {organizer.name}</h1>
          <p className="mt-3 text-sm" style={{ color: 'var(--muted-foreground)' }}>Accept this invitation to access the organizer workspace.</p>
          <button onClick={acceptMembership} className="mt-6 rounded-xl px-5 py-3 text-sm font-bold" style={{ background: 'var(--primary)', color: '#000' }}>Accept invitation</button>
        </div>
      </div>
    )
  }

  if (teamMembership && !isOwner && visibleNav.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6" style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
        <div className="w-full max-w-md rounded-2xl border p-6 text-center" style={{ background: '#1a1d1d', borderColor: 'var(--border)' }}>
          <h1 className="text-2xl font-black">No dashboard permissions</h1>
          <p className="mt-3 text-sm" style={{ color: 'var(--muted-foreground)' }}>Ask the organizer owner to assign you a role with dashboard access.</p>
        </div>
      </div>
    )
  }

  const unreadOrganizerNotifications = organizerNotifications.filter(notification => !notification.read_at)
  const filteredOrganizerNotifications = organizerNotifications.filter(notification => {
    if (notificationFilter === 'unread') return !notification.read_at
    if (notificationFilter === 'events') return notification.type === 'event' || !!notification.event_id
    if (notificationFilter === 'sales') return notification.type === 'payment' || notification.title.toLowerCase().includes('order') || notification.title.toLowerCase().includes('ticket')
    if (notificationFilter === 'followers') return notification.type === 'follower'
    if (notificationFilter === 'team') return notification.type === 'team' || notification.title.toLowerCase().includes('member') || notification.title.toLowerCase().includes('role')
    return true
  })

  return (
    <div className="organizer-dashboard-shell flex min-h-screen" style={{ background: 'linear-gradient(135deg, #0b0c0c 0%, #11100e 48%, #0b0c0c 100%)', color: 'var(--foreground)' }}>
      {selectedOrder && (() => {
        const agentSale = agentOrderMeta[selectedOrder.id]
        const customerName = (selectedOrder as any).holder_name ?? (selectedOrder as any).profiles?.full_name ?? 'Customer'
        const customerEmail = (selectedOrder as any).holder_email ?? (selectedOrder as any).profiles?.email ?? 'No email'
        const isAwaitingAgentCash = selectedOrder.status === 'pending' && agentSale?.payment_mode === 'cash' && agentSale.status === 'awaiting_payment'
        return (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4" onClick={() => setSelectedOrder(null)}>
            <div className="w-full max-w-lg rounded-2xl border p-5 shadow-2xl" style={{ background: '#171918', borderColor: 'var(--border)' }} onClick={event => event.stopPropagation()}>
              <div className="flex items-start justify-between gap-4 border-b pb-4" style={{ borderColor: 'var(--border)' }}>
                <div><p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--primary)' }}>Order details</p><h2 className="mt-1 text-xl font-black">{selectedOrder.id.slice(0, 8)}…</h2></div>
                <button onClick={() => setSelectedOrder(null)} className="text-xl" style={{ color: 'var(--muted-foreground)' }}>×</button>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Customer</p><p className="mt-1 font-bold">{customerName}</p><p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{customerEmail}</p></div>
                <div><p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Event</p><p className="mt-1 font-bold">{(selectedOrder as any).events?.title ?? 'Event'}</p></div>
                <div><p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Source</p><p className="mt-1 font-bold">{agentSale ? `Agent · ${agentSale.profiles?.full_name ?? 'Sales agent'}` : 'Customer checkout'}</p></div>
                <div><p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Payment</p><p className="mt-1 font-bold capitalize">{agentSale?.payment_mode ?? selectedOrder.payment_method?.replace('_', ' ') ?? 'Pending'}</p></div>
                <div><p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Customer paid</p><p className="mt-1 font-bold" style={{ color: 'var(--primary)' }}>{formatPrice(selectedOrder.total)}</p></div>
                <div><p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Platform fee</p><p className="mt-1 font-bold" style={{ color: '#fca5a5' }}>-{formatPrice(platformFeeForOrder(selectedOrder))}</p></div>
                <div><p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Organizer net</p><p className="mt-1 font-bold" style={{ color: 'var(--primary)' }}>{formatPrice(netTicketRevenueForOrder(selectedOrder))}</p></div>
                <div><p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Status</p><div className="mt-1"><Badge label={selectedOrder.status} color={STATUS_COLORS[selectedOrder.status] ?? '#888'} /></div></div>
              </div>
              <div className="mt-5 rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,0.025)' }}>
                <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Tickets and tiers</p>
                {(() => {
                  const event = events.find(item => item.id === selectedOrder.event_id)
                  const tierNames = new Map((event?.ticket_tiers ?? []).map(tier => [tier.id, tier.name]))
                  const items = selectedOrder.order_items ?? []
                  const ticketCount = items.reduce((sum, item) => sum + item.quantity, 0) || agentSale?.quantity || 0
                  const tiers = [...new Set(items.map(item => tierNames.get(item.ticket_tier_id) ?? 'Unknown tier'))]
                  return <><p className="mt-1 font-bold">{ticketCount} ticket{ticketCount === 1 ? '' : 's'}</p><p className="mt-1 text-xs" style={{ color: 'var(--muted-foreground)' }}>{tiers.length ? tiers.join(', ') : 'Tier details unavailable'}</p></>
                })()}
              </div>
              {isAwaitingAgentCash && <div className="mt-5 rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(249,112,21,.1)', color: 'var(--primary)' }}>The agent reported cash received. Confirming this order will create the customer tickets and record the agent commission.</div>}
              <div className="mt-5 flex justify-end gap-2"><button onClick={() => setSelectedOrder(null)} className="rounded-xl px-4 py-2.5 text-sm font-bold" style={{ background: 'var(--muted)', color: 'var(--foreground)' }}>Close</button>{isAwaitingAgentCash && <button onClick={() => void confirmAgentOrder(selectedOrder)} className="rounded-xl px-4 py-2.5 text-sm font-bold" style={{ background: 'var(--primary)', color: '#000' }}>Confirm cash and issue tickets</button>}</div>
            </div>
          </div>
        )
      })()}
      {showWithdrawal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4" onClick={() => !withdrawalSaving && setShowWithdrawal(false)}>
          <form onSubmit={event => { event.preventDefault(); void requestWithdrawal() }} className="w-full max-w-md rounded-2xl border p-5 shadow-2xl" style={{ background: '#171918', borderColor: 'var(--border)' }} onClick={event => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b pb-4" style={{ borderColor: 'var(--border)' }}>
              <div><p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--primary)' }}>Payout request</p><h2 className="mt-1 text-xl font-black">Withdraw balance</h2></div>
              <button type="button" onClick={() => setShowWithdrawal(false)} disabled={withdrawalSaving} className="text-xl" style={{ color: 'var(--muted-foreground)' }}>×</button>
            </div>
            <div className="mt-4 rounded-xl border p-3 text-sm" style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,0.025)' }}>
              <span style={{ color: 'var(--muted-foreground)' }}>Available to withdraw</span><p className="mt-1 text-lg font-black" style={{ color: '#86efac' }}>{formatPrice(availableWithdrawalBalance)}</p>
              <p className="mt-1 text-[11px]" style={{ color: 'var(--muted-foreground)' }}>Pending requests reserve money until they are paid, rejected, or cancelled.</p>
            </div>
            <label className="mt-4 block text-xs font-bold">Amount (BIF)
              <input required type="number" min="1" step="1" max={availableWithdrawalBalance || undefined} value={withdrawalForm.amount} onChange={event => setWithdrawalForm(current => ({ ...current, amount: event.target.value }))} placeholder="0" className="mt-2 w-full rounded-xl border px-3 py-2.5 text-sm outline-none" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'var(--border)', color: 'var(--foreground)' }} />
            </label>
            <label className="mt-4 block text-xs font-bold">Method
              <select value={withdrawalForm.paymentMethod} onChange={event => setWithdrawalForm(current => ({ ...current, paymentMethod: event.target.value as 'mobile_money' | 'bank' }))} className="mt-2 w-full rounded-xl border px-3 py-2.5 text-sm outline-none" style={{ background: '#1a1d1d', borderColor: 'var(--border)', color: 'var(--foreground)' }}>
                <option value="mobile_money">Mobile Money</option>
                <option value="bank">Bank transfer</option>
              </select>
            </label>
            <label className="mt-4 block text-xs font-bold">{withdrawalForm.paymentMethod === 'mobile_money' ? 'Mobile Money number' : 'Bank account reference'}
              <input required value={withdrawalForm.paymentReference} onChange={event => setWithdrawalForm(current => ({ ...current, paymentReference: event.target.value }))} placeholder={withdrawalForm.paymentMethod === 'mobile_money' ? 'e.g. +257 …' : 'Account number or IBAN'} className="mt-2 w-full rounded-xl border px-3 py-2.5 text-sm outline-none" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'var(--border)', color: 'var(--foreground)' }} />
            </label>
            <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setShowWithdrawal(false)} disabled={withdrawalSaving} className="rounded-xl px-4 py-2.5 text-sm font-bold" style={{ background: 'var(--muted)', color: 'var(--foreground)' }}>Cancel</button><button type="submit" disabled={withdrawalSaving || availableWithdrawalBalance <= 0} className="rounded-xl px-4 py-2.5 text-sm font-bold" style={{ background: 'var(--primary)', color: '#000', opacity: withdrawalSaving || availableWithdrawalBalance <= 0 ? 0.6 : 1 }}>{withdrawalSaving ? 'Requesting…' : 'Request withdrawal'}</button></div>
          </form>
        </div>
      )}
      {actionError && (
        <div className="fixed top-4 right-4 z-[70] max-w-sm rounded-xl px-4 py-3 text-left text-xs font-semibold shadow-2xl" style={{ background: '#3a1717', border: '1px solid #ef4444', color: '#fecaca' }}>
          <p>{actionError}</p>
          <div className="mt-3 flex items-center gap-3">
            {dashboardLoadError && <button onClick={() => void load()} className="rounded-lg px-3 py-1.5 font-bold" style={{ background: 'var(--primary)', color: '#000' }}>Retry dashboard</button>}
            <button onClick={() => { setActionError(''); setDashboardLoadError(false) }} className="font-semibold" style={{ color: '#fecaca' }}>Dismiss</button>
          </div>
        </div>
      )}
      {teamMembership?.status === 'pending' && (
        <div className="fixed left-1/2 top-4 z-[70] flex w-[min(92vw,34rem)] -translate-x-1/2 items-center justify-between gap-4 rounded-xl border px-4 py-3 text-xs shadow-2xl" style={{ background: '#1a1d1d', borderColor: 'var(--primary)' }}>
          <span>You have been invited to join {organizer.name}.</span>
          <button onClick={acceptMembership} className="shrink-0 rounded-lg px-3 py-1.5 font-bold" style={{ background: 'var(--primary)', color: '#000' }}>Accept invite</button>
        </div>
      )}
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 flex flex-col border-r transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
        style={{ background: 'rgba(12,13,13,0.96)', borderColor: 'rgba(255,255,255,0.09)', top: 0 }}
      >
        {/* Brand */}
        <div className="px-5 py-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.09)' }}>
          <a href="/dashboard/analytics" onClick={event => { event.preventDefault(); selectSection('overview') }} className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl text-sm font-black" style={{ background: 'var(--primary)', color: '#17100a' }}>t</span>
            <span className="text-lg font-black tracking-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>organizer studio</span>
          </a>
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--muted-foreground)' }}>Workspace</p>
          <p className="mt-1 truncate text-xs" style={{ color: 'rgba(255,255,255,0.72)' }}>{profile?.full_name?.trim() || organizer.name}</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3">
          {visibleNav.map(({ key, label }) => {
            const NavIcon = NAV_ICONS[key]
            return (
              <a
                key={key}
                href={SECTION_PATHS[key]}
                onClick={event => { event.preventDefault(); selectSection(key) }}
                className="w-full flex items-center gap-3 px-5 py-2.5 text-sm font-medium text-left transition-colors"
                style={{
                  background: section === key ? 'rgba(200,169,110,0.08)' : 'transparent',
                  color: section === key ? 'var(--foreground)' : 'rgba(255,255,255,0.45)',
                  borderLeft: section === key ? '2px solid var(--accent)' : '2px solid transparent',
                }}
              >
                <NavIcon size={15} />
                {label}
                <span className="ml-auto text-[10px] opacity-30">/{SECTION_PATHS[key].split('/').pop()}</span>
              </a>
            )
          })}
        </nav>

        {/* Bottom */}
        <div className="p-4 border-t space-y-2" style={{ borderColor: 'rgba(255,255,255,0.09)' }}>
          <a href="/" onClick={event => { event.preventDefault(); navigate('home') }} className="flex w-full items-center justify-center gap-2 py-2 text-xs" style={{ color: 'var(--muted-foreground)' }}>
            <ArrowLeftIcon size={14} /> Back to site
          </a>
        </div>
      </aside>

      {/* Overlay for mobile sidebar */}
      {sidebarOpen && <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Main */}
      <main className="flex-1 min-w-0 flex flex-col lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-20 flex items-center justify-between px-5 py-3.5 border-b" style={{ background: 'rgba(11,12,12,0.88)', backdropFilter: 'blur(20px)', borderColor: 'rgba(255,255,255,0.09)' }}>
          <div className="flex items-center gap-3">
            <button className="lg:hidden p-1.5 rounded-lg" style={{ background: 'var(--muted)' }} onClick={() => setSidebarOpen(v => !v)}>
              <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor"><rect y="2" width="16" height="1.5" rx="1"/><rect y="7" width="16" height="1.5" rx="1"/><rect y="12" width="16" height="1.5" rx="1"/></svg>
            </button>
            <div>
              <div className="flex items-center gap-2"><h1 className="font-black text-base" style={{ fontFamily: 'Outfit, sans-serif' }}>
                {visibleNav.find(n => n.key === section)?.label ?? 'Dashboard'}
              </h1><span className="hidden sm:inline rounded-md px-2 py-1 text-[10px] font-mono" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--muted-foreground)' }}>{SECTION_PATHS[section]}</span></div>
              <p className="mt-1 text-[10px] font-mono sm:hidden" style={{ color: 'var(--muted-foreground)' }}>{SECTION_PATHS[section]}</p>
              <p className="text-xs hidden sm:block" style={{ color: 'var(--muted-foreground)' }}>
                Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, {profile?.full_name?.split(' ')[0] ?? 'Organizer'} · {isOwner ? organizer.name : `${organizer.name} team`} 👋
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canCheckIn && <button onClick={() => navigate('checkin')} className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold lg:hidden" style={{ background: 'var(--primary)', color: '#000' }}>
              <TicketIcon size={14} /> Check-in
            </button>}
            {utilityPopup && <button className="fixed inset-0 z-10 cursor-default" aria-label="Close popup" onClick={() => setUtilityPopup(null)} />}
            <div className="relative z-20">
              <button onClick={() => setUtilityPopup(current => current === 'notifications' ? null : 'notifications')} aria-label="Notifications" title="Notifications" className="relative flex h-9 w-9 items-center justify-center rounded-xl border transition-colors" style={{ background: utilityPopup === 'notifications' ? 'rgba(200,169,110,0.14)' : 'transparent', borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.78)' }}>
                <BellIcon size={18} />
                {organizerNotifications.filter(notification => !notification.read_at).length > 0 && <span className="absolute -right-2 -top-2 min-w-5 rounded-full px-1 text-center text-[10px] font-black" style={{ background: 'var(--primary)', color: '#000' }}>{organizerNotifications.filter(notification => !notification.read_at).length > 99 ? '99+' : organizerNotifications.filter(notification => !notification.read_at).length}</span>}
              </button>
              {utilityPopup === 'notifications' && (
                <div className="absolute right-0 top-11 flex h-80 w-72 flex-col rounded-2xl border p-4 shadow-2xl" style={{ background: '#171918', borderColor: 'rgba(255,255,255,0.12)' }}>
                  <div className="flex items-center justify-between gap-3"><p className="text-sm font-bold">Organizer notifications</p><BellIcon size={15} /></div>
                  <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto">
                    {organizerNotifications.map(notification => (
                      <button key={notification.id} type="button" onClick={() => void openOrganizerNotification(notification)} className="w-full rounded-xl px-3 py-2 text-left" style={{ background: notification.read_at ? 'rgba(255,255,255,0.04)' : 'rgba(200,169,110,0.12)' }}>
                        <p className="text-xs font-semibold">{notification.title}</p>
                        <p className="mt-1 text-[11px] leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>{notification.body}</p>
                      </button>
                    ))}
                    {organizerNotifications.length === 0 && <p className="py-2 text-xs leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>No organizer notifications yet.</p>}
                    <button type="button" onClick={() => { setUtilityPopup(null); selectSection('notifications') }} className="mt-2 w-full rounded-lg py-2 text-xs font-bold" style={{ color: 'var(--primary)', background: 'rgba(249,112,21,0.08)' }}>View all notifications</button>
                  </div>
                </div>
              )}
            </div>
            {canUseCalendar && <div className="relative z-20">
              <button onClick={() => setUtilityPopup(current => current === 'calendar' ? null : 'calendar')} aria-label="Calendar" title="Calendar" className="flex h-9 w-9 items-center justify-center rounded-xl border transition-colors" style={{ background: utilityPopup === 'calendar' ? 'rgba(200,169,110,0.14)' : 'transparent', borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.78)' }}>
                <CalendarIcon size={18} />
              </button>
              {utilityPopup === 'calendar' && (
                <div className="absolute right-0 top-11 w-80 rounded-2xl border p-4 shadow-2xl" style={{ background: '#171918', borderColor: 'rgba(255,255,255,0.12)' }}>
                  <div className="flex items-center justify-between gap-3"><p className="text-sm font-bold">Event calendar</p><CalendarIcon size={15} /></div>
                  <div className="mt-3 space-y-2">
                    {events.slice(0, 3).map(event => (
                      <button key={event.id} onClick={() => { setUtilityPopup(null); navigate('event-detail', event) }} className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left" style={{ background: 'rgba(255,255,255,0.05)' }}>
                        <span className="min-w-0 truncate text-xs font-semibold">{event.title}</span>
                        <span className="shrink-0 text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{event.date}</span>
                      </button>
                    ))}
                    {events.length === 0 && <p className="py-2 text-xs" style={{ color: 'var(--muted-foreground)' }}>No events scheduled yet.</p>}
                  </div>
                  {canViewEvents && <button onClick={() => { setUtilityPopup(null); selectSection('events') }} className="mt-4 w-full rounded-xl border px-3 py-2 text-xs font-bold" style={{ borderColor: 'rgba(255,255,255,0.12)', color: 'var(--foreground)' }}>Open all events</button>}
                </div>
              )}
            </div>}
            <a href={`/organizers/${organizer.id}/${organizer.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`} onClick={event => { event.preventDefault(); navigate('organizer-profile', organizer) }} className="hidden sm:flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold" style={{ borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.78)' }}><LinkIcon size={14} /> Public profile</a>
            <div className="relative z-20">
              <button onClick={() => setUtilityPopup(current => current === 'profile' ? null : 'profile')} aria-label="Profile menu" title="Profile menu" className="flex h-9 w-9 items-center justify-center rounded-xl border transition-colors" style={{ background: utilityPopup === 'profile' ? 'rgba(200,169,110,0.14)' : 'transparent', borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.78)' }}>
                {profile?.profile_image || profile?.avatar_url
                  ? <img src={profile.profile_image || profile.avatar_url || ''} className="h-7 w-7 rounded-full object-cover" alt={profile.full_name ?? ''} />
                  : <UserIcon size={18} />}
              </button>
              {utilityPopup === 'profile' && (
                <div className="absolute right-0 top-11 w-56 rounded-2xl border p-2 shadow-2xl" style={{ background: '#171918', borderColor: 'rgba(255,255,255,0.12)' }}>
                  <p className="px-3 py-2 text-xs font-semibold" style={{ color: 'var(--muted-foreground)' }}>{profile?.full_name?.trim() || organizer.name}</p>
                  <button onClick={() => { setUtilityPopup(null); navigate('profile') }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold hover:bg-white/5"><UserIcon size={14} /> Account profile</button>
                  <button onClick={() => { setUtilityPopup(null); navigate('organizer-profile', organizer) }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold hover:bg-white/5"><LinkIcon size={14} /> Organizer profile</button>
                  <button onClick={() => { setUtilityPopup(null); navigate('home') }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold hover:bg-white/5"><EyeIcon size={14} /> View site</button>
                  <button onClick={handleSignOut} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold hover:bg-white/5" style={{ color: '#f87171' }}><ArrowLeftIcon size={14} /> Sign out</button>
                </div>
              )}
            </div>
            <a href="/" onClick={event => { event.preventDefault(); navigate('home') }} className="hidden md:flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.78)' }}><EyeIcon size={14} /> View site</a>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-auto p-5">
          {dataLoading && (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }} />
            </div>
          )}

          {!dataLoading && (
            <>
              {/* ── ANALYTICS / OVERVIEW ── */}
              {section === 'overview' && (
                <div className="space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3" style={{ borderColor: 'var(--border)' }}>
                    <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--muted-foreground)' }}>Analytics range</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex flex-wrap items-center gap-1 rounded-xl border p-1" style={{ background: 'rgba(255,255,255,0.035)', borderColor: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}>
                        {(['all', 'day', 'week', 'month', 'year', 'custom'] as AnalyticsRange[]).map(range => (
                          <button key={range} onClick={() => setAnalyticsRange(range)} className="rounded-lg border px-3 py-2 text-xs font-bold capitalize transition-colors" style={{ background: analyticsRange === range ? 'rgba(255,255,255,0.12)' : 'transparent', borderColor: analyticsRange === range ? 'rgba(255,255,255,0.28)' : 'transparent', color: analyticsRange === range ? 'var(--foreground)' : 'var(--muted-foreground)' }}>{range === 'custom' ? 'Select dates' : range === 'all' ? 'All time' : range}</button>
                        ))}
                      </div>
                      {(analyticsRange === 'day' || analyticsRange === 'month') && (
                        <div className="flex flex-wrap items-center gap-1 rounded-xl border p-1" style={{ background: 'rgba(255,255,255,0.035)', borderColor: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}>
                          {(analyticsRange === 'day' ? [1, 2, 4, 6, 12] : [1, 2, 4]).map(option => {
                            const value = analyticsRange === 'day' ? analyticsDayInterval : analyticsMonthInterval
                            const label = `${option}${analyticsRange === 'day' ? 'h' : 'w'}`
                            const active = value === option
                            return (
                              <button key={label} onClick={() => analyticsRange === 'day' ? setAnalyticsDayInterval(option) : setAnalyticsMonthInterval(option)} className="rounded-lg border px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide transition-colors" style={{ background: active ? 'rgba(255,255,255,0.12)' : 'transparent', borderColor: active ? 'rgba(255,255,255,0.28)' : 'transparent', color: active ? 'var(--foreground)' : 'var(--muted-foreground)' }}>{label}</button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                    {analyticsRange === 'custom' && <div className="flex items-center gap-2 text-[10px]" style={{ color: 'var(--muted-foreground)' }}><label>From<input type="date" value={analyticsStart} onChange={event => setAnalyticsStart(event.target.value)} className="ml-1 rounded-lg border px-2 py-1.5 text-xs" style={{ background: 'rgba(255,255,255,0.035)', borderColor: 'rgba(255,255,255,0.14)', color: 'var(--foreground)', backdropFilter: 'blur(18px)' }} /></label><label>To<input type="date" value={analyticsEnd} onChange={event => setAnalyticsEnd(event.target.value)} className="ml-1 rounded-lg border px-2 py-1.5 text-xs" style={{ background: 'rgba(255,255,255,0.035)', borderColor: 'rgba(255,255,255,0.14)', color: 'var(--foreground)', backdropFilter: 'blur(18px)' }} /></label></div>}
                  </div>
                  <div className="flex flex-col gap-4 rounded-2xl p-5 sm:flex-row sm:items-center sm:justify-between" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                    <div><p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--muted-foreground)' }}>Organizer verification</p><p className="mt-1 text-sm" style={{ color: 'var(--muted-foreground)' }}>{verificationStatus === 'verified' ? 'Your organizer profile is verified.' : verificationStatus === 'pending' ? 'Your verification request is awaiting review.' : 'Verify your profile to show a trusted badge on organizer cards and profiles.'}</p></div>
                    <button onClick={requestVerification} disabled={verificationStatus !== 'unverified'} className="rounded-xl px-4 py-2.5 text-sm font-bold" style={{ background: verificationStatus === 'unverified' ? 'var(--primary)' : 'var(--muted)', color: verificationStatus === 'unverified' ? '#000' : 'var(--muted-foreground)' }}>{verificationStatus === 'verified' ? 'Verified' : verificationStatus === 'pending' ? 'Pending review' : 'Request verification'}</button>
                  </div>
                  {/* KPI grid */}
                  <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                    <StatCard Icon={TicketIcon} label="Tickets Sold" value={totalTicketsSold.toLocaleString()} />
                    <StatCard Icon={DollarSignIcon} label="Net Ticket Revenue" value={formatPrice(totalRevenue)} />
                    <StatCard Icon={DollarSignIcon} label="Platform Fees" value={formatPrice(totalPlatformFees)} sub="Deducted from sales" color="#fca5a5" />
                    <StatCard Icon={DollarSignIcon} label="Available Balance" value={formatPrice(availableWithdrawalBalance)} sub={reservedWithdrawalAmount ? `${formatPrice(reservedWithdrawalAmount)} reserved` : 'Ready to withdraw'} color="#86efac" />
                    <StatCard Icon={CalendarIcon} label="Published Events" value={publishedEvents.toString()} />
                    <StatCard Icon={UsersIcon} label="Customers" value={customers.length.toString()}
                      sub={`Avg order: ${avgOrderValue > 0 ? formatPrice(avgOrderValue) : '—'}`} />
                  </div>

                  {/* Chart + recent */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                    {/* Revenue chart */}
                    <div className="lg:col-span-2 rounded-2xl p-5" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                      <div className="mb-5 flex items-start justify-between gap-3">
                        <div><h2 className="font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>Net ticket revenue by period</h2><p className="mt-1 text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{analyticsRangeLabel} · net confirmed orders</p></div>
                        <div className="text-right"><p className="text-sm font-bold" style={{ color: 'var(--primary)' }}>{formatPrice(totalRevenue)}</p><p className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{netRevenueOrders.length} orders</p></div>
                      </div>
                      <div className="space-y-3">
                        {chartData.map(({ day, revenue }) => (
                          <div key={`revenue-${day}`} className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-3 text-xs">
                            <span className="truncate font-semibold" style={{ color: 'var(--muted-foreground)' }}>{day}</span>
                            <div className="h-2.5 overflow-hidden rounded-full" style={{ background: 'var(--muted)' }}><div className="h-full rounded-full" style={{ width: `${revenue ? Math.max((revenue / maxRevenue) * 100, 3) : 0}%`, background: 'var(--primary)' }} /></div>
                            <span className="font-bold" style={{ color: revenue ? 'var(--foreground)' : 'var(--muted-foreground)' }}>{formatPrice(revenue)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Ticket activity chart */}
                    <div className="rounded-2xl p-5" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                      <div className="mb-5 flex items-start justify-between gap-3">
                        <div><h2 className="font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>Orders by period</h2><p className="mt-1 text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{analyticsRangeLabel} · confirmed net sales</p></div>
                        <p className="text-sm font-bold" style={{ color: 'var(--accent)' }}>{netRevenueOrders.length}</p>
                      </div>
                      <div className="space-y-3">
                        {chartData.map(({ day, count }) => (
                          <div key={`orders-${day}`} className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-3 text-xs">
                            <span className="truncate font-semibold" style={{ color: 'var(--muted-foreground)' }}>{day}</span>
                            <div className="h-2.5 overflow-hidden rounded-full" style={{ background: 'var(--muted)' }}><div className="h-full rounded-full" style={{ width: `${count ? Math.max((count / maxOrders) * 100, 5) : 0}%`, background: 'var(--accent)' }} /></div>
                            <span className="font-bold" style={{ color: count ? 'var(--foreground)' : 'var(--muted-foreground)' }}>{count}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Recent orders */}
                    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                      <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
                        <h2 className="font-bold text-sm" style={{ fontFamily: 'Outfit, sans-serif' }}>Recent Orders</h2>
                        <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--accent)' }} />
                      </div>
                      <div className="overflow-y-auto" style={{ maxHeight: 200 }}>
                        {orders.slice(0, 8).map(o => (
                          <div key={o.id} className="flex items-center justify-between px-5 py-3 border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold truncate">{(o as any).profiles?.full_name ?? 'Customer'}</p>
                              <p className="text-xs truncate" style={{ color: 'var(--muted-foreground)' }}>{(o as any).events?.title ?? '—'}</p>
                            </div>
                            <div className="text-right flex-shrink-0 ml-3">
                              <p className="text-xs font-bold" style={{ color: 'var(--primary)' }}>{formatPrice(o.total)}</p>
                              <Badge label={o.status} color={STATUS_COLORS[o.status] ?? '#888'} />
                            </div>
                          </div>
                        ))}
                        {orders.length === 0 && <p className="text-xs text-center py-8" style={{ color: 'var(--muted-foreground)' }}>No orders yet</p>}
                      </div>
                    </div>
                  </div>

                  {/* Additional analytics */}
                  <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
                    <div className="xl:col-span-3 overflow-x-auto rounded-2xl p-5" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                      <div className="mb-4 flex items-center justify-between">
                        <div><h2 className="font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>Net ticket revenue trend</h2><p className="mt-1 text-[10px]" style={{ color: 'var(--muted-foreground)' }}>Net ticket revenue across the selected {analyticsRangeLabel.toLowerCase()} range</p></div>
                        <TrendingUpIcon size={17} style={{ color: 'var(--primary)' }} />
                      </div>
                      <RevenueTrendChart data={chartData} />
                    </div>
                    <div className="xl:col-span-2 rounded-2xl p-5" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                      <div className="mb-5 flex items-center justify-between">
                        <div><h2 className="font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>Event performance</h2><p className="mt-1 text-[10px]" style={{ color: 'var(--muted-foreground)' }}>Net ticket revenue by event</p></div>
                        <BarChartIcon size={17} style={{ color: 'var(--accent)' }} />
                      </div>
                      <EventPerformanceChart events={events} orders={netRevenueOrders} getRevenue={netTicketRevenueForOrder} />
                    </div>
                  </div>

                  {/* Top events */}
                  <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                    <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
                      <h2 className="font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>Event Performance</h2>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr style={{ background: 'var(--muted)' }}>
                            {['Event', 'Status', 'Date', 'Sold / Cap', 'Revenue'].map(h => (
                              <th key={h} className="text-left px-5 py-3 text-xs font-semibold" style={{ color: 'var(--muted-foreground)' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {events.slice(0, 6).map(ev => {
                            const performance = eventAnalytics.get(ev.id) ?? { tickets: 0, revenue: 0 }
                            return (
                              <tr key={ev.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                                <td className="px-5 py-3 font-medium text-sm">{ev.title}</td>
                                <td className="px-5 py-3"><Badge label={ev.status} color={STATUS_COLORS[ev.status] ?? '#888'} /></td>
                                <td className="px-5 py-3 text-xs" style={{ color: 'var(--muted-foreground)' }}>{new Date(ev.date).toLocaleDateString()}</td>
                                <td className="px-5 py-3 text-xs">{performance.tickets} / {ev.capacity}</td>
                                <td className="px-5 py-3 text-xs font-bold" style={{ color: 'var(--primary)' }}>{formatPrice(performance.revenue)}</td>
                              </tr>
                            )
                          })}
                          {events.length === 0 && (
                            <tr><td colSpan={5} className="px-5 py-8 text-center text-xs" style={{ color: 'var(--muted-foreground)' }}>No events yet. Create your first event!</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* ── ORGANIZER NOTIFICATIONS ── */}
              {section === 'notifications' && (
                <div className="mx-auto max-w-5xl space-y-6">
                  <div className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between" style={{ borderColor: 'var(--border)' }}>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--accent)' }}>Workspace signal</p>
                      <h2 className="mt-1 text-2xl font-black" style={{ fontFamily: 'Outfit, sans-serif' }}>Organizer inbox</h2>
                      <p className="mt-1 max-w-xl text-sm" style={{ color: 'var(--muted-foreground)' }}>Keep up with sales, event changes, followers, and team activity across your workspace.</p>
                    </div>
                    {unreadOrganizerNotifications.length > 0 && <button type="button" onClick={() => void markAllOrganizerNotificationsRead()} className="shrink-0 rounded-xl border px-3 py-2 text-xs font-bold" style={{ borderColor: 'rgba(249,112,21,0.35)', color: 'var(--primary)', background: 'rgba(249,112,21,0.08)' }}>Mark all read</button>}
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      ['Total updates', organizerNotifications.length.toString(), 'var(--foreground)'],
                      ['Needs attention', unreadOrganizerNotifications.length.toString(), 'var(--primary)'],
                      ['Event updates', organizerNotifications.filter(notification => notification.type === 'event' || !!notification.event_id).length.toString(), '#9bd4ff'],
                      ['Followers', organizerNotifications.filter(notification => notification.type === 'follower').length.toString(), '#c8a96e'],
                    ].map(([label, value, color]) => <div key={label} className="rounded-2xl border p-4" style={{ background: 'rgba(255,255,255,0.035)', borderColor: 'var(--border)' }}><p className="text-2xl font-black" style={{ color }}>{value}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--muted-foreground)' }}>{label}</p></div>)}
                  </div>

                  <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                    {([['all', 'All updates'], ['unread', 'Needs attention'], ['events', 'Events'], ['sales', 'Sales'], ['followers', 'Followers'], ['team', 'Team']] as const).map(([key, label]) => <button key={key} type="button" onClick={() => setNotificationFilter(key)} className="shrink-0 rounded-xl border px-3 py-2 text-xs font-bold" style={{ background: notificationFilter === key ? 'rgba(249,112,21,0.14)' : 'transparent', borderColor: notificationFilter === key ? 'rgba(249,112,21,0.4)' : 'var(--border)', color: notificationFilter === key ? 'var(--primary)' : 'var(--muted-foreground)' }}>{label}</button>)}
                  </div>

                  <div className="overflow-hidden rounded-2xl border" style={{ background: 'rgba(255,255,255,0.025)', borderColor: 'var(--border)' }}>
                    <div className="border-b px-5 py-4" style={{ borderColor: 'var(--border)' }}><p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--muted-foreground)' }}>{filteredOrganizerNotifications.length} update{filteredOrganizerNotifications.length === 1 ? '' : 's'} in this view</p></div>
                    {filteredOrganizerNotifications.length === 0 ? <div className="px-5 py-16 text-center"><BellIcon size={24} /><p className="mt-4 font-bold">Nothing here yet</p><p className="mt-1 text-sm" style={{ color: 'var(--muted-foreground)' }}>New organizer activity will appear in this inbox.</p></div> : <div>{filteredOrganizerNotifications.map(notification => {
                      const title = notification.title.toLowerCase()
                      const NotificationIcon = notification.type === 'payment' || title.includes('order') || title.includes('ticket') ? DollarSignIcon : notification.type === 'follower' ? UserIcon : notification.type === 'team' || title.includes('member') || title.includes('role') ? UsersIcon : notification.type === 'event' || notification.event_id ? CalendarIcon : BellIcon
                      return <button key={notification.id} type="button" onClick={() => void openOrganizerNotification(notification)} className="flex w-full items-start gap-4 border-b px-5 py-4 text-left transition-colors last:border-b-0 hover:bg-white/[0.035]" style={{ borderColor: 'var(--border)', background: notification.read_at ? 'transparent' : 'rgba(249,112,21,0.055)' }}>
                        <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: notification.read_at ? 'rgba(255,255,255,0.06)' : 'rgba(249,112,21,0.14)', color: notification.read_at ? 'var(--muted-foreground)' : 'var(--primary)' }}><NotificationIcon size={17} /></span>
                        <span className="min-w-0 flex-1"><span className="flex items-start justify-between gap-3"><span className="text-sm font-bold">{notification.title}</span>{!notification.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: 'var(--primary)' }} />}</span><span className="mt-1 block text-xs leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>{notification.body}</span><span className="mt-2 block text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--muted-foreground)' }}>{new Date(notification.created_at).toLocaleString()}</span></span>
                      </button>
                    })}</div>}
                  </div>
                </div>
              )}

              {/* ── EVENTS ── */}
              {section === 'events' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <div><h2 className="font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>Events</h2><p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{events.length} event{events.length === 1 ? '' : 's'} in your workspace</p></div>
                    <button onClick={() => setShowNewEvent(true)} className="shrink-0 rounded-xl px-4 py-2.5 text-sm font-bold" style={{ background: 'var(--primary)', color: '#000' }}>+ New Event</button>
                  </div>
                  {events.length === 0 && (
                    <div className="text-center py-20">
                      <p className="text-4xl mb-4">🎭</p>
                      <p className="font-bold text-lg mb-2">No events yet</p>
                      <button onClick={() => setShowNewEvent(true)} className="mt-4 px-6 py-3 rounded-xl text-sm font-bold" style={{ background: 'var(--primary)', color: '#000' }}>
                        + Create your first event
                      </button>
                    </div>
                  )}
                  {events.map(ev => {
                    const sold = ev.ticket_tiers?.reduce((s, t) => s + t.sold, 0) ?? 0
                    const pct = ev.capacity > 0 ? Math.round((sold / ev.capacity) * 100) : 0
                    return (
                      <div key={ev.id} className="rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row gap-4 sm:items-center" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                        <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0" style={{ background: '#1a1a1a' }}>
                          {ev.cover_image && <img src={ev.cover_image} alt={ev.title} className="w-full h-full object-cover" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className="font-bold text-sm truncate">{ev.title}</p>
                            <Badge label={ev.status} color={STATUS_COLORS[ev.status] ?? '#888'} />
                          </div>
                          <p className="text-xs mb-2" style={{ color: 'var(--muted-foreground)' }}>
                            📅 {new Date(ev.date).toLocaleDateString()} · 📍 {ev.venue} · {ev.category}
                          </p>
                          <div className="flex items-center gap-3">
                            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)', maxWidth: 120 }}>
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct > 80 ? '#ef4444' : 'var(--primary)' }} />
                            </div>
                            <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{sold}/{ev.capacity} sold</p>
                          </div>
                        </div>
                        <div className="flex gap-2 flex-shrink-0 self-stretch sm:self-auto">
                          <button onClick={() => setEditingEvent(ev)} className="px-3 py-1.5 rounded-lg text-xs font-bold" style={{ background: 'rgba(249,112,21,0.12)', color: 'var(--primary)' }}>
                            Edit
                          </button>
                          <button
                            onClick={() => toggleEventStatus(ev)}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold"
                            style={{ background: ev.status === 'published' ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)', color: ev.status === 'published' ? '#ef4444' : '#22c55e' }}
                          >
                            {ev.status === 'published' ? 'Unpublish' : 'Publish'}
                          </button>
                          <button onClick={() => deleteEvent(ev.id)} className="px-3 py-1.5 rounded-lg text-xs font-bold" style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}>
                            Delete
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* ── ORDERS ── */}
              {section === 'orders' && (
                <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                  <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
                    <h2 className="font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>{orders.length} Orders</h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ background: 'var(--muted)' }}>
                          {['Order ID', 'Customer', 'Event', 'Tickets / tiers', 'Source', 'Method', 'Customer paid', 'Status', 'Date', 'Actions'].map(h => (
                            <th key={h} className="text-left px-4 py-3 text-xs font-semibold whitespace-nowrap" style={{ color: 'var(--muted-foreground)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {orders.map(o => {
                          const event = events.find(item => item.id === o.event_id)
                          const tierNames = new Map((event?.ticket_tiers ?? []).map(tier => [tier.id, tier.name]))
                          const ticketCount = o.order_items?.reduce((sum, item) => sum + item.quantity, 0) || agentOrderMeta[o.id]?.quantity || 0
                          const tiers = [...new Set((o.order_items ?? []).map(item => tierNames.get(item.ticket_tier_id) ?? 'Unknown tier'))]
                          return (
                          <tr key={o.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                            <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--muted-foreground)' }}>{o.id.slice(0, 8)}…</td>
                            <td className="px-4 py-3 text-xs font-medium">{(o as any).holder_name ?? (o as any).profiles?.full_name ?? '—'}<span className="block text-[10px] font-normal" style={{ color: 'var(--muted-foreground)' }}>{(o as any).holder_email ?? (o as any).profiles?.email ?? ''}</span></td>
                            <td className="px-4 py-3 text-xs truncate max-w-[140px]" style={{ color: 'var(--muted-foreground)' }}>{(o as any).events?.title ?? '—'}</td>
                            <td className="px-4 py-3 text-xs"><span className="font-semibold">{ticketCount} ticket{ticketCount === 1 ? '' : 's'}</span><span className="block max-w-[150px] truncate text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{tiers.length ? tiers.join(', ') : 'Tier details unavailable'}</span></td>
                            <td className="px-4 py-3 text-xs">{agentOrderMeta[o.id] ? <><span className="font-semibold">{agentOrderMeta[o.id].profiles?.full_name ?? 'Agent'}</span><span className="block text-[10px]" style={{ color: 'var(--muted-foreground)' }}>Agent sale · {agentOrderMeta[o.id].quantity} ticket{agentOrderMeta[o.id].quantity === 1 ? '' : 's'}</span></> : <span style={{ color: 'var(--muted-foreground)' }}>Customer checkout</span>}</td>
                            <td className="px-4 py-3 text-xs capitalize">{agentOrderMeta[o.id]?.payment_mode ?? o.payment_method?.replace('_', ' ') ?? '—'}</td>
                            <td className="px-4 py-3 text-xs font-bold" style={{ color: 'var(--primary)' }}>{formatPrice(o.total)}</td>
                            <td className="px-4 py-3"><Badge label={o.status} color={STATUS_COLORS[o.status] ?? '#888'} /></td>
                            <td className="px-4 py-3 text-xs" style={{ color: 'var(--muted-foreground)' }}>{new Date(o.created_at).toLocaleDateString()}</td>
                            <td className="px-4 py-3"><button onClick={() => setSelectedOrder(o)} className="rounded-lg px-2.5 py-1.5 text-xs font-bold" style={{ background: 'var(--muted)', color: 'var(--foreground)' }}>View order</button></td>
                          </tr>
                          )
                        })}
                        {orders.length === 0 && (
                          <tr><td colSpan={10} className="px-4 py-12 text-center text-xs" style={{ color: 'var(--muted-foreground)' }}>No orders yet</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── CUSTOMERS ── */}
              {section === 'customers' && (
                <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                  <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
                    <h2 className="font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>{customers.length} Customers</h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ background: 'var(--muted)' }}>
                          {['Name', 'Email', 'Phone', 'Orders', 'Total Spent', 'Since'].map(h => (
                            <th key={h} className="text-left px-4 py-3 text-xs font-semibold" style={{ color: 'var(--muted-foreground)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {customers.map(c => (
                          <tr key={c.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                            <td className="px-4 py-3 font-medium text-sm">{c.full_name ?? '—'}</td>
                            <td className="px-4 py-3 text-xs" style={{ color: 'var(--muted-foreground)' }}>{c.email ?? '—'}</td>
                            <td className="px-4 py-3 text-xs" style={{ color: 'var(--muted-foreground)' }}>{c.phone ?? '—'}</td>
                            <td className="px-4 py-3 text-xs text-center">{c.total_orders}</td>
                            <td className="px-4 py-3 text-xs font-bold" style={{ color: 'var(--primary)' }}>{formatPrice(c.total_spent)}</td>
                            <td className="px-4 py-3 text-xs" style={{ color: 'var(--muted-foreground)' }}>{new Date(c.created_at).toLocaleDateString()}</td>
                          </tr>
                        ))}
                        {customers.length === 0 && (
                          <tr><td colSpan={6} className="px-4 py-12 text-center text-xs" style={{ color: 'var(--muted-foreground)' }}>No customers yet</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── MEMBERS ── */}
              {section === 'followers' && (
                <div className="space-y-4">
                  <div className="rounded-2xl p-5" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                    <p className="text-3xl font-black" style={{ fontFamily: 'Outfit, sans-serif', color: 'var(--primary)' }}>{followers.length}</p>
                    <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>People following your organizer profile</p>
                  </div>
                  {followers.length === 0 ? (
                    <div className="rounded-2xl p-12 text-center" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                      <UsersIcon size={28} style={{ color: 'var(--muted-foreground)' }} />
                      <p className="mt-3 font-bold">No followers yet</p>
                    </div>
                  ) : followers.map(follower => {
                    const followerName = follower.profiles?.full_name || follower.profiles?.username || 'Tiketi user'
                    return (
                      <div key={follower.id} className="flex items-center gap-3 rounded-2xl p-4" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                        {follower.profiles?.avatar_url ? <img src={follower.profiles.avatar_url} alt={followerName} className="h-10 w-10 rounded-full object-cover" /> : <div className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold" style={{ background: 'var(--muted)' }}>{followerName[0]?.toUpperCase() ?? '?'}</div>}
                        <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{followerName}</p><p className="truncate text-xs" style={{ color: 'var(--muted-foreground)' }}>{follower.profiles?.username ? `@${follower.profiles.username.replace(/^@/, '')}` : 'Follower'}</p></div>
                        <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{new Date(follower.created_at).toLocaleDateString()}</span>
                        <button onClick={() => removeFollower(follower.id)} className="rounded-lg px-3 py-1.5 text-xs font-bold" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>Remove</button>
                      </div>
                    )
                  })}
                </div>
              )}

              {section === 'checkin' && (
                <div className="space-y-5">
                  <div>
                    <h2 className="font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>Check-in</h2>
                    <p className="mt-1 text-xs" style={{ color: 'var(--muted-foreground)' }}>Attendance activity for your events.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                    <StatCard Icon={CheckIcon} label="Checked in" value={checkinTickets.filter(ticket => ticket.checked_in_at || ticket.status === 'used').length.toString()} />
                    <StatCard Icon={TicketIcon} label="Tickets issued" value={checkinTickets.length.toString()} />
                    <StatCard Icon={TrendingUpIcon} label="Attendance rate" value={checkinTickets.length ? `${Math.round((checkinTickets.filter(ticket => ticket.checked_in_at || ticket.status === 'used').length / checkinTickets.length) * 100)}%` : '0%'} />
                    <StatCard Icon={CalendarIcon} label="Events covered" value={new Set(checkinTickets.map(ticket => ticket.event_id)).size.toString()} />
                  </div>
                  <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                    <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}><h3 className="font-bold">Recent check-ins</h3></div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead><tr style={{ background: 'var(--muted)' }}>{['Guest', 'Event', 'Ticket', 'Checked in'].map(label => <th key={label} className="px-4 py-3 text-left text-xs font-semibold" style={{ color: 'var(--muted-foreground)' }}>{label}</th>)}</tr></thead>
                        <tbody>
                          {checkinTickets.filter(ticket => ticket.checked_in_at || ticket.status === 'used').slice(0, 25).map(ticket => (
                            <tr key={ticket.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                              <td className="px-4 py-3 text-xs font-medium">{ticket.holder_name ?? 'Guest'}</td>
                              <td className="px-4 py-3 text-xs">{ticket.events?.title ?? 'Event'}</td>
                              <td className="px-4 py-3 text-xs font-mono">{ticket.qr_code.slice(0, 12)}…</td>
                              <td className="px-4 py-3 text-xs" style={{ color: 'var(--muted-foreground)' }}>{ticket.checked_in_at ? new Date(ticket.checked_in_at).toLocaleString() : 'Recorded'}</td>
                            </tr>
                          ))}
                          {checkinTickets.filter(ticket => ticket.checked_in_at || ticket.status === 'used').length === 0 && <tr><td colSpan={4} className="px-4 py-12 text-center text-xs" style={{ color: 'var(--muted-foreground)' }}>No check-ins recorded yet</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* ── MEMBERS ── */}
              {section === 'members' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div><h2 className="font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>Team members</h2><p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{members.length} member{members.length === 1 ? '' : 's'} in your workspace</p></div>
                    <div className="flex shrink-0 gap-2"><button onClick={() => setShowInviteAgent(true)} className="rounded-xl px-4 py-2.5 text-sm font-bold" style={{ background: 'var(--primary)', color: '#000' }}>+ Invite Agent</button><button onClick={() => setShowInviteMember(true)} className="rounded-xl px-4 py-2.5 text-sm font-bold" style={{ background: 'var(--muted)', color: 'var(--foreground)' }}>+ Member</button></div>
                  </div>
                  {members.length === 0 && (
                    <div className="text-center py-16">
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{ background: 'var(--muted)' }}><UsersIcon size={20} style={{ color: 'var(--muted-foreground)' }} /></div>
                      <p className="font-bold mb-1">No team members yet</p>
                      <p className="text-sm mb-4" style={{ color: 'var(--muted-foreground)' }}>Invite staff, agents, and scanners to your team.</p>
                      <button onClick={() => setShowInviteMember(true)} className="px-5 py-2.5 rounded-xl text-sm font-bold" style={{ background: 'var(--primary)', color: '#000' }}>+ Invite Member</button>
                    </div>
                  )}
                  {members.map(m => (
                    <div key={m.id} className="flex items-center gap-4 p-4 rounded-2xl" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                      <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center text-sm font-bold" style={{ background: 'var(--muted)' }}>
                        {(m as any).profiles?.profile_image || (m as any).profiles?.avatar_url
                          ? <img src={(m as any).profiles.profile_image || (m as any).profiles.avatar_url} className="w-full h-full object-cover" />
                          : ((m as any).profiles?.full_name?.[0] ?? '?')}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">{(m as any).profiles?.full_name ?? 'Unknown'}</p>
                        <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{(m as any).profiles?.email ?? '—'}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-bold px-3 py-1 rounded-full" style={{ background: 'rgba(249,112,21,0.12)', color: 'var(--primary)' }}>
                          {(m as any).organizer_roles?.name ?? 'No role'}
                        </span>
                        <Badge label={m.status} color={STATUS_COLORS[m.status] ?? '#888'} />
                        <button
                          onClick={() => updateMemberStatus(m.id, m.status === 'active' ? 'inactive' : 'active')}
                          className="text-xs px-3 py-1 rounded-lg"
                          style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}
                        >
                          {m.status === 'active' ? 'Deactivate' : 'Activate'}
                        </button>
                        <select value={m.role_id ?? ''} onChange={event => updateMemberRole(m.id, event.target.value)} className="rounded-lg px-2 py-1 text-xs" style={{ background: '#252828', border: '1px solid var(--border)', color: 'var(--foreground)' }} aria-label="Member role">
                          <option value="">No role</option>
                          {roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}
                        </select>
                        {agentAssignments.filter(assignment => assignment.user_id === m.user_id).map(assignment => <button key={assignment.id} onClick={() => setEditingAgentAssignment(assignment)} className="rounded-lg px-3 py-1 text-xs font-bold" style={{ background: 'rgba(249,112,21,0.12)', color: 'var(--primary)' }}>Edit assignment</button>)}
                        <button onClick={() => deleteMember(m.id)} className="rounded-lg px-3 py-1 text-xs font-bold" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>Remove</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── ROLES ── */}
              {section === 'roles' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div><h2 className="font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>Roles</h2><p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{roles.length} role{roles.length === 1 ? '' : 's'} configured</p></div>
                    <button onClick={() => setShowNewRole(true)} className="shrink-0 rounded-xl px-4 py-2.5 text-sm font-bold" style={{ background: 'var(--primary)', color: '#000' }}>+ New Role</button>
                  </div>
                  {roles.map(r => (
                    <div key={r.id} className="flex items-center justify-between p-5 rounded-2xl" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                      <div>
                        <p className="font-bold">{r.name}</p>
                        <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>
                          Permissions: {Object.entries(r.permissions || {}).filter(([, enabled]) => enabled).map(([permission]) => permission).join(', ') || 'None granted'}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                          {members.filter(m => m.role_id === r.id).length} member{members.filter(m => m.role_id === r.id).length !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2"><span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--muted-foreground)' }}>Live</span><button onClick={() => { setEditingRole(r); setShowNewRole(true) }} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: 'var(--muted)', color: 'var(--foreground)' }}>Edit</button><button onClick={() => deleteRole(r.id)} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444' }}>Delete</button></div>
                    </div>
                  ))}
                  {roles.length === 0 && (
                    <div className="text-center py-16">
                      <p className="text-4xl mb-3">🔑</p>
                      <p className="font-bold mb-1">No roles defined</p>
                      <button onClick={() => setShowNewRole(true)} className="mt-4 px-5 py-2.5 rounded-xl text-sm font-bold" style={{ background: 'var(--primary)', color: '#000' }}>+ New Role</button>
                    </div>
                  )}
                </div>
              )}

              {/* ── SUBSCRIPTIONS ── */}
              {section === 'subscriptions' && (
                <div className="space-y-5">
                  {/* Current plan */}
                  {subscriptions.map(sub => (
                    <div key={sub.id} className="p-6 rounded-2xl" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--muted-foreground)' }}>Current Plan</p>
                          <p className="text-3xl font-black capitalize" style={{ fontFamily: 'Outfit, sans-serif', color: 'var(--primary)' }}>{sub.tier}</p>
                          <p className="text-sm mt-1" style={{ color: 'var(--muted-foreground)' }}>
                            {sub.price === 0 ? 'Free' : formatPrice(sub.price) + '/month'}
                          </p>
                        </div>
                        <Badge label={sub.status} color={STATUS_COLORS[sub.status] ?? '#888'} />
                      </div>
                      <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                        Started: {new Date(sub.started_at).toLocaleDateString()}
                        {sub.expires_at && ` · Expires: ${new Date(sub.expires_at).toLocaleDateString()}`}
                      </p>
                    </div>
                  ))}

                  {/* Upgrade options */}
                  <h2 className="font-bold text-lg mt-4" style={{ fontFamily: 'Outfit, sans-serif' }}>Available Plans</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                      { tier: 'Free', price: 0, features: ['3 events/month', '500 tickets', 'Basic analytics', 'Email support'] },
                      { tier: 'Starter', price: 50000, features: ['10 events/month', '2,000 tickets', 'Full analytics', 'Ticket agents', 'Priority support'] },
                      { tier: 'Pro', price: 150000, features: ['Unlimited events', 'Unlimited tickets', 'Advanced analytics', 'Custom domain', 'Dedicated support'] },
                      { tier: 'Enterprise', price: 0, features: ['Custom pricing', 'SLA guarantee', 'White label', 'API access', 'Account manager'] },
                    ].map(({ tier, price, features }) => {
                      const current = subscriptions[0]?.tier === tier.toLowerCase()
                      return (
                        <div key={tier} className="p-5 rounded-2xl flex flex-col"
                          style={{ background: current ? 'rgba(240,165,0,0.07)' : 'var(--card)', border: current ? '2px solid var(--primary)' : '1px solid var(--border)' }}>
                          <p className="font-black text-lg mb-0.5" style={{ fontFamily: 'Outfit, sans-serif', color: current ? 'var(--primary)' : '#fff' }}>{tier}</p>
                          <p className="font-bold text-sm mb-4" style={{ color: 'var(--muted-foreground)' }}>
                            {price === 0 ? (tier === 'Free' ? 'Free' : 'Custom') : formatPrice(price) + '/mo'}
                          </p>
                          <ul className="space-y-1.5 flex-1">
                            {features.map(f => (
                              <li key={f} className="flex items-start gap-2 text-xs" style={{ color: 'var(--muted-foreground)' }}>
                                <CheckIcon size={11} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 1 }} /> {f}
                              </li>
                            ))}
                          </ul>
                          <button onClick={() => tier === 'Enterprise' ? navigate('organizers') : changeSubscription(tier.toLowerCase() as Subscription['tier'], price)} className="mt-4 py-2 rounded-xl text-xs font-bold"
                            style={{ background: current ? 'var(--primary)' : 'var(--muted)', color: current ? '#000' : 'rgba(255,255,255,0.7)' }}>
                            {current ? 'Current Plan' : tier === 'Enterprise' ? 'Contact Us' : 'Upgrade'}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ── TRANSACTIONS ── */}
              {FEATURES.refunds && section === 'refunds' && (
                <div className="space-y-4">
                  <div>
                    <h2 className="font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>Refund requests</h2>
                    <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Review customer requests before processing any provider refund.</p>
                  </div>
                  <div className="rounded-2xl border" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                    {refundRequests.length === 0 ? <div className="px-5 py-14 text-center"><p className="font-bold">No refund requests</p><p className="mt-1 text-xs" style={{ color: 'var(--muted-foreground)' }}>New requests from ticket holders will appear here.</p></div> : <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                      {refundRequests.map(request => <div key={request.id} className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-bold text-sm">{request.profiles?.full_name || request.profiles?.email || 'Customer'}</p><Badge label={request.status} color={STATUS_COLORS[request.status] ?? '#888'} /></div><p className="mt-1 text-xs" style={{ color: 'var(--muted-foreground)' }}>{request.events?.title || 'Event'} · {new Date(request.created_at).toLocaleString()}</p><p className="mt-3 text-sm leading-relaxed">{request.reason}</p><p className="mt-2 font-mono text-[10px]" style={{ color: 'var(--muted-foreground)' }}>Order {request.order_id.slice(0, 8)}…{request.ticket_id ? ` · Ticket ${request.ticket_id.slice(0, 8)}…` : ''}</p></div>
                        <div className="flex shrink-0 flex-wrap gap-2">{request.status === 'pending' && <><button type="button" onClick={() => void reviewRefundRequest(request, 'approved')} className="rounded-xl px-3 py-2 text-xs font-bold" style={{ background: 'rgba(34,197,94,0.14)', color: '#86efac' }}>Approve</button><button type="button" onClick={() => void reviewRefundRequest(request, 'rejected')} className="rounded-xl px-3 py-2 text-xs font-bold" style={{ background: 'rgba(239,68,68,0.14)', color: '#fca5a5' }}>Decline</button></>}<a href="mailto:hello@tiketi.events?subject=Refund%20request%20review" className="rounded-xl px-3 py-2 text-xs font-bold" style={{ background: 'var(--muted)', color: 'var(--foreground)' }}>Contact support</a></div>
                      </div>)}
                    </div>}
                  </div>
                </div>
              )}

              {/* ── TRANSACTIONS ── */}
              {section === 'transactions' && (
                <div className="space-y-4">
                  <div className="rounded-2xl border p-5" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div><p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--primary)' }}>Organizer wallet</p><h2 className="mt-1 text-xl font-black" style={{ fontFamily: 'Outfit, sans-serif' }}>Available balance: <span style={{ color: '#86efac' }}>{formatPrice(availableWithdrawalBalance)}</span></h2><p className="mt-2 max-w-2xl text-xs leading-5" style={{ color: 'var(--muted-foreground)' }}>Confirmed customer payments, minus platform fees, processed refunds, agent commissions, paid payouts, and requests currently being processed.</p></div>
                      {isOwner && <button type="button" onClick={() => { setActionError(''); setShowWithdrawal(true) }} disabled={availableWithdrawalBalance <= 0} className="shrink-0 rounded-xl px-4 py-2.5 text-sm font-bold" style={{ background: 'var(--primary)', color: '#000', opacity: availableWithdrawalBalance <= 0 ? 0.55 : 1 }}>Request withdrawal</button>}
                    </div>
                    <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                      {[
                        ['Lifetime net earnings', lifetimeNetRevenue, '#86efac'],
                        ['Paid out', withdrawnAmount, 'var(--primary)'],
                        ['Reserved in requests', reservedWithdrawalAmount, '#fbbf24'],
                        ['Available now', availableWithdrawalBalance, '#86efac'],
                      ].map(([label, amount, color]) => <div key={label as string} className="rounded-xl border p-3" style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,0.025)' }}><p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--muted-foreground)' }}>{label as string}</p><p className="mt-1 font-black" style={{ color: color as string }}>{formatPrice(amount as number)}</p></div>)}
                    </div>
                  </div>

                  <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                    <div className="flex items-center justify-between gap-3 border-b px-5 py-4" style={{ borderColor: 'var(--border)' }}><div><h2 className="font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>Withdrawal requests</h2><p className="mt-1 text-xs" style={{ color: 'var(--muted-foreground)' }}>A request is reserved immediately. Only a paid request reduces your settled payout balance.</p></div><span className="text-xs font-bold" style={{ color: 'var(--muted-foreground)' }}>{withdrawals.length} total</span></div>
                    {withdrawals.length === 0 ? <div className="px-5 py-10 text-center text-xs" style={{ color: 'var(--muted-foreground)' }}>No withdrawal requests yet.</div> : <div className="divide-y" style={{ borderColor: 'var(--border)' }}>{withdrawals.map(withdrawal => <div key={withdrawal.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-bold">{formatPrice(withdrawal.amount)}</p><Badge label={withdrawal.status} color={STATUS_COLORS[withdrawal.status] ?? '#888'} /></div><p className="mt-1 text-xs capitalize" style={{ color: 'var(--muted-foreground)' }}>{withdrawal.payment_method.replace('_', ' ')} · {withdrawal.payment_reference} · {new Date(withdrawal.requested_at).toLocaleString()}</p>{withdrawal.note && <p className="mt-1 text-xs" style={{ color: 'var(--muted-foreground)' }}>{withdrawal.note}</p>}</div>{isOwner && withdrawal.status === 'requested' && <button type="button" onClick={() => void cancelWithdrawal(withdrawal.id)} className="shrink-0 rounded-xl px-3 py-2 text-xs font-bold" style={{ background: 'rgba(239,68,68,0.12)', color: '#fca5a5' }}>Cancel request</button>}</div>)}</div>}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {(['payment', 'payout', 'refund', 'fee'] as const).map(type => {
                      const total = transactions.filter(t => t.type === type && t.status === 'completed').reduce((s, t) => s + t.amount, 0)
                      return (
                        <div key={type} className="p-4 rounded-2xl" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                          <p className="text-xs font-semibold capitalize mb-1" style={{ color: 'var(--muted-foreground)' }}>{type}s</p>
                          <p className="font-black text-base" style={{ fontFamily: 'Outfit, sans-serif', color: STATUS_COLORS[type] ?? '#fff' }}>{formatPrice(total)}</p>
                        </div>
                      )
                    })}
                  </div>

                  <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                    <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
                      <h2 className="font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>{transactions.length} Transactions</h2>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr style={{ background: 'var(--muted)' }}>
                            {['ID', 'Type', 'Amount', 'Currency', 'Status', 'Reference', 'Date'].map(h => (
                              <th key={h} className="text-left px-4 py-3 text-xs font-semibold" style={{ color: 'var(--muted-foreground)' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {transactions.map(t => (
                            <tr key={t.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                              <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--muted-foreground)' }}>{t.id.slice(0, 8)}…</td>
                              <td className="px-4 py-3"><Badge label={t.type} color={STATUS_COLORS[t.type] ?? '#888'} /></td>
                              <td className="px-4 py-3 text-xs font-bold" style={{ color: t.type === 'refund' || t.type === 'fee' || t.type === 'payout' ? '#ef4444' : 'var(--primary)' }}>
                                {t.type === 'refund' || t.type === 'fee' || t.type === 'payout' ? '-' : '+'}{formatPrice(t.amount)}
                              </td>
                              <td className="px-4 py-3 text-xs">{t.currency}</td>
                              <td className="px-4 py-3"><Badge label={t.status} color={STATUS_COLORS[t.status === 'completed' ? 'completed_t' : t.status === 'failed' ? 'failed' : 'pending_t'] ?? '#888'} /></td>
                              <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--muted-foreground)' }}>{t.reference ?? '—'}</td>
                              <td className="px-4 py-3 text-xs" style={{ color: 'var(--muted-foreground)' }}>{new Date(t.created_at).toLocaleDateString()}</td>
                            </tr>
                          ))}
                          {transactions.length === 0 && (
                            <tr><td colSpan={7} className="px-4 py-12 text-center text-xs" style={{ color: 'var(--muted-foreground)' }}>No transactions yet</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* ── CREATE EVENT MODAL ── */}
      {(showNewEvent || editingEvent) && <CreateEventModal orgId={orgId!} event={editingEvent} onClose={() => { setShowNewEvent(false); setEditingEvent(null) }} onCreated={() => { setShowNewEvent(false); setEditingEvent(null); load() }} />}
      {showNewRole && <CreateRoleModal orgId={orgId!} role={editingRole} onClose={() => { setShowNewRole(false); setEditingRole(null) }} onCreated={() => { setShowNewRole(false); setEditingRole(null); load() }} />}
      {showInviteMember && <InviteMemberModal orgId={orgId!} roles={roles} onClose={() => setShowInviteMember(false)} onInvited={() => { setShowInviteMember(false); load() }} />}
      {showInviteAgent && <InviteAgentModal orgId={orgId!} events={events} onClose={() => setShowInviteAgent(false)} onInvited={() => { setShowInviteAgent(false); load() }} />}
      {editingAgentAssignment && <EditAgentAssignmentModal assignment={editingAgentAssignment} events={events} onClose={() => setEditingAgentAssignment(null)} onSaved={() => { setEditingAgentAssignment(null); load() }} />}
    </div>
  )
}

// ── Modals ──

type EventTierForm = { id?: string; name: string; price: string; quantity: string; description: string; ticket_type: 'consumable' | 'non_consumable'; extra_info: string; expires_at: string; group_size: string; sold: number }

function CreateEventModal({ orgId, event, onClose, onCreated }: { orgId: string; event?: Event | null; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState(() => ({ title: event?.title ?? '', category: event?.category ?? 'Music', date: event?.date ?? '', time: event?.time ?? '18:00', end_time: event?.end_time ?? '', venue: event?.venue ?? '', venue_latitude: event?.venue_latitude ?? null as number | null, venue_longitude: event?.venue_longitude ?? null as number | null, city: event?.city ?? 'Bujumbura', description: event?.description ?? '', capacity: String(event?.capacity ?? 500), cover_image: event?.cover_image ?? '', tags: event?.tags?.join(', ') ?? '', status: event?.status ?? 'draft', featured: event?.is_featured ?? false, refund_policy: event?.refund_policy ?? 'Tickets are non-refundable', entry_policy: event?.entry_policy ?? 'Valid ID required at entry' }))
  const [venueSearch, setVenueSearch] = useState(event?.venue ?? '')
  const [venueResults, setVenueResults] = useState<Array<{ display_name: string; lat: string; lon: string; class?: string; type?: string; address?: { city?: string; town?: string; village?: string } }>>([])
  const [venueSearching, setVenueSearching] = useState(false)
  const [tiers, setTiers] = useState<EventTierForm[]>(() => event?.ticket_tiers?.map(tier => ({ id: tier.id, name: tier.name, price: String(tier.price), quantity: String(tier.quantity), description: tier.description ?? '', ticket_type: tier.ticket_type ?? 'consumable', extra_info: tier.extra_info ?? '', expires_at: tier.expires_at ?? '', group_size: String(tier.group_size ?? 1), sold: tier.sold })) ?? [{ name: 'REGULAR', price: '30000', quantity: '500', description: 'General admission', ticket_type: 'consumable', extra_info: '', expires_at: '', group_size: '1', sold: 0 }])
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [coverPreview, setCoverPreview] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const createCoverDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const image = new Image()
      image.onload = () => {
        const maxSize = 1600
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(image.width * scale))
        canvas.height = Math.max(1, Math.round(image.height * scale))
        canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.82))
      }
      image.onerror = () => reject(new Error('The selected image could not be read.'))
      image.src = String(reader.result)
    }
    reader.onerror = () => reject(new Error('The selected image could not be read.'))
    reader.readAsDataURL(file)
  })

  const handleSubmit = async () => {
    const title = form.title.trim()
    const venue = form.venue.trim()
    const capacity = Number.parseInt(form.capacity, 10)
    if (!title || !form.date || !venue) { setError('Event title, date, and venue are required.'); return }
    if (!Number.isInteger(capacity) || capacity < 1) { setError('Event capacity must be a positive whole number.'); return }
    if (!tiers.length) { setError('Add at least one ticket tier.'); return }
    const normalizedTierNames = new Set<string>()
    let totalTicketCapacity = 0
    for (const tier of tiers) {
      const tierName = tier.name.trim()
      const price = Number.parseInt(tier.price, 10)
      const quantity = Number.parseInt(tier.quantity, 10)
      const groupSize = Number.parseInt(tier.group_size, 10)
      if (!tierName) { setError('Every ticket tier needs a name.'); return }
      if (normalizedTierNames.has(tierName.toLowerCase())) { setError('Ticket tier names must be unique.'); return }
      if (!Number.isInteger(price) || price < 0) { setError(`Enter a valid price for ${tierName}.`); return }
      if (!Number.isInteger(quantity) || quantity < 1 || quantity < tier.sold) { setError(`${tierName} quantity must be at least ${tier.sold} and greater than zero.`); return }
      if (!Number.isInteger(groupSize) || groupSize < 1) { setError(`Group size for ${tierName} must be at least 1.`); return }
      normalizedTierNames.add(tierName.toLowerCase())
      totalTicketCapacity += quantity * groupSize
    }
    if (totalTicketCapacity > capacity) { setError('Total ticket capacity cannot exceed the event capacity.'); return }
    setSaving(true)
    setError('')

    let coverImageUrl = form.cover_image.trim()
    let uploadedCoverPath: string | null = null
    if (coverFile) {
      const safeName = coverFile.name.toLowerCase().replace(/[^a-z0-9.-]+/g, '-')
      const filePath = `${orgId}/${crypto.randomUUID()}-${safeName}`
      const { error: uploadError } = await supabase.storage.from('event-covers').upload(filePath, coverFile, {
        cacheControl: '3600',
        contentType: coverFile.type,
        upsert: false,
      })
      if (uploadError) {
        const message = uploadError.message.toLowerCase()
        if (message.includes('bucket') && message.includes('not found')) {
          try {
            coverImageUrl = await createCoverDataUrl(coverFile)
          } catch (fallbackError) {
            setError(fallbackError instanceof Error ? fallbackError.message : 'The cover image could not be read.')
            setSaving(false)
            return
          }
        } else {
          setError(uploadError.message || 'The cover image could not be uploaded. Check your connection and try again.')
          setSaving(false)
          return
        }
      }
      if (!coverImageUrl) {
        uploadedCoverPath = filePath
        coverImageUrl = supabase.storage.from('event-covers').getPublicUrl(filePath).data.publicUrl
      }
    }

    const eventPayload = {
      organizer_id: orgId,
      title,
      category: form.category,
      date: form.date,
      time: form.time,
      end_time: form.end_time || null,
      venue,
      venue_latitude: form.venue_latitude,
      venue_longitude: form.venue_longitude,
      city: form.city,
      description: form.description,
      capacity,
      cover_image: coverImageUrl || null,
      tags: form.tags.split(',').map(tag => tag.trim()).filter(Boolean),
      status: form.status,
      is_featured: form.featured,
      refund_policy: form.refund_policy,
      entry_policy: form.entry_policy,
    }
    const eventQuery = event
      ? supabase.from('events').update(eventPayload).eq('id', event.id).select().single()
      : supabase.from('events').insert(eventPayload).select().single()
    const { data: ev, error } = await eventQuery

    if (error || !ev) {
      if (uploadedCoverPath) await supabase.storage.from('event-covers').remove([uploadedCoverPath])
      setError(error?.message ?? 'The event could not be created.')
      setSaving(false)
      return
    }
    if (ev) {
      for (const tier of tiers) {
        const tierPayload = {
          event_id: ev.id,
          name: tier.name,
          price: parseInt(tier.price),
          quantity: parseInt(tier.quantity),
          description: tier.description,
          ticket_type: tier.ticket_type,
          extra_info: tier.extra_info || null,
          expires_at: tier.expires_at || null,
          group_size: Math.max(1, parseInt(tier.group_size) || 1),
        }
        const { error: tierError } = tier.id
          ? await supabase.from('ticket_tiers').update(tierPayload).eq('id', tier.id)
          : await supabase.from('ticket_tiers').insert(tierPayload)
        if (tierError) {
          setError(tierError.message)
          setSaving(false)
          return
        }
      }
    }
    setSaving(false)
    onCreated()
  }

  const f = (key: string, val: string) => setForm(p => ({ ...p, [key]: val }))

  const searchVenues = async (value: string) => {
    setVenueSearch(value)
    if (value.trim().length < 3) { setVenueResults([]); return }
    setVenueSearching(true)
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&addressdetails=1&countrycodes=bi&q=${encodeURIComponent(value)}`)
      if (response.ok) {
        const results = await response.json() as typeof venueResults
        const venueTypes = new Set([
          'bar', 'pub', 'biergarten', 'nightclub', 'cafe', 'restaurant', 'fast_food',
          'hotel', 'motel', 'guest_house', 'hostel', 'school', 'college', 'university',
          'kindergarten', 'stadium', 'sports_centre', 'pitch', 'theatre', 'cinema',
          'conference_centre', 'community_centre', 'place_of_worship', 'hospital',
          'clinic', 'museum', 'arts_centre', 'park', 'attraction', 'theme_park',
        ])
        setVenueResults(results.filter(result => result.class === 'amenity' || result.class === 'tourism' || result.class === 'leisure' || result.class === 'sport' || result.class === 'historic' || venueTypes.has(result.type ?? '')).slice(0, 5))
      }
    } catch {
      setVenueResults([])
    } finally {
      setVenueSearching(false)
    }
  }

  const selectVenue = (venue: (typeof venueResults)[number]) => {
    setVenueSearch(venue.display_name)
    setVenueResults([])
    setForm(current => ({ ...current, venue_latitude: Number(venue.lat), venue_longitude: Number(venue.lon) }))
  }

  const handleCoverFile = (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Cover image must be an image file.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Cover image must be smaller than 5 MB.')
      return
    }
    setError('')
    setCoverFile(file)
    setCoverPreview(URL.createObjectURL(file))
    setForm(p => ({ ...p, cover_image: '' }))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.8)' }}>
      <div className="dashboard-form-modal w-full max-w-lg rounded-2xl overflow-hidden overflow-y-auto" style={{ background: '#1a1d1d', border: '1px solid var(--border)', maxHeight: '90vh' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
          <h2 className="font-black text-lg" style={{ fontFamily: 'Outfit, sans-serif' }}>{event ? 'Edit Event' : 'New Event'}</h2>
          <button onClick={onClose} className="text-xl" style={{ color: 'var(--muted-foreground)' }}>✕</button>
        </div>
        <div className="p-6 space-y-4">
          {error && <p className="rounded-lg px-3 py-2 text-xs" style={{ background: '#3a1717', color: '#fecaca' }}>{error}</p>}
          {[
            { label: 'Event title *', key: 'title', placeholder: 'Bujumbura Summer Fest' },
          ].map(({ label, key, placeholder }) => (
            <div key={key}>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted-foreground)' }}>{label}</label>
              <input value={String(form[key as keyof typeof form])} onChange={e => f(key, e.target.value)} placeholder={placeholder}
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none" style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: '#fff' }} />
            </div>
          ))}
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted-foreground)' }}>Venue name *</label>
            <input value={form.venue} onChange={event => f('venue', event.target.value)} placeholder="Stade Intwari" className="w-full px-4 py-2.5 rounded-xl text-sm outline-none" style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: '#fff' }} />
            <p className="mt-1 text-[11px]" style={{ color: 'var(--muted-foreground)' }}>This is the venue name attendees will see.</p>
          </div>
          <div className="relative">
            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted-foreground)' }}>Map location</label>
            <input value={venueSearch} onChange={event => void searchVenues(event.target.value)} placeholder="Search for the venue on the map" className="w-full px-4 py-2.5 rounded-xl text-sm outline-none" style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: '#fff' }} />
            <p className="mt-1 text-[11px]" style={{ color: 'var(--muted-foreground)' }}>{venueSearching ? 'Searching venues...' : form.venue_latitude ? 'Map location selected.' : 'Optional: search for a bar, hotel, school, restaurant, stadium, or other venue.'}</p>
            {venueResults.length > 0 && <div className="absolute inset-x-0 top-full z-10 mt-2 overflow-hidden rounded-xl border shadow-2xl" style={{ background: '#1a1d1d', borderColor: 'var(--border)' }}>{venueResults.map(result => <button key={`${result.lat}-${result.lon}`} type="button" onClick={() => selectVenue(result)} className="block w-full border-b px-3 py-2.5 text-left text-xs last:border-0 hover:bg-white/5" style={{ borderColor: 'var(--border)' }}>{result.display_name}</button>)}</div>}
            {form.venue_latitude !== null && form.venue_longitude !== null && <iframe title="Selected venue map" className="mt-3 h-40 w-full rounded-xl border" style={{ borderColor: 'var(--border)' }} src={`https://www.openstreetmap.org/export/embed.html?bbox=${form.venue_longitude - 0.01}%2C${form.venue_latitude - 0.01}%2C${form.venue_longitude + 0.01}%2C${form.venue_latitude + 0.01}&layer=mapnik&marker=${form.venue_latitude}%2C${form.venue_longitude}`} />}
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted-foreground)' }}>Cover image</label>
            <div className="rounded-xl p-3 space-y-3" style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}>
              {coverPreview && <img src={coverPreview} alt="Cover preview" className="w-full h-36 rounded-lg object-cover" />}
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={e => handleCoverFile(e.target.files?.[0])}
                className="w-full text-xs" style={{ color: 'var(--muted-foreground)' }} />
              <p className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>PNG, JPG, WEBP or GIF. Maximum 5 MB.</p>
              {!coverFile && <input value={form.cover_image} onChange={e => f('cover_image', e.target.value)} placeholder="Or paste an image URL"
                className="w-full px-3 py-2.5 rounded-lg text-xs outline-none" style={{ background: 'var(--card)', border: '1px solid var(--border)', color: '#fff' }} />}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted-foreground)' }}>Date *</label>
              <input type="date" value={form.date} onChange={e => f('date', e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none" style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: '#fff' }} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted-foreground)' }}>Time</label>
              <input type="time" value={form.time} onChange={e => f('time', e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none" style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: '#fff' }} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted-foreground)' }}>Event ending time</label>
              <input type="time" value={form.end_time} onChange={e => f('end_time', e.target.value)} className="w-full px-4 py-2.5 rounded-xl text-sm outline-none" style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: '#fff' }} />
              <p className="mt-1 text-[10px]" style={{ color: 'var(--muted-foreground)' }}>The event is marked ended when this time is reached.</p>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted-foreground)' }}>Tags / lineup</label>
            <input value={form.tags} onChange={e => f('tags', e.target.value)} placeholder="DJ, Live music, Afrobeats"
              className="w-full px-4 py-2.5 rounded-xl text-sm outline-none" style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: '#fff' }} />
            <p className="text-[11px] mt-1" style={{ color: 'var(--muted-foreground)' }}>Separate tags with commas. They appear as the event lineup.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted-foreground)' }}>Publication status</label>
              <select value={form.status} onChange={e => f('status', e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none" style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: '#fff' }}>
                {['draft', 'published', 'cancelled', 'completed'].map(status => <option key={status}>{status}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 pb-2 text-sm font-semibold">
              <input type="checkbox" checked={form.featured} onChange={e => setForm(current => ({ ...current, featured: e.target.checked }))} />
              Featured event
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted-foreground)' }}>Category</label>
              <select value={form.category} onChange={e => f('category', e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none" style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: '#fff' }}>
                {['Music', 'Parties', 'Sports', 'Comedy', 'Conferences', 'Culture', 'Business', 'Festivals'].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted-foreground)' }}>Capacity</label>
              <input type="number" value={form.capacity} onChange={e => f('capacity', e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none" style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: '#fff' }} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted-foreground)' }}>Description</label>
            <textarea value={form.description} onChange={e => f('description', e.target.value)} rows={3}
              className="w-full px-4 py-2.5 rounded-xl text-sm outline-none resize-none" style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: '#fff' }} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted-foreground)' }}>Refund policy</label><input value={form.refund_policy} onChange={e => f('refund_policy', e.target.value)} className="w-full px-4 py-2.5 rounded-xl text-sm outline-none" style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: '#fff' }} /></div>
            <div><label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted-foreground)' }}>Entry policy</label><input value={form.entry_policy} onChange={e => f('entry_policy', e.target.value)} className="w-full px-4 py-2.5 rounded-xl text-sm outline-none" style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: '#fff' }} /></div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold" style={{ color: 'var(--muted-foreground)' }}>Ticket Tiers</label>
              <button onClick={() => setTiers(t => [...t, { name: 'VIP', price: '75000', quantity: '100', description: '', ticket_type: 'consumable', extra_info: '', expires_at: '', group_size: '1', sold: 0 }])}
                className="text-xs font-bold" style={{ color: 'var(--primary)' }}>+ Add tier</button>
            </div>
            {tiers.map((tier, i) => (
              <div key={i} className="mb-3 rounded-xl p-3" style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                <input placeholder="Name" value={tier.name} onChange={e => setTiers(t => t.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                  className="px-3 py-2 rounded-lg text-xs outline-none" style={{ background: 'var(--card)', border: '1px solid var(--border)', color: '#fff' }} />
                <div className="flex items-center gap-2"><input type="number" min="0" placeholder="Price BIF" value={tier.price} disabled={tier.price === '0'} onChange={e => setTiers(t => t.map((x, j) => j === i ? { ...x, price: e.target.value } : x))}
                  className="min-w-0 flex-1 px-3 py-2 rounded-lg text-xs outline-none" style={{ background: 'var(--card)', border: '1px solid var(--border)', color: '#fff' }} /><label className="flex shrink-0 items-center gap-1 text-[11px]" style={{ color: 'var(--muted-foreground)' }}><input type="checkbox" checked={tier.price === '0'} onChange={e => setTiers(t => t.map((x, j) => j === i ? { ...x, price: e.target.checked ? '0' : '30000' } : x))} /> Free</label></div>
                <input placeholder="Qty" value={tier.quantity} onChange={e => setTiers(t => t.map((x, j) => j === i ? { ...x, quantity: e.target.value } : x))}
                  className="px-3 py-2 rounded-lg text-xs outline-none" style={{ background: 'var(--card)', border: '1px solid var(--border)', color: '#fff' }} />
                <button onClick={() => setTiers(t => t.filter((_, j) => j !== i))} className="text-xs" style={{ color: '#ef4444' }}>✕</button>
                </div>
                <input placeholder="Ticket description" value={tier.description} onChange={e => setTiers(t => t.map((x, j) => j === i ? { ...x, description: e.target.value } : x))}
                  className="mb-2 w-full px-3 py-2 rounded-lg text-xs outline-none" style={{ background: 'var(--card)', border: '1px solid var(--border)', color: '#fff' }} />
                <textarea placeholder="Extra info (optional)" value={tier.extra_info} onChange={e => setTiers(t => t.map((x, j) => j === i ? { ...x, extra_info: e.target.value } : x))} rows={2}
                  className="mb-2 w-full resize-none px-3 py-2 rounded-lg text-xs outline-none" style={{ background: 'var(--card)', border: '1px solid var(--border)', color: '#fff' }} />
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="mb-1 block text-[11px]" style={{ color: 'var(--muted-foreground)' }}>Ticket type</label><select value={tier.ticket_type} onChange={e => setTiers(t => t.map((x, j) => j === i ? { ...x, ticket_type: e.target.value as 'consumable' | 'non_consumable' } : x))} className="w-full px-3 py-2 rounded-lg text-xs outline-none" style={{ background: 'var(--card)', border: '1px solid var(--border)', color: '#fff' }}><option value="consumable">Consumable</option><option value="non_consumable">Non-consumable</option></select></div>
                  <div><label className="mb-1 block text-[11px]" style={{ color: 'var(--muted-foreground)' }}>Expiry (optional)</label><input type="date" value={tier.expires_at} onChange={e => setTiers(t => t.map((x, j) => j === i ? { ...x, expires_at: e.target.value } : x))} className="w-full px-3 py-2 rounded-lg text-xs outline-none" style={{ background: 'var(--card)', border: '1px solid var(--border)', color: '#fff' }} /></div>
                </div>
                <label className="mt-2 block text-[11px]" style={{ color: 'var(--muted-foreground)' }}>Group size</label>
                <input type="number" min="1" value={tier.group_size} onChange={e => setTiers(t => t.map((x, j) => j === i ? { ...x, group_size: e.target.value } : x))} className="w-full px-3 py-2 rounded-lg text-xs outline-none" style={{ background: 'var(--card)', border: '1px solid var(--border)', color: '#fff' }} />
                <p className="mt-1 text-[10px]" style={{ color: 'var(--muted-foreground)' }}>Number of individual tickets issued per purchase. A group size of 5 means 5 tickets will be sent for one transaction.</p>
              </div>
            ))}
          </div>

          <button onClick={handleSubmit} disabled={saving} className="w-full py-3.5 rounded-xl font-black" style={{ background: 'var(--primary)', color: '#000', opacity: saving ? 0.7 : 1 }}>
            {saving ? (event ? 'Saving...' : 'Creating...') : event ? 'Save event changes' : 'Create Event (Draft)'}
          </button>
        </div>
      </div>
    </div>
  )
}

function CreateRoleModal({ orgId, role, onClose, onCreated }: { orgId: string; role?: OrganizerRole | null; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState(role?.name ?? '')
  const [perms, setPerms] = useState<Record<string, boolean>>({ events: false, orders: false, customers: false, transactions: false, followers: false, calendar: false, checkin: false, analytics: false, members: false, ...(role?.permissions ?? {}) })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = async () => {
    const normalizedName = name.trim()
    if (role?.name.trim().toLowerCase() === 'admin') { setError('The Admin role cannot be edited.'); return }
    if (normalizedName.length < 2) { setError('Role name must be at least 2 characters.'); return }
    if (normalizedName.length > 40) { setError('Role name must be 40 characters or fewer.'); return }
    if (!/^[\p{L}\p{N}][\p{L}\p{N} &'._-]*$/u.test(normalizedName)) { setError('Role name contains unsupported characters.'); return }
    setSaving(true)
    const query = role
      ? supabase.from('organizer_roles').update({ name: normalizedName, permissions: perms }).eq('id', role.id)
      : supabase.from('organizer_roles').insert({ organizer_id: orgId, name: normalizedName, permissions: perms })
    const { error: saveError } = await query
    if (saveError) { setError(saveError.message); setSaving(false); return }
    setSaving(false)
    onCreated()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.8)' }}>
      <div className="dashboard-form-modal w-full max-w-sm rounded-2xl" style={{ background: '#1a1d1d', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="font-black" style={{ fontFamily: 'Outfit, sans-serif' }}>{role ? 'Edit Role' : 'New Role'}</h2>
          <button onClick={onClose} style={{ color: 'var(--muted-foreground)' }}>✕</button>
        </div>
        <div className="p-6 space-y-4">
          {error && <p className="rounded-lg px-3 py-2 text-xs" style={{ background: '#3a1717', color: '#fecaca' }}>{error}</p>}
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted-foreground)' }}>Role name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Scanner, Agent, Manager"
              className="w-full px-4 py-2.5 rounded-xl text-sm outline-none" style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: '#fff' }} />
          </div>
          <div>
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--muted-foreground)' }}>Permissions</p>
            {Object.keys(perms).map(p => (
              <label key={p} className="flex items-center gap-3 py-1.5 cursor-pointer">
                <div onClick={() => setPerms(v => ({ ...v, [p]: !v[p] }))}
                  className="w-4 h-4 rounded flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ background: perms[p] ? 'var(--primary)' : 'var(--border)', color: '#000' }}>
                  {perms[p] ? <CheckIcon size={10} /> : null}
                </div>
                <span className="text-sm capitalize">{p}</span>
              </label>
            ))}
          </div>
          <button onClick={save} disabled={saving || !name.trim() || role?.name.trim().toLowerCase() === 'admin'} className="w-full py-3 rounded-xl font-bold text-sm" style={{ background: 'var(--primary)', color: '#000', opacity: saving || !name.trim() || role?.name.trim().toLowerCase() === 'admin' ? 0.5 : 1 }}>
            {saving ? 'Saving...' : role ? 'Save Role' : 'Create Role'}
          </button>
        </div>
      </div>
    </div>
  )
}

function InviteAgentModal({ orgId, events, onClose, onInvited }: { orgId: string; events: Event[]; onClose: () => void; onInvited: () => void }) {
  const [email, setEmail] = useState('')
  const [eventId, setEventId] = useState(events[0]?.id ?? '')
  const [tierIds, setTierIds] = useState<string[]>([])
  const [commission, setCommission] = useState('7')
  const [ticketLimit, setTicketLimit] = useState('')
  const [salesLimit, setSalesLimit] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const selectedEvent = events.find(event => event.id === eventId)
  const tiers = selectedEvent?.ticket_tiers ?? []
  const toggleTier = (id: string) => setTierIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])
  const invite = async () => {
    setMessage('')
    const normalizedEmail = email.trim().toLowerCase()
    const commissionValue = Number(commission)
    const ticketLimitValue = ticketLimit ? Number(ticketLimit) : null
    const salesLimitValue = salesLimit ? Number(salesLimit) : null
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) { setMessage('Enter a valid agent email.'); return }
    if (!eventId) { setMessage('Select an event.'); return }
    if (!Number.isFinite(commissionValue) || commissionValue < 0 || commissionValue > 100) { setMessage('Commission must be between 0 and 100%.'); return }
    if (ticketLimitValue !== null && (!Number.isInteger(ticketLimitValue) || ticketLimitValue < 0)) { setMessage('Ticket limit must be a whole number.'); return }
    if (salesLimitValue !== null && (!Number.isInteger(salesLimitValue) || salesLimitValue < 0)) { setMessage('Sales limit must be a whole number.'); return }
    setSaving(true)
    const { error } = await supabase.rpc('invite_agent_by_email', {
      p_organizer_id: orgId, p_email: normalizedEmail, p_event_id: eventId, p_ticket_tier_ids: tierIds,
      p_commission_rate: commissionValue, p_ticket_limit: ticketLimitValue,
      p_sales_limit: salesLimitValue, p_message: null,
    })
    if (error) { setMessage(error.message); setSaving(false); return }
    onInvited()
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.8)' }}><div className="w-full max-w-sm rounded-2xl p-6" style={{ background: '#1a1d1d', border: '1px solid var(--border)' }}>
    <div className="flex items-center justify-between"><h2 className="font-black" style={{ fontFamily: 'Outfit, sans-serif' }}>Invite Agent</h2><button onClick={onClose}>✕</button></div>
    <p className="mt-2 text-xs" style={{ color: 'var(--muted-foreground)' }}>The person must already have a Tiketi account.</p>
    <div className="mt-4 space-y-3">
      <input value={email} onChange={event => setEmail(event.target.value)} placeholder="agent@example.com" className="w-full rounded-xl px-4 py-2.5 text-sm" style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: '#fff' }} />
      <select value={eventId} onChange={event => { setEventId(event.target.value); setTierIds([]) }} className="w-full rounded-xl px-4 py-2.5 text-sm" style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: '#fff' }}>{events.map(event => <option key={event.id} value={event.id}>{event.title}</option>)}</select>
      <div><p className="mb-2 text-xs font-semibold" style={{ color: 'var(--muted-foreground)' }}>Ticket types, or all if none selected</p><div className="flex flex-wrap gap-2">{tiers.map(tier => <button key={tier.id} onClick={() => toggleTier(tier.id)} className="rounded-full px-3 py-1.5 text-xs font-bold" style={{ background: tierIds.includes(tier.id) ? 'var(--primary)' : 'var(--muted)', color: tierIds.includes(tier.id) ? '#000' : '#fff' }}>{tier.name}</button>)}</div></div>
      <div className="grid grid-cols-3 gap-2"><input value={commission} onChange={event => setCommission(event.target.value)} type="number" min="0" max="100" placeholder="%" className="rounded-xl px-3 py-2.5 text-sm" style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: '#fff' }} /><input value={ticketLimit} onChange={event => setTicketLimit(event.target.value)} type="number" min="0" placeholder="Ticket limit" className="rounded-xl px-3 py-2.5 text-sm" style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: '#fff' }} /><input value={salesLimit} onChange={event => setSalesLimit(event.target.value)} type="number" min="0" placeholder="Sales limit" className="rounded-xl px-3 py-2.5 text-sm" style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: '#fff' }} /></div>
      {message && <p className="text-xs text-red-400">{message}</p>}<button onClick={() => void invite()} disabled={saving || !email.trim() || !eventId} className="w-full rounded-xl py-3 text-sm font-bold disabled:opacity-50" style={{ background: 'var(--primary)', color: '#000' }}>{saving ? 'Sending...' : 'Send agent invitation'}</button>
    </div>
  </div></div>
}

function EditAgentAssignmentModal({ assignment, events, onClose, onSaved }: { assignment: AgentAssignment; events: Event[]; onClose: () => void; onSaved: () => void }) {
  const [eventId, setEventId] = useState(assignment.event_id)
  const [tierIds, setTierIds] = useState<string[]>(assignment.allow_all_ticket_types ? [] : assignment.ticket_tier_ids)
  const [commission, setCommission] = useState(String(assignment.commission_rate))
  const [ticketLimit, setTicketLimit] = useState(assignment.ticket_limit == null ? '' : String(assignment.ticket_limit))
  const [salesLimit, setSalesLimit] = useState(assignment.sales_limit == null ? '' : String(assignment.sales_limit))
  const [status, setStatus] = useState(assignment.status)
  const [startsAt, setStartsAt] = useState(assignment.starts_at ? assignment.starts_at.slice(0, 16) : '')
  const [endsAt, setEndsAt] = useState(assignment.ends_at ? assignment.ends_at.slice(0, 16) : '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const selectedEvent = events.find(event => event.id === eventId)
  const tiers = selectedEvent?.ticket_tiers ?? []
  const toggleTier = (id: string) => setTierIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])

  const save = async () => {
    setError('')
    const commissionValue = Number(commission)
    const ticketLimitValue = ticketLimit ? Number(ticketLimit) : null
    const salesLimitValue = salesLimit ? Number(salesLimit) : null
    const startDate = startsAt ? new Date(startsAt) : new Date(assignment.starts_at)
    const endDate = endsAt ? new Date(endsAt) : null
    if (!eventId) { setError('Select an event.'); return }
    if (!Number.isFinite(commissionValue) || commissionValue < 0 || commissionValue > 100) { setError('Commission must be between 0 and 100%.'); return }
    if (ticketLimitValue !== null && (!Number.isInteger(ticketLimitValue) || ticketLimitValue < 0)) { setError('Ticket limit must be a whole number.'); return }
    if (salesLimitValue !== null && (!Number.isInteger(salesLimitValue) || salesLimitValue < 0)) { setError('Sales limit must be a whole number.'); return }
    if (!Number.isFinite(startDate.getTime()) || (endDate && !Number.isFinite(endDate.getTime()))) { setError('Enter valid assignment dates.'); return }
    if (endDate && endDate <= startDate) { setError('Assignment end must be after its start.'); return }
    setSaving(true)
    const { error: updateError } = await supabase.from('agent_assignments').update({
      event_id: eventId,
      ticket_tier_ids: tierIds,
      allow_all_ticket_types: tierIds.length === 0,
      commission_rate: commissionValue,
      ticket_limit: ticketLimitValue,
      sales_limit: salesLimitValue,
      status,
      starts_at: startDate.toISOString(),
      ends_at: endDate ? endDate.toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq('id', assignment.id)
    if (updateError) { setError(updateError.message); setSaving(false); return }
    onSaved()
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4" style={{ background: 'rgba(0,0,0,.8)' }}><div className="w-full max-w-lg rounded-2xl p-6" style={{ background: '#1a1d1d', border: '1px solid var(--border)' }}>
    <div className="flex items-center justify-between"><div><h2 className="font-black" style={{ fontFamily: 'Outfit, sans-serif' }}>Edit agent assignment</h2><p className="mt-1 text-xs" style={{ color: 'var(--muted-foreground)' }}>{(assignment as any).profiles?.full_name ?? 'Assigned agent'}</p></div><button onClick={onClose} style={{ color: 'var(--muted-foreground)' }}>✕</button></div>
    <div className="mt-5 space-y-3">
      {error && <p className="rounded-lg px-3 py-2 text-xs" style={{ background: '#3a1717', color: '#fecaca' }}>{error}</p>}
      <select value={eventId} onChange={event => { setEventId(event.target.value); setTierIds([]) }} className="w-full rounded-xl px-4 py-2.5 text-sm" style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: '#fff' }}>{events.map(event => <option key={event.id} value={event.id}>{event.title}</option>)}</select>
      <div><p className="mb-2 text-xs font-semibold" style={{ color: 'var(--muted-foreground)' }}>Ticket types, or all if none selected</p><div className="flex flex-wrap gap-2">{tiers.map(tier => <button key={tier.id} type="button" onClick={() => toggleTier(tier.id)} className="rounded-full px-3 py-1.5 text-xs font-bold" style={{ background: tierIds.includes(tier.id) ? 'var(--primary)' : 'var(--muted)', color: tierIds.includes(tier.id) ? '#000' : '#fff' }}>{tier.name}</button>)}</div></div>
      <div className="grid grid-cols-3 gap-2"><input value={commission} onChange={event => setCommission(event.target.value)} type="number" min="0" max="100" placeholder="Commission %" className="rounded-xl px-3 py-2.5 text-sm" style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: '#fff' }} /><input value={ticketLimit} onChange={event => setTicketLimit(event.target.value)} type="number" min="0" placeholder="Ticket limit" className="rounded-xl px-3 py-2.5 text-sm" style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: '#fff' }} /><input value={salesLimit} onChange={event => setSalesLimit(event.target.value)} type="number" min="0" placeholder="Sales limit" className="rounded-xl px-3 py-2.5 text-sm" style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: '#fff' }} /></div>
      <div className="grid grid-cols-2 gap-2"><label className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Starts<input value={startsAt} onChange={event => setStartsAt(event.target.value)} type="datetime-local" className="mt-1 w-full rounded-xl px-3 py-2.5 text-sm" style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: '#fff' }} /></label><label className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Ends<input value={endsAt} onChange={event => setEndsAt(event.target.value)} type="datetime-local" className="mt-1 w-full rounded-xl px-3 py-2.5 text-sm" style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: '#fff' }} /></label></div>
      <select value={status} onChange={event => setStatus(event.target.value as AgentAssignment['status'])} className="w-full rounded-xl px-4 py-2.5 text-sm capitalize" style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: '#fff' }}>{['active', 'paused', 'pending', 'revoked', 'expired'].map(option => <option key={option} value={option}>{option}</option>)}</select>
      <button type="button" onClick={() => void save()} disabled={saving || !eventId} className="w-full rounded-xl py-3 text-sm font-bold disabled:opacity-50" style={{ background: 'var(--primary)', color: '#000' }}>{saving ? 'Saving...' : 'Save assignment'}</button>
    </div>
  </div></div>
}

function InviteMemberModal({ orgId, onClose, roles, onInvited }: { orgId: string; roles: OrganizerRole[]; onClose: () => void; onInvited: () => void }) {
  const [email, setEmail] = useState('')
  const [roleId, setRoleId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const invite = async () => {
    setError('')
    const normalizedEmail = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) { setError('Enter a valid member email.'); return }
    setSaving(true)
    const { data: profile, error: profileError } = await supabase.from('profiles').select('id').eq('email', normalizedEmail).maybeSingle()
    if (profileError || !profile) {
      setError(profileError?.message ?? 'This email must have a Tiketi account before it can be invited.')
      setSaving(false)
      return
    }
    const { data: existingMember, error: memberLookupError } = await supabase
      .from('organizer_members')
      .select('id, status')
      .eq('organizer_id', orgId)
      .eq('user_id', profile.id)
      .maybeSingle()
    if (memberLookupError) { setError(memberLookupError.message); setSaving(false); return }
    if (existingMember?.status === 'active') { setError('This account is already an active team member.'); setSaving(false); return }
    if (existingMember?.status === 'pending') { setError('This account already has a pending team invitation.'); setSaving(false); return }
    const { error: memberError } = await supabase.from('organizer_members').insert({ organizer_id: orgId, user_id: profile.id, role_id: roleId || null, status: 'pending' })
    if (memberError) { setError(memberError.message); setSaving(false); return }
    onInvited()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.8)' }}>
      <div className="dashboard-form-modal w-full max-w-sm rounded-2xl" style={{ background: '#1a1d1d', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="font-black" style={{ fontFamily: 'Outfit, sans-serif' }}>Invite Member</h2>
          <button onClick={onClose} style={{ color: 'var(--muted-foreground)' }}>✕</button>
        </div>
        <div className="p-6 space-y-4">
          {error && <p className="rounded-lg px-3 py-2 text-xs" style={{ background: '#3a1717', color: '#fecaca' }}>{error}</p>}
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Add an existing Tiketi account to your team, or share the registration link below first.</p>
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="team.member@example.com"
            className="w-full px-4 py-2.5 rounded-xl text-sm outline-none" style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: '#fff' }} />
          {roles.length > 0 && <select value={roleId} onChange={e => setRoleId(e.target.value)} className="w-full px-4 py-2.5 rounded-xl text-sm outline-none" style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: '#fff' }}>
            <option value="">No role</option>
            {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>}
          <button onClick={invite} disabled={saving || !email.trim()} className="w-full py-2.5 rounded-xl text-sm font-bold" style={{ background: 'var(--primary)', color: '#000', opacity: saving || !email.trim() ? 0.5 : 1 }}>{saving ? 'Adding...' : 'Add member'}</button>
          <div className="h-px" style={{ background: 'var(--border)' }} />
          <div className="flex gap-2">
            <input readOnly value={`${window.location.origin}?intent=organizer`}
              className="flex-1 px-4 py-2.5 rounded-xl text-xs outline-none font-mono" style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: '#fff' }} />
            <button onClick={() => navigator.clipboard.writeText(`${window.location.origin}?intent=organizer`)}
              className="px-4 py-2.5 rounded-xl text-xs font-bold" style={{ background: 'var(--primary)', color: '#000' }}>
              Copy
            </button>
          </div>
          {roles.length > 0 && (
            <div>
              <p className="text-xs font-semibold mb-1" style={{ color: 'var(--muted-foreground)' }}>Assign role after they join:</p>
              <div className="flex flex-wrap gap-2">
                {roles.map(r => (
                  <span key={r.id} className="text-xs px-3 py-1 rounded-full" style={{ background: 'rgba(249,112,21,0.12)', color: 'var(--primary)' }}>{r.name}</span>
                ))}
              </div>
            </div>
          )}
          <button onClick={onClose} className="w-full py-3 rounded-xl font-bold text-sm" style={{ background: 'var(--muted)', color: 'rgba(255,255,255,0.7)' }}>Close</button>
        </div>
      </div>
    </div>
  )
}
