// Organizer operations workspace, including the filterable event-card listing.
import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import i18n from '../lib/i18n'
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
import { ArrowDownLeft, ArrowUpRight, Bell, Building2, CalendarDays, CalendarPlus, ChartNoAxesCombined, ChevronLeft, ChevronRight, CircleDollarSign, ClipboardList, Download, Filter, Heart, LayoutDashboard, MapPin, MoreHorizontal, Plus, ReceiptText, RotateCcw, Search, Settings, Shield, Tag, TicketCheck, UserRound, UsersRound, Wallet, type LucideIcon } from 'lucide-react'

type Section = 'overview' | 'analytics' | 'events' | 'orders' | 'customers' | 'followers' | 'members' | 'settings' | 'subscriptions' | 'transactions' | 'payouts' | 'refunds' | 'notifications'
type AnalyticsRange = 'all' | 'day' | 'week' | 'month' | 'year' | 'custom'
type OrdersPeriod = 'all' | 'day' | 'week' | 'month'
type OrdersStatusFilter = 'all' | 'confirmed' | 'pending' | 'cancelled' | 'refunded'
type OrganizerSettingsTab = 'workspace' | 'roles' | 'notifications' | 'security'
type StatementFilter = 'all' | 'payment' | 'fee' | 'refund' | 'payout'
type TeamTab = 'users' | 'invitations'
type NotificationFilter = 'all' | 'unread' | 'events' | 'sales' | 'followers' | 'team'
type EventsFilter = 'all' | 'active' | 'review' | 'inactive' | 'drafts' | 'past'
type OrganizerNotification = { id: string; type: string; title: string; body: string; created_at: string; read_at: string | null; event_id?: string | null; recipient_scope?: string }
type AgentOrderMeta = { order_id: string; agent_user_id: string; payment_mode: 'digital' | 'cash'; status: string; quantity: number; profiles?: { full_name: string | null; email: string | null } | null }
type RefundRequest = { id: string; order_id: string; ticket_id: string | null; customer_id: string; reason: string; status: 'pending' | 'approved' | 'rejected' | 'processed'; created_at: string; profiles?: { full_name: string | null; email: string | null } | null; events?: { title: string | null } | null }

type Props = { navigate: (p: string, extra?: unknown) => void }
const t = i18n.t

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
  { key: 'overview', label: t('Overview') },
  { key: 'analytics', label: t('Analytics') },
  { key: 'events', label: t('Events') },
  { key: 'orders', label: t('Orders') },
  { key: 'customers', label: t('Customers') },
  { key: 'followers', label: t('Followers') },
  { key: 'members', label: t('Members') },
  { key: 'settings', label: t('Settings') },
  { key: 'transactions', label: t('Transactions') },
  { key: 'payouts', label: t('Wallet') },
  ...(FEATURES.refunds ? [{ key: 'refunds' as Section, label: t('Refund requests') }] : []),
]

const NAV_GROUPS: { label: string; keys: Section[] }[] = [
  { label: t('Dashboard'), keys: ['overview', 'events', 'members', 'analytics', 'orders', 'customers', 'followers'] },
  { label: t('Finance'), keys: ['payouts', 'transactions', 'refunds'] },
  { label: '', keys: ['settings'] },
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

const overviewCalendarWeekdays = Array.from({ length: 7 }, (_, index) => formatLocaleDate(new Date(2024, 0, index + 7), { weekday: 'short' }).replace(/\./g, '').toUpperCase())

const STATUS_COLORS: Record<string, string> = {
  published: '#22c55e', draft: '#F0A500', cancelled: '#ef4444', completed: '#888',
  confirmed: '#22c55e', pending: '#F0A500', refunded: '#ef4444',
  active: '#22c55e', inactive: '#888',
  completed_t: '#22c55e', failed: '#ef4444', pending_t: '#F0A500',
  payment: 'var(--primary)', refund: '#ef4444', payout: 'var(--accent)', fee: '#888',
}

const EVENT_CATEGORY_TONES: Record<string, string> = {
  music: '#c084fc', festivals: '#fb923c', festival: '#fb923c', parties: '#f472b6', party: '#f472b6',
  sports: '#60a5fa', comedy: '#facc15', conferences: '#2dd4bf', culture: '#fb7185', business: '#a3e635',
}

function getEventCategoryTone(category: string) {
  return EVENT_CATEGORY_TONES[category.trim().toLowerCase()] ?? '#f0a36a'
}

const ORGANIZER_PERMISSION_ROWS = [
  { key: 'analytics', label: t('Analytics'), detail: t('View sales, revenue, and performance reports') },
  { key: 'events', label: t('Events'), detail: t('Create and manage event listings') },
  { key: 'orders', label: t('Orders'), detail: t('Review ticket purchases and order details') },
  { key: 'customers', label: t('Customers'), detail: t('View customer records and purchase history') },
  { key: 'checkin', label: t('Check-in'), detail: t('Validate tickets and manage door access') },
  { key: 'members', label: t('Team members'), detail: t('View and manage workspace collaborators') },
  { key: 'roles', label: t('Roles & settings'), detail: t('Review access roles and workspace settings') },
  { key: 'transactions', label: t('Transactions'), detail: t('View financial ledger entries') },
  { key: 'payouts', label: t('Wallet & payouts'), detail: t('View or manage organizer withdrawals') },
  { key: 'refunds', label: t('Refund requests'), detail: t('Review customer refund requests') },
  { key: 'notifications', label: t('Notifications'), detail: t('Access organizer activity updates') },
] as const

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
    title: eventTitles.get(eventId) ?? t('Unknown event'),
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
      {data.length === 0 && <p className="py-8 text-center text-xs" style={{ color: 'var(--muted-foreground)' }}>{t('Publish an event to see performance here')}</p>}
    </div>
  )
}

function TicketSalesByEventChart({ events, performance }: { events: Event[]; performance: Map<string, { tickets: number; revenue: number }> }) {
  const eventTitles = new Map(events.map(event => [event.id, event.title]))
  const data = [...performance.entries()].map(([eventId, result]) => ({
    id: eventId,
    title: eventTitles.get(eventId) ?? t('Unknown event'),
    tickets: result.tickets,
  })).sort((left, right) => right.tickets - left.tickets).slice(0, 5)
  const max = Math.max(...data.map(event => event.tickets), 1)

  return <div className="organizer-analytics-metric-list">
    {data.map(event => <div className="organizer-analytics-metric-row" key={event.id}>
      <div className="organizer-analytics-metric-heading"><span>{event.title}</span><strong>{event.tickets.toLocaleString()} {t('tickets')}</strong></div>
      <div className="organizer-analytics-metric-track"><i style={{ width: `${event.tickets ? Math.max(event.tickets / max * 100, 4) : 0}%` }} /></div>
    </div>)}
    {data.length === 0 && <p className="organizer-analytics-chart-empty">{t('Confirmed ticket sales will appear here.')}</p>}
  </div>
}

function RevenueBreakdownChart({ items }: { items: Array<{ label: string; amount: number }> }) {
  const max = Math.max(...items.map(item => item.amount), 1)
  return <div className="organizer-analytics-metric-list">
    {items.map(item => <div className="organizer-analytics-metric-row" key={item.label}>
      <div className="organizer-analytics-metric-heading"><span>{item.label}</span><strong>{formatPrice(item.amount)}</strong></div>
      <div className="organizer-analytics-metric-track"><i style={{ width: `${item.amount ? Math.max(item.amount / max * 100, 4) : 0}%` }} /></div>
    </div>)}
  </div>
}

function PaymentMethodChart({ orders }: { orders: Order[] }) {
  const data = [...orders.reduce((counts, order) => {
    const method = order.payment_method?.replace(/_/g, ' ') || t('Not specified')
    counts.set(method, (counts.get(method) ?? 0) + 1)
    return counts
  }, new Map<string, number>())].map(([method, count]) => ({ method, count }))
    .sort((left, right) => right.count - left.count)
  const max = Math.max(...data.map(item => item.count), 1)
  return <div className="organizer-analytics-metric-list">
    {data.map(item => <div className="organizer-analytics-metric-row" key={item.method}>
      <div className="organizer-analytics-metric-heading"><span className="capitalize">{item.method}</span><strong>{item.count.toLocaleString()} {t('orders')}</strong></div>
      <div className="organizer-analytics-metric-track"><i style={{ width: `${item.count ? Math.max(item.count / max * 100, 4) : 0}%` }} /></div>
    </div>)}
    {data.length === 0 && <p className="organizer-analytics-chart-empty">{t('Confirmed orders will appear here.')}</p>}
  </div>
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
  const [ordersSearch, setOrdersSearch] = useState('')
  const [ordersStatusFilter, setOrdersStatusFilter] = useState<OrdersStatusFilter>('all')
  const [ordersPeriod, setOrdersPeriod] = useState<OrdersPeriod>('all')
  const [customersSearch, setCustomersSearch] = useState('')
  const [customersPeriod, setCustomersPeriod] = useState<OrdersPeriod>('all')
  const [organizerSettingsTab, setOrganizerSettingsTab] = useState<OrganizerSettingsTab>('roles')
  const [organizerSettingsPreferences, setOrganizerSettingsPreferences] = useState<Record<string, boolean>>({ email_notifications: true, event_reminders: true, promotions: false, nearby_events: true })
  const [organizerPreferenceSaving, setOrganizerPreferenceSaving] = useState<string | null>(null)
  const [securityPassword, setSecurityPassword] = useState({ password: '', confirm: '' })
  const [securityPasswordSaving, setSecurityPasswordSaving] = useState(false)
  const [securityNotice, setSecurityNotice] = useState('')
  const [organizerDetailsDraft, setOrganizerDetailsDraft] = useState({ name: organizer?.name ?? '', city: organizer?.city ?? '', website: organizer?.website ?? '', phone: organizer?.phone ?? '' })
  const [organizerDetailsSaving, setOrganizerDetailsSaving] = useState(false)
  const [organizerDetailsNotice, setOrganizerDetailsNotice] = useState('')
  const [dashboardSearch, setDashboardSearch] = useState('')
  const [eventsFilter, setEventsFilter] = useState<EventsFilter>('all')
  const [eventsSearch, setEventsSearch] = useState('')
  const [eventsCategory, setEventsCategory] = useState('all')
  const [openEventMenu, setOpenEventMenu] = useState<string | null>(null)
  const [eventMenuPosition, setEventMenuPosition] = useState<{ top: number; left: number } | null>(null)
  const [teamTab, setTeamTab] = useState<TeamTab>('users')
  const [teamSearch, setTeamSearch] = useState('')
  const [followersSearch, setFollowersSearch] = useState('')
  const [payoutAmount, setPayoutAmount] = useState('')
  const [payoutMethod, setPayoutMethod] = useState<'mobile_money' | 'bank'>('mobile_money')
  const [payoutReference, setPayoutReference] = useState('')
  const [payoutSubmitting, setPayoutSubmitting] = useState(false)
  const [payoutNotice, setPayoutNotice] = useState('')

  useEffect(() => {
    if (!openEventMenu) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenEventMenu(null)
    }
    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target
      if (target instanceof Element && !target.closest('.organizer-event-menu, .organizer-event-more')) setOpenEventMenu(null)
    }
    const closeOnViewportChange = () => setOpenEventMenu(null)
    document.addEventListener('keydown', closeOnEscape)
    document.addEventListener('mousedown', closeOnOutsideClick)
    window.addEventListener('scroll', closeOnViewportChange, true)
    window.addEventListener('resize', closeOnViewportChange)
    return () => {
      document.removeEventListener('keydown', closeOnEscape)
      document.removeEventListener('mousedown', closeOnOutsideClick)
      window.removeEventListener('scroll', closeOnViewportChange, true)
      window.removeEventListener('resize', closeOnViewportChange)
    }
  }, [openEventMenu])

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
    setOrganizerSettingsPreferences({ email_notifications: true, event_reminders: true, promotions: false, nearby_events: true, ...(profile?.preferences ?? {}) })
  }, [profile?.id, profile?.preferences])

  useEffect(() => {
    setOrganizerDetailsDraft({ name: organizer?.name ?? '', city: organizer?.city ?? '', website: organizer?.website ?? '', phone: organizer?.phone ?? '' })
  }, [organizer?.id, organizer?.name, organizer?.city, organizer?.website, organizer?.phone])

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

  const updateOrganizerSettingsPreference = async (key: string) => {
    if (!profile?.id) return
    const previousValue = organizerSettingsPreferences[key] === true
    const nextPreferences = { ...organizerSettingsPreferences, [key]: !previousValue }
    setOrganizerSettingsPreferences(nextPreferences)
    setOrganizerPreferenceSaving(key)
    setActionError('')
    const { error } = await supabase.from('profiles').update({ preferences: nextPreferences }).eq('id', profile.id)
    if (error) {
      setOrganizerSettingsPreferences(current => ({ ...current, [key]: previousValue }))
      setActionError(error.message)
    }
    setOrganizerPreferenceSaving(null)
  }

  const updateAccountPassword = async () => {
    setSecurityNotice('')
    setActionError('')
    if (securityPassword.password.length < 8) { setActionError(t('Choose a password with at least 8 characters.')); return }
    if (securityPassword.password !== securityPassword.confirm) { setActionError(t('The passwords do not match.')); return }
    setSecurityPasswordSaving(true)
    const { error } = await supabase.auth.updateUser({ password: securityPassword.password })
    setSecurityPasswordSaving(false)
    if (error) { setActionError(error.message); return }
    setSecurityPassword({ password: '', confirm: '' })
    setSecurityNotice(t('Your password has been updated.'))
  }

  const saveOrganizerDetails = async () => {
    if (!organizer?.id || !isOwner) return
    const name = organizerDetailsDraft.name.trim()
    if (!name) { setActionError(t('Organization name is required.')); return }
    setActionError('')
    setOrganizerDetailsNotice('')
    setOrganizerDetailsSaving(true)
    const { error } = await supabase.from('organizers').update({
      name,
      city: organizerDetailsDraft.city.trim(),
      website: organizerDetailsDraft.website.trim() || null,
      phone: organizerDetailsDraft.phone.trim() || null,
    }).eq('id', organizer.id)
    setOrganizerDetailsSaving(false)
    if (error) { setActionError(error.message); return }
    setOrganizerDetailsNotice(t('Organization profile saved.'))
    await load()
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
      : t('Select dates')
    : analyticsRange === 'all' ? t('All time') : t(analyticsRange.charAt(0).toUpperCase() + analyticsRange.slice(1))
  const visibleOrders = orders.filter(order => {
    const createdAt = new Date(order.created_at)
    return createdAt >= rangeStart && createdAt <= rangeEnd
  })
  const orderStatusCounts = orders.reduce((counts, order) => {
    counts[order.status] += 1
    return counts
  }, { confirmed: 0, pending: 0, cancelled: 0, refunded: 0 })
  const orderPeriodStart = (() => {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    if (ordersPeriod === 'day') return start
    if (ordersPeriod === 'week') {
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
      return start
    }
    if (ordersPeriod === 'month') start.setDate(1)
    return ordersPeriod === 'all' ? null : start
  })()
  const filteredOrders = orders.filter(order => {
    const matchesStatus = ordersStatusFilter === 'all' || order.status === ordersStatusFilter
    const createdAt = new Date(order.created_at)
    const matchesPeriod = !orderPeriodStart || createdAt >= orderPeriodStart
    const searchText = `${order.id} ${(order as any).holder_name ?? ''} ${(order as any).holder_email ?? ''} ${(order as any).profiles?.full_name ?? ''} ${(order as any).profiles?.email ?? ''} ${(order as any).events?.title ?? ''} ${order.payment_method ?? ''} ${order.status}`.toLowerCase()
    const matchesSearch = !ordersSearch.trim() || searchText.includes(ordersSearch.trim().toLowerCase())
    return matchesStatus && matchesPeriod && matchesSearch
  })
  const customerPeriodStart = (() => {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    if (customersPeriod === 'day') return start
    if (customersPeriod === 'week') {
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
      return start
    }
    if (customersPeriod === 'month') start.setDate(1)
    return customersPeriod === 'all' ? null : start
  })()
  const visibleCustomers = customers.filter(customer => {
    const searchText = `${customer.full_name ?? ''} ${customer.email ?? ''} ${customer.phone ?? ''}`.toLowerCase()
    const matchesSearch = !customersSearch.trim() || searchText.includes(customersSearch.trim().toLowerCase())
    const matchesPeriod = !customerPeriodStart || new Date(customer.created_at) >= customerPeriodStart
    return matchesSearch && matchesPeriod
  })
  const visibleTeamMembers = members
    .filter(member => teamTab === 'invitations' ? member.status === 'pending' : member.status !== 'pending')
    .filter(member => `${(member as any).profiles?.full_name ?? ''} ${(member as any).profiles?.email ?? ''}`.toLowerCase().includes(teamSearch.trim().toLowerCase()))
  const visibleFollowers = followers.filter(follower => `${follower.profiles?.full_name ?? ''} ${follower.profiles?.username ?? ''}`.toLowerCase().includes(followersSearch.trim().toLowerCase()))

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
    if (!confirm(t('Delete this event?'))) return
    const { error } = await supabase.from('events').delete().eq('id', id)
    if (error) { setActionError(error.message); return }
    setEvents(prev => prev.filter(e => e.id !== id))
  }

  const removeFollower = async (id: string) => {
    if (!confirm(t('Remove this follower?'))) return
    const { error } = await supabase.from('organizer_followers').delete().eq('id', id)
    if (error) { setActionError(error.message); return }
    setFollowers(prev => prev.filter(follower => follower.id !== id))
  }

  const handleSignOut = async () => {
    await signOut()
    navigate('home')
  }

  const deleteMember = async (id: string) => {
    if (!confirm(t('Remove this team member?'))) return
    const { error } = await supabase.from('organizer_members').delete().eq('id', id)
    if (error) { setActionError(error.message); return }
    setMembers(prev => prev.filter(member => member.id !== id))
  }

  const updateMemberRole = async (memberId: string, roleId: string) => {
    if (!isOwner) { setActionError(t('Only the organizer owner can assign team roles.')); return }
    const { error } = await supabase.from('organizer_members').update({ role_id: roleId || null }).eq('id', memberId)
    if (error) { setActionError(error.message); return }
    setMembers(prev => prev.map(member => member.id === memberId ? { ...member, role_id: roleId || null, organizer_roles: roles.find(role => role.id === roleId) } : member))
  }

  const updateMemberStatus = async (memberId: string, status: 'active' | 'inactive') => {
    const member = members.find(item => item.id === memberId)
    if (!member) { setActionError(t('This team member is no longer available.')); return }
    if (status === 'inactive' && member.status === 'active' && !confirm(t('Deactivate this team member? They will lose access immediately.'))) return
    if (status === 'active' && member.status === 'pending' && !confirm(t('Activate this pending team invitation?'))) return
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

  const exportOrders = () => {
    const rows = visibleOrders.map(order => {
      const event = events.find(item => item.id === order.event_id)
      const tierNames = new Map((event?.ticket_tiers ?? []).map(tier => [tier.id, tier.name]))
      const ticketCount = order.order_items?.reduce((sum, item) => sum + item.quantity, 0) || agentOrderMeta[order.id]?.quantity || 0
      const tiers = [...new Set((order.order_items ?? []).map(item => tierNames.get(item.ticket_tier_id) ?? 'Unknown tier'))]
      return [
        order.id,
        (order as any).holder_name ?? (order as any).profiles?.full_name ?? '',
        (order as any).holder_email ?? (order as any).profiles?.email ?? '',
        (order as any).events?.title ?? '',
        ticketCount,
        tiers.join('; '),
        agentOrderMeta[order.id]?.profiles?.full_name ?? (agentOrderMeta[order.id] ? 'Agent sale' : 'Customer checkout'),
        agentOrderMeta[order.id]?.payment_mode ?? order.payment_method ?? '',
        order.total,
        order.status,
        order.created_at,
      ]
    })
    const csv = [['Order ID', 'Customer', 'Email', 'Event', 'Ticket count', 'Ticket tiers', 'Source', 'Payment method', 'Total', 'Status', 'Created'], ...rows].map(row => row.map(value => {
      const text = String(value)
      const safeText = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
      return `"${safeText.replace(/"/g, '""')}"`
    }).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `qpassa-orders-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const exportCustomers = () => {
    const rows = visibleCustomers.map(customer => [customer.full_name ?? '', customer.email ?? '', customer.phone ?? '', customer.total_orders, customer.total_spent, customer.created_at])
    const csv = [['Customer', 'Email', 'Phone', 'Orders', 'Total spent', 'Joined'], ...rows].map(row => row.map(value => {
      const text = String(value)
      const safeText = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
      return `"${safeText.replace(/"/g, '""')}"`
    }).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `qpassa-customers-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const submitPayoutRequest = async () => {
    setPayoutNotice('')
    setActionError('')
    const amount = Number(payoutAmount)
    if (!Number.isInteger(amount) || amount <= 0) { setActionError(t('Enter a whole-number payout amount greater than zero.')); return }
    if (!payoutReference.trim()) { setActionError(t('Enter the Mobile Money phone number or bank account reference.')); return }
    if (amount > availablePayoutBalance) { setActionError(t('Amount exceeds your available balance of {{amount}}.', { amount: formatPrice(availablePayoutBalance) })); return }
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
    setPayoutNotice(t('Payout request submitted. It will appear below while the platform team processes the transfer.'))
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
    const note = window.prompt(status === 'approved' ? t('Optional note for the customer') : t('Reason for declining this request')) ?? ''
    if (status === 'rejected' && !note.trim()) return
    setActionError('')
    const { error } = await supabase.rpc('review_ticket_refund', { p_request_id: request.id, p_status: status, p_note: note.trim() || null })
    if (error) { setActionError(error.message); return }
    setRefundRequests(current => current.map(item => item.id === request.id ? { ...item, status } : item))
  }

  if (!organizer) {
    return (
      <div className="flex items-center justify-center min-h-screen flex-col gap-4 pt-16" style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
        <p className="text-2xl font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>{t('No organizer account found')}</p>
        <p style={{ color: 'var(--muted-foreground)' }}>{t('Sign in as an organizer to access the dashboard.')}</p>
        <button onClick={() => navigate('auth-organizer')} className="px-6 py-3 rounded-xl font-bold" style={{ background: 'var(--primary)', color: '#000' }}>
          {t('Sign in as Organizer')}
        </button>
      </div>
    )
  }

  if (teamMembership && !isOwner && teamMembership.status === 'pending') {
    return (
      <div className="flex min-h-screen items-center justify-center p-6" style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
        <div className="w-full max-w-md rounded-2xl border p-6 text-center" style={{ background: '#1a1d1d', borderColor: 'var(--border)' }}>
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--muted-foreground)' }}>{t('Team invitation')}</p>
          <h1 className="mt-2 text-2xl font-black">{t('Join')} {organizer.name}</h1>
          <p className="mt-3 text-sm" style={{ color: 'var(--muted-foreground)' }}>{t('Accept this invitation to access the organizer workspace.')}</p>
          <button onClick={acceptMembership} className="mt-6 rounded-xl px-5 py-3 text-sm font-bold" style={{ background: 'var(--primary)', color: '#000' }}>{t('Accept invitation')}</button>
        </div>
      </div>
    )
  }

  if (teamMembership && !isOwner && visibleNav.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6" style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
        <div className="w-full max-w-md rounded-2xl border p-6 text-center" style={{ background: '#1a1d1d', borderColor: 'var(--border)' }}>
          <h1 className="text-2xl font-black">{t('No dashboard permissions')}</h1>
          <p className="mt-3 text-sm" style={{ color: 'var(--muted-foreground)' }}>{t('Ask the organizer owner to assign you a role with dashboard access.')}</p>
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
    .filter(event => event.status === 'published' && event.date.slice(0, 10) === overviewCalendarDate)
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
        onOpenSettings={() => { setOrganizerSettingsTab('workspace'); selectSection('settings') }}
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
            <header className="organizer-analytics-page-heading organizer-orders-heading organizer-dashboard-overview-heading">
              <div className="organizer-analytics-title-block"><h3>{t('Overview')}</h3><p>{t('Your workspace at a glance—events, ticket sales, and recent activity.')}</p></div>
              <div className="organizer-orders-heading-meta"><span className="organizer-finance-live-dot" />{lastUpdated ? t('Updated {{time}}', { time: lastUpdated.toLocaleTimeString() }) : t('Loading workspace activity')}</div>
            </header>
            <div className="organizer-overview-stat-grid">
              <article className="organizer-overview-stat"><span className="organizer-overview-stat-icon"><TicketCheck size={17} strokeWidth={1.8} /></span><small>{t('Tickets sold')}</small><strong>{canViewOverviewAnalytics ? totalTicketsSold.toLocaleString() : '—'}</strong><span>{canViewOverviewAnalytics ? t('{{count}} still available', { count: overviewTicketsRemaining.toLocaleString() }) : t('Analytics access required')}</span></article>
              <article className="organizer-overview-stat"><span className="organizer-overview-stat-icon"><CalendarDays size={17} strokeWidth={1.8} /></span><small>{t('Published events')}</small><strong>{canViewEvents ? publishedEvents : '—'}</strong><span>{canViewEvents ? t('{{count}} total in your workspace', { count: events.length }) : t('Event access required')}</span></article>
              <article className="organizer-overview-stat"><span className="organizer-overview-stat-icon"><CircleDollarSign size={17} strokeWidth={1.8} /></span><small>{t('Net ticket revenue')}</small><strong>{canViewOverviewAnalytics || canAccessSection('transactions') ? formatPrice(totalRevenue) : '—'}</strong><span>{canViewOverviewAnalytics || canAccessSection('transactions') ? t('From confirmed ticket orders') : t('Finance access required')}</span></article>
              <article className="organizer-overview-stat"><span className="organizer-overview-stat-icon"><UsersRound size={17} strokeWidth={1.8} /></span><small>{t('Customers')}</small><strong>{canViewOverviewCustomers ? customers.length.toLocaleString() : '—'}</strong><span>{canViewOverviewCustomers ? t('{{count}} orders recorded', { count: orders.length.toLocaleString() }) : t('Customer access required')}</span></article>
            </div>

            <div className="organizer-overview-feature-grid">
              <div className="organizer-overview-feature-left">
              <section className="organizer-overview-wallet-banner" aria-label={t('Wallet overview')}>
                <div className="organizer-overview-wallet-top">
                  <span className="organizer-overview-wallet-brand"><span className="organizer-overview-wallet-mark">Q</span><span>{t('QPassa wallet')}</span></span>
                  <Wallet size={19} strokeWidth={1.7} aria-hidden="true" />
                </div>
                <div className="organizer-overview-wallet-balance">
                  <small>{t('Available balance')}</small>
                  <strong>{isOwner ? formatPrice(availablePayoutBalance) : t('Owner-managed')}</strong>
                </div>
                <div className="organizer-overview-wallet-footer">
                  <span>{isOwner ? t('Ready for your next payout') : t('Wallet access is managed by the owner')}</span>
                  {isOwner && <button type="button" onClick={() => selectSection('payouts')} className="organizer-overview-wallet-action">{t('Open wallet')} <ArrowUpRight size={15} /></button>}
                </div>
              </section>

              <button
                type="button"
                className="organizer-overview-next-event-banner"
                onClick={() => nextPublishedEvent ? openEventView(nextPublishedEvent) : openCreateEvent()}
              >
                {nextPublishedEvent?.cover_image && <img className="organizer-overview-next-event-cover" src={nextPublishedEvent.cover_image} alt="" />}
                <span className="organizer-overview-next-event-copy">
                  <strong>{nextPublishedEvent?.title ?? t('Make your next event happen')}</strong>
                  <small>{nextPublishedEvent ? `${new Date(nextPublishedEvent.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · ${nextPublishedEvent.venue}` : t('Create an event and start selling tickets.')}</small>
                </span>
                <span className="organizer-overview-next-event-action">{nextPublishedEvent ? t('View event') : t('Create event')} <ArrowUpRight size={15} /></span>
              </button>

              <section className="organizer-overview-quick-actions" aria-label={t('Quick actions')}>
                <div className="organizer-overview-quick-heading"><p className="organizer-overview-card-kicker">{t('QUICK ACTIONS')}</p><span>{t('Jump back into your workflow')}</span></div>
                <div className="organizer-overview-quick-grid">
                  {canAccessSection('events') && <button type="button" onClick={openCreateEvent}>
                    <span className="organizer-overview-quick-icon"><CalendarPlus size={17} /></span>
                    <span><strong>{t('Create an event')}</strong><small>{t('Set up your next experience')}</small></span>
                    <ArrowUpRight size={16} />
                  </button>}
                  {canAccessSection('events') && <button type="button" onClick={() => selectSection('events')}>
                    <span className="organizer-overview-quick-icon"><CalendarDays size={17} /></span>
                    <span><strong>{t('Manage events')}</strong><small>{t('Update listings and tickets')}</small></span>
                    <ArrowUpRight size={16} />
                  </button>}
                  {canAccessSection('orders') && <button type="button" onClick={() => selectSection('orders')}>
                    <span className="organizer-overview-quick-icon"><ClipboardList size={17} /></span>
                    <span><strong>{t('Review orders')}</strong><small>{t('Check recent ticket sales')}</small></span>
                    <ArrowUpRight size={16} />
                  </button>}
                  {canViewOverviewAnalytics && <button type="button" onClick={() => selectSection('analytics')}>
                    <span className="organizer-overview-quick-icon"><ChartNoAxesCombined size={17} /></span>
                    <span><strong>{t('View analytics')}</strong><small>{t('Track revenue and attendance')}</small></span>
                    <ArrowUpRight size={16} />
                  </button>}
                </div>
              </section>
              </div>

              <div className="organizer-overview-calendar-column">
              <section className="organizer-overview-calendar" aria-label={t('Event calendar')}>
                <div className="organizer-overview-calendar-heading">
                  <button type="button" aria-label={t('Previous month')} onClick={() => setOverviewCalendarMonth(month => new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={17} /></button>
                  <h3>{formatLocaleDate(overviewCalendarMonth, { month: 'long', year: 'numeric' })}</h3>
                  <button type="button" aria-label={t('Next month')} onClick={() => setOverviewCalendarMonth(month => new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={17} /></button>
                </div>
                <div className="organizer-overview-calendar-grid" role="grid" aria-label={formatLocaleDate(overviewCalendarMonth, { month: 'long', year: 'numeric' })}>
                  {overviewCalendarWeekdays.map((day, index) => <span className="organizer-overview-calendar-weekday" key={`${day}-${index}`} role="columnheader">{day}</span>)}
                  {overviewCalendarCells.map(({ day, date, inMonth }) => {
                    const dateKey = localDateKey(date)
                    const hasEvents = overviewCalendarEventDays.has(dateKey)
                    return <button key={dateKey} type="button" role="gridcell" aria-label={`${formatLocaleDate(date, { month: 'long', day: 'numeric' })}${hasEvents ? `, ${t('events scheduled')}` : ''}`} aria-pressed={overviewCalendarDate === dateKey} data-today={dateKey === localDateKey(new Date()) || undefined} data-has-events={hasEvents || undefined} data-in-month={inMonth || undefined} onClick={() => { setOverviewCalendarDate(dateKey); if (!inMonth) setOverviewCalendarMonth(new Date(date.getFullYear(), date.getMonth(), 1)) }}>{day}{hasEvents && <i />}</button>
                  })}
                </div>
                <div className="organizer-overview-calendar-agenda">
                  <strong>{t('Upcoming events')}</strong>
                  {overviewCalendarUpcomingEvents.length ? (
                    overviewCalendarUpcomingEvents.slice(0, 1).map(event => (
                      <button key={event.id} type="button" onClick={() => openEventView(event)}>
                        <span>
                          <strong>{event.title}</strong>
                          <small>{formatLocaleDate(new Date(`${event.date.slice(0, 10)}T00:00:00`), { weekday: 'short', month: 'short', day: 'numeric' })}</small>
                        </span>
                        <ArrowUpRight size={13} />
                      </button>
                    ))
                  ) : <span>{t('No upcoming events')}</span>}
                </div>
              </section>
              </div>
            </div>

            <div className="organizer-overview-bottom-grid">
              <section className="organizer-overview-panel">
                <div className="organizer-overview-panel-heading"><div><p className="organizer-overview-card-kicker">{t('YOUR WORKSPACE')}</p><h4>{t('Pick up where you left off')}</h4></div><button type="button" onClick={() => selectSection('events')} aria-label={t('View all events')}><ArrowUpRight size={17} /></button></div>
                {events.slice(0, 3).length ? <div className="organizer-overview-event-list">{events.slice(0, 3).map(event => <button key={event.id} type="button" onClick={() => openEventView(event)}><span className="organizer-overview-event-thumb">{event.cover_image ? <img src={event.cover_image} alt="" /> : <CalendarDays size={18} />}</span><span className="min-w-0 flex-1"><strong>{event.title}</strong><small>{formatLocaleDate(event.date, { month: 'short', day: 'numeric', year: 'numeric' })} · {event.venue}</small></span><Badge className="organizer-overview-list-badge" label={event.status} color={STATUS_COLORS[event.status] ?? '#888'} /><ChevronRight size={15} /></button>)}</div> : <div className="organizer-overview-empty"><p>{t('No events yet—your first one can start today.')}</p><button type="button" onClick={openCreateEvent}>{t('Create event')} <Plus size={15} /></button></div>}
              </section>
              {canViewOverviewOrders && <section className="organizer-overview-panel organizer-overview-orders-panel">
                <div className="organizer-overview-panel-heading"><div><p className="organizer-overview-card-kicker">{t('RECENT ACTIVITY')}</p><h4>{t('Latest orders')}</h4></div><button type="button" onClick={() => selectSection('orders')} aria-label={t('View all orders')}><ArrowUpRight size={17} /></button></div>
                {orders.slice(0, 3).length ? <div className="organizer-overview-order-list">{orders.slice(0, 3).map(order => <button type="button" key={order.id} onClick={() => { selectSection('orders'); setSelectedOrder(order) }}><span className="organizer-overview-order-icon"><TicketCheck size={16} /></span><span className="min-w-0 flex-1"><strong>{(order as any).profiles?.full_name ?? t('Ticket buyer')}</strong><small>{(order as any).events?.title ?? t('Event ticket')} · {new Date(order.created_at).toLocaleDateString()}</small></span><span className="organizer-overview-order-total">{formatPrice(order.total)}</span></button>)}</div> : <div className="organizer-overview-empty"><p>{t('New ticket orders will show up here.')}</p><button type="button" onClick={() => selectSection('events')}>{t('Explore events')} <ArrowUpRight size={15} /></button></div>}
              </section>}
            </div>
          </section>}

          <>
              {/* ── ANALYTICS / OVERVIEW ── */}
              {section === 'analytics' && (
                <div className="organizer-analytics-page space-y-6">
                  <header className="organizer-analytics-page-heading">
                    <div className="organizer-analytics-title-block">
                      <h3>Analytics</h3>
                      <p>Track revenue, ticket sales, and event performance across your workspace.</p>
                    </div>
                    <div className="organizer-analytics-header-controls">
                      <div className="organizer-analytics-header-ranges" role="group" aria-label="Analytics date range">
                        {([['day', 'Today'], ['week', 'Week'], ['month', 'Month'], ['year', 'Year'], ['all', 'All time']] as const).map(([range, label]) => (
                          <button key={range} type="button" onClick={() => setAnalyticsRange(range)} aria-pressed={analyticsRange === range}>{label}</button>
                        ))}
                      </div>
                      {(analyticsRange === 'day' || analyticsRange === 'month') && <div className="organizer-analytics-header-intervals" role="group" aria-label="Analytics interval">
                        {(analyticsRange === 'day' ? [1, 2, 4, 6, 12] : [1, 2, 4]).map(option => {
                          const value = analyticsRange === 'day' ? analyticsDayInterval : analyticsMonthInterval
                          const active = value === option
                          return <button key={option} type="button" onClick={() => analyticsRange === 'day' ? setAnalyticsDayInterval(option) : setAnalyticsMonthInterval(option)} aria-pressed={active}>{analyticsRange === 'day' ? `${option}h` : `${option}w`}</button>
                        })}
                      </div>}
                      <button type="button" className="organizer-analytics-date-trigger" onClick={() => { setAnalyticsStart(localDateKey(rangeStart)); setAnalyticsEnd(localDateKey(rangeEnd)); setAnalyticsRange('custom') }} aria-label="Choose a custom analytics date range">
                        <CalendarDays size={14} aria-hidden="true" />
                        <span>{analyticsRange === 'custom' && analyticsStart && analyticsEnd ? `${new Date(`${analyticsStart}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} – ${new Date(`${analyticsEnd}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}` : 'Select dates'}</span>
                      </button>
                    </div>
                  </header>
                  {analyticsRange === 'custom' && <div className="organizer-analytics-detail-controls"><div className="organizer-analytics-custom-dates" style={{ color: 'var(--muted-foreground)' }}><label><span>From</span><input type="date" value={analyticsStart} onChange={event => setAnalyticsStart(event.target.value)} /></label><label><span>To</span><input type="date" value={analyticsEnd} onChange={event => setAnalyticsEnd(event.target.value)} /></label></div></div>}
                  {verificationStatus !== 'verified' && <div className="organizer-analytics-verification flex flex-col gap-4 rounded-2xl p-5 sm:flex-row sm:items-center sm:justify-between" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                    <div><p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--muted-foreground)' }}>Organizer verification</p><p className="mt-1 text-sm" style={{ color: 'var(--muted-foreground)' }}>{verificationStatus === 'verified' ? 'Your organizer profile is verified.' : verificationStatus === 'pending' ? 'Your verification request is awaiting review.' : 'Verify your profile to show a trusted badge on organizer cards and profiles.'}</p></div>
                    <button onClick={requestVerification} disabled={!isOwner || verificationStatus !== 'unverified' || verificationSubmitting} className="rounded-xl px-4 py-2.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60" style={{ background: verificationStatus === 'unverified' && isOwner ? 'var(--primary)' : 'var(--muted)', color: verificationStatus === 'unverified' && isOwner ? '#000' : 'var(--muted-foreground)' }}>{verificationStatus === 'verified' ? 'Verified' : verificationStatus === 'pending' ? 'Pending review' : verificationSubmitting ? 'Submitting…' : isOwner ? 'Request verification' : 'Owner only'}</button>
                  </div>}
                  {/* KPI grid */}
                  <div className="organizer-analytics-stat-grid grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <article className="organizer-overview-stat organizer-analytics-stat"><span className="organizer-overview-stat-icon"><ClipboardList size={17} strokeWidth={1.8} /></span><small>Confirmed orders</small><strong>{confirmedOrders.length.toLocaleString()}</strong><span>Within {analyticsRangeLabel.toLowerCase()}</span></article>
                    <article className="organizer-overview-stat organizer-analytics-stat"><span className="organizer-overview-stat-icon"><CircleDollarSign size={17} strokeWidth={1.8} /></span><small>Average order value</small><strong>{avgOrderValue > 0 ? formatPrice(avgOrderValue) : '—'}</strong><span>Net confirmed ticket sales</span></article>
                    <article className="organizer-overview-stat organizer-analytics-stat"><span className="organizer-overview-stat-icon"><ReceiptText size={17} strokeWidth={1.8} /></span><small>Platform fees</small><strong>{formatPrice(totalPlatformCommission)}</strong><span>From confirmed orders</span></article>
                    <article className="organizer-overview-stat organizer-analytics-stat"><span className="organizer-overview-stat-icon"><RotateCcw size={17} strokeWidth={1.8} /></span><small>Processed refunds</small><strong>{formatPrice(totalProcessedRefunds)}</strong><span>For this date range</span></article>
                  </div>

                  {/* Chart + recent */}
                  <div className="organizer-analytics-chart-grid grid grid-cols-1 lg:grid-cols-3 gap-5">
                    {/* Revenue chart */}
                    <div className="organizer-analytics-surface organizer-analytics-revenue-card lg:col-span-2 rounded-2xl p-5" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                      <div className="organizer-analytics-card-heading mb-5 flex items-start justify-between gap-3">
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
                    <div className="organizer-analytics-surface organizer-analytics-orders-card rounded-2xl p-5" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                      <div className="organizer-analytics-card-heading mb-5 flex items-start justify-between gap-3">
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

                  </div>

                  {/* Additional analytics */}
                  <div className="organizer-analytics-trend-grid grid grid-cols-1 xl:grid-cols-6 gap-5">
                    <div className="organizer-analytics-surface organizer-analytics-trend-card xl:col-span-3 overflow-x-auto rounded-2xl p-5" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                      <div className="organizer-analytics-card-heading mb-4 flex items-center justify-between">
                        <div><h2 className="font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>Revenue trend</h2><p className="mt-1 text-[10px]" style={{ color: 'var(--muted-foreground)' }}>Confirmed sales across the selected {analyticsRangeLabel.toLowerCase()} range</p></div>
                        <TrendingUpIcon size={17} style={{ color: 'var(--primary)' }} />
                      </div>
                      <RevenueTrendChart data={chartData} />
                    </div>
                    <div className="organizer-analytics-surface organizer-analytics-event-performance-card xl:col-span-3 rounded-2xl p-5" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                      <div className="organizer-analytics-card-heading mb-5 flex items-center justify-between">
                        <div><h2 className="font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>Event performance</h2><p className="mt-1 text-[10px]" style={{ color: 'var(--muted-foreground)' }}>Revenue by event</p></div>
                        <BarChartIcon size={17} style={{ color: 'var(--accent)' }} />
                      </div>
                        <EventPerformanceChart events={events} performance={eventAnalytics} />
                    </div>
                  </div>

                  <div className="organizer-analytics-insight-grid grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    <section className="organizer-analytics-surface organizer-analytics-insight-card rounded-2xl p-5">
                      <div className="organizer-analytics-card-heading mb-5 flex items-center justify-between gap-3"><div><h2 className="font-bold">Ticket sales by event</h2><p className="mt-1">Confirmed tickets in the selected range</p></div><TicketCheck size={17} aria-hidden="true" /></div>
                      <TicketSalesByEventChart events={events} performance={eventAnalytics} />
                    </section>
                    <section className="organizer-analytics-surface organizer-analytics-insight-card rounded-2xl p-5">
                      <div className="organizer-analytics-card-heading mb-5 flex items-center justify-between gap-3"><div><h2 className="font-bold">Revenue composition</h2><p className="mt-1">Gross collection less deductions</p></div><CircleDollarSign size={17} aria-hidden="true" /></div>
                      <RevenueBreakdownChart items={[
                        { label: 'Gross ticket collection', amount: confirmedOrders.reduce((sum, order) => sum + ticketSubtotalForOrder(order), 0) },
                        { label: 'Platform fees', amount: totalPlatformCommission },
                        { label: 'Agent commissions', amount: totalAgentCommission },
                        { label: 'Processed refunds', amount: totalProcessedRefunds },
                        { label: 'Net ticket revenue', amount: totalRevenue },
                      ]} />
                    </section>
                    <section className="organizer-analytics-surface organizer-analytics-insight-card rounded-2xl p-5">
                      <div className="organizer-analytics-card-heading mb-5 flex items-center justify-between gap-3"><div><h2 className="font-bold">Payment methods</h2><p className="mt-1">Confirmed orders by method</p></div><Wallet size={17} aria-hidden="true" /></div>
                      <PaymentMethodChart orders={confirmedOrders} />
                    </section>
                  </div>

                  <div className="organizer-analytics-bottom-tables">
                    <section className="organizer-analytics-surface organizer-analytics-insight-card organizer-analytics-recent-orders organizer-analytics-bottom-card rounded-2xl p-5" aria-labelledby="analytics-recent-orders-title">
                      <div className="organizer-analytics-card-heading mb-5 flex items-center justify-between gap-3">
                        <div><h2 id="analytics-recent-orders-title" className="font-bold">Recent orders</h2><p>Latest ticket purchases from your events</p></div>
                        <ReceiptText size={17} aria-hidden="true" />
                      </div>
                      <div className="organizer-analytics-recent-table-wrap">
                        <table className="organizer-analytics-recent-table organizer-analytics-insight-table organizer-analytics-bottom-table">
                          <thead><tr>{['Customer', 'Event', 'Order total', 'Status'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
                          <tbody>
                            {orders.slice(0, 8).map(o => {
                              const customerName = (o as any).profiles?.full_name ?? 'Customer'
                              return <tr key={o.id}>
                                <td><span className="organizer-analytics-recent-customer"><strong>{customerName}</strong><small>{new Date(o.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</small></span></td>
                                <td className="organizer-analytics-bottom-event">{(o as any).events?.title ?? 'Event ticket'}</td>
                                <td><strong className="organizer-analytics-recent-total">{formatPrice(o.total)}</strong></td>
                                <td><Badge className="organizer-analytics-status-badge" label={o.status} color={STATUS_COLORS[o.status] ?? '#888'} /></td>
                              </tr>
                            })}
                            {orders.length === 0 && <tr><td colSpan={4} className="organizer-analytics-recent-empty">Your first ticket order will appear here.</td></tr>}
                          </tbody>
                        </table>
                      </div>
                    </section>

                    <section className="organizer-analytics-surface organizer-analytics-insight-card organizer-analytics-event-table organizer-analytics-bottom-card rounded-2xl p-5" aria-labelledby="analytics-event-performance-title">
                      <div className="organizer-analytics-card-heading mb-5 flex items-center justify-between gap-3">
                        <div><h2 id="analytics-event-performance-title" className="font-bold">{t('Event performance')}</h2><p>{t('Revenue by event')} · {t('sales and capacity')}</p></div>
                        <BarChartIcon size={17} aria-hidden="true" />
                      </div>
                      <div className="overflow-x-auto">
                        <table aria-label={t('Event status, date, ticket sales, and revenue for the selected period')} className="organizer-dashboard-event-performance-table organizer-analytics-premium-table organizer-analytics-insight-table organizer-analytics-bottom-table w-full text-sm">
                        <thead>
                          <tr>
                            {[t('Event'), t('Status'), t('Event date'), t('Tickets sold'), t('Revenue')].map(h => (
                              <th key={h} scope="col" className="text-left px-5 py-3 text-xs font-semibold">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {events.slice(0, 8).map(ev => {
                            const performance = eventAnalytics.get(ev.id) ?? { tickets: 0, revenue: 0 }
                            const capacity = Number(ev.capacity) || 0
                            const soldPercent = capacity > 0 ? Math.min((performance.tickets / capacity) * 100, 100) : 0
                            return (
                              <tr key={ev.id} className="organizer-analytics-table-row border-t" style={{ borderColor: 'var(--border)' }}>
                                <td className="organizer-analytics-event-name px-5 py-3"><span className="organizer-analytics-event-mark"><CalendarDays size={15} /></span><span><strong>{ev.title}</strong><small>{ev.venue || t('Venue not set')}</small></span></td>
                                <td className="px-5 py-3"><Badge className="organizer-analytics-status-badge" label={ev.status} color={STATUS_COLORS[ev.status] ?? '#888'} /></td>
                                <td className="px-5 py-3"><span className="organizer-analytics-date-cell">{new Date(ev.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span></td>
                                <td className="organizer-analytics-capacity-cell px-5 py-3"><span><strong>{performance.tickets.toLocaleString()}</strong><small>{capacity > 0 ? `${t('of')} ${capacity.toLocaleString()}` : t('tickets sold')}</small></span><i role="progressbar" aria-label={`${ev.title} ${t('capacity sold')}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(soldPercent)}><b style={{ width: `${soldPercent}%` }} /></i></td>
                                <td className="organizer-analytics-revenue-cell px-5 py-3"><strong>{formatPrice(performance.revenue)}</strong><small>{t('Net ticket sales')}</small></td>
                              </tr>
                            )
                          })}
                          {events.length === 0 && (
                            <tr><td colSpan={5} className="organizer-analytics-empty-table px-5 py-12 text-center"><span><CalendarDays size={18} /></span><strong>{t('No events to report yet')}</strong><small>{t('Create an event to see performance metrics here.')}</small></td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    </section>
                  </div>
                </div>
              )}

              {/* ── ORGANIZER NOTIFICATIONS ── */}
              {section === 'notifications' && (
                <div className="organizer-notifications-page organizer-analytics-page space-y-5">
                  <header className="organizer-analytics-page-heading organizer-orders-heading organizer-notifications-heading">
                    <div className="organizer-analytics-title-block"><h3>{t('Notifications')}</h3><p>{t('Sales, event changes, followers, and team activity across your workspace.')}</p></div>
                    {unreadOrganizerNotifications.length > 0 && <button type="button" onClick={() => void markAllOrganizerNotificationsRead()} className="organizer-orders-export"><CheckIcon size={14} />{t('Mark all read')}</button>}
                  </header>

                  <div className="organizer-notifications-stat-grid grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <article className="organizer-overview-stat"><span className="organizer-overview-stat-icon"><Bell size={17} /></span><small>{t('Total updates')}</small><strong>{organizerNotifications.length.toLocaleString()}</strong><span>{t('Across this workspace')}</span></article>
                    <article className="organizer-overview-stat"><span className="organizer-overview-stat-icon"><Shield size={17} /></span><small>{t('Unread')}</small><strong>{unreadOrganizerNotifications.length.toLocaleString()}</strong><span>{t('Waiting for your review')}</span></article>
                    <article className="organizer-overview-stat"><span className="organizer-overview-stat-icon"><CalendarDays size={17} /></span><small>{t('Event updates')}</small><strong>{organizerNotifications.filter(notification => notification.type === 'event' || !!notification.event_id).length.toLocaleString()}</strong><span>{t('Listings and event activity')}</span></article>
                    <article className="organizer-overview-stat"><span className="organizer-overview-stat-icon"><UsersRound size={17} /></span><small>{t('Followers')}</small><strong>{organizerNotifications.filter(notification => notification.type === 'follower').length.toLocaleString()}</strong><span>{t('Community activity')}</span></article>
                  </div>

                  <section className="organizer-orders-panel organizer-notifications-panel">
                    <div className="organizer-orders-toolbar">
                      <div className="organizer-notifications-panel-heading"><strong>{t('Recent activity')}</strong><small>{filteredOrganizerNotifications.length} {t('update')}{filteredOrganizerNotifications.length === 1 ? '' : 's'} {t('in this view')}</small></div>
                      <span className="organizer-notifications-panel-total">{unreadOrganizerNotifications.length} {t('unread')}</span>
                    </div>
                    <div className="organizer-orders-status-filters organizer-notifications-filters" role="group" aria-label={t('Filter notifications')}>
                      {([['all', t('All updates')], ['unread', t('Unread')], ['events', t('Events')], ['sales', t('Sales')], ['followers', t('Followers')], ['team', t('Team')]] as const).map(([key, label]) => <button key={key} type="button" onClick={() => setNotificationFilter(key)} aria-pressed={notificationFilter === key}>{label}</button>)}
                    </div>
                    {filteredOrganizerNotifications.length === 0 ? <div className="organizer-orders-empty organizer-notifications-empty"><span><Bell size={20} /></span><strong>{t('Nothing here yet')}</strong><small>{t('New organizer activity will appear here.')}</small></div> : <div className="organizer-notifications-list">{filteredOrganizerNotifications.map(notification => {
                      const title = notification.title.toLowerCase()
                      const NotificationIcon = notification.type === 'payment' || title.includes('order') || title.includes('ticket') ? DollarSignIcon : notification.type === 'follower' ? UserIcon : notification.type === 'team' || title.includes('member') || title.includes('role') ? UsersIcon : notification.type === 'event' || notification.event_id ? CalendarIcon : BellIcon
                      return <button key={notification.id} type="button" onClick={() => void openOrganizerNotification(notification)} className={`organizer-notification-row ${notification.read_at ? '' : 'is-unread'}`}>
                        <span className="organizer-notification-icon"><NotificationIcon size={17} /></span>
                        <span className="organizer-notification-copy"><span className="organizer-notification-title">{notification.title}</span><span className="organizer-notification-body">{notification.body}</span><span className="organizer-notification-time">{new Date(notification.created_at).toLocaleString()}</span></span>
                        {!notification.read_at && <span className="organizer-notification-unread-dot" aria-label={t('Unread')} />}
                      </button>
                    })}</div>}
                  </section>
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
                  <header className="organizer-analytics-page-heading organizer-orders-heading organizer-events-heading">
                    <div className="organizer-analytics-title-block"><h3>{t('Events')}</h3><p>{t('Manage event listings, ticket inventory, and event status.')}</p></div>
                    <div className="organizer-events-header-actions"><button type="button" className="organizer-events-create" onClick={openCreateEvent}><Plus size={17} />{t('Create event')}</button><div className="organizer-orders-heading-meta"><span className="organizer-finance-live-dot" />{lastUpdated ? `${t('Updated')} ${lastUpdated.toLocaleTimeString()}` : t('Loading event activity')}</div></div>
                  </header>

                  <div className="organizer-overview-stat-grid organizer-events-stat-grid">
                    <article className="organizer-overview-stat"><span className="organizer-overview-stat-icon"><CalendarDays size={17} strokeWidth={1.8} /></span><small>{t('Total events')}</small><strong>{events.length.toLocaleString()}</strong><span>{t('In your workspace')}</span></article>
                    <article className="organizer-overview-stat"><span className="organizer-overview-stat-icon"><TicketCheck size={17} strokeWidth={1.8} /></span><small>{t('Published')}</small><strong>{publishedEvents.toLocaleString()}</strong><span>{t('Currently live')}</span></article>
                    <article className="organizer-overview-stat"><span className="organizer-overview-stat-icon"><UsersRound size={17} strokeWidth={1.8} /></span><small>{t('Tickets sold')}</small><strong>{totalTicketsSold.toLocaleString()}</strong><span>{t('From confirmed orders')}</span></article>
                    <article className="organizer-overview-stat"><span className="organizer-overview-stat-icon"><TicketCheck size={17} strokeWidth={1.8} /></span><small>{t('Tickets available')}</small><strong>{overviewTicketsRemaining.toLocaleString()}</strong><span>{t('Across all events')}</span></article>
                  </div>

                  <div className="organizer-events-tabs" role="tablist" aria-label={t('Filter events by status')}>
                    {eventFilterTabs.map(tab => {
                      const count = tab.key === 'all' ? events.length : events.filter(event => getEventListStatus(event) === tab.key).length
                      return <button key={tab.key} type="button" role="tab" aria-selected={eventsFilter === tab.key} onClick={() => setEventsFilter(tab.key)}>
                        <span>{tab.label}</span><small>{count}</small>
                      </button>
                    })}
                  </div>

                  <div className="organizer-events-toolbar">
                    <label className="organizer-events-search"><Search size={17} aria-hidden="true" /><input type="search" value={eventsSearch} onChange={event => setEventsSearch(event.target.value)} placeholder={t('Search by event title…')} aria-label={t('Search events by title')} /></label>
                    <label className="organizer-events-category"><Filter size={15} aria-hidden="true" /><select value={eventsCategory} onChange={event => setEventsCategory(event.target.value)} aria-label={t('Filter by category')}><option value="all">{t('All categories')}</option>{eventCategories.map(category => <option key={category} value={category}>{category}</option>)}</select></label>
                    <span className="organizer-events-result-count">{filteredEvents.length} {t('shown')}</span>
                  </div>

                  {filteredEvents.length === 0 ? <div className="organizer-events-empty">
                    <span><CalendarDays size={23} /></span><h2>{events.length ? t('No events match these filters') : t('Your next event starts here')}</h2>
                    <p>{events.length ? t('Try another status, category, or search term.') : t('Create an event page and bring your next experience to life.')}</p>
                    <button type="button" onClick={() => events.length ? (setEventsFilter('all'), setEventsCategory('all'), setEventsSearch(''), setDashboardSearch('')) : openCreateEvent()}>{events.length ? t('Clear filters') : t('Create your first event')} <ArrowUpRight size={15} /></button>
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
                          <button type="button" className="organizer-event-more" aria-label={`More actions for ${ev.title}`} aria-expanded={openEventMenu === ev.id} onClick={event => {
                            if (openEventMenu === ev.id) { setOpenEventMenu(null); return }
                            const rect = event.currentTarget.getBoundingClientRect()
                            const menuWidth = 176
                            const menuHeight = Math.min(192, Math.max(0, window.innerHeight - 16))
                            const spaceBelow = window.innerHeight - rect.bottom - 8
                            const spaceAbove = rect.top - 8
                            const top = spaceBelow >= menuHeight || spaceBelow >= spaceAbove
                              ? Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - menuHeight - 8))
                              : Math.max(8, rect.top - menuHeight - 8)
                            const left = Math.max(8, Math.min(window.innerWidth - menuWidth - 8, rect.right - menuWidth))
                            setEventMenuPosition({ top, left })
                            setOpenEventMenu(ev.id)
                          }}><MoreHorizontal size={19} /></button>
                          {openEventMenu === ev.id && eventMenuPosition && createPortal(<div className="organizer-event-menu" role="menu" style={{ top: eventMenuPosition.top, left: eventMenuPosition.left }}>
                            <button type="button" role="menuitem" onClick={() => { setOpenEventMenu(null); openEventView(ev) }}><EyeIcon size={15} />View details</button>
                            <button type="button" role="menuitem" onClick={() => { setOpenEventMenu(null); openEditEvent(ev) }}><EditIcon size={15} />Edit event</button>
                            <button type="button" role="menuitem" onClick={() => { setOpenEventMenu(null); void toggleEventStatus(ev) }}>{ev.status === 'published' ? <XIcon size={15} /> : <CheckIcon size={15} />}{ev.status === 'published' ? 'Unpublish' : 'Publish'}</button>
                            <button type="button" role="menuitem" className="is-danger" onClick={() => { setOpenEventMenu(null); void deleteEvent(ev.id) }}><TrashIcon size={15} />Delete event</button>
                          </div>, document.body)}
                        </div>
                        <button type="button" className="organizer-event-card-copy" onClick={() => openEventView(ev)}>
                          <span className="organizer-event-card-category" style={{ '--category-tone': getEventCategoryTone(ev.category || '') } as React.CSSProperties}>{ev.category || 'Event'}</span>
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
                <div className="organizer-orders-page organizer-analytics-page space-y-5">
                  <header className="organizer-analytics-page-heading organizer-orders-heading">
                    <div className="organizer-analytics-title-block"><h3>Orders</h3><p>Keep track of ticket purchases across your events.</p></div>
                    <div className="organizer-orders-heading-meta"><span className="organizer-finance-live-dot" />{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : 'Loading order activity'}</div>
                  </header>

                  <div className="organizer-orders-summary-grid">
                    {([
                      ['confirmed', 'Confirmed', '#39a981'], ['pending', 'Pending', '#d19a38'], ['cancelled', 'Cancelled', '#d76c6c'], ['refunded', 'Refunded', '#668fe0'],
                    ] as const).map(([status, label, tone]) => <button key={status} type="button" className="organizer-orders-summary-card" onClick={() => setOrdersStatusFilter(current => current === status ? 'all' : status)} aria-pressed={ordersStatusFilter === status}>
                      <span style={{ color: tone }}>{orderStatusCounts[status].toLocaleString()}</span><small>{label}</small>
                    </button>)}
                  </div>

                  <section className="organizer-orders-panel">
                    <div className="organizer-orders-toolbar">
                      <label className="organizer-orders-search"><Search size={16} aria-hidden="true" /><input type="search" value={ordersSearch} onChange={event => setOrdersSearch(event.target.value)} placeholder="Search customer, event or order ID" aria-label="Search orders" />{ordersSearch && <button type="button" onClick={() => setOrdersSearch('')} aria-label="Clear search"><XIcon size={14} /></button>}</label>
                      <div className="organizer-orders-toolbar-actions">
                        <div className="organizer-orders-period-filter" role="group" aria-label="Filter orders by date">
                          {([['all', 'All time'], ['day', 'Today'], ['week', 'This week'], ['month', 'This month']] as const).map(([period, label]) => <button key={period} type="button" aria-pressed={ordersPeriod === period} onClick={() => setOrdersPeriod(period)}>{label}</button>)}
                        </div>
                        <button type="button" className="organizer-orders-refresh" onClick={() => void load()} disabled={dataLoading}><RotateCcw size={14} />{dataLoading ? 'Refreshing' : 'Refresh'}</button>
                        <button type="button" className="organizer-orders-export" onClick={exportOrders} disabled={!visibleOrders.length}><Download size={14} />Export CSV</button>
                      </div>
                    </div>

                    <div className="organizer-orders-status-filters" role="group" aria-label="Filter orders by status">
                      {([['all', 'All orders', orders.length], ['confirmed', 'Confirmed', orderStatusCounts.confirmed], ['pending', 'Pending', orderStatusCounts.pending], ['cancelled', 'Cancelled', orderStatusCounts.cancelled], ['refunded', 'Refunded', orderStatusCounts.refunded]] as const).map(([status, label, count]) => <button key={status} type="button" aria-pressed={ordersStatusFilter === status} onClick={() => setOrdersStatusFilter(status)}>{label}<span>{count}</span></button>)}
                      <span className="organizer-orders-visible-count">Showing {visibleOrders.length} of {orders.length}</span>
                    </div>

                    <div className="organizer-orders-table-wrap">
                      <table className="organizer-orders-table">
                        <thead><tr>{['Order', 'Customer', 'Event', 'Tickets', 'Source', 'Method', 'Total', 'Status', 'Date', ''].map((h, index) => <th key={`${h}-${index}`} scope="col">{h || <span className="sr-only">Actions</span>}</th>)}</tr></thead>
                        <tbody>
                        {visibleOrders.map(o => {
                          const event = events.find(item => item.id === o.event_id)
                          const tierNames = new Map((event?.ticket_tiers ?? []).map(tier => [tier.id, tier.name]))
                          const ticketCount = o.order_items?.reduce((sum, item) => sum + item.quantity, 0) || agentOrderMeta[o.id]?.quantity || 0
                          const tiers = [...new Set((o.order_items ?? []).map(item => tierNames.get(item.ticket_tier_id) ?? 'Unknown tier'))]
                          const customerName = (o as any).holder_name ?? (o as any).profiles?.full_name ?? 'Customer'
                          return (
                          <tr key={o.id}>
                            <td><span className="organizer-orders-id">#{o.id.slice(0, 8)}</span></td>
                            <td><span className="organizer-orders-customer"><strong>{customerName}</strong><small>{(o as any).holder_email ?? (o as any).profiles?.email ?? 'Customer'}</small></span></td>
                            <td><span className="organizer-orders-event">{(o as any).events?.title ?? '—'}</span></td>
                            <td><span className="organizer-orders-ticket-count">{ticketCount} ticket{ticketCount === 1 ? '' : 's'}</span><small className="organizer-orders-ticket-tiers">{tiers.length ? tiers.join(', ') : 'Tier details unavailable'}</small></td>
                            <td><span className="organizer-orders-source">{agentOrderMeta[o.id] ? agentOrderMeta[o.id].profiles?.full_name ?? 'Agent sale' : 'Online checkout'}</span></td>
                            <td><span className="organizer-orders-method">{(agentOrderMeta[o.id]?.payment_mode ?? o.payment_method?.replace(/_/g, ' ') ?? '—')}</span></td>
                            <td><strong className="organizer-orders-total">{formatPrice(o.total)}</strong></td>
                            <td><Badge className="organizer-orders-status" label={o.status} color={STATUS_COLORS[o.status] ?? '#888'} /></td>
                            <td><span className="organizer-orders-date">{new Date(o.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span></td>
                            <td><button type="button" onClick={() => setSelectedOrder(o)} className="organizer-orders-view">View</button></td>
                          </tr>
                          )
                        })}
                        {visibleOrders.length === 0 && <tr><td colSpan={10} className="organizer-orders-empty"><span><ClipboardList size={20} /></span><strong>{orders.length ? 'No orders match your filters' : 'No orders yet'}</strong><small>{orders.length ? 'Try another search or filter to see more orders.' : 'Your ticket purchases will appear here as they come in.'}</small>{(ordersSearch || ordersStatusFilter !== 'all' || ordersPeriod !== 'all') && <button type="button" onClick={() => { setOrdersSearch(''); setOrdersStatusFilter('all'); setOrdersPeriod('all') }}>Clear filters</button>}</td></tr>}
                      </tbody>
                    </table>
                  </div>
                  <div className="organizer-orders-responsive-list">
                    {visibleOrders.map(order => {
                      const customerName = (order as any).holder_name ?? (order as any).profiles?.full_name ?? 'Customer'
                      const eventTitle = (order as any).events?.title ?? 'Event ticket'
                      const agentSale = agentOrderMeta[order.id]
                      const ticketCount = order.order_items?.reduce((sum, item) => sum + item.quantity, 0) || agentSale?.quantity || 0
                      return <article className="organizer-order-responsive-card" key={order.id}>
                        <div className="organizer-order-responsive-top"><div><span className="organizer-orders-id">#{order.id.slice(0, 8)}</span><strong>{formatPrice(order.total)}</strong></div><Badge className="organizer-orders-status" label={order.status} color={STATUS_COLORS[order.status] ?? '#888'} /></div>
                        <h4>{customerName}</h4>
                        <p>{eventTitle}</p>
                        <div className="organizer-order-responsive-meta"><span>{ticketCount} ticket{ticketCount === 1 ? '' : 's'}</span><span>{new Date(order.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span><span>{agentSale?.payment_mode ?? order.payment_method?.replace(/_/g, ' ') ?? 'Online'}</span></div>
                        <button type="button" onClick={() => setSelectedOrder(order)} className="organizer-orders-view">View order</button>
                      </article>
                    })}
                    {visibleOrders.length === 0 && <div className="organizer-orders-empty"><span><ClipboardList size={20} /></span><strong>{orders.length ? 'No orders match your filters' : 'No orders yet'}</strong><small>{orders.length ? 'Try another search or filter to see more orders.' : 'Your ticket purchases will appear here as they come in.'}</small>{(ordersSearch || ordersStatusFilter !== 'all' || ordersPeriod !== 'all') && <button type="button" onClick={() => { setOrdersSearch(''); setOrdersStatusFilter('all'); setOrdersPeriod('all') }}>Clear filters</button>}</div>}
                  </div>
                  </section>
                </div>
              )}

              {/* ── CUSTOMERS ── */}
              {section === 'customers' && (
                <div className="organizer-customers-page organizer-analytics-page space-y-5">
                  <header className="organizer-analytics-page-heading organizer-orders-heading">
                    <div className="organizer-analytics-title-block"><h3>Customers</h3><p>Get to know the people showing up for your events.</p></div>
                    <div className="organizer-orders-heading-meta"><span className="organizer-finance-live-dot" />{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : 'Customer list'}</div>
                  </header>

                  <div className="organizer-orders-summary-grid organizer-customers-summary-grid">
                    <article className="organizer-orders-summary-card"><span>{customers.length.toLocaleString()}</span><small>Total customers</small></article>
                    <article className="organizer-orders-summary-card"><span>{customers.filter(customer => customer.total_orders > 1).length.toLocaleString()}</span><small>Returning customers</small></article>
                    <article className="organizer-orders-summary-card"><span>{formatPrice(customers.reduce((sum, customer) => sum + customer.total_spent, 0))}</span><small>Total customer spend</small></article>
                    <article className="organizer-orders-summary-card"><span>{customers.length ? formatPrice(Math.round(customers.reduce((sum, customer) => sum + customer.total_spent, 0) / customers.length)) : '—'}</span><small>Average spend</small></article>
                  </div>

                  <section className="organizer-orders-panel organizer-customers-panel">
                    <div className="organizer-orders-toolbar">
                      <label className="organizer-orders-search"><Search size={16} aria-hidden="true" /><input type="search" value={customersSearch} onChange={event => setCustomersSearch(event.target.value)} placeholder="Search name, email or phone" aria-label="Search customers" />{customersSearch && <button type="button" onClick={() => setCustomersSearch('')} aria-label="Clear search"><XIcon size={14} /></button>}</label>
                      <div className="organizer-orders-toolbar-actions">
                        <div className="organizer-orders-period-filter" role="group" aria-label="Filter customers by join date">
                          {([['all', 'All time'], ['day', 'Today'], ['week', 'This week'], ['month', 'This month']] as const).map(([period, label]) => <button key={period} type="button" aria-pressed={customersPeriod === period} onClick={() => setCustomersPeriod(period)}>{label}</button>)}
                        </div>
                        <button type="button" className="organizer-orders-export" onClick={exportCustomers} disabled={!visibleCustomers.length}><Download size={14} />Export CSV</button>
                      </div>
                    </div>
                    <div className="organizer-customers-results"><span>{visibleCustomers.length} of {customers.length} customers</span></div>

                    <div className="organizer-customers-table-wrap">
                      <table className="organizer-orders-table organizer-customers-table">
                        <thead><tr>{['Customer', 'Contact', 'Orders', 'Total spent', 'Customer since'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
                        <tbody>{visibleCustomers.map(customer => <tr key={customer.id}>
                          <td><span className="organizer-customers-name"><strong>{customer.full_name || 'Unnamed customer'}</strong><small>Customer account</small></span></td>
                          <td><span className="organizer-customers-contact"><strong>{customer.email || '—'}</strong><small>{customer.phone || 'Phone not provided'}</small></span></td>
                          <td><span className="organizer-customers-order-count">{customer.total_orders.toLocaleString()}</span></td>
                          <td><strong className="organizer-orders-total">{formatPrice(customer.total_spent)}</strong></td>
                          <td><span className="organizer-orders-date">{new Date(customer.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span></td>
                        </tr>)}
                        {visibleCustomers.length === 0 && <tr><td colSpan={5} className="organizer-orders-empty"><span><UsersRound size={20} /></span><strong>{customers.length ? 'No customers match your search' : 'No customers yet'}</strong><small>{customers.length ? 'Try another name, email, phone number, or date range.' : 'Your ticket buyers will appear here.'}</small>{(customersSearch || customersPeriod !== 'all') && <button type="button" onClick={() => { setCustomersSearch(''); setCustomersPeriod('all') }}>Clear filters</button>}</td></tr>}</tbody>
                      </table>
                    </div>

                    <div className="organizer-customers-mobile-list">
                      {visibleCustomers.map(customer => <article key={customer.id} className="organizer-customers-mobile-card">
                        <div className="organizer-customers-mobile-heading"><span className="organizer-customers-mobile-avatar">{(customer.full_name || 'C').trim().charAt(0).toUpperCase()}</span><span className="organizer-customers-name"><strong>{customer.full_name || 'Unnamed customer'}</strong><small>Joined {new Date(customer.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</small></span></div>
                        <div className="organizer-customers-mobile-contact"><span>{customer.email || 'Email not provided'}</span><span>{customer.phone || 'Phone not provided'}</span></div>
                        <div className="organizer-customers-mobile-stats"><span><small>Orders</small><strong>{customer.total_orders.toLocaleString()}</strong></span><span><small>Total spent</small><strong>{formatPrice(customer.total_spent)}</strong></span></div>
                      </article>)}
                      {visibleCustomers.length === 0 && <div className="organizer-orders-empty"><span><UsersRound size={20} /></span><strong>{customers.length ? 'No customers match your search' : 'No customers yet'}</strong><small>{customers.length ? 'Try another search or date range.' : 'Your ticket buyers will appear here.'}</small></div>}
                    </div>
                  </section>
                </div>
              )}

              {/* ── MEMBERS ── */}
              {section === 'followers' && (
                <div className="organizer-followers-page organizer-analytics-page space-y-5">
                  <header className="organizer-analytics-page-heading organizer-orders-heading">
                    <div className="organizer-analytics-title-block"><h3>Followers</h3><p>Your community, growing around the events you create.</p></div>
                    <div className="organizer-orders-heading-meta"><span className="organizer-finance-live-dot" />Community</div>
                  </header>
                  <div className="organizer-orders-summary-grid organizer-community-summary-grid">
                    <article className="organizer-orders-summary-card"><span>{followers.length.toLocaleString()}</span><small>Total followers</small></article>
                    <article className="organizer-orders-summary-card"><span>{followers.filter(follower => Date.now() - new Date(follower.created_at).getTime() <= 30 * 24 * 60 * 60 * 1000).length.toLocaleString()}</span><small>Joined this month</small></article>
                    <article className="organizer-orders-summary-card"><span>{events.filter(event => event.status === 'published').length.toLocaleString()}</span><small>Published events</small></article>
                    <article className="organizer-orders-summary-card"><span>{organizer.verified || organizer.verification_status === 'verified' ? 'Verified' : 'Building trust'}</span><small>Organizer profile</small></article>
                  </div>
                  <section className="organizer-orders-panel organizer-community-panel">
                    <div className="organizer-orders-toolbar">
                      <label className="organizer-orders-search"><Search size={16} aria-hidden="true" /><input type="search" value={followersSearch} onChange={event => setFollowersSearch(event.target.value)} placeholder="Search followers by name or username" aria-label="Search followers" />{followersSearch && <button type="button" onClick={() => setFollowersSearch('')} aria-label="Clear search"><XIcon size={14} /></button>}</label>
                      <div className="organizer-community-results">{visibleFollowers.length} of {followers.length} followers</div>
                    </div>
                    <div className="organizer-community-table-wrap">
                      <table className="organizer-orders-table organizer-community-table">
                        <thead><tr>{['Follower', 'Username', 'Following since', ''].map((label, index) => <th key={`${label}-${index}`} scope="col">{label || <span className="sr-only">Actions</span>}</th>)}</tr></thead>
                        <tbody>{visibleFollowers.map(follower => {
                          const followerName = follower.profiles?.full_name || follower.profiles?.username || 'QPassa user'
                          return <tr key={follower.id}>
                            <td><span className="organizer-community-person"><span className="organizer-community-avatar">{follower.profiles?.avatar_url ? <img src={follower.profiles.avatar_url} alt="" /> : followerName[0]?.toUpperCase() ?? '?'}</span><strong>{followerName}</strong></span></td>
                            <td><span className="organizer-community-username">{follower.profiles?.username ? `@${follower.profiles.username.replace(/^@/, '')}` : '—'}</span></td>
                            <td><span className="organizer-orders-date">{new Date(follower.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span></td>
                            <td><button type="button" onClick={() => removeFollower(follower.id)} className="organizer-community-remove">Remove</button></td>
                          </tr>
                        })}{visibleFollowers.length === 0 && <tr><td colSpan={4} className="organizer-orders-empty"><span><Heart size={20} /></span><strong>{followers.length ? 'No followers match your search' : 'Your community starts here'}</strong><small>{followers.length ? 'Try another name or username.' : 'People who follow your organizer profile will appear here.'}</small>{followersSearch && <button type="button" onClick={() => setFollowersSearch('')}>Clear search</button>}</td></tr>}</tbody>
                      </table>
                    </div>
                    <div className="organizer-community-mobile-list">{visibleFollowers.map(follower => {
                      const followerName = follower.profiles?.full_name || follower.profiles?.username || 'QPassa user'
                      return <article className="organizer-community-mobile-card" key={follower.id}>
                        <div className="organizer-community-person"><span className="organizer-community-avatar">{follower.profiles?.avatar_url ? <img src={follower.profiles.avatar_url} alt="" /> : followerName[0]?.toUpperCase() ?? '?'}</span><span className="organizer-community-mobile-copy"><strong>{followerName}</strong><small>{follower.profiles?.username ? `@${follower.profiles.username.replace(/^@/, '')}` : 'Follower'}</small></span><button type="button" onClick={() => removeFollower(follower.id)} className="organizer-community-remove">Remove</button></div>
                        <small className="organizer-community-follow-date">Following since {new Date(follower.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</small>
                      </article>
                    })}{visibleFollowers.length === 0 && <div className="organizer-orders-empty"><span><Heart size={20} /></span><strong>{followers.length ? 'No followers match your search' : 'Your community starts here'}</strong><small>{followers.length ? 'Try another name or username.' : 'People who follow your organizer profile will appear here.'}</small></div>}</div>
                  </section>
                </div>
              )}

              {/* ── MEMBERS ── */}
              {section === 'members' && (
                <div className="organizer-members-page organizer-analytics-page space-y-5">
                  <header className="organizer-analytics-page-heading organizer-orders-heading">
                    <div className="organizer-analytics-title-block"><h3>Members</h3><p>Manage the people who help bring your events to life.</p></div>
                    <div className="organizer-members-header-actions">{isOwner && <><button type="button" className="organizer-orders-export" onClick={() => setShowInviteMember(true)}><Plus size={14} />Invite member</button><button type="button" className="organizer-members-secondary-action" onClick={() => setShowInviteAgent(true)}><UsersRound size={14} />Invite agent</button></>}<div className="organizer-orders-heading-meta"><span className="organizer-finance-live-dot" />{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : 'Team activity'}</div></div>
                  </header>
                  <div className="organizer-orders-summary-grid organizer-community-summary-grid">
                    <article className="organizer-orders-summary-card"><span>{members.filter(member => member.status !== 'pending').length.toLocaleString()}</span><small>Team members</small></article>
                    <article className="organizer-orders-summary-card"><span>{members.filter(member => member.status === 'active').length.toLocaleString()}</span><small>Active</small></article>
                    <article className="organizer-orders-summary-card"><span>{members.filter(member => member.status === 'pending').length.toLocaleString()}</span><small>Invitations</small></article>
                    <article className="organizer-orders-summary-card"><span>{agentAssignments.filter(assignment => assignment.status === 'active').length.toLocaleString()}</span><small>Active agents</small></article>
                  </div>
                  <section className="organizer-orders-panel organizer-community-panel">
                    <div className="organizer-members-toolbar">
                      <div className="organizer-finance-tabs" role="tablist" aria-label="Team users and invitations">
                        <button type="button" role="tab" aria-selected={teamTab === 'users'} onClick={() => setTeamTab('users')}>Members <span>{members.filter(member => member.status !== 'pending').length}</span></button>
                        <button type="button" role="tab" aria-selected={teamTab === 'invitations'} onClick={() => setTeamTab('invitations')}>Invitations <span>{members.filter(member => member.status === 'pending').length}</span></button>
                      </div>
                      <label className="organizer-orders-search"><Search size={16} aria-hidden="true" /><input type="search" value={teamSearch} onChange={event => setTeamSearch(event.target.value)} placeholder="Search name or email" aria-label="Search team members" />{teamSearch && <button type="button" onClick={() => setTeamSearch('')} aria-label="Clear search"><XIcon size={14} /></button>}</label>
                    </div>
                    <div className="organizer-community-results"><span>{visibleTeamMembers.length} shown</span></div>
                    <div className="organizer-community-table-wrap">
                      <table className="organizer-orders-table organizer-members-table">
                        <thead><tr>{['Team member', 'Role', 'Status', ...(isOwner ? ['Actions'] : [])].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
                        <tbody>{visibleTeamMembers.map(member => {
                          const fullName = (member as any).profiles?.full_name ?? 'Team member'
                          const email = (member as any).profiles?.email ?? '—'
                          const assignedAgent = agentAssignments.filter(assignment => assignment.user_id === member.user_id)
                          return <tr key={member.id}>
                            <td><span className="organizer-community-person"><span className="organizer-community-avatar">{(member as any).profiles?.avatar_url || (member as any).profiles?.profile_image ? <img src={(member as any).profiles?.avatar_url ?? (member as any).profiles?.profile_image} alt="" /> : fullName[0]?.toUpperCase() ?? '?'}</span><span className="organizer-community-member-copy"><strong>{fullName}</strong><small>{email}</small></span></span></td>
                            <td>{isOwner ? <select value={member.role_id ?? ''} onChange={event => void updateMemberRole(member.id, event.target.value)} className="organizer-members-role-select" aria-label={`Role for ${fullName}`}><option value="">Select role</option>{roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select> : <span className="organizer-community-username">{(member as any).organizer_roles?.name ?? '—'}</span>}</td>
                            <td><Badge className="organizer-orders-status organizer-community-badge" label={member.status} color={STATUS_COLORS[member.status] ?? '#888'} /></td>
                            {isOwner && <td><div className="organizer-members-actions">{member.status === 'pending' && <button type="button" onClick={() => void updateMemberStatus(member.id, 'active')}>Activate</button>}{assignedAgent.map(assignment => <button key={assignment.id} type="button" onClick={() => setEditingAgentAssignment(assignment)}>Agent settings</button>)}<button type="button" className="is-muted" onClick={() => member.status === 'active' ? void updateMemberStatus(member.id, 'inactive') : void deleteMember(member.id)}>{member.status === 'active' ? 'Deactivate' : 'Remove'}</button></div></td>}
                          </tr>
                        })}{visibleTeamMembers.length === 0 && <tr><td colSpan={isOwner ? 4 : 3} className="organizer-orders-empty"><span><UsersRound size={20} /></span><strong>{teamTab === 'invitations' ? 'No invitations found' : 'No team members found'}</strong><small>{teamSearch ? 'Try a different name or email.' : teamTab === 'invitations' ? 'Invitations you send will be listed here.' : 'Invite collaborators to help manage your events.'}</small>{teamSearch && <button type="button" onClick={() => setTeamSearch('')}>Clear search</button>}</td></tr>}</tbody>
                      </table>
                    </div>
                    <div className="organizer-community-mobile-list">{visibleTeamMembers.map(member => {
                      const fullName = (member as any).profiles?.full_name ?? 'Team member'
                      const email = (member as any).profiles?.email ?? '—'
                      const assignedAgent = agentAssignments.filter(assignment => assignment.user_id === member.user_id)
                      return <article className="organizer-community-mobile-card" key={member.id}>
                        <div className="organizer-community-mobile-member-top"><span className="organizer-community-person"><span className="organizer-community-avatar">{(member as any).profiles?.avatar_url || (member as any).profiles?.profile_image ? <img src={(member as any).profiles?.avatar_url ?? (member as any).profiles?.profile_image} alt="" /> : fullName[0]?.toUpperCase() ?? '?'}</span><span className="organizer-community-mobile-copy"><strong>{fullName}</strong><small>{email}</small></span></span><Badge className="organizer-orders-status organizer-community-badge" label={member.status} color={STATUS_COLORS[member.status] ?? '#888'} /></div>
                        <div className="organizer-community-mobile-role">{isOwner ? <label>Role<select value={member.role_id ?? ''} onChange={event => void updateMemberRole(member.id, event.target.value)} className="organizer-members-role-select" aria-label={`Role for ${fullName}`}><option value="">Select role</option>{roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label> : <span>{(member as any).organizer_roles?.name ?? 'No role assigned'}</span>}</div>
                        {isOwner && <div className="organizer-members-actions">{member.status === 'pending' && <button type="button" onClick={() => void updateMemberStatus(member.id, 'active')}>Activate</button>}{assignedAgent.map(assignment => <button key={assignment.id} type="button" onClick={() => setEditingAgentAssignment(assignment)}>Agent settings</button>)}<button type="button" className="is-muted" onClick={() => member.status === 'active' ? void updateMemberStatus(member.id, 'inactive') : void deleteMember(member.id)}>{member.status === 'active' ? 'Deactivate' : 'Remove'}</button></div>}
                      </article>
                    })}{visibleTeamMembers.length === 0 && <div className="organizer-orders-empty"><span><UsersRound size={20} /></span><strong>{teamTab === 'invitations' ? 'No invitations found' : 'No team members found'}</strong><small>{teamSearch ? 'Try a different name or email.' : 'Invite collaborators to help manage your events.'}</small></div>}</div>
                  </section>
                </div>
              )}

              {/* ── ORGANIZER SETTINGS / ROLE REFERENCE ── */}
              {section === 'settings' && (
                <div className="organizer-settings-page organizer-analytics-page space-y-5">
                  <header className="organizer-analytics-page-heading organizer-orders-heading">
                    <div className="organizer-analytics-title-block"><h3>Settings</h3><p>Organization details, team access, and workspace shortcuts.</p></div>
                    <div className="organizer-orders-heading-meta"><span className="organizer-finance-live-dot" />{isOwner ? 'Owner access' : 'Team access'}</div>
                  </header>

                  <div className="organizer-settings-nav" role="tablist" aria-label="Settings categories">
                    {([['workspace', 'Workspace profile', Building2], ['roles', 'Roles & permissions', Shield], ['notifications', 'Notification preferences', Bell], ['security', 'Security', KeyIcon]] as const).map(([tab, label, TabIcon]) => <button key={tab} type="button" role="tab" aria-selected={organizerSettingsTab === tab} onClick={() => setOrganizerSettingsTab(tab)}><TabIcon size={15} />{label}</button>)}
                  </div>

                  {organizerSettingsTab === 'workspace' && <section className="organizer-settings-workspace organizer-orders-panel" id="organizer-settings-workspace" aria-labelledby="organizer-settings-workspace-title">
                    <div className="organizer-settings-section-heading"><span className="organizer-settings-section-icon"><Building2 size={17} /></span><div><h4 id="organizer-settings-workspace-title">Workspace profile</h4><p>Edit the public details associated with {organizer.name}.</p></div><Badge className="organizer-orders-status" label={verificationStatus} /></div>
                    {organizerDetailsNotice && <p className="organizer-settings-security-notice" role="status">{organizerDetailsNotice}</p>}
                    <div className="organizer-settings-edit-grid">
                      <label>Organization name<input value={organizerDetailsDraft.name} onChange={event => setOrganizerDetailsDraft(current => ({ ...current, name: event.target.value }))} placeholder="Organization name" disabled={!isOwner} /></label>
                      <label>City<input value={organizerDetailsDraft.city} onChange={event => setOrganizerDetailsDraft(current => ({ ...current, city: event.target.value }))} placeholder="City or region" disabled={!isOwner} /></label>
                      <label>Website<input type="url" value={organizerDetailsDraft.website} onChange={event => setOrganizerDetailsDraft(current => ({ ...current, website: event.target.value }))} placeholder="https://example.com" disabled={!isOwner} /></label>
                      <label>Contact phone<input type="tel" value={organizerDetailsDraft.phone} onChange={event => setOrganizerDetailsDraft(current => ({ ...current, phone: event.target.value }))} placeholder="Phone number" disabled={!isOwner} /></label>
                      <div className="organizer-settings-edit-meta"><span><small>Subscription</small><strong className="capitalize">{organizer.subscription_tier}</strong></span><span><small>Account status</small><strong>{verificationStatus === 'verified' ? 'Verified' : verificationStatus === 'pending' ? 'Pending review' : 'Not verified'}</strong></span></div>
                    </div>
                    <div className="organizer-settings-section-footer"><span>{isOwner ? 'Only organization owners can edit workspace details.' : 'Workspace details are managed by the organization owner.'}</span>{isOwner && <button type="button" className="organizer-settings-save-button" disabled={organizerDetailsSaving || !organizerDetailsDraft.name.trim()} onClick={() => void saveOrganizerDetails()}>{organizerDetailsSaving ? 'Saving…' : 'Save changes'}</button>}</div>
                  </section>}

                  {organizerSettingsTab === 'roles' && <>
                  <section className="organizer-settings-roles organizer-orders-panel" id="organizer-settings-roles" aria-labelledby="organizer-settings-roles-title">
                    <div className="organizer-settings-section-heading"><span className="organizer-settings-section-icon"><Shield size={17} /></span><div><h4 id="organizer-settings-roles-title">Roles &amp; permissions</h4><p>Access profiles available to {organizer.name}. Role capabilities are managed by QPassa administrators.</p></div><span className="organizer-community-results">{roles.length} roles</span></div>
                    <div className="organizer-community-table-wrap"><table className="organizer-orders-table organizer-settings-role-table">
                      <thead><tr>{['Role', 'Scope', 'Capabilities', 'Assigned members'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
                      <tbody>{roles.map(role => {
                        const capabilities = role.permissions?.all ? ['Full organization access'] : Object.entries(role.permissions ?? {}).filter(([, enabled]) => enabled).map(([permission]) => permission.replace(/_/g, ' '))
                        return <tr key={role.id}>
                          <td><strong className="organizer-settings-role-name">{role.name}</strong></td>
                          <td><span className="organizer-community-username">Organization</span></td>
                          <td><div className="organizer-settings-capabilities">{capabilities.length ? capabilities.map(capability => <span key={capability} className="organizer-permission-chip">{capability}</span>) : <span className="organizer-community-username">No access granted</span>}</div></td>
                          <td><span className="organizer-customers-order-count">{members.filter(member => member.role_id === role.id).length}</span></td>
                        </tr>
                      })}{roles.length === 0 && <tr><td colSpan={4} className="organizer-orders-empty"><span><Shield size={20} /></span><strong>Role profiles are being configured</strong><small>Available access profiles will appear here when they are ready.</small></td></tr>}</tbody>
                    </table></div>
                    <div className="organizer-settings-section-footer"><span>Manage assignments and invitations in Team members.</span><button type="button" onClick={() => selectSection('members')}>Open team <ArrowUpRight size={14} /></button></div>
                  </section>

                  <section className="organizer-settings-matrix organizer-orders-panel" aria-labelledby="organizer-settings-matrix-title">
                    <div className="organizer-settings-section-heading"><span className="organizer-settings-section-icon"><LayoutDashboard size={17} /></span><div><h4 id="organizer-settings-matrix-title">Capability matrix</h4><p>Feature access granted by each role in this organization.</p></div></div>
                    <div className="organizer-community-table-wrap"><table className="organizer-orders-table organizer-settings-matrix-table">
                      <thead><tr><th scope="col">Feature area</th>{roles.map(role => <th key={role.id} scope="col">{role.name}</th>)}</tr></thead>
                      <tbody>{ORGANIZER_PERMISSION_ROWS.map(feature => <tr key={feature.key}>
                        <td><span className="organizer-settings-feature"><strong>{feature.label}</strong><small>{feature.detail}</small></span></td>
                        {roles.map(role => {
                          const allowed = role.permissions?.all === true || role.permissions?.[feature.key] === true
                          return <td key={role.id}><span className={`organizer-settings-access ${allowed ? 'is-allowed' : 'is-restricted'}`} aria-label={allowed ? 'Access granted' : 'No access'}>{allowed ? <CheckIcon size={14} /> : '—'}</span></td>
                        })}
                      </tr>)}
                      {roles.length === 0 && <tr><td colSpan={Math.max(roles.length + 1, 2)} className="organizer-orders-empty"><span><LayoutDashboard size={20} /></span><strong>No role capabilities to show</strong><small>Capabilities appear here when roles are assigned to this organization.</small></td></tr>}</tbody>
                    </table></div>
                    <div className="organizer-settings-matrix-legend"><span><i className="is-allowed"><CheckIcon size={11} /></i>Access granted</span><span><i className="is-restricted">—</i>No access</span><small>Full organization access enables every listed feature.</small></div>
                  </section>

                  <section className="organizer-settings-assignment organizer-orders-panel" aria-labelledby="organizer-settings-assignment-title">
                    <div className="organizer-settings-section-heading"><span className="organizer-settings-section-icon"><UsersRound size={17} /></span><div><h4 id="organizer-settings-assignment-title">Role management boundaries</h4><p>Administrative actions available in the QPassa organizer workspace.</p></div></div>
                    <div className="organizer-community-table-wrap"><table className="organizer-orders-table organizer-settings-assignment-table">
                      <thead><tr>{['Workspace actor', 'Invite members', 'Assign roles', 'Edit role definitions', 'Manage payouts'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
                      <tbody>
                        <tr><td><strong className="organizer-settings-role-name">Organization owner</strong></td><td><span className="organizer-settings-access is-allowed"><CheckIcon size={14} />Yes</span></td><td><span className="organizer-settings-access is-allowed"><CheckIcon size={14} />Yes</span></td><td><span className="organizer-settings-access is-restricted">Platform admin</span></td><td><span className="organizer-settings-access is-allowed"><CheckIcon size={14} />Yes</span></td></tr>
                        <tr><td><strong className="organizer-settings-role-name">Team member</strong></td><td><span className="organizer-settings-access is-restricted">Owner only</span></td><td><span className="organizer-settings-access is-restricted">Owner only</span></td><td><span className="organizer-settings-access is-restricted">Platform admin</span></td><td><span className="organizer-settings-access is-restricted">Owner only</span></td></tr>
                        <tr><td><strong className="organizer-settings-role-name">QPassa administrator</strong></td><td><span className="organizer-settings-access is-allowed"><CheckIcon size={14} />Platform-wide</span></td><td><span className="organizer-settings-access is-allowed"><CheckIcon size={14} />Platform-wide</span></td><td><span className="organizer-settings-access is-allowed"><CheckIcon size={14} />Yes</span></td><td><span className="organizer-settings-access is-allowed"><CheckIcon size={14} />Platform-wide</span></td></tr>
                      </tbody>
                    </table></div>
                  </section>

                  <div className="organizer-settings-guides">
                    <article><span className="organizer-settings-guide-icon"><CalendarDays size={16} /></span><div><small>TEAM WORKFLOW</small><strong>Delegate event operations</strong><p>Invite a team member and assign an event role to share day-to-day event tasks.</p><button type="button" onClick={() => selectSection('members')}>Manage team <ArrowUpRight size={13} /></button></div></article>
                    <article><span className="organizer-settings-guide-icon"><Shield size={16} /></span><div><small>ACCESS CONTROL</small><strong>Keep finance access owner-managed</strong><p>Wallet and payout actions stay with the organization owner; team members can be granted statement access separately.</p><button type="button" onClick={() => selectSection('payouts')}>Review wallet access <ArrowUpRight size={13} /></button></div></article>
                  </div>
                  </>}

                  {organizerSettingsTab === 'notifications' && <section className="organizer-settings-notifications organizer-orders-panel" aria-labelledby="organizer-settings-notifications-title">
                    <div className="organizer-settings-section-heading"><span className="organizer-settings-section-icon"><Bell size={17} /></span><div><h4 id="organizer-settings-notifications-title">Notification preferences</h4><p>Choose the account-level updates you want to receive. Changes save automatically.</p></div></div>
                    <div className="organizer-settings-preference-list">
                      {([
                        ['email_notifications', 'Email notifications', 'Receive important product and account updates by email.', Bell],
                        ['event_reminders', 'Event reminders', 'Get reminders and updates related to events you manage or attend.', CalendarDays],
                        ['promotions', 'Promotions and offers', 'Receive occasional product news, offers, and promotional updates.', Tag],
                        ['nearby_events', 'Nearby event updates', 'Stay informed about events and activity relevant to your location.', MapPin],
                      ] as const).map(([key, title, description, PreferenceIcon]) => <div className="organizer-settings-preference-row" key={key}>
                        <span className="organizer-settings-preference-icon"><PreferenceIcon size={16} /></span>
                        <span className="organizer-settings-preference-copy"><strong>{title}</strong><small>{description}</small></span>
                        <button type="button" role="switch" aria-checked={organizerSettingsPreferences[key] === true} aria-label={title} disabled={organizerPreferenceSaving === key} onClick={() => void updateOrganizerSettingsPreference(key)} className="organizer-settings-switch"><i /></button>
                      </div>)}
                    </div>
                    <p className="organizer-settings-note">These preferences are saved to your account profile. Transactional and security notices may still be sent when required.</p>
                  </section>}

                  {organizerSettingsTab === 'security' && <section className="organizer-settings-security organizer-orders-panel" aria-labelledby="organizer-settings-security-title">
                    <div className="organizer-settings-section-heading"><span className="organizer-settings-section-icon"><Shield size={17} /></span><div><h4 id="organizer-settings-security-title">Account security</h4><p>Review your sign-in details and manage personal security controls.</p></div></div>
                    {securityNotice && <p className="organizer-settings-security-notice" role="status">{securityNotice}</p>}
                    <div className="organizer-settings-security-grid">
                      <article className="organizer-settings-password-card"><div className="organizer-settings-security-card-heading"><span className="organizer-settings-security-icon"><KeyIcon size={17} /></span><div><strong>Change password</strong><p>Use a unique password with at least 8 characters to protect your account.</p></div></div>
                        <label>New password<input type="password" autoComplete="new-password" value={securityPassword.password} onChange={event => setSecurityPassword(current => ({ ...current, password: event.target.value }))} placeholder="At least 8 characters" /></label>
                        <label>Confirm new password<input type="password" autoComplete="new-password" value={securityPassword.confirm} onChange={event => setSecurityPassword(current => ({ ...current, confirm: event.target.value }))} placeholder="Enter it again" /></label>
                        <button type="button" disabled={securityPasswordSaving || !securityPassword.password || !securityPassword.confirm} onClick={() => void updateAccountPassword()}>{securityPasswordSaving ? 'Updating…' : 'Update password'}</button>
                      </article>
                      <article><span className="organizer-settings-security-icon"><UserRound size={17} /></span><div><strong>Account profile</strong><p>Signed in as {profile?.email || user?.email || 'your account'}.</p></div><button type="button" onClick={() => navigate('profile')}>Open profile <ArrowUpRight size={14} /></button></article>
                      <article><span className="organizer-settings-security-icon"><Wallet size={17} /></span><div><strong>Finance access</strong><p>Wallet and payout access is restricted to the organization owner.</p></div>{isOwner ? <button type="button" onClick={() => selectSection('payouts')}>Open wallet <ArrowUpRight size={14} /></button> : <span className="organizer-settings-owner-note">Owner managed</span>}</article>
                    </div>
                  </section>}
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
                  <header className="organizer-analytics-page-heading organizer-orders-heading">
                    <div className="organizer-analytics-title-block"><h3>Statements</h3><p>A clear record of payments, platform fees, refunds, and completed wallet withdrawals for {organizer.name}.</p></div>
                    <div className="organizer-orders-heading-meta"><span className="organizer-finance-live-dot" />{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : 'Loading statement activity'}</div>
                  </header>

                  <div className="organizer-statement-kpi-grid grid grid-cols-2 gap-3 xl:grid-cols-4">
                    {([
                      ['Payments', 'payment'], ['Fees', 'fee'], ['Refunds', 'refund'], ['Payouts', 'payout'],
                    ] as const).map(([label, type]) => {
                      const StatIcon = type === 'payment' ? ArrowDownLeft : type === 'payout' ? ArrowUpRight : type === 'refund' ? RotateCcw : ReceiptText
                      const amount = transactions.filter(item => item.type === type && item.status === 'completed').reduce((sum, item) => sum + item.amount, 0)
                      const count = transactions.filter(item => item.type === type).length
                      return <article key={type} className="organizer-overview-stat organizer-statement-stat"><span className="organizer-overview-stat-icon"><StatIcon size={16} /></span><small>{label}</small><strong>{formatPrice(amount)}</strong><span>{count} ledger record{count === 1 ? '' : 's'}</span></article>
                    })}
                  </div>

                  <section className="organizer-finance-panel overflow-hidden rounded-2xl">
                    <div className="flex flex-col gap-4 border-b p-5 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: 'var(--border)' }}>
                      <div><h3 className="font-bold">Transaction ledger</h3><p className="mt-1 text-xs" style={{ color: 'var(--muted-foreground)' }}>Completed and pending financial activity · payout requests are managed in Wallet</p></div>
                      <button type="button" onClick={exportStatements} disabled={!filteredStatementTransactions.length} className="organizer-finance-export organizer-statement-export rounded-full px-4 py-2.5 text-xs font-bold disabled:opacity-50"><Download size={14} /> Export CSV</button>
                    </div>
                    <>
                      <div className="organizer-finance-tools flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <label className="organizer-orders-search organizer-statement-search w-full sm:max-w-sm">
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
                            <div className="organizer-statement-meta"><span className="organizer-statement-date">{new Date(transaction.created_at).toLocaleDateString()}</span><Badge className="organizer-finance-badge" label={transaction.type} color={STATUS_COLORS[transaction.type] ?? '#888'} /></div>
                            <strong className={`organizer-statement-amount ${positive ? 'is-positive' : transaction.type === 'refund' ? 'is-refund' : ''}`}>{positive ? '+' : '−'}{formatPrice(transaction.amount)}</strong>
                            <Badge className="organizer-finance-badge" label={transaction.status} color={STATUS_COLORS[transaction.status === 'completed' ? 'completed_t' : transaction.status === 'failed' ? 'failed' : 'pending_t'] ?? '#888'} />
                          </article>
                        })}
                      </div>}
                    </>
                  </section>
                </div>
              )}

              {section === 'payouts' && isOwner && (
                <div className="organizer-finance-page organizer-wallet-page mx-auto max-w-7xl space-y-5">
                  <header className="organizer-analytics-page-heading organizer-orders-heading">
                    <div className="organizer-analytics-title-block"><h3>Wallet</h3><p>Manage your available earnings, request a payout, and follow its progress.</p></div>
                    <div className="organizer-orders-heading-meta"><span className="organizer-finance-live-dot" />{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : 'Loading wallet activity'}</div>
                  </header>

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
                          <div className="organizer-wallet-payout-copy"><div><strong>{formatPrice(withdrawal.amount)}</strong><Badge className="organizer-finance-badge" label={withdrawal.status} color={STATUS_COLORS[withdrawal.status] ?? '#888'} /></div><p>{withdrawal.payment_method === 'mobile_money' ? 'Mobile Money' : 'Bank transfer'} · {withdrawal.payment_reference}</p><small>{new Date(withdrawal.requested_at).toLocaleDateString()}{withdrawal.note ? ` · ${withdrawal.note}` : ''}</small></div>
                          {withdrawal.status === 'requested' && <button type="button" onClick={() => void cancelPayoutRequest(withdrawal)} className="organizer-wallet-cancel">Cancel</button>}
                        </article>)}
                      </div>}
                      <button type="button" className="organizer-wallet-statements-link" onClick={() => selectSection('transactions')}>Open full statements <ArrowUpRight size={14} /></button>
                    </section>
                  </div>

                  <section className="organizer-finance-panel organizer-wallet-earnings overflow-hidden rounded-2xl">
                    <div className="border-b px-5 py-4" style={{ borderColor: 'var(--border)' }}><div className="organizer-wallet-panel-heading"><div><h3>Earnings breakdown</h3><p>Confirmed ticket sales after fees, refunds, and agent commissions.</p></div><ChartNoAxesCombined size={17} /></div></div>
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
          <div className="organizer-event-wizard-section-heading"><span>02</span><div><h3>{t('Set up your tickets')}</h3><p>{t('Add ticket options, prices and quantities. Your total inventory must fit the event capacity.')}</p></div></div>
          <div className="organizer-event-wizard-capacity"><span className="organizer-event-wizard-capacity-icon"><TicketCheck size={17} /></span><span>{t('Event capacity')}</span><strong>{(Number.parseInt(form.capacity, 10) || 0).toLocaleString()}</strong><small>{t('tickets available across all ticket types')}</small></div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold" style={{ color: 'var(--muted-foreground)' }}>{t('Ticket Tiers')}</label>
              <button type="button" className="organizer-event-add-tier" onClick={() => setTiers(t => [...t, { name: 'VIP', price: '75000', quantity: '100', description: '', ticket_type: 'non_consumable', consumable_amount: '', extra_info: '', expires_at: '', group_size: '1', show_optional_details: false, sold: 0 }])}>
                <Plus size={14} /> {t('Add ticket tier')}
              </button>
            </div>
            {tiers.map((tier, i) => (
              <div key={i} className="organizer-event-wizard-tier mb-3 rounded-xl p-3" style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                <input placeholder={t('Name')} value={tier.name} onChange={e => setTiers(t => t.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                  className="px-3 py-2 rounded-lg text-xs outline-none" style={{ background: 'var(--card)', border: '1px solid var(--border)', color: '#fff' }} />
                <div className="flex items-center gap-2"><input type="number" min="0" placeholder={t('Price BIF')} value={tier.price} disabled={tier.price === '0'} onChange={e => setTiers(t => t.map((x, j) => j === i ? { ...x, price: e.target.value } : x))}
                  className="min-w-0 flex-1 px-3 py-2 rounded-lg text-xs outline-none" style={{ background: 'var(--card)', border: '1px solid var(--border)', color: '#fff' }} /><label className="flex shrink-0 items-center gap-1 text-[11px]" style={{ color: 'var(--muted-foreground)' }}><input type="checkbox" checked={tier.price === '0'} onChange={e => setTiers(t => t.map((x, j) => j === i ? { ...x, price: e.target.checked ? '0' : '30000' } : x))} /> {t('Free')}</label></div>
                <input placeholder={t('Qty')} value={tier.quantity} onChange={e => setTiers(t => t.map((x, j) => j === i ? { ...x, quantity: e.target.value } : x))}
                  className="px-3 py-2 rounded-lg text-xs outline-none" style={{ background: 'var(--card)', border: '1px solid var(--border)', color: '#fff' }} />
                <button type="button" onClick={() => setTiers(t => t.filter((_, j) => j !== i))} className="organizer-event-remove-tier" aria-label={`Remove ${tier.name || 'ticket'} tier`} title={t('Remove ticket tier')}><XIcon size={15} /></button>
                </div>
                <input placeholder={t('Ticket description')} value={tier.description} onChange={e => setTiers(t => t.map((x, j) => j === i ? { ...x, description: e.target.value } : x))}
                  className="mb-2 w-full px-3 py-2 rounded-lg text-xs outline-none" style={{ background: 'var(--card)', border: '1px solid var(--border)', color: '#fff' }} />
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="mb-1 block text-[11px]" style={{ color: 'var(--muted-foreground)' }}>{t('Ticket type')}</label><select value={tier.ticket_type} onChange={e => setTiers(t => t.map((x, j) => j === i ? { ...x, ticket_type: e.target.value as 'consumable' | 'non_consumable' } : x))} className="w-full px-3 py-2 rounded-lg text-xs outline-none" style={{ background: 'var(--card)', border: '1px solid var(--border)', color: '#fff' }}><option value="non_consumable">{t('Non-consumable')}</option><option value="consumable">{t('Consumable')}</option></select></div>
                  {tier.ticket_type === 'consumable' && <div><label className="mb-1 block text-[11px]" style={{ color: 'var(--muted-foreground)' }}>{t('Consumable amount *')}</label><input type="number" min="1" step="1" placeholder={t('e.g. 2 drinks')} value={tier.consumable_amount} onChange={e => setTiers(t => t.map((x, j) => j === i ? { ...x, consumable_amount: e.target.value } : x))} className="w-full px-3 py-2 rounded-lg text-xs outline-none" style={{ background: 'var(--card)', border: '1px solid var(--border)', color: '#fff' }} /></div>}
                </div>
                <button type="button" aria-expanded={tier.show_optional_details} onClick={() => setTiers(t => t.map((x, j) => j === i ? { ...x, show_optional_details: !x.show_optional_details } : x))} className="mt-2 text-[11px] font-semibold" style={{ color: 'var(--primary)' }}>{tier.show_optional_details ? t('Hide optional details −') : t('Show optional details +')}</button>
                {tier.show_optional_details && <div className="mt-2 space-y-2 rounded-lg p-2" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <textarea placeholder={t('Extra info (optional)')} value={tier.extra_info} onChange={e => setTiers(t => t.map((x, j) => j === i ? { ...x, extra_info: e.target.value } : x))} rows={2} className="w-full resize-none px-3 py-2 rounded-lg text-xs outline-none" style={{ background: 'var(--card)', border: '1px solid var(--border)', color: '#fff' }} />
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className="mb-1 block text-[11px]" style={{ color: 'var(--muted-foreground)' }}>{t('Group size (optional)')}</label><input type="number" min="1" value={tier.group_size} onChange={e => setTiers(t => t.map((x, j) => j === i ? { ...x, group_size: e.target.value } : x))} className="w-full px-3 py-2 rounded-lg text-xs outline-none" style={{ background: 'var(--card)', border: '1px solid var(--border)', color: '#fff' }} /><p className="mt-1 text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{t('Tickets issued per purchase.')}</p></div>
                    <div><label className="mb-1 block text-[11px]" style={{ color: 'var(--muted-foreground)' }}>{t('Expiry date (optional)')}</label><input type="date" value={tier.expires_at} onChange={e => setTiers(t => t.map((x, j) => j === i ? { ...x, expires_at: e.target.value } : x))} className="w-full px-3 py-2 rounded-lg text-xs outline-none" style={{ background: 'var(--card)', border: '1px solid var(--border)', color: '#fff' }} /></div>
                  </div>
                </div>}
              </div>
            ))}
          </div>
          </>}

          {step === 3 && <>
            <div className="organizer-event-wizard-section-heading"><span>03</span><div><h3>{t('Review your event')}</h3><p>{t('Check the details and choose whether to save as a draft or publish.')}</p></div></div>
            <div className="organizer-event-review-layout">
              <section className="organizer-event-review-main">
                <div className="organizer-event-review-cover" style={{ backgroundImage: (coverPreview || form.cover_image) ? `linear-gradient(0deg, rgba(9,12,16,.9), rgba(9,12,16,.18) 85%), url(${coverPreview || form.cover_image})` : undefined }}>
                  <span>{form.category}</span><h3>{form.title.trim() || t('Untitled event')}</h3>
                  <p>{form.date ? formatLocaleDate(`${form.date}T12:00:00`, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : t('Date to be announced')} · {form.time || t('Time TBA')}</p>
                  <small>{form.venue || t('Venue to be announced')}{form.city ? ` · ${form.city}` : ''}</small>
                </div>
                <div className="organizer-event-review-card">
                  <h4>{t('Event details')}</h4>
                  <dl>
                    <div><dt>{t('Date and time')}</dt><dd>{form.date ? formatLocaleDate(`${form.date}T12:00:00`, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : t('Date not set')} · {form.time || t('Time TBA')}{form.end_date ? ` – ${formatLocaleDate(`${form.end_date}T12:00:00`, { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}{form.end_time ? `, ${form.end_time}` : ''}</dd></div>
                    <div><dt>{t('Venue')}</dt><dd>{form.venue || t('Venue not set')}{form.city ? ` · ${form.city}` : ''}</dd></div>
                    <div><dt>{t('Category · capacity')}</dt><dd>{form.category} · {(Number.parseInt(form.capacity, 10) || 0).toLocaleString()} {t('people')}</dd></div>
                    {form.tags.trim() && <div><dt>{t('Tags / lineup')}</dt><dd>{form.tags}</dd></div>}
                    {form.description.trim() && <div><dt>{t('Description')}</dt><dd><RichTextContent value={form.description} /></dd></div>}
                  </dl>
                </div>
                <div className="organizer-event-review-card">
                  <h4>{t('Policies')}</h4>
                  <dl><div><dt>{t('Refund policy')}</dt><dd><RichTextContent value={form.refund_policy || t('Not specified')} /></dd></div><div><dt>{t('Entry policy')}</dt><dd><RichTextContent value={form.entry_policy || t('Not specified')} /></dd></div><div><dt>{t('Terms & conditions')}</dt><dd><RichTextContent value={form.terms_and_conditions || t('Not specified')} /></dd></div></dl>
                </div>
              </section>
              <section className="organizer-event-review-tickets">
                <div className="organizer-event-review-tickets-heading"><div><h4>{t('Ticket types')}</h4><p>{tiers.length} {t('ticket')} {tiers.length === 1 ? t('type') : t('types')} · {tiers.reduce((total, tier) => total + ((Number.parseInt(tier.quantity, 10) || 0) * (Number.parseInt(tier.group_size, 10) || 1)), 0).toLocaleString()} {t('total tickets')}</p></div><button type="button" onClick={() => setStep(2)}>{t('Edit')}</button></div>
                {tiers.map((tier, index) => <article className="organizer-event-review-ticket" key={`${tier.id ?? tier.name}-${index}`}><div><strong>{tier.name || t('Ticket type {{index}}', { index: index + 1 })}</strong><small>{tier.ticket_type === 'consumable' ? `${t('Consumable')} · ${tier.consumable_amount || 0} ${t('included')}` : t('Standard entry')}{(Number.parseInt(tier.group_size, 10) || 1) > 1 ? ` · ${t('group of')} ${tier.group_size}` : ''}</small>{tier.description && <small>{tier.description}</small>}</div><div><b>{Number.parseInt(tier.price, 10) === 0 ? t('Free') : `${(Number.parseInt(tier.price, 10) || 0).toLocaleString()} BIF`}</b><small>{(Number.parseInt(tier.quantity, 10) || 0).toLocaleString()} {t('available')}</small></div></article>)}
              </section>
            </div>
            <div className="organizer-event-review-publish">
              <label htmlFor="event-publication-status">{t('When you confirm')}</label>
              <select id="event-publication-status" value={form.status} onChange={e => f('status', e.target.value)}>
                <option value="draft">{t('Save as draft — only you can see it')}</option><option value="published">{t('Publish — make it visible to attendees')}</option>
                {event && <><option value="cancelled">{t('Mark as cancelled')}</option><option value="completed">{t('Mark as completed')}</option></>}
              </select>
            </div>
          </>}
        </div>
        </div>
        <footer className="organizer-event-wizard-footer">
          <button type="button" onClick={step === 1 ? onClose : () => { setError(''); setStep(current => Math.max(1, current - 1)) }} disabled={saving} className="organizer-event-wizard-back">{step === 1 ? t('Back to events') : t('Back')}</button>
          <span>{t('Step')} {step} {t('of')} 3</span>
          {step < 3
            ? <button type="button" onClick={goToNextStep} className="organizer-event-wizard-next">{t('Continue')} <ArrowRightIcon size={15} /></button>
            : <button type="button" onClick={handleSubmit} disabled={saving || invalidEventEnd} className="organizer-event-wizard-next" style={{ opacity: saving || invalidEventEnd ? 0.55 : 1 }}>{saving ? (event ? t('Saving…') : t('Creating…')) : event ? t('Confirm changes') : form.status === 'published' ? t('Confirm & publish') : t('Confirm & save draft')} <CheckIcon size={15} /></button>}
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
  return <div className="organizer-invite-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="organizer-modal organizer-invite-dialog organizer-invite-agent-dialog" role="dialog" aria-modal="true" aria-labelledby="invite-agent-title">
      <header className="organizer-invite-heading"><div><p>Team access</p><h2 id="invite-agent-title">Invite an agent</h2><span>The agent must already have a QPassa account.</span></div><button type="button" onClick={onClose} aria-label="Close invite agent dialog">×</button></header>
      <div className="organizer-invite-body">
        {message && <p className="organizer-invite-error" role="alert">{message}</p>}
        <label className="organizer-invite-field">Agent email<input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="agent@example.com" autoComplete="email" /></label>
        <label className="organizer-invite-field">Event<select value={eventId} onChange={event => { setEventId(event.target.value); setTierIds([]) }} disabled={!events.length}><option value="">Select an event</option>{events.map(event => <option key={event.id} value={event.id}>{event.title}</option>)}</select></label>
        <fieldset className="organizer-invite-tier-field"><legend>Ticket types</legend><p>Select specific tiers, or leave all unselected to allow every tier.</p><div className="organizer-invite-tier-list">{tiers.map(tier => <button key={tier.id} type="button" aria-pressed={tierIds.includes(tier.id)} onClick={() => toggleTier(tier.id)}>{tier.name}</button>)}{!tiers.length && <span>{selectedEvent ? 'No ticket tiers are set up for this event.' : 'Choose an event to see its ticket tiers.'}</span>}</div></fieldset>
        <div className="organizer-invite-limits-grid">
          <label className="organizer-invite-field">Commission (%)<input value={commission} onChange={event => setCommission(event.target.value)} type="number" min="0" max="100" /></label>
          <label className="organizer-invite-field">Ticket limit<input value={ticketLimit} onChange={event => setTicketLimit(event.target.value)} type="number" min="0" placeholder="No limit" /></label>
          <label className="organizer-invite-field">Sales limit<input value={salesLimit} onChange={event => setSalesLimit(event.target.value)} type="number" min="0" placeholder="No limit" /></label>
        </div>
      </div>
      <footer className="organizer-invite-footer"><button type="button" className="organizer-invite-secondary" onClick={onClose}>Cancel</button><button type="button" className="organizer-invite-primary" onClick={() => void invite()} disabled={saving || !email.trim() || !eventId}>{saving ? 'Sending…' : 'Send invitation'}</button></footer>
    </section>
  </div>
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
    <div className="organizer-invite-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <section className="organizer-modal organizer-invite-dialog" role="dialog" aria-modal="true" aria-labelledby="invite-member-title">
        <header className="organizer-invite-heading"><div><p>Team access</p><h2 id="invite-member-title">Invite a member</h2><span>Invite an existing QPassa account to your workspace.</span></div><button type="button" onClick={onClose} aria-label="Close invite member dialog">×</button></header>
        <div className="organizer-invite-body">
          {error && <p className="organizer-invite-error" role="alert">{error}</p>}
          <label className="organizer-invite-field">Member email<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="team.member@example.com" autoComplete="email" /></label>
          {roles.length > 0 && <label className="organizer-invite-field">Role<select value={roleId} onChange={e => setRoleId(e.target.value)}><option value="">No role</option>{roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>}
          <div className="organizer-invite-link-card"><div><strong>Registration link</strong><span>Share this link if they still need to create an account.</span></div><div className="organizer-invite-link-row"><input readOnly aria-label="Organizer registration link" value={`${window.location.origin}?intent=organizer`} /><button type="button" className="organizer-invite-secondary" onClick={() => void navigator.clipboard.writeText(`${window.location.origin}?intent=organizer`)}>Copy link</button></div></div>
          {roles.length > 0 && <div className="organizer-invite-role-note"><strong>Available roles</strong><div>{roles.map(role => <span key={role.id}>{role.name}</span>)}</div></div>}
        </div>
        <footer className="organizer-invite-footer"><button type="button" className="organizer-invite-secondary" onClick={onClose}>Cancel</button><button type="button" className="organizer-invite-primary" onClick={invite} disabled={saving || !email.trim()}>{saving ? 'Adding…' : 'Add member'}</button></footer>
      </section>
    </div>
  )
}
