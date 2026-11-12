// Organizer operations workspace, including the filterable event-card listing.
import { useState, useEffect, useCallback } from 'react'
import { signOut, supabase } from '../lib/supabase'
import { fetchAllRows } from '../lib/supabasePagination'
import { useAuth } from '../context/AuthContext'
import { formatPrice } from '../data/events'
import { ArrowRightIcon, BarChartIcon, BellIcon, CalendarIcon, ClipboardIcon, UsersIcon, UserIcon, KeyIcon, TagIcon, DollarSignIcon, TicketIcon, TrendingUpIcon, CheckIcon, EyeIcon, EditIcon, TrashIcon, XIcon } from '../components/Icon'
import type { Event, Order, Customer, Transaction, OrganizerWithdrawal, OrganizerMember, OrganizerRole, Subscription, Ticket, AgentAssignment } from '../lib/types'
import { FEATURES } from '../lib/features'
import OrganizerEventViewPage from './OrganizerEventViewPage'
import { sendOrderTicketEmails } from '../lib/ticketEmail'
import { currentLocale, formatLocaleDate } from '../lib/locale'
import StatusBadge from '../components/StatusBadge'
import OrganizerDashboardNav from '../components/OrganizerDashboardNav'
import RichTextEditor, { RichTextContent } from '../components/RichTextEditor'
import { ArrowDownLeft, ArrowUpRight, Bell, CalendarDays, CalendarPlus, ChartNoAxesCombined, ChevronLeft, ChevronRight, CircleDollarSign, ClipboardList, Download, Filter, Heart, LayoutDashboard, MapPin, MoreHorizontal, Plus, ReceiptText, RotateCcw, Search, Settings, Shield, Tag, TicketCheck, UserRound, UsersRound, Wallet, type LucideIcon } from 'lucide-react'

type Section = 'overview' | 'analytics' | 'events' | 'orders' | 'customers' | 'followers' | 'members' | 'settings' | 'subscriptions' | 'transactions' | 'payouts' | 'refunds' | 'notifications'
type AnalyticsRange = 'all' | 'day' | 'week' | 'month' | 'year' | 'custom'
type StatementFilter = 'all' | 'payment' | 'fee' | 'refund' | 'payout'
type TeamTab = 'users' | 'invitations'
type NotificationFilter = 'all' | 'unread' | 'events' | 'sales' | 'followers' | 'team'
type EventsFilter = 'all' | 'active' | 'review' | 'inactive' | 'drafts' | 'past'
type OrganizerNotification = { id: string; type: string; title: string; body: string; created_at: string; read_at: string | null; event_id?: string | null; recipient_scope?: string }
type AgentOrderMeta = { order_id: string; agent_user_id: string; payment_mode: 'digital' | 'cash'; status: string; quantity: number; profiles?: { full_name: string | null; email: string | null } | null }
type RefundRequest = { id: string; order_id: string; ticket_id: string | null; customer_id: string; reason: string; status: 'pending' | 'approved' | 'rejected' | 'processed'; created_at: string; profiles?: { full_name: string | null; email: string | null } | null; events?: { title: string | null } | null }

type Props = { navigate: (p: string, extra?: unknown) => void }

const NAV_ICONS: Record<Section, LucideIcon> = {
  overview: LayoutDashboard,
  analytics: ChartNoAxesCombined,
  events: CalendarDays,
  orders: ClipboardList,
  customers: UsersRound,
  followers: Heart,
  members: UserRound,
  settings: Settings,
  subscriptions: Tag,
  transactions: ReceiptText,
  payouts: Wallet,
  refunds: CircleDollarSign,
  notifications: Bell,
}

const NAV: { key: Section; label: string }[] = [
  { key: 'overview', label: 'Dashboard' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'events', label: 'Events' },
  { key: 'orders', label: 'Orders' },
  { key: 'customers', label: 'Customers' },
  { key: 'followers', label: 'Followers' },
  { key: 'members', label: 'Members' },
  { key: 'settings', label: 'Settings' },
  { key: 'transactions', label: 'Statements' },
  { key: 'payouts', label: 'Wallet' },
  ...(FEATURES.refunds ? [{ key: 'refunds' as Section, label: 'Refund requests' }] : []),
  { key: 'notifications', label: 'Notifications' },
]

const NAV_GROUPS: { label: string; keys: Section[] }[] = [
  { label: 'Main', keys: ['overview', 'analytics'] },
  { label: 'Operations', keys: ['events', 'orders', 'customers', 'followers'] },
  { label: 'Account', keys: ['members', 'settings', 'transactions', 'payouts', 'refunds'] },
]

const SECTION_PATHS: Record<Section, string> = {
  overview: '/dashboard/overview',
  analytics: '/dashboard/analytics',
  events: '/dashboard/events',
  orders: '/dashboard/orders',
  customers: '/dashboard/customers',
  followers: '/dashboard/followers',
  members: '/dashboard/team',
  settings: '/dashboard/settings',
  subscriptions: '/dashboard/subscriptions',
  transactions: '/dashboard/finance/statements',
  payouts: '/dashboard/finance/wallet',
  refunds: '/dashboard/refunds',
  notifications: '/dashboard/notifications',
}

function sectionFromPath(pathname: string): Section {
  const normalizedPath = pathname.split('?')[0].replace(/\/$/, '') || '/'
  const exactMatch = Object.entries(SECTION_PATHS).find(([, path]) => path === normalizedPath)
  if (exactMatch) return exactMatch[0] as Section
  const pathParts = normalizedPath.split('/').filter(Boolean)
  if (pathParts[0] === 'dashboard' && pathParts[1] === 'events') return 'events'
  const slug = pathParts[pathParts.length - 1]
  const legacyFinanceRoutes: Record<string, Section> = { transactions: 'transactions', payouts: 'payouts', roles: 'settings' }
  if (slug && legacyFinanceRoutes[slug]) return legacyFinanceRoutes[slug]
  const match = Object.entries(SECTION_PATHS).find(([, path]) => path.split('/').pop() === slug)
  return (match?.[0] as Section | undefined) ?? 'overview'
}

function eventIdFromPath(pathname: string) {
  const parts = pathname.split('/').filter(Boolean)
  return parts[0] === 'dashboard' && parts[1] === 'events' && parts[2] !== 'new' && parts[3] !== 'edit' ? parts[2] ?? null : null
}

function eventWizardIdFromPath(pathname: string) {
  const parts = pathname.split('/').filter(Boolean)
  if (parts[0] !== 'dashboard' || parts[1] !== 'events') return null
  if (parts[2] === 'new') return 'new'
  return parts[3] === 'edit' ? parts[2] ?? null : null
}

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const STATUS_COLORS: Record<string, string> = {
  published: '#22c55e', draft: '#F0A500', cancelled: '#ef4444', completed: '#888',
  confirmed: '#22c55e', pending: '#F0A500', refunded: '#ef4444',
  active: '#22c55e', inactive: '#888',
  completed_t: '#22c55e', failed: '#ef4444', pending_t: '#F0A500',
  payment: 'var(--primary)', refund: '#ef4444', payout: 'var(--accent)', fee: '#888',
}

const Badge = StatusBadge

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
      <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full overflow-visible" role="img" aria-label="Revenue trend by selected period">
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

function EventPerformanceChart({ events, performance }: { events: Event[]; performance: Map<string, { tickets: number; revenue: number }> }) {
  const eventTitles = new Map(events.map(event => [event.id, event.title]))
  const data = [...performance.entries()].map(([eventId, result]) => ({
    id: eventId,
    title: eventTitles.get(eventId) ?? 'Unknown event',
    revenue: result.revenue,
  })).sort((a, b) => b.revenue - a.revenue).slice(0, 5)
  const max = Math.max(...data.map(event => event.revenue), 1)

  return (
    <div className="space-y-4">
      {data.map(event => (
        <div key={event.id}>
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
  const { user, profile, organizer, organizerOptions, switchOrganizer, teamMembership } = useAuth()
  const [section, setSection] = useState<Section>(() => sectionFromPath(window.location.pathname))
  const [eventViewId, setEventViewId] = useState<string | null>(() => eventIdFromPath(window.location.pathname))
  const [eventWizardId, setEventWizardId] = useState<string | null>(() => eventWizardIdFromPath(window.location.pathname))
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => document.documentElement.dataset.theme === 'light' ? 'light' : 'dark')
  const [overviewCalendarMonth, setOverviewCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [overviewCalendarDate, setOverviewCalendarDate] = useState(() => localDateKey(new Date()))
  const [complianceReminderVisible, setComplianceReminderVisible] = useState(true)

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = nextTheme
    window.localStorage.setItem('qpassa-theme', nextTheme)
    setTheme(nextTheme)
  }

  // Data
  const [events, setEvents] = useState<Event[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [agentOrderMeta, setAgentOrderMeta] = useState<Record<string, AgentOrderMeta>>({})
  const [agentAssignments, setAgentAssignments] = useState<AgentAssignment[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [followers, setFollowers] = useState<Array<{ id: string; user_id: string; created_at: string; profiles?: { full_name: string | null; username: string | null; avatar_url: string | null } | null }>>([])
  const [members, setMembers] = useState<OrganizerMember[]>([])
  const [roles, setRoles] = useState<OrganizerRole[]>([])
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [withdrawals, setWithdrawals] = useState<OrganizerWithdrawal[]>([])
  const [commissions, setCommissions] = useState<Array<{ amount: number; status: string; agent_sales?: { order_id?: string | null } | Array<{ order_id?: string | null }> | null }>>([])
  const [refundRequests, setRefundRequests] = useState<RefundRequest[]>([])
  const [checkinTickets, setCheckinTickets] = useState<Ticket[]>([])
  const [organizerNotifications, setOrganizerNotifications] = useState<OrganizerNotification[]>([])
  const [dataLoading, setDataLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [analyticsRange, setAnalyticsRange] = useState<AnalyticsRange>('year')
  const [analyticsStart, setAnalyticsStart] = useState('')
  const [analyticsEnd, setAnalyticsEnd] = useState('')
  const [analyticsDayInterval, setAnalyticsDayInterval] = useState(2)
  const [analyticsMonthInterval, setAnalyticsMonthInterval] = useState(1)
  const [notificationFilter, setNotificationFilter] = useState<NotificationFilter>('all')
  const [statementFilter, setStatementFilter] = useState<StatementFilter>('all')
  const [statementSearch, setStatementSearch] = useState('')
  const [dashboardSearch, setDashboardSearch] = useState('')
  const [eventsFilter, setEventsFilter] = useState<EventsFilter>('all')
  const [eventsSearch, setEventsSearch] = useState('')
  const [eventsCategory, setEventsCategory] = useState('all')
  const [openEventMenu, setOpenEventMenu] = useState<string | null>(null)
  const [teamTab, setTeamTab] = useState<TeamTab>('users')
  const [teamSearch, setTeamSearch] = useState('')
  const [payoutAmount, setPayoutAmount] = useState('')
  const [payoutMethod, setPayoutMethod] = useState<'mobile_money' | 'bank'>('mobile_money')
  const [payoutReference, setPayoutReference] = useState('')
  const [payoutSubmitting, setPayoutSubmitting] = useState(false)
  const [payoutNotice, setPayoutNotice] = useState('')

  // Modals
  const [showInviteMember, setShowInviteMember] = useState(false)
  const [showInviteAgent, setShowInviteAgent] = useState(false)
  const [actionError, setActionError] = useState('')
  const [dashboardLoadError, setDashboardLoadError] = useState(false)
  const [verificationStatus, setVerificationStatus] = useState<'unverified' | 'pending' | 'verified'>(organizer?.verification_status ?? (organizer?.verified ? 'verified' : 'unverified'))
  const [verificationSubmitting, setVerificationSubmitting] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [editingAgentAssignment, setEditingAgentAssignment] = useState<AgentAssignment | null>(null)

  const orgId = organizer?.id
  const isOwner = !!organizer && organizer.user_id === profile?.id
  const membershipPermissions = (teamMembership?.organizer_roles?.permissions ?? {}) as Record<string, boolean>
  const canAccessSection = (key: Section) => key === 'payouts' ? isOwner : key === 'settings' ? isOwner || membershipPermissions.all === true || membershipPermissions.roles === true : key === 'overview' ? isOwner || membershipPermissions.all === true || membershipPermissions.analytics === true || membershipPermissions.events === true || membershipPermissions.orders === true || membershipPermissions.customers === true : isOwner || membershipPermissions.all === true || membershipPermissions[key] === true || (key === 'events' && (membershipPermissions.checkin === true || membershipPermissions.orders === true))
  const canViewOverviewAnalytics = isOwner || membershipPermissions.all === true || membershipPermissions.analytics === true
  const canViewOverviewOrders = isOwner || membershipPermissions.all === true || membershipPermissions.orders === true
  const canViewOverviewCustomers = isOwner || membershipPermissions.all === true || membershipPermissions.customers === true
  const canViewEvents = isOwner || membershipPermissions.all === true || membershipPermissions.events === true || membershipPermissions.checkin === true || membershipPermissions.orders === true
  const canCheckIn = isOwner || membershipPermissions.all === true || membershipPermissions.checkin === true
  const canRecordTransactions = isOwner || membershipPermissions.all === true || membershipPermissions.orders === true
  const visibleNav = NAV.filter(item => canAccessSection(item.key))

  useEffect(() => {
    const handlePathChange = () => {
      setSection(sectionFromPath(window.location.pathname))
      setEventViewId(eventIdFromPath(window.location.pathname))
      setEventWizardId(eventWizardIdFromPath(window.location.pathname))
    }
    window.addEventListener('popstate', handlePathChange)
    return () => window.removeEventListener('popstate', handlePathChange)
  }, [])

  const selectSection = (nextSection: Section) => {
    if (!canAccessSection(nextSection)) return
    setSection(nextSection)
    setEventViewId(null)
    setEventWizardId(null)
    setSidebarOpen(window.innerWidth >= 768)
    const nextPath = SECTION_PATHS[nextSection]
    if (window.location.pathname !== nextPath) window.history.pushState({}, '', nextPath)
  }

  const openEventView = (event: Event) => {
    if (!canViewEvents) return
    setSection('events')
    setEventViewId(event.id)
    setEventWizardId(null)
    setSidebarOpen(window.innerWidth >= 768)
    const nextPath = `/dashboard/events/${event.id}`
    if (window.location.pathname !== nextPath) window.history.pushState({}, '', nextPath)
  }

  const openCreateEvent = () => {
    setSection('events')
    setEventViewId(null)
    setEventWizardId('new')
    setSidebarOpen(window.innerWidth >= 768)
    if (window.location.pathname !== '/dashboard/events/new') window.history.pushState({}, '', '/dashboard/events/new')
  }

  const openEditEvent = (event: Event) => {
    setSection('events')
    setEventViewId(null)
    setEventWizardId(event.id)
    setSidebarOpen(window.innerWidth >= 768)
    const nextPath = `/dashboard/events/${event.id}/edit`
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
        .eq('organizer_id', orgId)
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
    if (!user?.id || !orgId) return
    const readAt = new Date().toISOString()
    const { error } = await supabase.from('notifications').update({ read_at: readAt })
      .eq('id', notification.id)
      .eq('user_id', user.id)
      .eq('organizer_id', orgId)
      .eq('recipient_scope', 'organizer')
    if (error) { setActionError(error.message); return }
    setOrganizerNotifications(current => current.map(item => item.id === notification.id ? { ...item, read_at: readAt } : item))
    const title = notification.title.toLowerCase()
    if (title.includes('member') || title.includes('role') || title.includes('permission') || title.includes('invite')) selectSection('members')
    else if (title.includes('order') || title.includes('ticket') || title.includes('inventory') || title.includes('sold out')) selectSection('events')
    else if (title.includes('transaction') || title.includes('payment')) selectSection('transactions')
    else if (title.includes('follower')) selectSection('followers')
    else if (title.includes('event')) selectSection('events')
    else selectSection('notifications')
  }

  const markAllOrganizerNotificationsRead = async () => {
    if (!user?.id || !orgId) return
    const readAt = new Date().toISOString()
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: readAt })
      .eq('user_id', user.id)
      .eq('organizer_id', orgId)
      .eq('recipient_scope', 'organizer')
      .is('read_at', null)
    if (error) { setActionError(error.message); return }
    setOrganizerNotifications(current => current.map(notification => ({ ...notification, read_at: notification.read_at ?? readAt })))
  }

  const requestVerification = async () => {
    if (!orgId || !isOwner || verificationStatus !== 'unverified' || verificationSubmitting) return
    setVerificationSubmitting(true)
    setActionError('')
    try {
      const { error } = await supabase.rpc('request_organizer_verification', { p_organizer_id: orgId })
      if (error) throw error
      setVerificationStatus('pending')
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to submit the verification request.')
    } finally {
      setVerificationSubmitting(false)
    }
  }

  const load = useCallback(async () => {
    if (!orgId) return
    setDataLoading(true)
    setDashboardLoadError(false)
    try {
    const [ev, ord, cust, mem, rol, sub, txn, tickets, agentSales, assignments, refunds, payoutRequests, commissionRows] = await Promise.all([
      fetchAllRows((from, to) => supabase.from('events').select('*, tags, ticket_tiers(id, event_id, name, price, description, ticket_type, consumable_amount, extra_info, expires_at, group_size, quantity, sold, created_at)').eq('organizer_id', orgId).order('created_at', { ascending: false }).range(from, to)),
      fetchAllRows((from, to) => supabase.from('orders').select('*, events(title), profiles(full_name, email)').eq('organizer_id', orgId).order('created_at', { ascending: false }).range(from, to)),
      fetchAllRows((from, to) => supabase.from('customers').select('*').eq('organizer_id', orgId).order('total_spent', { ascending: false }).range(from, to)),
      supabase.from('organizer_members').select('*, profiles(full_name, email, username, profile_image, avatar_url), organizer_roles(name)').eq('organizer_id', orgId),
      supabase.from('organizer_roles').select('*').eq('organizer_id', orgId),
      supabase.from('subscriptions').select('*').eq('organizer_id', orgId).order('created_at', { ascending: false }),
      fetchAllRows((from, to) => supabase.from('transactions').select('*, orders(id)').eq('organizer_id', orgId).order('created_at', { ascending: false }).range(from, to)),
      fetchAllRows((from, to) => supabase.from('tickets').select('*, events(id, title, organizer_id)').eq('events.organizer_id', orgId).order('checked_in_at', { ascending: false }).range(from, to)),
      fetchAllRows((from, to) => supabase.from('agent_sales').select('order_id, agent_user_id, payment_mode, status, quantity, profiles(full_name, email)').eq('organizer_id', orgId).order('created_at', { ascending: false }).range(from, to)),
      supabase.from('agent_assignments').select('*, events(*, ticket_tiers(*)), profiles(full_name, email)').eq('organizer_id', orgId).order('created_at', { ascending: false }),
      fetchAllRows((from, to) => supabase.from('refund_requests').select('*, profiles!customer_id(full_name, email), events(title)').eq('organizer_id', orgId).order('created_at', { ascending: false }).range(from, to)),
      fetchAllRows((from, to) => supabase.from('organizer_withdrawals').select('*').eq('organizer_id', orgId).order('requested_at', { ascending: false }).range(from, to)),
      fetchAllRows((from, to) => supabase.from('commissions').select('amount, status, agent_sales(order_id)').eq('organizer_id', orgId).range(from, to)),
    ])
    const failedQueries = [
      ['team', mem.error], ['roles', rol.error],
      ['subscriptions', sub.error],
      ['assignments', assignments.error],
    ].filter(([, error]) => error).map(([name, error]) => `${name}: ${(error as { message: string }).message}`)
    if (failedQueries.length) {
      setDashboardLoadError(true)
      setActionError(`Some dashboard data could not be loaded. ${failedQueries.join(' | ')}`)
    }
    const loadedOrders = ord as Order[]
    const orderIds = loadedOrders.map(order => order.id)
    const orderItemPages = await Promise.all(Array.from({ length: Math.ceil(orderIds.length / 250) }, (_, index) => {
      const orderIdPage = orderIds.slice(index * 250, (index + 1) * 250)
      return fetchAllRows((from, to) => supabase.from('order_items').select('id, order_id, ticket_tier_id, quantity, unit_price, total_price').in('order_id', orderIdPage).range(from, to))
    }))
    const itemsByOrder = new Map<string, NonNullable<Order['order_items']>>()
    orderItemPages.flat().forEach(item => {
      const items = itemsByOrder.get(item.order_id) ?? []
      items.push(item)
      itemsByOrder.set(item.order_id, items)
    })
    setEvents(ev as Event[])
    setOrders(loadedOrders.map(order => ({ ...order, order_items: itemsByOrder.get(order.id) ?? [] })))
    setAgentOrderMeta(Object.fromEntries((agentSales as AgentOrderMeta[]).map(item => [item.order_id, item])))
    setAgentAssignments((assignments.data ?? []) as AgentAssignment[])
    setCustomers(cust as Customer[])
    setMembers(mem.data ?? [])
    setRoles(rol.data ?? [])
    setSubscriptions(sub.data ?? [])
    setTransactions(txn as Transaction[])
    setWithdrawals(payoutRequests as OrganizerWithdrawal[])
    setCommissions(commissionRows as typeof commissions)
    setRefundRequests(refunds as RefundRequest[])
    setCheckinTickets(tickets as Ticket[])
    setLastUpdated(new Date())
    setDataLoading(false)
    } catch (error) {
      setActionError(`Analytics data could not be loaded: ${error instanceof Error ? error.message : 'Unknown error'}`)
      setDashboardLoadError(true)
      setDataLoading(false)
    }
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'organizer_withdrawals' }, () => { void load() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commissions' }, () => { void load() })
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

  // Keep server-defined event states compatible with the organizer event filters.
  const rangeEnd = new Date()
  const rangeStart = new Date(rangeEnd)
  if (analyticsRange === 'all') {
    const firstOrderDate = orders.reduce((earliest, order) => {
      const createdAt = new Date(order.created_at)
      return Number.isFinite(createdAt.getTime()) && createdAt < earliest ? createdAt : earliest
    }, new Date(rangeEnd))
    rangeStart.setTime(firstOrderDate.getTime())
    rangeStart.setHours(0, 0, 0, 0)
    rangeStart.setDate(1)
    rangeEnd.setTime(Date.now())
  } else if (analyticsRange === 'day') {
    rangeStart.setHours(0, 0, 0, 0)
    rangeEnd.setHours(23, 59, 59, 999)
  } else if (analyticsRange === 'week') {
    const daysFromMonday = (rangeEnd.getDay() + 6) % 7
    rangeStart.setDate(rangeEnd.getDate() - daysFromMonday)
    rangeStart.setHours(0, 0, 0, 0)
    rangeEnd.setTime(Date.now())
  } else if (analyticsRange === 'month') {
    rangeStart.setDate(1)
    rangeStart.setHours(0, 0, 0, 0)
    rangeEnd.setMonth(rangeEnd.getMonth() + 1, 0)
    rangeEnd.setHours(23, 59, 59, 999)
  } else if (analyticsRange === 'year') {
    rangeStart.setMonth(0, 1)
    rangeStart.setHours(0, 0, 0, 0)
    rangeEnd.setTime(Date.now())
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
  const orderStatusCounts = orders.reduce((counts, order) => {
    counts[order.status] += 1
    return counts
  }, { confirmed: 0, pending: 0, cancelled: 0, refunded: 0 })

  // Keep every KPI on the same confirmed, net-sales basis as the revenue chart.
  const confirmedOrders = filteredOrders.filter(order => order.status === 'confirmed')
  const confirmedOrderIds = new Set(confirmedOrders.map(order => order.id))
  const processedRefundAmountByOrder = new Map<string, number>()
  const processedRefundTicketIds = new Set<string>()
  const processedRefundTicketsByEvent = new Map<string, number>()
  refundRequests.filter(request => request.status === 'processed').forEach(request => {
    if (!confirmedOrderIds.has(request.order_id)) return
    const ticket = checkinTickets.find(item => item.id === request.ticket_id)
    if (request.ticket_id && !processedRefundTicketIds.has(request.ticket_id)) {
      processedRefundTicketIds.add(request.ticket_id)
      if (ticket) processedRefundTicketsByEvent.set(ticket.event_id, (processedRefundTicketsByEvent.get(ticket.event_id) ?? 0) + 1)
    }
    const order = orders.find(item => item.id === request.order_id)
    const orderItem = order?.order_items?.find(item => item.ticket_tier_id === ticket?.ticket_tier_id)
    if (orderItem) {
      const quantity = Math.max(1, Number(orderItem.quantity) || 1)
      const ticketValue = Number(orderItem.total_price) || Number(orderItem.unit_price) * quantity
      const perTicketAmount = Math.round(ticketValue / quantity)
      processedRefundAmountByOrder.set(request.order_id, (processedRefundAmountByOrder.get(request.order_id) ?? 0) + perTicketAmount)
    }
  })
  const commissionAmountByOrder = new Map<string, number>()
  commissions.filter(commission => commission.status !== 'reversed').forEach(commission => {
    const sale = Array.isArray(commission.agent_sales) ? commission.agent_sales[0] : commission.agent_sales
    if (sale?.order_id) commissionAmountByOrder.set(sale.order_id, (commissionAmountByOrder.get(sale.order_id) ?? 0) + (Number(commission.amount) || 0))
  })
  // Order total can include a customer-facing fee on older checkout flows.
  // Organizer proceeds are based on ticket subtotal, less the fee and the
  // commission amount actually recorded for that sale (not today's rates).
  const ticketSubtotalForOrder = (order: Order) => Number(order.subtotal)
    || (order.order_items ?? []).reduce((sum, item) => sum + (Number(item.total_price) || 0), 0)
  const serviceFeeForOrder = (order: Order) => Math.max(0, Number(order.service_fee) || 0)
  const agentCommissionForOrder = (order: Order) => commissionAmountByOrder.get(order.id) ?? 0
  const revenueForOrder = (order: Order) => Math.max(0, ticketSubtotalForOrder(order) - serviceFeeForOrder(order) - agentCommissionForOrder(order) - (processedRefundAmountByOrder.get(order.id) ?? 0))
  const totalRevenue = confirmedOrders.reduce((sum, order) => sum + revenueForOrder(order), 0)
  const totalPlatformCommission = confirmedOrders.reduce((sum, order) => sum + serviceFeeForOrder(order), 0)
  const totalAgentCommission = confirmedOrders.reduce((sum, order) => sum + agentCommissionForOrder(order), 0)
  const totalProcessedRefunds = [...processedRefundAmountByOrder.values()].reduce((sum, amount) => sum + amount, 0)
  const netRevenueByOrder = Object.fromEntries(confirmedOrders.map(order => [order.id, revenueForOrder(order)]))
  const totalTicketsSold = Math.max(0, confirmedOrders.reduce((total, order) => total + (order.order_items?.reduce((sum, item) => sum + item.quantity, 0) ?? 0), 0) - processedRefundTicketIds.size)
  const publishedEvents = events.filter(e => e.status === 'published').length
  const avgOrderValue = confirmedOrders.length ? Math.round(totalRevenue / confirmedOrders.length) : 0
  const eventAnalytics = new Map<string, { tickets: number; revenue: number }>()
  confirmedOrders.forEach(order => {
    const current = eventAnalytics.get(order.event_id) ?? { tickets: 0, revenue: 0 }
    current.tickets += order.order_items?.reduce((sum, item) => sum + item.quantity, 0) ?? 0
    current.revenue += revenueForOrder(order)
    eventAnalytics.set(order.event_id, current)
  })
  processedRefundTicketsByEvent.forEach((count, eventId) => {
    const performance = eventAnalytics.get(eventId)
    if (performance) performance.tickets = Math.max(0, performance.tickets - count)
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
          day: `${bucketFrom.toLocaleTimeString(currentLocale(), { hour: 'numeric', minute: '2-digit' })} - ${bucketTo.toLocaleTimeString(currentLocale(), { hour: 'numeric', minute: '2-digit' })}`,
          revenue: bucketOrders.filter(order => order.status === 'confirmed').reduce((sum, order) => sum + revenueForOrder(order), 0),
          count: bucketOrders.filter(order => order.status === 'confirmed').length,
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
          day: `${bucketFrom.toLocaleDateString(currentLocale(), { month: 'short', day: 'numeric' })} - ${new Date(bucketTo.getTime() - 1).toLocaleDateString(currentLocale(), { month: 'short', day: 'numeric' })}`,
          revenue: bucketOrders.filter(order => order.status === 'confirmed').reduce((sum, order) => sum + revenueForOrder(order), 0),
          count: bucketOrders.filter(order => order.status === 'confirmed').length,
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
            day: bucketFrom.toLocaleDateString(currentLocale(), { weekday: 'short' }),
            revenue: bucketOrders.filter(order => order.status === 'confirmed').reduce((sum, order) => sum + revenueForOrder(order), 0),
            count: bucketOrders.filter(order => order.status === 'confirmed').length,
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
            revenue: bucketOrders.filter(order => order.status === 'confirmed').reduce((sum, order) => sum + revenueForOrder(order), 0),
            count: bucketOrders.filter(order => order.status === 'confirmed').length,
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
          day: bucketFrom.toLocaleDateString(currentLocale(), { month: 'short', year: 'numeric' }),
          revenue: bucketOrders.filter(order => order.status === 'confirmed').reduce((sum, order) => sum + revenueForOrder(order), 0),
          count: bucketOrders.filter(order => order.status === 'confirmed').length,
        }
      })
    }

    const bucketCount = analyticsRange === 'week'
      ? 7
      : analyticsRange === 'all'
        ? Math.max(1, (rangeEnd.getFullYear() - rangeStart.getFullYear()) * 12 + rangeEnd.getMonth() - rangeStart.getMonth() + 1)
        : 12
    return Array.from({ length: bucketCount }, (_, index) => {
      const bucket = new Date(rangeStart)
      if (analyticsRange === 'week') bucket.setDate(rangeStart.getDate() + index)
      else {
        bucket.setDate(1)
        bucket.setMonth(rangeStart.getMonth() + index)
      }
      const nextBucket = new Date(bucket)
      if (analyticsRange === 'week') nextBucket.setDate(bucket.getDate() + 1)
      else nextBucket.setMonth(bucket.getMonth() + 1)
      const bucketOrders = filteredOrders.filter(order => { const time = new Date(order.created_at); return time >= bucket && time < nextBucket })
      return {
        day: analyticsRange === 'week'
          ? bucket.toLocaleDateString(currentLocale(), { weekday: 'long' })
          : analyticsRange === 'all' && rangeStart.getFullYear() !== rangeEnd.getFullYear()
            ? bucket.toLocaleDateString(currentLocale(), { month: 'short', year: 'numeric' })
            : bucket.toLocaleDateString(currentLocale(), { month: 'long' }),
        revenue: bucketOrders.filter(order => order.status === 'confirmed').reduce((sum, order) => sum + revenueForOrder(order), 0),
        count: bucketOrders.filter(order => order.status === 'confirmed').length,
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
    if (!isOwner) { setActionError('Only the organizer owner can assign team roles.'); return }
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

  const availablePayoutBalance = Math.max(0, transactions.reduce((balance, transaction) => {
    if (transaction.type === 'payment' && transaction.status === 'completed') return balance + transaction.amount
    if ((transaction.type === 'fee' || transaction.type === 'refund') && transaction.status === 'completed') return balance - transaction.amount
    if (transaction.type === 'payout' && (transaction.status === 'pending' || transaction.status === 'completed')) return balance - transaction.amount
    return balance
  }, 0) - commissions.filter(commission => ['pending', 'available', 'paid'].includes(commission.status)).reduce((sum, commission) => sum + commission.amount, 0))

  const walletEventBreakdown = events.map(event => {
    const eventOrders = orders.filter(order => order.event_id === event.id && order.status === 'confirmed')
    const orderIds = new Set(eventOrders.map(order => order.id))
    const gross = eventOrders.reduce((sum, order) => sum + ticketSubtotalForOrder(order), 0)
    const fees = eventOrders.reduce((sum, order) => sum + serviceFeeForOrder(order), 0)
    const agentFees = eventOrders.reduce((sum, order) => sum + agentCommissionForOrder(order), 0)
    const refunds = transactions.filter(transaction => transaction.type === 'refund' && transaction.status === 'completed' && transaction.order_id && orderIds.has(transaction.order_id)).reduce((sum, transaction) => sum + transaction.amount, 0)
    return { id: event.id, title: event.title, orders: eventOrders.length, gross, fees, agentFees, refunds, net: Math.max(0, gross - fees - agentFees - refunds) }
  }).filter(event => event.orders > 0).sort((a, b) => b.net - a.net)

  const filteredStatementTransactions = transactions.filter(transaction => {
    const matchesType = statementFilter === 'all' || transaction.type === statementFilter
    const order = transaction.order_id ? orders.find(item => item.id === transaction.order_id) : null
    const searchText = `${transaction.id} ${transaction.type} ${transaction.status} ${transaction.reference ?? ''} ${transaction.currency} ${order?.events?.title ?? ''}`.toLowerCase()
    return matchesType && (!statementSearch.trim() || searchText.includes(statementSearch.trim().toLowerCase()))
  })

  const exportStatements = () => {
    const rows = filteredStatementTransactions.map(transaction => [
      transaction.created_at,
      transaction.type,
      transaction.reference ?? transaction.id,
      transaction.orders?.events?.title ?? orders.find(order => order.id === transaction.order_id)?.events?.title ?? '',
      transaction.amount,
      transaction.currency,
      transaction.status,
    ])
    const csv = [['Date', 'Type', 'Reference', 'Event', 'Amount', 'Currency', 'Status'], ...rows].map(row => row.map(value => {
      const text = String(value)
      const safeText = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
      return `"${safeText.replace(/"/g, '""')}"`
    }).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `qpassa-statements-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const submitPayoutRequest = async () => {
    setPayoutNotice('')
    setActionError('')
    const amount = Number(payoutAmount)
    if (!Number.isInteger(amount) || amount <= 0) { setActionError('Enter a whole-number payout amount greater than zero.'); return }
    if (!payoutReference.trim()) { setActionError('Enter the Mobile Money phone number or bank account reference.'); return }
    if (amount > availablePayoutBalance) { setActionError(`Amount exceeds your available balance of ${formatPrice(availablePayoutBalance)}.`); return }
    setActionError('')
    setPayoutSubmitting(true)
    const { error } = await supabase.rpc('request_organizer_withdrawal', {
      p_amount: amount,
      p_payment_method: payoutMethod,
      p_payment_reference: payoutReference.trim(),
    })
    setPayoutSubmitting(false)
    if (error) { setActionError(error.message); return }
    setPayoutAmount('')
    setActionError('')
    setPayoutNotice('Payout request submitted. It will appear below while the platform team processes the transfer.')
    await load()
  }

  const cancelPayoutRequest = async (withdrawal: OrganizerWithdrawal) => {
    if (withdrawal.status !== 'requested') return
    setActionError('')
    const { error } = await supabase.rpc('cancel_organizer_withdrawal', { p_withdrawal_id: withdrawal.id })
    if (error) { setActionError(error.message); return }
    await load()
  }

  const confirmAgentOrder = async (order: Order) => {
    setActionError('')
    const { error } = await supabase.rpc('confirm_agent_cash_sale', { p_order_id: order.id })
    if (error) { setActionError(error.message); return }
    const emailDelivery = await sendOrderTicketEmails(order.id)
    if (emailDelivery.failedCount) {
      setActionError(`Sale confirmed, but ${emailDelivery.sentCount} of ${emailDelivery.total} ticket emails were sent. ${emailDelivery.reason ?? ''}`)
    }
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
  const overviewCalendarYear = overviewCalendarMonth.getFullYear()
  const overviewCalendarMonthIndex = overviewCalendarMonth.getMonth()
  const overviewCalendarDays = new Date(overviewCalendarYear, overviewCalendarMonthIndex + 1, 0).getDate()
  const overviewCalendarOffset = (new Date(overviewCalendarYear, overviewCalendarMonthIndex, 1).getDay() + 6) % 7
  const overviewCalendarCells = Array.from({ length: 42 }, (_, index) => {
    const day = index - overviewCalendarOffset + 1
    if (day < 1) {
      const previousMonthDay = new Date(overviewCalendarYear, overviewCalendarMonthIndex, 0).getDate() + day
      return { day: previousMonthDay, date: new Date(overviewCalendarYear, overviewCalendarMonthIndex - 1, previousMonthDay), inMonth: false }
    }
    if (day > overviewCalendarDays) {
      return { day: day - overviewCalendarDays, date: new Date(overviewCalendarYear, overviewCalendarMonthIndex + 1, day - overviewCalendarDays), inMonth: false }
    }
    return { day, date: new Date(overviewCalendarYear, overviewCalendarMonthIndex, day), inMonth: true }
  })
  const overviewCalendarEventDays = new Set(events.map(event => event.date.slice(0, 10)))
  const overviewCalendarUpcomingEvents = events
    .filter(event => event.status === 'published' && event.date.slice(0, 10) >= localDateKey(new Date()))
    .sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime())
  const nextPublishedEvent = events
    .filter(event => event.status === 'published')
    .sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime())[0]
  const getEventListStatus = (event: Event): Exclude<EventsFilter, 'all'> => {
    const status = String(event.status)
    if (status === 'draft') return 'drafts'
    if (status === 'in_review' || status === 'review') return 'review'
    if (status === 'cancelled' || status === 'inactive') return 'inactive'
    if (status === 'completed') return 'past'
    if (status === 'published') {
      const eventEnd = new Date(`${event.end_date || event.date}T${event.end_time || event.time || '23:59'}`).getTime()
      return Number.isFinite(eventEnd) && eventEnd < Date.now() ? 'past' : 'active'
    }
    return 'inactive'
  }
  const eventFilterTabs: { key: EventsFilter; label: string }[] = [
    { key: 'all', label: 'All events' }, { key: 'active', label: 'Active' }, { key: 'review', label: 'In review' },
    { key: 'inactive', label: 'Inactive' }, { key: 'drafts', label: 'Drafts' }, { key: 'past', label: 'Past' },
  ]
  const eventCategories = [...new Set(events.map(event => event.category).filter(Boolean))].sort()
  const filteredEvents = events.filter(event => {
    const query = eventsSearch.trim().toLowerCase() || dashboardSearch.trim().toLowerCase()
    const matchesSearch = !query || `${event.title} ${event.venue} ${event.category}`.toLowerCase().includes(query)
    const matchesStatus = eventsFilter === 'all' || getEventListStatus(event) === eventsFilter
    const matchesCategory = eventsCategory === 'all' || event.category === eventsCategory
    return matchesSearch && matchesStatus && matchesCategory
  })
  const overviewTicketsRemaining = events.reduce((total, event) => total + Math.max(0, event.capacity - (event.ticket_tiers?.reduce((sold, tier) => sold + tier.sold, 0) ?? 0)), 0)
  const runDashboardSearch = () => {
    if (!dashboardSearch.trim()) return
    selectSection('events')
  }

  return (
    <div className="organizer-dashboard-shell flex min-h-screen" style={{ background: 'linear-gradient(135deg, #0b0c0c 0%, #11100e 48%, #0b0c0c 100%)', color: 'var(--foreground)' }}>
      {selectedOrder && (() => {
        const agentSale = agentOrderMeta[selectedOrder.id]
        const customerName = (selectedOrder as any).holder_name ?? (selectedOrder as any).profiles?.full_name ?? 'Customer'
        const customerEmail = (selectedOrder as any).holder_email ?? (selectedOrder as any).profiles?.email ?? 'No email'
        const isAwaitingAgentCash = selectedOrder.status === 'pending' && agentSale?.payment_mode === 'cash' && agentSale.status === 'awaiting_payment'
        return (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4" onClick={() => setSelectedOrder(null)}>
            <div className="organizer-modal w-full max-w-lg rounded-2xl border p-5" style={{ background: 'var(--card)', borderColor: 'var(--border)' }} onClick={event => event.stopPropagation()}>
              <div className="flex items-start justify-between gap-4 border-b pb-4" style={{ borderColor: 'var(--border)' }}>
                <div><p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--primary)' }}>Order details</p><h2 className="mt-1 text-xl font-black">{selectedOrder.id.slice(0, 8)}…</h2></div>
                <button onClick={() => setSelectedOrder(null)} className="text-xl" style={{ color: 'var(--muted-foreground)' }}>×</button>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Customer</p><p className="mt-1 font-bold">{customerName}</p><p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{customerEmail}</p></div>
                <div><p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Event</p><p className="mt-1 font-bold">{(selectedOrder as any).events?.title ?? 'Event'}</p></div>
                <div><p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Source</p><p className="mt-1 font-bold">{agentSale ? `Agent · ${agentSale.profiles?.full_name ?? 'Sales agent'}` : 'Customer checkout'}</p></div>
                <div><p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Payment</p><p className="mt-1 font-bold capitalize">{agentSale?.payment_mode ?? selectedOrder.payment_method?.replace('_', ' ') ?? 'Pending'}</p></div>
                <div><p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Total</p><p className="mt-1 font-bold" style={{ color: 'var(--primary)' }}>{formatPrice(selectedOrder.total)}</p></div>
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
      {actionError && (
        <div className={`organizer-dashboard-alert fixed top-4 right-4 z-[70] max-w-sm rounded-xl px-4 py-3 text-left text-xs font-semibold shadow-2xl ${actionError.startsWith('Payout request submitted') ? 'is-success' : 'is-error'}`} role={actionError.startsWith('Payout request submitted') ? 'status' : 'alert'}>
          <p>{actionError}</p>
          <div className="mt-3 flex items-center gap-3">
            {dashboardLoadError && <button onClick={() => void load()} className="rounded-lg px-3 py-1.5 font-bold" style={{ background: 'var(--primary)', color: '#000' }}>Retry dashboard</button>}
            <button onClick={() => { setActionError(''); setDashboardLoadError(false) }} className="font-semibold" style={{ color: actionError.startsWith('Payout request submitted') ? '#bbf7d0' : '#fecaca' }}>Dismiss</button>
          </div>
        </div>
      )}
      {teamMembership?.status === 'pending' && (
        <div className="organizer-dashboard-alert is-info fixed left-1/2 top-4 z-[70] flex w-[min(92vw,34rem)] -translate-x-1/2 items-center justify-between gap-4 rounded-xl px-4 py-3 text-xs">
          <span>You have been invited to join {organizer.name}.</span>
          <button onClick={acceptMembership} className="shrink-0 rounded-lg px-3 py-1.5 font-bold" style={{ background: 'var(--primary)', color: '#000' }}>Accept invite</button>
        </div>
      )}

      <OrganizerDashboardNav
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(value => !value)}
        currentSection={section}
        navItems={visibleNav}
        navGroups={NAV_GROUPS}
        navIcons={NAV_ICONS}
        sectionPaths={SECTION_PATHS}
        onSelectSection={key => selectSection(key as Section)}
        organizationName={organizer.name}
        organizationRole={isOwner ? 'Owner' : teamMembership?.organizer_roles?.name ?? 'Team member'}
        organizerOptions={organizerOptions}
        activeOrganizerId={organizer.id}
        onSwitchOrganizer={switchOrganizer}
        fullName={profile?.full_name?.trim() || organizer.name}
        email={profile?.email || user?.email || ''}
        avatarUrl={profile?.profile_image || profile?.avatar_url || null}
        theme={theme}
        onToggleTheme={toggleTheme}
        searchValue={dashboardSearch}
        onSearchChange={setDashboardSearch}
        onSearch={runDashboardSearch}
        canCreateEvent={canAccessSection('events')}
        onCreateEvent={openCreateEvent}
        notifications={organizerNotifications}
        onOpenNotification={notification => { void openOrganizerNotification(notification) }}
        onViewNotifications={() => selectSection('notifications')}
        onNavigate={(page, extra) => navigate(page, extra ?? (page === 'organizer-profile' ? organizer : undefined))}
        onSignOut={handleSignOut}
      />

      <div className={`organizer-dashboard-main flex min-w-0 flex-1 flex-col ${sidebarOpen ? 'organizer-sidebar-is-open' : ''}`}>
        {/* Main */}
        <main className="flex-1 min-w-0 flex flex-col">
        {/* Content */}
        <div className="flex-1 overflow-auto px-4 pb-4 pt-3">
          {complianceReminderVisible && <aside className="organizer-compliance-alert mb-5" aria-label="Compliance reminder">
            <div className="organizer-compliance-alert-content">
              <span className="organizer-compliance-alert-icon"><Shield size={16} strokeWidth={1.8} /></span>
              <div className="organizer-compliance-alert-copy">
                <p className="organizer-compliance-alert-kicker">Compliance reminder</p>
                <p className="organizer-compliance-alert-title">Keep event information accurate, refund policies transparent, and contact details up to date.</p>
                <p className="organizer-compliance-alert-description">Review your listings before every event to reduce disputes and maintain customer trust.</p>
              </div>
              <button type="button" className="organizer-compliance-alert-close" aria-label="Dismiss compliance reminder" title="Dismiss reminder" onClick={() => setComplianceReminderVisible(false)}><XIcon size={15} /></button>
            </div>
          </aside>}

          {section === 'overview' && <section className="organizer-overview-page space-y-7">
            <div className="organizer-overview-stat-grid">
              <article className="organizer-overview-stat"><span className="organizer-overview-stat-icon"><TicketCheck size={17} strokeWidth={1.8} /></span><small>Tickets sold</small><strong>{canViewOverviewAnalytics ? totalTicketsSold.toLocaleString() : '—'}</strong><span>{canViewOverviewAnalytics ? `${overviewTicketsRemaining.toLocaleString()} still available` : 'Analytics access required'}</span></article>
              <article className="organizer-overview-stat"><span className="organizer-overview-stat-icon"><CalendarDays size={17} strokeWidth={1.8} /></span><small>Published events</small><strong>{canViewEvents ? publishedEvents : '—'}</strong><span>{canViewEvents ? `${events.length} total in your workspace` : 'Event access required'}</span></article>
              <article className="organizer-overview-stat"><span className="organizer-overview-stat-icon"><CircleDollarSign size={17} strokeWidth={1.8} /></span><small>Net ticket revenue</small><strong>{canViewOverviewAnalytics || canAccessSection('transactions') ? formatPrice(totalRevenue) : '—'}</strong><span>{canViewOverviewAnalytics || canAccessSection('transactions') ? 'From confirmed ticket orders' : 'Finance access required'}</span></article>
              <article className="organizer-overview-stat"><span className="organizer-overview-stat-icon"><UsersRound size={17} strokeWidth={1.8} /></span><small>Customers</small><strong>{canViewOverviewCustomers ? customers.length.toLocaleString() : '—'}</strong><span>{canViewOverviewCustomers ? `${orders.length.toLocaleString()} orders recorded` : 'Customer access required'}</span></article>
            </div>

            <div className="organizer-overview-feature-grid">
              <div className="organizer-overview-feature-left">
              <button type="button" className="organizer-overview-featured-event" onClick={() => nextPublishedEvent ? openEventView(nextPublishedEvent) : openCreateEvent()}>
                <span className="organizer-overview-event-art">
                  {nextPublishedEvent?.cover_image ? <img src={nextPublishedEvent.cover_image} alt="" /> : <span className="organizer-overview-art-mark"><TicketCheck size={38} strokeWidth={1.5} /></span>}
                </span>
                <span className="organizer-overview-event-copy">
                  <span className="organizer-overview-card-kicker"><span className="organizer-live-dot" /> {nextPublishedEvent ? 'UP NEXT · PUBLISHED EVENT' : 'YOUR EVENT WORKSPACE'}</span>
                  <strong>{nextPublishedEvent?.title ?? 'Your next big moment starts here'}</strong>
                  <span>{nextPublishedEvent ? `${new Date(nextPublishedEvent.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${nextPublishedEvent.venue}` : 'Build an event page and start selling tickets.'}</span>
                  <span className="organizer-overview-progress"><i style={{ width: `${nextPublishedEvent?.capacity ? `${Math.min(100, Math.round(((nextPublishedEvent.ticket_tiers?.reduce((sold, tier) => sold + tier.sold, 0) ?? 0) / nextPublishedEvent.capacity) * 100))}%` : '0%'}` }} /></span>
                  <span className="organizer-overview-event-action">{nextPublishedEvent ? 'Open event' : 'Create your first event'} <ArrowUpRight size={16} /></span>
                </span>
              </button>

              <section className="organizer-overview-quick-actions" aria-label="Quick actions">
                <div className="organizer-overview-quick-heading"><p className="organizer-overview-card-kicker">QUICK ACTIONS</p><span>Jump back into your workflow</span></div>
                <div className="organizer-overview-quick-grid">
                  {canAccessSection('events') && <button type="button" onClick={openCreateEvent}>
                    <span className="organizer-overview-quick-icon"><CalendarPlus size={17} /></span>
                    <span><strong>Create an event</strong><small>Set up your next experience</small></span>
                    <ArrowUpRight size={16} />
                  </button>}
                  {canAccessSection('events') && <button type="button" onClick={() => selectSection('events')}>
                    <span className="organizer-overview-quick-icon"><CalendarDays size={17} /></span>
                    <span><strong>Manage events</strong><small>Update listings and tickets</small></span>
                    <ArrowUpRight size={16} />
                  </button>}
                  {canAccessSection('orders') && <button type="button" onClick={() => selectSection('orders')}>
                    <span className="organizer-overview-quick-icon"><ClipboardList size={17} /></span>
                    <span><strong>Review orders</strong><small>Check recent ticket sales</small></span>
                    <ArrowUpRight size={16} />
                  </button>}
                  {canViewOverviewAnalytics && <button type="button" onClick={() => selectSection('analytics')}>
                    <span className="organizer-overview-quick-icon"><ChartNoAxesCombined size={17} /></span>
                    <span><strong>View analytics</strong><small>Track revenue and attendance</small></span>
                    <ArrowUpRight size={16} />
                  </button>}
                </div>
              </section>
              </div>

              <div className="organizer-overview-calendar-column">
              <section className="organizer-overview-calendar" aria-label="Event calendar">
                <div className="organizer-overview-calendar-heading">
                  <button type="button" aria-label="Previous month" onClick={() => setOverviewCalendarMonth(month => new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={17} /></button>
                  <h3>{overviewCalendarMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h3>
                  <button type="button" aria-label="Next month" onClick={() => setOverviewCalendarMonth(month => new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={17} /></button>
                </div>
                <div className="organizer-overview-calendar-grid" role="grid" aria-label={overviewCalendarMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}>
                  {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((day, index) => <span className="organizer-overview-calendar-weekday" key={`${day}-${index}`} role="columnheader">{day}</span>)}
                  {overviewCalendarCells.map(({ day, date, inMonth }) => {
                    const dateKey = localDateKey(date)
                    const hasEvents = overviewCalendarEventDays.has(dateKey)
                    return <button key={dateKey} type="button" role="gridcell" aria-label={`${date.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}${hasEvents ? ', events scheduled' : ''}`} aria-pressed={overviewCalendarDate === dateKey} data-today={dateKey === localDateKey(new Date()) || undefined} data-has-events={hasEvents || undefined} data-in-month={inMonth || undefined} onClick={() => { setOverviewCalendarDate(dateKey); if (!inMonth) setOverviewCalendarMonth(new Date(date.getFullYear(), date.getMonth(), 1)) }}>{day}{hasEvents && <i />}</button>
                  })}
                </div>
                <div className="organizer-overview-calendar-agenda">
                  <strong>Upcoming events</strong>
                  {overviewCalendarUpcomingEvents.length ? <>
                    {overviewCalendarUpcomingEvents.slice(0, 3).map(event => <button key={event.id} type="button" onClick={() => openEventView(event)}><span><strong>{event.title}</strong><small>{new Date(`${event.date.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</small></span><ArrowUpRight size={13} /></button>)}
                    {overviewCalendarUpcomingEvents.length > 3 && <button type="button" className="organizer-overview-calendar-see-more" onClick={() => selectSection('events')}>See more <ArrowUpRight size={13} /></button>}
                  </> : <span>No upcoming events</span>}
                </div>
              </section>
              </div>
            </div>

            <div className="organizer-overview-bottom-grid">
              <section className="organizer-overview-panel">
                <div className="organizer-overview-panel-heading"><div><p className="organizer-overview-card-kicker">YOUR WORKSPACE</p><h3>Pick up where you left off</h3></div><button type="button" onClick={() => selectSection('events')} aria-label="View all events"><ArrowUpRight size={17} /></button></div>
                {events.slice(0, 3).length ? <div className="organizer-overview-event-list">{events.slice(0, 3).map(event => <button key={event.id} type="button" onClick={() => openEventView(event)}><span className="organizer-overview-event-thumb">{event.cover_image ? <img src={event.cover_image} alt="" /> : <CalendarDays size={18} />}</span><span className="min-w-0 flex-1"><strong>{event.title}</strong><small>{new Date(event.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} · {event.venue}</small></span><Badge label={event.status} color={STATUS_COLORS[event.status] ?? '#888'} /><ChevronRight size={15} /></button>)}</div> : <div className="organizer-overview-empty"><p>No events yet—your first one can start today.</p><button type="button" onClick={openCreateEvent}>Create event <Plus size={15} /></button></div>}
              </section>
              {canViewOverviewOrders && <section className="organizer-overview-panel organizer-overview-orders-panel">
                <div className="organizer-overview-panel-heading"><div><p className="organizer-overview-card-kicker">RECENT ACTIVITY</p><h3>Latest orders</h3></div><button type="button" onClick={() => selectSection('orders')} aria-label="View all orders"><ArrowUpRight size={17} /></button></div>
                {orders.slice(0, 3).length ? <div className="organizer-overview-order-list">{orders.slice(0, 3).map(order => <button type="button" key={order.id} onClick={() => { selectSection('orders'); setSelectedOrder(order) }}><span className="organizer-overview-order-icon"><TicketCheck size={16} /></span><span className="min-w-0 flex-1"><strong>{(order as any).profiles?.full_name ?? 'Ticket buyer'}</strong><small>{(order as any).events?.title ?? 'Event ticket'} · {new Date(order.created_at).toLocaleDateString()}</small></span><span className="organizer-overview-order-total">{formatPrice(order.total)}</span></button>)}</div> : <div className="organizer-overview-empty"><p>New ticket orders will show up here.</p><button type="button" onClick={() => selectSection('events')}>Explore events <ArrowUpRight size={15} /></button></div>}
              </section>}
            </div>
          </section>}

          <>
              {/* ── ANALYTICS / OVERVIEW ── */}
              {section === 'analytics' && (
                <div className="space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3" style={{ borderColor: 'var(--border)' }}>
                    <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--muted-foreground)' }}>Analytics range</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="organizer-dashboard-filter-group organizer-overview-filter-group flex flex-wrap items-center gap-1 rounded-xl border p-1" aria-label="Analytics date range">
                        {(['all', 'day', 'week', 'month', 'year', 'custom'] as AnalyticsRange[]).map(range => (
                          <button key={range} onClick={() => setAnalyticsRange(range)} className="organizer-dashboard-filter-button rounded-lg border px-3 py-2 text-xs font-bold capitalize transition-colors" aria-pressed={analyticsRange === range} style={{ background: analyticsRange === range ? 'rgba(255,255,255,0.12)' : 'transparent', borderColor: analyticsRange === range ? 'rgba(255,255,255,0.28)' : 'transparent', color: analyticsRange === range ? 'var(--foreground)' : 'var(--muted-foreground)' }}>{range === 'custom' ? 'Select dates' : range === 'all' ? 'All time' : range}</button>
                        ))}
                      </div>
                      {(analyticsRange === 'day' || analyticsRange === 'month') && (
                        <div className="organizer-dashboard-filter-group organizer-overview-filter-group flex flex-wrap items-center gap-1 rounded-xl border p-1" aria-label="Analytics interval">
                          {(analyticsRange === 'day' ? [1, 2, 4, 6, 12] : [1, 2, 4]).map(option => {
                            const value = analyticsRange === 'day' ? analyticsDayInterval : analyticsMonthInterval
                            const label = `${option}${analyticsRange === 'day' ? 'h' : 'w'}`
                            const active = value === option
                            return (
                              <button key={label} onClick={() => analyticsRange === 'day' ? setAnalyticsDayInterval(option) : setAnalyticsMonthInterval(option)} className="organizer-dashboard-filter-button rounded-lg border px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide transition-colors" aria-pressed={active} style={{ background: active ? 'rgba(255,255,255,0.12)' : 'transparent', borderColor: active ? 'rgba(255,255,255,0.28)' : 'transparent', color: active ? 'var(--foreground)' : 'var(--muted-foreground)' }}>{label}</button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                    {analyticsRange === 'custom' && <div className="flex items-center gap-2 text-[10px]" style={{ color: 'var(--muted-foreground)' }}><label>From<input type="date" value={analyticsStart} onChange={event => setAnalyticsStart(event.target.value)} className="ml-1 rounded-lg border px-2 py-1.5 text-xs" style={{ background: 'rgba(255,255,255,0.035)', borderColor: 'rgba(255,255,255,0.14)', color: 'var(--foreground)', backdropFilter: 'blur(18px)' }} /></label><label>To<input type="date" value={analyticsEnd} onChange={event => setAnalyticsEnd(event.target.value)} className="ml-1 rounded-lg border px-2 py-1.5 text-xs" style={{ background: 'rgba(255,255,255,0.035)', borderColor: 'rgba(255,255,255,0.14)', color: 'var(--foreground)', backdropFilter: 'blur(18px)' }} /></label></div>}
                  </div>
                  {verificationStatus !== 'verified' && <div className="flex flex-col gap-4 rounded-2xl p-5 sm:flex-row sm:items-center sm:justify-between" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                    <div><p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--muted-foreground)' }}>Organizer verification</p><p className="mt-1 text-sm" style={{ color: 'var(--muted-foreground)' }}>{verificationStatus === 'verified' ? 'Your organizer profile is verified.' : verificationStatus === 'pending' ? 'Your verification request is awaiting review.' : 'Verify your profile to show a trusted badge on organizer cards and profiles.'}</p></div>
                    <button onClick={requestVerification} disabled={!isOwner || verificationStatus !== 'unverified' || verificationSubmitting} className="rounded-xl px-4 py-2.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60" style={{ background: verificationStatus === 'unverified' && isOwner ? 'var(--primary)' : 'var(--muted)', color: verificationStatus === 'unverified' && isOwner ? '#000' : 'var(--muted-foreground)' }}>{verificationStatus === 'verified' ? 'Verified' : verificationStatus === 'pending' ? 'Pending review' : verificationSubmitting ? 'Submitting…' : isOwner ? 'Request verification' : 'Owner only'}</button>
                  </div>}
                  {/* KPI grid */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatCard Icon={TicketIcon} label="Tickets Sold" value={totalTicketsSold.toLocaleString()} />
                    <StatCard Icon={DollarSignIcon} label="Net Ticket Revenue" value={formatPrice(totalRevenue)} sub={`Ticket subtotal − ${formatPrice(totalPlatformCommission)} fees − ${formatPrice(totalAgentCommission)} agent commissions − ${formatPrice(totalProcessedRefunds)} refunds`} />
                    <StatCard Icon={CalendarIcon} label="Published Events" value={publishedEvents.toString()} />
                    <StatCard Icon={UsersIcon} label="Customers" value={customers.length.toString()}
                      sub={`Avg order: ${avgOrderValue > 0 ? formatPrice(avgOrderValue) : '—'}`} />
                  </div>

                  {/* Chart + recent */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                    {/* Revenue chart */}
                    <div className="lg:col-span-2 rounded-2xl p-5" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                      <div className="mb-5 flex items-start justify-between gap-3">
                        <div><h2 className="font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>Revenue by period</h2><p className="mt-1 text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{analyticsRangeLabel} · confirmed sales · updated {lastUpdated?.toLocaleTimeString() ?? 'loading'}</p></div>
                        <div className="text-right"><p className="text-sm font-bold" style={{ color: 'var(--primary)' }}>{formatPrice(totalRevenue)}</p><p className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{filteredOrders.filter(o => o.status === 'confirmed').length} orders</p></div>
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
                        <p className="text-sm font-bold" style={{ color: 'var(--accent)' }}>{confirmedOrders.length}</p>
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
                        <div><h2 className="font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>Revenue trend</h2><p className="mt-1 text-[10px]" style={{ color: 'var(--muted-foreground)' }}>Confirmed sales across the selected {analyticsRangeLabel.toLowerCase()} range</p></div>
                        <TrendingUpIcon size={17} style={{ color: 'var(--primary)' }} />
                      </div>
                      <RevenueTrendChart data={chartData} />
                    </div>
                    <div className="xl:col-span-2 rounded-2xl p-5" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                      <div className="mb-5 flex items-center justify-between">
                        <div><h2 className="font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>Event performance</h2><p className="mt-1 text-[10px]" style={{ color: 'var(--muted-foreground)' }}>Revenue by event</p></div>
                        <BarChartIcon size={17} style={{ color: 'var(--accent)' }} />
                      </div>
                        <EventPerformanceChart events={events} performance={eventAnalytics} />
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

                  <div className="organizer-dashboard-filter-row flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                    {([['all', 'All updates'], ['unread', 'Needs attention'], ['events', 'Events'], ['sales', 'Sales'], ['followers', 'Followers'], ['team', 'Team']] as const).map(([key, label]) => <button key={key} type="button" onClick={() => setNotificationFilter(key)} className="organizer-dashboard-filter-button shrink-0 rounded-xl border px-3 py-2 text-xs font-bold" aria-pressed={notificationFilter === key} style={{ background: notificationFilter === key ? 'rgba(249,112,21,0.14)' : 'transparent', borderColor: notificationFilter === key ? 'rgba(249,112,21,0.4)' : 'var(--border)', color: notificationFilter === key ? 'var(--primary)' : 'var(--muted-foreground)' }}>{label}</button>)}
                  </div>

                    <div className="organizer-dashboard-table-card overflow-hidden rounded-2xl border" style={{ background: 'rgba(255,255,255,0.025)', borderColor: 'var(--border)' }}>
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
                eventWizardId ? eventWizardId === 'new'
                  ? <CreateEventPage orgId={orgId!} onClose={() => selectSection('events')} onCreated={() => { selectSection('events'); void load() }} />
                  : events.find(event => event.id === eventWizardId)
                    ? <CreateEventPage orgId={orgId!} event={events.find(event => event.id === eventWizardId)!} onClose={() => selectSection('events')} onCreated={() => { selectSection('events'); void load() }} />
                    : <div className="organizer-event-wizard-loading" role="status">Loading event details…</div>
                : eventViewId ? <OrganizerEventViewPage
                  event={events.find(event => event.id === eventViewId) ?? null}
                  orders={orders}
                  tickets={checkinTickets}
                  agentOrderMeta={agentOrderMeta}
                  canCheckIn={canCheckIn}
                  canRecordTransaction={canRecordTransactions}
                  onTicketsChanged={() => { void load() }}
                  onSaleRecorded={() => { void load() }}
                  loading={dataLoading}
                  onBack={() => selectSection('events')}
                  onEdit={openEditEvent}
                  navigate={navigate}
                /> :
                <section className="organizer-events-page">
                  <header className="organizer-events-heading">
                    <h1>Events</h1>
                    <button type="button" className="organizer-events-create" onClick={openCreateEvent}><Plus size={17} />Create event</button>
                  </header>

                  <div className="organizer-events-tabs" role="tablist" aria-label="Filter events by status">
                    {eventFilterTabs.map(tab => {
                      const count = tab.key === 'all' ? events.length : events.filter(event => getEventListStatus(event) === tab.key).length
                      return <button key={tab.key} type="button" role="tab" aria-selected={eventsFilter === tab.key} onClick={() => setEventsFilter(tab.key)}>
                        <span>{tab.label}</span><small>{count}</small>
                      </button>
                    })}
                  </div>

                  <div className="organizer-events-toolbar">
                    <label className="organizer-events-search"><Search size={17} aria-hidden="true" /><input type="search" value={eventsSearch} onChange={event => setEventsSearch(event.target.value)} placeholder="Search by event title…" aria-label="Search events by title" /></label>
                    <label className="organizer-events-category"><Filter size={15} aria-hidden="true" /><select value={eventsCategory} onChange={event => setEventsCategory(event.target.value)} aria-label="Filter by category"><option value="all">All categories</option>{eventCategories.map(category => <option key={category} value={category}>{category}</option>)}</select></label>
                    <span className="organizer-events-result-count">{filteredEvents.length} shown</span>
                  </div>

                  {filteredEvents.length === 0 ? <div className="organizer-events-empty">
                    <span><CalendarDays size={23} /></span><h2>{events.length ? 'No events match these filters' : 'Your next event starts here'}</h2>
                    <p>{events.length ? 'Try another status, category, or search term.' : 'Create an event page and bring your next experience to life.'}</p>
                    <button type="button" onClick={() => events.length ? (setEventsFilter('all'), setEventsCategory('all'), setEventsSearch(''), setDashboardSearch('')) : openCreateEvent()}>{events.length ? 'Clear filters' : 'Create your first event'} <ArrowUpRight size={15} /></button>
                  </div> : <div className="organizer-events-grid">
                    {filteredEvents.map(ev => {
                      const sold = ev.ticket_tiers?.reduce((sum, tier) => sum + tier.sold, 0) ?? 0
                      const capacity = ev.capacity || ev.ticket_tiers?.reduce((sum, tier) => sum + tier.quantity, 0) || 0
                      const pct = capacity > 0 ? Math.min(100, Math.round((sold / capacity) * 100)) : 0
                      const eventStatus = getEventListStatus(ev)
                      const dateValue = ev.date ? new Date(`${ev.date.slice(0, 10)}T${ev.time || '12:00'}`) : null
                      const validDate = dateValue && Number.isFinite(dateValue.getTime())
                      const dateLabel = validDate ? dateValue.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'Date to be announced'
                      return <article key={ev.id} className="organizer-event-card">
                        <div className="organizer-event-card-art">
                          <button type="button" className="organizer-event-card-image" onClick={() => openEventView(ev)} aria-label={`Open ${ev.title}`}>
                            {ev.cover_image ? <img src={ev.cover_image} alt="" loading="lazy" /> : <span className="organizer-event-card-placeholder"><TicketCheck size={34} strokeWidth={1.5} /><small>{ev.category}</small></span>}
                            <span className="organizer-event-card-shade" />
                          </button>
                          <span className={`organizer-event-status is-${eventStatus}`}>{eventStatus === 'review' ? 'In review' : eventStatus === 'drafts' ? 'Draft' : eventStatus === 'active' ? 'Published' : eventStatus === 'past' ? 'Past event' : 'Inactive'}</span>
                          <button type="button" className="organizer-event-more" aria-label={`More actions for ${ev.title}`} aria-expanded={openEventMenu === ev.id} onClick={() => setOpenEventMenu(current => current === ev.id ? null : ev.id)}><MoreHorizontal size={19} /></button>
                          {openEventMenu === ev.id && <div className="organizer-event-menu" role="menu">
                            <button type="button" role="menuitem" onClick={() => { setOpenEventMenu(null); openEventView(ev) }}><EyeIcon size={15} />View details</button>
                            <button type="button" role="menuitem" onClick={() => { setOpenEventMenu(null); openEditEvent(ev) }}><EditIcon size={15} />Edit event</button>
                            <button type="button" role="menuitem" onClick={() => { setOpenEventMenu(null); void toggleEventStatus(ev) }}>{ev.status === 'published' ? <XIcon size={15} /> : <CheckIcon size={15} />}{ev.status === 'published' ? 'Unpublish' : 'Publish'}</button>
                            <button type="button" role="menuitem" className="is-danger" onClick={() => { setOpenEventMenu(null); void deleteEvent(ev.id) }}><TrashIcon size={15} />Delete event</button>
                          </div>}
                        </div>
                        <button type="button" className="organizer-event-card-copy" onClick={() => openEventView(ev)}>
                          <span className="organizer-event-card-category">{ev.category || 'Event'}</span>
                          <strong>{ev.title || 'Untitled event'}</strong>
                          <span className="organizer-event-card-meta"><span><CalendarDays size={14} />{dateLabel}</span><span><MapPin size={14} />{ev.venue || 'Location to be announced'}</span></span>
                          <span className="organizer-event-sales">
                            <span className="organizer-event-sales-label"><b>Ticket sales</b><small>{sold.toLocaleString()} / {capacity.toLocaleString()} sold</small></span>
                            <span className="organizer-event-progress"><i style={{ width: `${pct}%` }} /></span>
                          </span>
                        </button>
                      </article>
                    })}
                  </div>}
                </section>
                
              )}

              {/* ── ORDERS ── */}
              {section === 'orders' && (
                <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4" style={{ borderColor: 'var(--border)' }}>
                    <div>
                      <h2 className="font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>{orders.length.toLocaleString()} Orders</h2>
                      <p className="mt-1 text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
                        {orderStatusCounts.confirmed} confirmed · {orderStatusCounts.pending} pending · {orderStatusCounts.cancelled} cancelled · {orderStatusCounts.refunded} refunded
                        {lastUpdated && ` · Updated ${lastUpdated.toLocaleTimeString()}`}
                      </p>
                    </div>
                    <button type="button" onClick={() => void load()} disabled={dataLoading} className="rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-50" style={{ background: 'var(--muted)', color: 'var(--foreground)' }}>
                      {dataLoading ? 'Refreshing…' : 'Refresh orders'}
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ background: 'var(--muted)' }}>
                          {['Order ID', 'Customer', 'Event', 'Tickets / tiers', 'Source', 'Method', 'Total', 'Status', 'Date', 'Actions'].map(h => (
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
                    const followerName = follower.profiles?.full_name || follower.profiles?.username || 'QPassa user'
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

              {/* ── MEMBERS ── */}
              {section === 'members' && (
                <div className="mx-auto max-w-6xl space-y-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div><p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--primary)' }}>Team management</p><h2 className="mt-1 text-2xl font-black" style={{ fontFamily: 'Outfit, sans-serif' }}>{organizer.name}</h2><p className="mt-1 text-sm" style={{ color: 'var(--muted-foreground)' }}>Manage team members and invitations for this organization.</p></div>
                    {isOwner && <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setShowInviteMember(true)} className="rounded-xl px-4 py-2.5 text-sm font-bold" style={{ background: 'var(--primary)', color: '#fff' }}>Invite user</button><button type="button" onClick={() => setShowInviteAgent(true)} className="rounded-xl px-4 py-2.5 text-sm font-bold" style={{ background: 'var(--muted)', color: 'var(--foreground)' }}>Invite agent</button></div>}
                  </div>
                  <section className="organizer-finance-panel overflow-hidden rounded-2xl">
                    <div className="flex flex-col gap-3 border-b px-5 pt-4 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: 'var(--border)' }}>
                      <div className="organizer-finance-tabs" role="tablist" aria-label="Team users and invitations">
                        <button type="button" role="tab" aria-selected={teamTab === 'users'} onClick={() => setTeamTab('users')}>Users <span>{members.filter(member => member.status !== 'pending').length}</span></button>
                        <button type="button" role="tab" aria-selected={teamTab === 'invitations'} onClick={() => setTeamTab('invitations')}>Invitations <span>{members.filter(member => member.status === 'pending').length}</span></button>
                      </div>
                      <input type="search" value={teamSearch} onChange={event => setTeamSearch(event.target.value)} placeholder="Search team…" aria-label="Search team members" className="organizer-finance-search mb-3 rounded-xl px-4 py-2 text-sm sm:mb-2 sm:w-64" />
                    </div>
                    <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm">
                      <thead><tr>{['User', 'Role', 'Status', ...(isOwner ? ['Actions'] : [])].map(label => <th key={label} className="px-5 py-3 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--muted-foreground)' }}>{label}</th>)}</tr></thead>
                      <tbody>{members.filter(member => teamTab === 'invitations' ? member.status === 'pending' : member.status !== 'pending').filter(member => `${(member as any).profiles?.full_name ?? ''} ${(member as any).profiles?.email ?? ''}`.toLowerCase().includes(teamSearch.trim().toLowerCase())).map(member => {
                        const fullName = (member as any).profiles?.full_name ?? 'Team member'
                        const email = (member as any).profiles?.email ?? '—'
                        const assignedAgent = agentAssignments.filter(assignment => assignment.user_id === member.user_id)
                        return <tr key={member.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                          <td className="px-5 py-4"><div className="flex items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ background: 'var(--muted)', color: 'var(--foreground)' }}>{fullName[0]?.toUpperCase() ?? '?'}</span><span className="min-w-0"><span className="block truncate font-semibold">{email}</span><span className="mt-0.5 block truncate text-xs" style={{ color: 'var(--muted-foreground)' }}>{fullName}</span></span></div></td>
                          <td className="px-5 py-4">{isOwner ? <select value={member.role_id ?? ''} onChange={event => void updateMemberRole(member.id, event.target.value)} className="organizer-finance-search max-w-52 rounded-lg px-3 py-2 text-xs" aria-label={`Role for ${fullName}`}><option value="">Select role</option>{roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select> : <span className="text-xs font-semibold">{(member as any).organizer_roles?.name ?? '—'}</span>}</td>
                          <td className="px-5 py-4"><Badge label={member.status === 'active' ? 'Active' : member.status} color={STATUS_COLORS[member.status] ?? '#888'} /></td>
                          {isOwner && <td className="px-5 py-4"><div className="flex flex-wrap gap-2">{member.status === 'pending' && <button type="button" onClick={() => void updateMemberStatus(member.id, 'active')} className="rounded-lg px-3 py-1.5 text-xs font-bold" style={{ background: 'var(--selected)', color: 'var(--primary)' }}>Activate</button>}{assignedAgent.map(assignment => <button key={assignment.id} type="button" onClick={() => setEditingAgentAssignment(assignment)} className="rounded-lg px-3 py-1.5 text-xs font-bold" style={{ background: 'var(--muted)', color: 'var(--foreground)' }}>Agent settings</button>)}<button type="button" onClick={() => member.status === 'active' ? void updateMemberStatus(member.id, 'inactive') : void deleteMember(member.id)} className="rounded-lg px-3 py-1.5 text-xs font-bold" style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}>{member.status === 'active' ? 'Deactivate' : 'Remove'}</button></div></td>}
                        </tr>
                      })}
                      {members.filter(member => teamTab === 'invitations' ? member.status === 'pending' : member.status !== 'pending').filter(member => `${(member as any).profiles?.full_name ?? ''} ${(member as any).profiles?.email ?? ''}`.toLowerCase().includes(teamSearch.trim().toLowerCase())).length === 0 && <tr><td colSpan={isOwner ? 4 : 3} className="px-5 py-14 text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>{teamTab === 'invitations' ? 'No pending invitations.' : 'No team members match your search.'}</td></tr>}</tbody>
                    </table></div>
                    <div className="border-t px-5 py-3 text-xs" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>Showing {members.filter(member => teamTab === 'invitations' ? member.status === 'pending' : member.status !== 'pending').length} entries</div>
                  </section>
                </div>
              )}

              {/* ── ORGANIZER SETTINGS / ROLE REFERENCE ── */}
              {section === 'settings' && (
                <div className="mx-auto max-w-5xl space-y-6">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--primary)' }}>Organization settings</p>
                    <h2 className="mt-1 text-2xl font-black" style={{ fontFamily: 'Outfit, sans-serif' }}>Roles & permissions</h2>
                    <p className="mt-1 max-w-2xl text-sm" style={{ color: 'var(--muted-foreground)' }}>Review the access profiles available to your team. Role definitions are managed by QPassa administrators; organization owners can assign a profile to a team member.</p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      ['Organization scope', 'Roles apply only to this organization and its events.'],
                      ['Role administration', 'Only QPassa platform administrators can create or edit role permissions.'],
                    ].map(([title, description]) => <div key={title} className="organizer-finance-stat rounded-2xl p-4"><p className="font-bold">{title}</p><p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>{description}</p></div>)}
                  </div>

                  <section className="organizer-finance-panel overflow-hidden rounded-2xl">
                    <div className="border-b px-5 py-4" style={{ borderColor: 'var(--border)' }}><h3 className="font-bold">Role definitions</h3><p className="mt-1 text-xs" style={{ color: 'var(--muted-foreground)' }}>Available access profiles for {organizer.name}</p></div>
                    <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm">
                      <thead><tr>{['Role', 'Scope', 'Capabilities', 'Assigned members'].map(label => <th key={label} className="px-5 py-3 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--muted-foreground)' }}>{label}</th>)}</tr></thead>
                      <tbody>{roles.map(role => {
                        const capabilities = role.permissions?.all ? ['Full organization access'] : Object.entries(role.permissions ?? {}).filter(([, enabled]) => enabled).map(([permission]) => permission.replace(/_/g, ' '))
                        return <tr key={role.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                          <td className="px-5 py-4 font-semibold">{role.name}</td>
                          <td className="px-5 py-4 text-xs" style={{ color: 'var(--muted-foreground)' }}>Organization</td>
                          <td className="px-5 py-4"><div className="flex max-w-lg flex-wrap gap-1.5">{capabilities.length ? capabilities.map(capability => <span key={capability} className="organizer-permission-chip">{capability}</span>) : <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>No access granted</span>}</div></td>
                          <td className="px-5 py-4 text-xs">{members.filter(member => member.role_id === role.id).length}</td>
                        </tr>
                      })}
                      {roles.length === 0 && <tr><td colSpan={4} className="px-5 py-12 text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>Role profiles are being configured by your platform administrator.</td></tr>}</tbody>
                    </table></div>
                  </section>
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
                        <div className="flex shrink-0 flex-wrap gap-2">{request.status === 'pending' && <><button type="button" onClick={() => void reviewRefundRequest(request, 'approved')} className="rounded-xl px-3 py-2 text-xs font-bold" style={{ background: 'rgba(255,106,0,0.14)', color: 'var(--primary)' }}>Approve</button><button type="button" onClick={() => void reviewRefundRequest(request, 'rejected')} className="rounded-xl px-3 py-2 text-xs font-bold" style={{ background: 'rgba(239,68,68,0.14)', color: '#fca5a5' }}>Decline</button></>}<a href="mailto:hello@qpassa.events?subject=Refund%20request%20review" className="rounded-xl px-3 py-2 text-xs font-bold" style={{ background: 'var(--muted)', color: 'var(--foreground)' }}>Contact support</a></div>
                      </div>)}
                    </div>}
                  </div>
                </div>
              )}

              {/* ── STATEMENTS ── */}
              {section === 'transactions' && (
                <div className="organizer-finance-page organizer-statements-page mx-auto max-w-6xl space-y-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div className="organizer-finance-heading">
                      <span className="organizer-finance-heading-mark"><ReceiptText size={20} /></span>
                      <div><p className="organizer-finance-eyebrow">Finance · ledger</p>
                      <h2 className="organizer-finance-title">Statements</h2>
                      <p className="organizer-finance-description">A clear record of payments, platform fees, refunds, and completed wallet withdrawals for {organizer.name}.</p></div>
                    </div>
                    <div className="organizer-finance-header-actions"><button type="button" className="organizer-finance-secondary-action" onClick={() => selectSection('payouts')}><Wallet size={14} /> Open wallet</button><div className="organizer-finance-header-meta"><span className="organizer-finance-live-dot" />Updated {lastUpdated?.toLocaleTimeString() ?? 'loading'}</div></div>
                  </div>

                  <div className="organizer-statement-kpi-grid grid grid-cols-2 gap-3 xl:grid-cols-4">
                    {([
                      ['Payments', 'payment'], ['Fees', 'fee'], ['Refunds', 'refund'], ['Payouts', 'payout'],
                    ] as const).map(([label, type]) => {
                      const StatIcon = type === 'payment' ? ArrowDownLeft : type === 'payout' ? ArrowUpRight : type === 'refund' ? RotateCcw : ReceiptText
                      const amount = transactions.filter(item => item.type === type && item.status === 'completed').reduce((sum, item) => sum + item.amount, 0)
                      const count = transactions.filter(item => item.type === type).length
                      return <div key={type} className="organizer-finance-stat organizer-statement-stat rounded-2xl p-4"><span className={`organizer-statement-stat-icon is-${type}`}><StatIcon size={15} /></span><div><p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--muted-foreground)' }}>{label}</p><p className="mt-2 text-xl font-black" style={{ color: type === 'refund' ? 'var(--error)' : 'var(--foreground)' }}>{formatPrice(amount)}</p><p className="mt-1 text-xs" style={{ color: 'var(--muted-foreground)' }}>{count} ledger record{count === 1 ? '' : 's'}</p></div></div>
                    })}
                  </div>

                  <section className="organizer-finance-panel overflow-hidden rounded-2xl">
                    <div className="flex flex-col gap-4 border-b p-5 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: 'var(--border)' }}>
                      <div><h3 className="font-bold">Transaction ledger</h3><p className="mt-1 text-xs" style={{ color: 'var(--muted-foreground)' }}>Completed and pending financial activity · payout requests are managed in Wallet</p></div>
                      <button type="button" onClick={exportStatements} disabled={!filteredStatementTransactions.length} className="organizer-finance-export organizer-statement-export rounded-full px-4 py-2.5 text-xs font-bold disabled:opacity-50"><Download size={14} /> Export CSV</button>
                    </div>
                    <>
                      <div className="organizer-finance-tools flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <label className="organizer-statement-search w-full sm:max-w-sm">
                          <Search size={16} aria-hidden="true" />
                          <input type="search" value={statementSearch} onChange={event => setStatementSearch(event.target.value)} placeholder="Search statements…" aria-label="Search statements" />
                        </label>
                        <div className="organizer-finance-filters" aria-label="Filter statement type">
                          {([['all', 'All activity'], ['payment', 'Payments'], ['fee', 'Fees'], ['refund', 'Refunds'], ['payout', 'Payouts']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={statementFilter === value} onClick={() => setStatementFilter(value)}>{label}</button>)}
                        </div>
                      </div>
                      {filteredStatementTransactions.length === 0 ? <div className="organizer-statement-empty"><span><ReceiptText size={19} /></span><strong>No statements found</strong><p>Adjust your search or filters, or wait for financial activity.</p></div> : <div className="organizer-statement-list">
                        {filteredStatementTransactions.map(transaction => {
                          const order = orders.find(item => item.id === transaction.order_id)
                          const positive = transaction.type === 'payment'
                          const title = order?.events?.title ?? (transaction.type === 'payout' ? 'Wallet withdrawal' : `${transaction.type[0].toUpperCase()}${transaction.type.slice(1)} settlement`)
                          return <article key={transaction.id} className="organizer-statement-row">
                            <span className={`organizer-statement-icon is-${transaction.type}`}>
                              {transaction.type === 'payment' ? <ArrowDownLeft size={16} /> : transaction.type === 'payout' ? <ArrowUpRight size={16} /> : transaction.type === 'refund' ? <RotateCcw size={15} /> : <ReceiptText size={15} />}
                            </span>
                            <div className="organizer-statement-description"><strong>{title}</strong><span>{transaction.reference ?? transaction.id.slice(0, 12)}</span></div>
                            <div className="organizer-statement-meta"><span className="organizer-statement-date">{new Date(transaction.created_at).toLocaleDateString()}</span><Badge label={transaction.type} color={STATUS_COLORS[transaction.type] ?? '#888'} /></div>
                            <strong className={`organizer-statement-amount ${positive ? 'is-positive' : transaction.type === 'refund' ? 'is-refund' : ''}`}>{positive ? '+' : '−'}{formatPrice(transaction.amount)}</strong>
                            <Badge label={transaction.status} color={STATUS_COLORS[transaction.status === 'completed' ? 'completed_t' : transaction.status === 'failed' ? 'failed' : 'pending_t'] ?? '#888'} />
                          </article>
                        })}
                      </div>}
                    </>
                  </section>
                </div>
              )}

              {section === 'payouts' && isOwner && (
                <div className="organizer-finance-page organizer-wallet-page mx-auto max-w-7xl space-y-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div className="organizer-finance-heading">
                      <span className="organizer-finance-heading-mark"><Wallet size={20} /></span>
                      <div><p className="organizer-finance-eyebrow">Organizer finance</p>
                      <h2 className="organizer-finance-title">Wallet</h2>
                      <p className="organizer-finance-description">Manage your available earnings, request a payout, and follow its progress.</p></div>
                    </div>
                    <div className="organizer-finance-header-actions"><button type="button" className="organizer-finance-secondary-action" onClick={() => selectSection('transactions')}><ReceiptText size={14} /> View statements</button></div>
                  </div>

                  <div className="organizer-wallet-dashboard-grid">
                    <div className="organizer-wallet-overview-column">
                      <section className="organizer-wallet-card">
                        <div className="organizer-wallet-card-top"><span className="organizer-wallet-card-brand"><span>Q</span> QPassa wallet</span><Wallet size={18} /></div>
                        <div className="organizer-wallet-card-balance"><small>Available balance</small><strong>{formatPrice(availablePayoutBalance)}</strong></div>
                        <div className="organizer-wallet-card-bottom"><span>Organizer account</span><span>{organizer.name}</span></div>
                      </section>
                      <section className="organizer-wallet-summary-card">
                        <div className="organizer-wallet-panel-heading"><div><p className="organizer-finance-eyebrow">Overview</p><h3>Earnings summary</h3></div><CircleDollarSign size={17} /></div>
                        <div className="organizer-wallet-summary-list">
                          {([
                            ['Gross collection', walletEventBreakdown.reduce((sum, item) => sum + item.gross, 0), 'income'],
                            ['Platform fees & commissions', walletEventBreakdown.reduce((sum, item) => sum + item.fees + item.agentFees, 0), 'deduction'],
                            ['Refunds', walletEventBreakdown.reduce((sum, item) => sum + item.refunds, 0), 'deduction'],
                            ['Net event earnings', walletEventBreakdown.reduce((sum, item) => sum + item.net, 0), 'total'],
                          ] as const).map(([label, amount, kind]) => <div key={label} data-kind={kind}><span>{label}</span><strong>{kind === 'income' ? '+' : kind === 'deduction' ? '−' : ''}{formatPrice(amount)}</strong></div>)}
                        </div>
                      </section>
                    </div>

                    <section id="wallet-withdrawal-form" className="organizer-finance-panel organizer-wallet-request">
                      <div className="organizer-wallet-panel-heading"><div><p className="organizer-finance-eyebrow">Withdraw earnings</p><h3>Send a payout</h3><p>Choose where your available funds should go.</p></div><span className="organizer-wallet-panel-heading-icon"><ArrowUpRight size={17} /></span></div>
                      {payoutNotice && <p role="status" className="organizer-dashboard-alert is-success mb-3 rounded-xl border px-3 py-2 text-xs">{payoutNotice}</p>}
                      <div className="organizer-wallet-form">
                        <label className="block text-xs font-semibold" style={{ color: 'var(--muted-foreground)' }}>Amount (BIF)
                          <input type="number" min="1" step="1" max={availablePayoutBalance} inputMode="numeric" value={payoutAmount} onChange={event => setPayoutAmount(event.target.value)} placeholder="Enter a whole amount" className="mt-1.5 w-full rounded-full border px-4 py-2.5 text-sm outline-none" style={{ background: 'var(--muted)', borderColor: 'var(--border)', color: 'var(--foreground)' }} />
                        </label>
                        <label className="block text-xs font-semibold" style={{ color: 'var(--muted-foreground)' }}>Payment method
                          <select value={payoutMethod} onChange={event => setPayoutMethod(event.target.value as 'mobile_money' | 'bank')} className="mt-1.5 w-full rounded-full border px-4 py-2.5 text-sm outline-none" style={{ background: 'var(--muted)', borderColor: 'var(--border)', color: 'var(--foreground)' }}>
                            <option value="mobile_money">Mobile Money</option><option value="bank">Bank transfer</option>
                          </select>
                        </label>
                        <label className="block text-xs font-semibold" style={{ color: 'var(--muted-foreground)' }}>{payoutMethod === 'mobile_money' ? 'Receiving phone number' : 'Bank account reference'}
                          <input type="text" autoComplete="off" value={payoutReference} onChange={event => setPayoutReference(event.target.value)} placeholder={payoutMethod === 'mobile_money' ? '+257 79 000 000' : 'Account holder / account number'} className="mt-1.5 w-full rounded-full border px-4 py-2.5 text-sm outline-none" style={{ background: 'var(--muted)', borderColor: 'var(--border)', color: 'var(--foreground)' }} />
                        </label>
                        <p className="organizer-wallet-available-note">Available to send <strong>{formatPrice(availablePayoutBalance)}</strong></p>
                        <button type="button" onClick={() => void submitPayoutRequest()} disabled={payoutSubmitting || !isOwner || availablePayoutBalance <= 0} className="organizer-finance-primary-action w-full rounded-full px-4 py-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50" style={{ background: 'var(--primary)', color: '#000' }}>
                          {payoutSubmitting ? 'Submitting request…' : availablePayoutBalance <= 0 ? 'No available balance' : <><ArrowUpRight size={15} /> Submit payout request</>}
                        </button>
                        <p className="organizer-wallet-form-note">Payout requests are reviewed by the platform team before transfer.</p>
                      </div>
                    </section>

                    <section className="organizer-finance-panel organizer-wallet-history">
                      <div className="organizer-wallet-panel-heading"><div><p className="organizer-finance-eyebrow">Transfers</p><h3>Payout activity</h3><p>{withdrawals.length.toLocaleString()} request{withdrawals.length === 1 ? '' : 's'} · {withdrawals.filter(item => ['requested', 'processing'].includes(item.status)).length} in progress</p></div><span className="organizer-wallet-panel-heading-icon"><ReceiptText size={17} /></span></div>
                      {withdrawals.length === 0 ? <div className="organizer-wallet-empty"><span><Wallet size={18} /></span><p>No payouts yet</p><small>Your payout requests and their statuses will show here.</small></div> : <div className="organizer-wallet-payout-list">
                        {withdrawals.map(withdrawal => <article key={withdrawal.id} className="organizer-wallet-payout-item">
                          <span className="organizer-wallet-payout-icon"><ArrowUpRight size={15} /></span>
                          <div className="organizer-wallet-payout-copy"><div><strong>{formatPrice(withdrawal.amount)}</strong><Badge label={withdrawal.status} color={STATUS_COLORS[withdrawal.status] ?? '#888'} /></div><p>{withdrawal.payment_method === 'mobile_money' ? 'Mobile Money' : 'Bank transfer'} · {withdrawal.payment_reference}</p><small>{new Date(withdrawal.requested_at).toLocaleDateString()}{withdrawal.note ? ` · ${withdrawal.note}` : ''}</small></div>
                          {withdrawal.status === 'requested' && <button type="button" onClick={() => void cancelPayoutRequest(withdrawal)} className="organizer-wallet-cancel">Cancel</button>}
                        </article>)}
                      </div>}
                      <button type="button" className="organizer-wallet-statements-link" onClick={() => selectSection('transactions')}>Open full statements <ArrowUpRight size={14} /></button>
                    </section>
                  </div>

                  <section className="organizer-finance-panel organizer-wallet-earnings overflow-hidden rounded-2xl">
                    <div className="border-b px-5 py-4" style={{ borderColor: 'var(--border)' }}><div className="organizer-wallet-panel-heading"><div><p className="organizer-finance-eyebrow">By event</p><h3>Earnings breakdown</h3><p>Confirmed ticket sales after fees, refunds, and agent commissions.</p></div><ChartNoAxesCombined size={17} /></div></div>
                    {walletEventBreakdown.length === 0 ? <div className="organizer-wallet-events-empty"><span><TicketCheck size={18} /></span><strong>No event earnings yet</strong><p>Confirmed ticket sales will appear here, broken down by event.</p></div> : <div className="organizer-wallet-event-list">
                      {walletEventBreakdown.map((item, index) => <article key={item.id} className="organizer-wallet-event-row">
                        <div className="organizer-wallet-event-heading"><span className="organizer-wallet-event-index">{String(index + 1).padStart(2, '0')}</span><div className="organizer-wallet-event-name"><strong>{item.title}</strong><small>{item.orders} confirmed order{item.orders === 1 ? '' : 's'}</small></div><div className="organizer-wallet-event-net"><small>Net settled</small><strong>{formatPrice(item.net)}</strong></div></div>
                        <div className="organizer-wallet-event-metrics"><div><small>Gross collection</small><strong>{formatPrice(item.gross)}</strong></div><div><small>Fees &amp; commissions</small><strong>−{formatPrice(item.fees + item.agentFees)}</strong></div><div><small>Refunds</small><strong>−{formatPrice(item.refunds)}</strong></div></div>
                        <div className="organizer-wallet-event-track" role="img" aria-label={`${item.gross ? Math.round(item.net / item.gross * 100) : 0}% net of gross collection`}><span style={{ width: `${item.gross ? Math.min(100, Math.max(0, item.net / item.gross * 100)) : 0}%` }} /></div>
                      </article>)}
                    </div>}
                  </section>
                </div>
              )}
          </>
        </div>
      </main>
      </div>

      {showInviteMember && <InviteMemberModal orgId={orgId!} roles={isOwner ? roles : []} onClose={() => setShowInviteMember(false)} onInvited={() => { setShowInviteMember(false); load() }} />}
      {showInviteAgent && <InviteAgentModal orgId={orgId!} events={events} onClose={() => setShowInviteAgent(false)} onInvited={() => { setShowInviteAgent(false); load() }} />}
      {editingAgentAssignment && <EditAgentAssignmentModal assignment={editingAgentAssignment} events={events} onClose={() => setEditingAgentAssignment(null)} onSaved={() => { setEditingAgentAssignment(null); load() }} />}
    </div>
  )
}

// ── Event setup page and workspace dialogs ──

type EventTierForm = { id?: string; name: string; price: string; quantity: string; description: string; ticket_type: 'consumable' | 'non_consumable'; consumable_amount: string; extra_info: string; expires_at: string; group_size: string; show_optional_details: boolean; sold: number }

function CreateEventPage({ orgId, event, onClose, onCreated }: { orgId: string; event?: Event | null; onClose: () => void; onCreated: () => void }) {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState(() => ({ title: event?.title ?? '', category: event?.category ?? 'Music', date: event?.date ?? '', end_date: event?.end_date ?? '', time: event?.time ?? '18:00', end_time: event?.end_time ?? '', venue: event?.venue ?? '', venue_latitude: event?.venue_latitude ?? null as number | null, venue_longitude: event?.venue_longitude ?? null as number | null, city: event?.city ?? 'Bujumbura', description: event?.description ?? '', capacity: String(event?.capacity ?? 500), cover_image: event?.cover_image ?? '', tags: event?.tags?.join(', ') ?? '', status: event?.status ?? 'draft', refund_policy: event?.refund_policy ?? 'Tickets are non-refundable', entry_policy: event?.entry_policy ?? 'Valid ID required at entry', terms_and_conditions: event?.terms_and_conditions ?? 'By purchasing a ticket, you agree to attend the event and accept the organizer’s policies.' }))
  const [venueSearch, setVenueSearch] = useState(event?.venue ?? '')
  const [venueResults, setVenueResults] = useState<Array<{ display_name: string; lat: string; lon: string; class?: string; type?: string; address?: { city?: string; town?: string; village?: string } }>>([])
  const [venueSearching, setVenueSearching] = useState(false)
  const [tiers, setTiers] = useState<EventTierForm[]>(() => event?.ticket_tiers?.map(tier => ({ id: tier.id, name: tier.name, price: String(tier.price), quantity: String(tier.quantity), description: tier.description ?? '', ticket_type: tier.ticket_type ?? 'non_consumable', consumable_amount: String(tier.consumable_amount ?? ''), extra_info: tier.extra_info ?? '', expires_at: tier.expires_at ?? '', group_size: String(tier.group_size ?? 1), show_optional_details: false, sold: tier.sold })) ?? [{ name: 'REGULAR', price: '30000', quantity: '500', description: 'General admission', ticket_type: 'non_consumable', consumable_amount: '', extra_info: '', expires_at: '', group_size: '1', show_optional_details: false, sold: 0 }])
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [coverPreview, setCoverPreview] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const endDateIsBeforeStart = Boolean(form.end_date && form.date && form.end_date < form.date)
  const endTimeIsBeforeStart = Boolean(form.end_time && form.time && (!form.end_date || form.end_date === form.date) && form.end_time.slice(0, 5) <= form.time.slice(0, 5))
  const invalidEventEnd = endDateIsBeforeStart || endTimeIsBeforeStart

  const validateEventDetails = () => {
    const capacity = Number.parseInt(form.capacity, 10)
    if (!form.title.trim() || !form.date || !form.venue.trim()) { setError('Event title, date, and venue are required.'); return false }
    if (endDateIsBeforeStart) { setError('Event end date must be on or after the start date.'); return false }
    if (endTimeIsBeforeStart) { setError('When the event ends on its start date, the end time must be later than the start time.'); return false }
    if (!Number.isInteger(capacity) || capacity < 1) { setError('Event capacity must be a positive whole number.'); return false }
    setError('')
    return true
  }

  const validateTicketSetup = () => {
    const capacity = Number.parseInt(form.capacity, 10)
    if (!tiers.length) { setError('Add at least one ticket tier.'); return false }
    const normalizedTierNames = new Set<string>()
    let totalTicketCapacity = 0
    for (const tier of tiers) {
      const tierName = tier.name.trim()
      const price = Number.parseInt(tier.price, 10)
      const quantity = Number.parseInt(tier.quantity, 10)
      const parsedGroupSize = Number.parseInt(tier.group_size, 10)
      const groupSize = parsedGroupSize || 1
      const consumableAmount = Number.parseInt(tier.consumable_amount, 10)
      if (!tierName) { setError('Every ticket tier needs a name.'); return false }
      if (normalizedTierNames.has(tierName.toLowerCase())) { setError('Ticket tier names must be unique.'); return false }
      if (!Number.isInteger(price) || price < 0) { setError(`Enter a valid price for ${tierName}.`); return false }
      if (!Number.isInteger(quantity) || quantity < 1 || quantity < tier.sold) { setError(`${tierName} quantity must be at least ${tier.sold} and greater than zero.`); return false }
      if (tier.show_optional_details && tier.group_size && (!Number.isInteger(parsedGroupSize) || parsedGroupSize < 1)) { setError(`Group size for ${tierName} must be at least 1.`); return false }
      if (tier.ticket_type === 'consumable' && (!Number.isInteger(consumableAmount) || consumableAmount < 1)) { setError(`Enter the consumable amount for ${tierName}.`); return false }
      normalizedTierNames.add(tierName.toLowerCase())
      totalTicketCapacity += quantity * groupSize
    }
    if (totalTicketCapacity > capacity) { setError('Total ticket capacity cannot exceed the event capacity.'); return false }
    setError('')
    return true
  }

  const goToNextStep = () => {
    if (step === 1 && !validateEventDetails()) return
    if (step === 2 && !validateTicketSetup()) return
    setStep(current => Math.min(3, current + 1))
  }

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
    if (endDateIsBeforeStart) {
      setError('Event end date must be on or after the start date.')
      return
    }
    if (endTimeIsBeforeStart) {
      setError('When the event ends on its start date, the end time must be later than the start time.')
      return
    }
    if (!Number.isInteger(capacity) || capacity < 1) { setError('Event capacity must be a positive whole number.'); return }
    if (!tiers.length) { setError('Add at least one ticket tier.'); return }
    const normalizedTierNames = new Set<string>()
    let totalTicketCapacity = 0
    for (const tier of tiers) {
      const tierName = tier.name.trim()
      const price = Number.parseInt(tier.price, 10)
      const quantity = Number.parseInt(tier.quantity, 10)
      const parsedGroupSize = Number.parseInt(tier.group_size, 10)
      const groupSize = parsedGroupSize || 1
      const consumableAmount = Number.parseInt(tier.consumable_amount, 10)
      if (!tierName) { setError('Every ticket tier needs a name.'); return }
      if (normalizedTierNames.has(tierName.toLowerCase())) { setError('Ticket tier names must be unique.'); return }
      if (!Number.isInteger(price) || price < 0) { setError(`Enter a valid price for ${tierName}.`); return }
      if (!Number.isInteger(quantity) || quantity < 1 || quantity < tier.sold) { setError(`${tierName} quantity must be at least ${tier.sold} and greater than zero.`); return }
      if (tier.show_optional_details && tier.group_size && (!Number.isInteger(parsedGroupSize) || parsedGroupSize < 1)) { setError(`Group size for ${tierName} must be at least 1.`); return }
      if (tier.ticket_type === 'consumable' && (!Number.isInteger(consumableAmount) || consumableAmount < 1)) { setError(`Enter the consumable amount for ${tierName}.`); return }
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
      end_date: form.end_date || null,
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
      refund_policy: form.refund_policy,
      entry_policy: form.entry_policy,
      terms_and_conditions: form.terms_and_conditions,
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
          consumable_amount: tier.ticket_type === 'consumable' ? Number.parseInt(tier.consumable_amount, 10) : null,
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

  const tagSuggestions = ['Live music', 'Outdoor', 'VIP', 'Food & drinks', 'Networking', 'Festival', 'Workshop', 'DJ set', 'Comedy', 'Fashion', 'Cultural', 'Meetup']
  const activeTags = new Set(form.tags.split(',').map(tag => tag.trim()).filter(Boolean))
  const toggleTagSuggestion = (tag: string) => {
    const nextTags = Array.from(activeTags)
    if (nextTags.includes(tag)) {
      nextTags.splice(nextTags.indexOf(tag), 1)
    } else {
      nextTags.push(tag)
    }
    f('tags', nextTags.join(', '))
  }

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
    <section className="organizer-event-wizard-page">
      <div className="organizer-modal dashboard-form-modal organizer-event-wizard w-full overflow-hidden" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
        <div className="organizer-event-wizard-header border-b px-5 py-4 sm:px-8" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
          <div className="flex items-start justify-between gap-4">
            <div><p className="mb-1 text-[10px] font-bold uppercase tracking-[.18em]" style={{ color: 'var(--primary)' }}>{event ? 'Manage event' : 'Event setup'}</p><h2 className="font-black text-xl sm:text-2xl" style={{ fontFamily: 'Outfit, sans-serif' }}>{event ? 'Edit event' : 'Create an event'}</h2></div>
            <button type="button" onClick={onClose} className="organizer-event-wizard-exit"><ChevronLeft size={15} />Back to events</button>
          </div>
          <ol className="organizer-event-wizard-steps" aria-label="Event setup progress">
            {[['Event details', '1'], ['Set up tickets', '2'], ['Review', '3']].map(([label, number], index) => <li key={label} data-state={step === index + 1 ? 'current' : step > index + 1 ? 'complete' : 'upcoming'}>
              <span>{step > index + 1 ? <CheckIcon size={14} /> : number}</span><b>{label}</b>
            </li>)}
          </ol>
          <div className="organizer-event-wizard-progress" aria-hidden="true"><i style={{ width: `${((step - 1) / 2) * 100}%` }} /></div>
        </div>
        <div className="organizer-event-wizard-scroll">
        <div className={`organizer-event-wizard-content ${step === 1 ? 'is-details-step' : step === 2 ? 'is-ticket-step' : 'is-review-step'}`}>
          {error && <p className="rounded-lg px-3 py-2 text-xs" style={{ background: '#3a1717', color: '#fecaca' }}>{error}</p>}
          {step === 1 && <>
          <div className="organizer-event-wizard-section-heading"><span>01</span><div><h3>Tell us about your event</h3><p>Share the essential information attendees need to know.</p></div></div>
          {[
            { label: 'Event title *', key: 'title', placeholder: 'Bujumbura Summer Fest' },
          ].map(({ label, key, placeholder }) => (
            <div key={key} className="organizer-event-field organizer-event-field-title">
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted-foreground)' }}>{label}</label>
              <input value={String(form[key as keyof typeof form])} onChange={e => f(key, e.target.value)} placeholder={placeholder}
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none" style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: '#fff' }} />
            </div>
          ))}
          <div className="organizer-event-field organizer-event-field-venue">
            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted-foreground)' }}>Venue name *</label>
            <input value={form.venue} onChange={event => f('venue', event.target.value)} placeholder="Stade Intwari" className="w-full px-4 py-2.5 rounded-xl text-sm outline-none" style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: '#fff' }} />
            <p className="mt-1 text-[11px]" style={{ color: 'var(--muted-foreground)' }}>This is the venue name attendees will see.</p>
          </div>
          <div className="organizer-event-field organizer-event-field-map relative">
            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted-foreground)' }}>Map location</label>
            <input value={venueSearch} onChange={event => void searchVenues(event.target.value)} placeholder="Search for the venue on the map" className="w-full px-4 py-2.5 rounded-xl text-sm outline-none" style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: '#fff' }} />
            <p className="mt-1 text-[11px]" style={{ color: 'var(--muted-foreground)' }}>{venueSearching ? 'Searching venues...' : form.venue_latitude ? 'Map location selected.' : 'Optional: search for a bar, hotel, school, restaurant, stadium, or other venue.'}</p>
            {venueResults.length > 0 && <div className="absolute inset-x-0 top-full z-10 mt-2 overflow-hidden rounded-xl border shadow-2xl" style={{ background: '#1a1d1d', borderColor: 'var(--border)' }}>{venueResults.map(result => <button key={`${result.lat}-${result.lon}`} type="button" onClick={() => selectVenue(result)} className="block w-full border-b px-3 py-2.5 text-left text-xs last:border-0 hover:bg-white/5" style={{ borderColor: 'var(--border)' }}>{result.display_name}</button>)}</div>}
            {form.venue_latitude !== null && form.venue_longitude !== null && <iframe title="Selected venue map" className="mt-3 h-40 w-full rounded-xl border" style={{ borderColor: 'var(--border)' }} src={`https://www.openstreetmap.org/export/embed.html?bbox=${form.venue_longitude - 0.01}%2C${form.venue_latitude - 0.01}%2C${form.venue_longitude + 0.01}%2C${form.venue_latitude + 0.01}&layer=mapnik&marker=${form.venue_latitude}%2C${form.venue_longitude}`} />}
          </div>
          <div className="organizer-event-field organizer-event-field-cover">
            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted-foreground)' }}>Cover image</label>
            <div className="organizer-event-cover-card rounded-xl p-3 space-y-3">
              {coverPreview && <img src={coverPreview} alt="Cover preview" className="w-full h-36 rounded-lg object-cover" />}
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={e => handleCoverFile(e.target.files?.[0])}
                className="w-full text-xs" style={{ color: 'var(--muted-foreground)' }} />
              <p className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>PNG, JPG, WEBP or GIF. Maximum 5 MB.</p>
              {!coverFile && <input value={form.cover_image} onChange={e => f('cover_image', e.target.value)} placeholder="Or paste an image URL"
                className="w-full px-3 py-2.5 rounded-lg text-xs outline-none" style={{ background: 'var(--card)', border: '1px solid var(--border)', color: '#fff' }} />}
            </div>
          </div>
          <div className="organizer-event-field-grid grid grid-cols-2 gap-3">
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
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted-foreground)' }}>End date (optional)</label>
              <input type="date" value={form.end_date} min={form.date || undefined} aria-invalid={endDateIsBeforeStart} onChange={e => f('end_date', e.target.value)} className="w-full px-4 py-2.5 rounded-xl text-sm outline-none" style={{ background: 'var(--muted)', border: `1px solid ${endDateIsBeforeStart ? '#ef4444' : 'var(--border)'}`, color: '#fff' }} />
              {endDateIsBeforeStart && <p role="alert" className="mt-1 text-[10px]" style={{ color: '#fca5a5' }}>End date cannot be before the start date.</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted-foreground)' }}>End time (optional)</label>
              <input type="time" value={form.end_time} aria-invalid={endTimeIsBeforeStart} onChange={e => f('end_time', e.target.value)} className="w-full px-4 py-2.5 rounded-xl text-sm outline-none" style={{ background: 'var(--muted)', border: `1px solid ${endTimeIsBeforeStart ? '#ef4444' : 'var(--border)'}`, color: '#fff' }} />
              {endTimeIsBeforeStart
                ? <p role="alert" className="mt-1 text-[10px]" style={{ color: '#fca5a5' }}>End time must be later when the event ends on its start date.</p>
                : <p className="mt-1 text-[10px]" style={{ color: 'var(--muted-foreground)' }}>Events can span multiple days.</p>}
            </div>
          </div>
          <div className="organizer-event-field organizer-event-field-tags">
            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted-foreground)' }}>Tags / lineup</label>
            <div className="organizer-event-tag-card">
              <input value={form.tags} onChange={e => f('tags', e.target.value)} placeholder="DJ, Live music, Afrobeats"
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none" style={{ background: 'var(--card)', border: '1px solid var(--border)', color: '#fff' }} />
              <div className="organizer-event-tag-suggestions">
                {tagSuggestions.map(tag => {
                  const selected = activeTags.has(tag)
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTagSuggestion(tag)}
                      className={`organizer-event-tag-suggestion${selected ? ' is-selected' : ''}`}
                    >
                      {tag}
                    </button>
                  )
                })}
              </div>
            </div>
            <p className="text-[11px] mt-1" style={{ color: 'var(--muted-foreground)' }}>Separate tags with commas or tap a suggestion. They appear as the event lineup.</p>
          </div>
          <div className="organizer-event-field organizer-event-field-status">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted-foreground)' }}>Publication status</label>
              <select value={form.status} onChange={e => f('status', e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none" style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: '#fff' }}>
                {['draft', 'published', 'cancelled', 'completed'].map(status => <option key={status}>{status}</option>)}
              </select>
            </div>
          </div>
          <div className="organizer-event-field-grid organizer-event-field-category grid grid-cols-2 gap-3">
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
          <div className="organizer-event-field organizer-event-field-description">
            <RichTextEditor id="event-description" label="Describe Your Event" value={form.description} onChange={value => f('description', value)} placeholder="Write a brief description of your event" maxLength={500} />
          </div>
          <div className="organizer-event-field-grid organizer-event-policy-grid grid grid-cols-1 gap-3">
            <div className="organizer-policy-field"><RichTextEditor id="event-refund-policy" label="Refund policy" value={form.refund_policy} onChange={value => f('refund_policy', value)} placeholder="Describe your refund policy" maxLength={1000} /></div>
            <div className="organizer-policy-field"><RichTextEditor id="event-entry-policy" label="Entry policy" value={form.entry_policy} onChange={value => f('entry_policy', value)} placeholder="Describe entry requirements for attendees" maxLength={1000} /></div>
            <div className="organizer-policy-field organizer-terms-field"><RichTextEditor id="event-terms" label="Terms & conditions" value={form.terms_and_conditions} onChange={value => f('terms_and_conditions', value)} placeholder="Add the terms and conditions for your event" maxLength={2000} /></div>
          </div>
          </>}

          {step === 2 && <>
          <div className="organizer-event-wizard-section-heading"><span>02</span><div><h3>Set up your tickets</h3><p>Add ticket options, prices and quantities. Your total inventory must fit the event capacity.</p></div></div>
          <div className="organizer-event-wizard-capacity"><span className="organizer-event-wizard-capacity-icon"><TicketCheck size={17} /></span><span>Event capacity</span><strong>{(Number.parseInt(form.capacity, 10) || 0).toLocaleString()}</strong><small>tickets available across all ticket types</small></div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold" style={{ color: 'var(--muted-foreground)' }}>Ticket Tiers</label>
              <button type="button" className="organizer-event-add-tier" onClick={() => setTiers(t => [...t, { name: 'VIP', price: '75000', quantity: '100', description: '', ticket_type: 'non_consumable', consumable_amount: '', extra_info: '', expires_at: '', group_size: '1', show_optional_details: false, sold: 0 }])}>
                <Plus size={14} /> Add ticket tier
              </button>
            </div>
            {tiers.map((tier, i) => (
              <div key={i} className="organizer-event-wizard-tier mb-3 rounded-xl p-3" style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                <input placeholder="Name" value={tier.name} onChange={e => setTiers(t => t.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                  className="px-3 py-2 rounded-lg text-xs outline-none" style={{ background: 'var(--card)', border: '1px solid var(--border)', color: '#fff' }} />
                <div className="flex items-center gap-2"><input type="number" min="0" placeholder="Price BIF" value={tier.price} disabled={tier.price === '0'} onChange={e => setTiers(t => t.map((x, j) => j === i ? { ...x, price: e.target.value } : x))}
                  className="min-w-0 flex-1 px-3 py-2 rounded-lg text-xs outline-none" style={{ background: 'var(--card)', border: '1px solid var(--border)', color: '#fff' }} /><label className="flex shrink-0 items-center gap-1 text-[11px]" style={{ color: 'var(--muted-foreground)' }}><input type="checkbox" checked={tier.price === '0'} onChange={e => setTiers(t => t.map((x, j) => j === i ? { ...x, price: e.target.checked ? '0' : '30000' } : x))} /> Free</label></div>
                <input placeholder="Qty" value={tier.quantity} onChange={e => setTiers(t => t.map((x, j) => j === i ? { ...x, quantity: e.target.value } : x))}
                  className="px-3 py-2 rounded-lg text-xs outline-none" style={{ background: 'var(--card)', border: '1px solid var(--border)', color: '#fff' }} />
                <button type="button" onClick={() => setTiers(t => t.filter((_, j) => j !== i))} className="organizer-event-remove-tier" aria-label={`Remove ${tier.name || 'ticket'} tier`} title="Remove ticket tier"><XIcon size={15} /></button>
                </div>
                <input placeholder="Ticket description" value={tier.description} onChange={e => setTiers(t => t.map((x, j) => j === i ? { ...x, description: e.target.value } : x))}
                  className="mb-2 w-full px-3 py-2 rounded-lg text-xs outline-none" style={{ background: 'var(--card)', border: '1px solid var(--border)', color: '#fff' }} />
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="mb-1 block text-[11px]" style={{ color: 'var(--muted-foreground)' }}>Ticket type</label><select value={tier.ticket_type} onChange={e => setTiers(t => t.map((x, j) => j === i ? { ...x, ticket_type: e.target.value as 'consumable' | 'non_consumable' } : x))} className="w-full px-3 py-2 rounded-lg text-xs outline-none" style={{ background: 'var(--card)', border: '1px solid var(--border)', color: '#fff' }}><option value="non_consumable">Non-consumable</option><option value="consumable">Consumable</option></select></div>
                  {tier.ticket_type === 'consumable' && <div><label className="mb-1 block text-[11px]" style={{ color: 'var(--muted-foreground)' }}>Consumable amount *</label><input type="number" min="1" step="1" placeholder="e.g. 2 drinks" value={tier.consumable_amount} onChange={e => setTiers(t => t.map((x, j) => j === i ? { ...x, consumable_amount: e.target.value } : x))} className="w-full px-3 py-2 rounded-lg text-xs outline-none" style={{ background: 'var(--card)', border: '1px solid var(--border)', color: '#fff' }} /></div>}
                </div>
                <button type="button" aria-expanded={tier.show_optional_details} onClick={() => setTiers(t => t.map((x, j) => j === i ? { ...x, show_optional_details: !x.show_optional_details } : x))} className="mt-2 text-[11px] font-semibold" style={{ color: 'var(--primary)' }}>{tier.show_optional_details ? 'Hide optional details −' : 'Show optional details +'}</button>
                {tier.show_optional_details && <div className="mt-2 space-y-2 rounded-lg p-2" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <textarea placeholder="Extra info (optional)" value={tier.extra_info} onChange={e => setTiers(t => t.map((x, j) => j === i ? { ...x, extra_info: e.target.value } : x))} rows={2} className="w-full resize-none px-3 py-2 rounded-lg text-xs outline-none" style={{ background: 'var(--card)', border: '1px solid var(--border)', color: '#fff' }} />
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className="mb-1 block text-[11px]" style={{ color: 'var(--muted-foreground)' }}>Group size (optional)</label><input type="number" min="1" value={tier.group_size} onChange={e => setTiers(t => t.map((x, j) => j === i ? { ...x, group_size: e.target.value } : x))} className="w-full px-3 py-2 rounded-lg text-xs outline-none" style={{ background: 'var(--card)', border: '1px solid var(--border)', color: '#fff' }} /><p className="mt-1 text-[10px]" style={{ color: 'var(--muted-foreground)' }}>Tickets issued per purchase.</p></div>
                    <div><label className="mb-1 block text-[11px]" style={{ color: 'var(--muted-foreground)' }}>Expiry date (optional)</label><input type="date" value={tier.expires_at} onChange={e => setTiers(t => t.map((x, j) => j === i ? { ...x, expires_at: e.target.value } : x))} className="w-full px-3 py-2 rounded-lg text-xs outline-none" style={{ background: 'var(--card)', border: '1px solid var(--border)', color: '#fff' }} /></div>
                  </div>
                </div>}
              </div>
            ))}
          </div>
          </>}

          {step === 3 && <>
            <div className="organizer-event-wizard-section-heading"><span>03</span><div><h3>Review your event</h3><p>Check the details and choose whether to save as a draft or publish.</p></div></div>
            <div className="organizer-event-review-layout">
              <section className="organizer-event-review-main">
                <div className="organizer-event-review-cover" style={{ backgroundImage: (coverPreview || form.cover_image) ? `linear-gradient(0deg, rgba(9,12,16,.9), rgba(9,12,16,.18) 85%), url(${coverPreview || form.cover_image})` : undefined }}>
                  <span>{form.category}</span><h3>{form.title.trim() || 'Untitled event'}</h3>
                  <p>{form.date ? formatLocaleDate(`${form.date}T12:00:00`, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'Date to be announced'} · {form.time || 'Time TBA'}</p>
                  <small>{form.venue || 'Venue to be announced'}{form.city ? ` · ${form.city}` : ''}</small>
                </div>
                <div className="organizer-event-review-card">
                  <h4>Event details</h4>
                  <dl>
                    <div><dt>Date and time</dt><dd>{form.date ? formatLocaleDate(`${form.date}T12:00:00`, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'Date not set'} · {form.time || 'Time TBA'}{form.end_date ? ` – ${formatLocaleDate(`${form.end_date}T12:00:00`, { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}{form.end_time ? `, ${form.end_time}` : ''}</dd></div>
                    <div><dt>Venue</dt><dd>{form.venue || 'Venue not set'}{form.city ? ` · ${form.city}` : ''}</dd></div>
                    <div><dt>Category · capacity</dt><dd>{form.category} · {(Number.parseInt(form.capacity, 10) || 0).toLocaleString()} people</dd></div>
                    {form.tags.trim() && <div><dt>Tags / lineup</dt><dd>{form.tags}</dd></div>}
                    {form.description.trim() && <div><dt>Description</dt><dd><RichTextContent value={form.description} /></dd></div>}
                  </dl>
                </div>
                <div className="organizer-event-review-card">
                  <h4>Policies</h4>
                  <dl><div><dt>Refund policy</dt><dd><RichTextContent value={form.refund_policy || 'Not specified'} /></dd></div><div><dt>Entry policy</dt><dd><RichTextContent value={form.entry_policy || 'Not specified'} /></dd></div><div><dt>Terms &amp; conditions</dt><dd><RichTextContent value={form.terms_and_conditions || 'Not specified'} /></dd></div></dl>
                </div>
              </section>
              <section className="organizer-event-review-tickets">
                <div className="organizer-event-review-tickets-heading"><div><h4>Ticket types</h4><p>{tiers.length} ticket {tiers.length === 1 ? 'type' : 'types'} · {tiers.reduce((total, tier) => total + ((Number.parseInt(tier.quantity, 10) || 0) * (Number.parseInt(tier.group_size, 10) || 1)), 0).toLocaleString()} total tickets</p></div><button type="button" onClick={() => setStep(2)}>Edit</button></div>
                {tiers.map((tier, index) => <article className="organizer-event-review-ticket" key={`${tier.id ?? tier.name}-${index}`}><div><strong>{tier.name || `Ticket type ${index + 1}`}</strong><small>{tier.ticket_type === 'consumable' ? `Consumable · ${tier.consumable_amount || 0} included` : 'Standard entry'}{(Number.parseInt(tier.group_size, 10) || 1) > 1 ? ` · group of ${tier.group_size}` : ''}</small>{tier.description && <small>{tier.description}</small>}</div><div><b>{Number.parseInt(tier.price, 10) === 0 ? 'Free' : `${(Number.parseInt(tier.price, 10) || 0).toLocaleString()} BIF`}</b><small>{(Number.parseInt(tier.quantity, 10) || 0).toLocaleString()} available</small></div></article>)}
              </section>
            </div>
            <div className="organizer-event-review-publish">
              <label htmlFor="event-publication-status">When you confirm</label>
              <select id="event-publication-status" value={form.status} onChange={e => f('status', e.target.value)}>
                <option value="draft">Save as draft — only you can see it</option><option value="published">Publish — make it visible to attendees</option>
                {event && <><option value="cancelled">Mark as cancelled</option><option value="completed">Mark as completed</option></>}
              </select>
            </div>
          </>}
        </div>
        </div>
        <footer className="organizer-event-wizard-footer">
          <button type="button" onClick={step === 1 ? onClose : () => { setError(''); setStep(current => Math.max(1, current - 1)) }} disabled={saving} className="organizer-event-wizard-back">{step === 1 ? 'Back to events' : 'Back'}</button>
          <span>Step {step} of 3</span>
          {step < 3
            ? <button type="button" onClick={goToNextStep} className="organizer-event-wizard-next">Continue <ArrowRightIcon size={15} /></button>
            : <button type="button" onClick={handleSubmit} disabled={saving || invalidEventEnd} className="organizer-event-wizard-next" style={{ opacity: saving || invalidEventEnd ? 0.55 : 1 }}>{saving ? (event ? 'Saving…' : 'Creating…') : event ? 'Confirm changes' : form.status === 'published' ? 'Confirm & publish' : 'Confirm & save draft'} <CheckIcon size={15} /></button>}
        </footer>
      </div>
    </section>
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
  return <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.8)' }}><div className="organizer-modal w-full max-w-sm rounded-2xl p-6" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
    <div className="flex items-center justify-between"><h2 className="font-black" style={{ fontFamily: 'Outfit, sans-serif' }}>Invite Agent</h2><button onClick={onClose}>✕</button></div>
    <p className="mt-2 text-xs" style={{ color: 'var(--muted-foreground)' }}>The person must already have a QPassa account.</p>
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

  return <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4" style={{ background: 'rgba(0,0,0,.8)' }}><div className="organizer-modal w-full max-w-lg rounded-2xl p-6" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
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
      setError(profileError?.message ?? 'This email must have a QPassa account before it can be invited.')
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
      <div className="organizer-modal dashboard-form-modal w-full max-w-sm rounded-2xl" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="font-black" style={{ fontFamily: 'Outfit, sans-serif' }}>Invite Member</h2>
          <button onClick={onClose} style={{ color: 'var(--muted-foreground)' }}>✕</button>
        </div>
        <div className="p-6 space-y-4">
          {error && <p className="rounded-lg px-3 py-2 text-xs" style={{ background: '#3a1717', color: '#fecaca' }}>{error}</p>}
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Add an existing QPassa account to your team, or share the registration link below first.</p>
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
