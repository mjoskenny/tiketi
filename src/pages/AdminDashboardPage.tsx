import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeftIcon,
  BarChartIcon,
  BellIcon,
  CalendarIcon,
  CheckIcon,
  ClipboardIcon,
  DollarSignIcon,
  EyeIcon,
  KeyIcon,
  ShieldIcon,
  TicketIcon,
  TrendingUpIcon,
  UserIcon,
  UsersIcon,
  SettingsIcon,
  ZapIcon,
} from '../components/Icon'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { fetchAllRows } from '../lib/supabasePagination'
import { LanguageSwitcher } from '../components/LocaleContent'
import StatusBadge from '../components/StatusBadge'
import i18n from '../lib/i18n'

type Section =
  | 'overview'
  | 'users'
  | 'organizers'
  | 'events'
  | 'tickets'
  | 'orders'
  | 'refunds'
  | 'payments'
  | 'payouts'
  | 'agents'
  | 'reports'
  | 'settings'

type HealthMetrics = {
  users: { signupsToday: number; repeatBuyers: number; adminAccounts: number }
  organizers: { awaitingVerification: number; verified: number; unverified: number }
  events: { published: number; drafts: number; totalCapacity: number }
  tickets: { lowInventory: number; scansToday: number; cancelled: number }
  orders: { confirmed: number; pending: number; refundedRate: number }
  payments: { successful: number; failed: number; pending: number }
  payouts: { paidAmount: number; queued: number; failed: number }
  agents: { topAgent: string; active: number; averageCommissionRate: number }
}

type PlatformSettings = {
  id: boolean
  platform_name: string
  support_email: string
  support_phone: string
  contact_whatsapp: string
  contact_address: string
  checkout_notice: string
  service_fee_percent: number
  ticket_sales_enabled: boolean
  mobile_money_enabled: boolean
  card_payments_enabled: boolean
  maintenance_mode: boolean
  maintenance_message: string
  marketplace_enabled: boolean
  max_tickets_per_order: number
  require_verified_organizers_to_publish: boolean
  refund_requests_enabled: boolean
  checkin_enabled: boolean
  social_instagram_url: string
  social_instagram_active: boolean
  social_facebook_url: string
  social_facebook_active: boolean
  social_x_url: string
  social_x_active: boolean
  social_tiktok_url: string
  social_tiktok_active: boolean
  social_whatsapp_url: string
  social_whatsapp_active: boolean
  google_analytics_id: string
  meta_pixel_id: string
  updated_at?: string
}

type VerificationRequest = {
  id: string
  name: string
  city: string | null
  phone: string | null
  website: string | null
  requestedAt: string | null
}

type AdminRefundRequest = {
  id: string
  order_id: string
  ticket_id: string | null
  customer_id: string
  organizer_id: string
  reason: string
  status: 'pending' | 'approved' | 'rejected' | 'processed'
  organizer_note: string | null
  created_at: string
  reviewed_at: string | null
  amount?: number | null
  profiles?: { full_name: string | null; email: string | null } | null
  events?: { title: string | null } | null
}

type AdminOrderRow = {
  id: string
  customer: string
  event: string
  amount: string
  status: string
  method: string
  tickets: number
  created: string
  createdAt: string
  total: number
}

type AdminPaymentRow = {
  reference: string
  customer: string
  event: string
  method: string
  amount: string
  platformFee: string
  organizerProceeds: string
  status: string
  created: string
  createdAt: string
}

type AdminEventRow = {
  id: string
  event: string
  organizer: string
  organizerId: string
  capacity: string
  status: string
  category: string
  city: string
  date: string
  time: string
  endTime: string
  venue: string
  description: string
}

type AdminEventDraft = Omit<AdminEventRow, 'id' | 'organizer' | 'status'> & { id?: string }

type ReportDatasetKey = 'orders' | 'payments' | 'transactions' | 'events' | 'tickets' | 'refunds' | 'payouts' | 'agents' | 'users' | 'organizers'
type ReportDataset = { label: string; columns: string[]; rows: Array<Array<string | number>>; snapshot?: boolean }

const organizerVerificationStatus = (organizer: { verified?: boolean | null; verification_status?: string | null }) => {
  if (organizer.verification_status === 'pending' || organizer.verification_status === 'verified' || organizer.verification_status === 'unverified') return organizer.verification_status
  return organizer.verified ? 'verified' : 'unverified'
}

const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  id: true,
  platform_name: 'QPassa',
  support_email: 'hello@qpassa.events',
  support_phone: '+257 22 000 000',
  contact_whatsapp: '+257 22 000 000',
  contact_address: 'Bujumbura, Burundi',
  checkout_notice: '',
  service_fee_percent: 5,
  ticket_sales_enabled: true,
  mobile_money_enabled: true,
  card_payments_enabled: true,
  maintenance_mode: false,
  maintenance_message: '',
  marketplace_enabled: true,
  max_tickets_per_order: 20,
  require_verified_organizers_to_publish: false,
  refund_requests_enabled: true,
  checkin_enabled: true,
  social_instagram_url: '',
  social_instagram_active: false,
  social_facebook_url: '',
  social_facebook_active: false,
  social_x_url: '',
  social_x_active: false,
  social_tiktok_url: '',
  social_tiktok_active: false,
  social_whatsapp_url: '',
  social_whatsapp_active: false,
  google_analytics_id: '',
  meta_pixel_id: '',
}

const NAV: { key: Section; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'users', label: 'Users' },
  { key: 'organizers', label: 'Organizers' },
  { key: 'events', label: 'Events' },
  { key: 'tickets', label: 'Tickets' },
  { key: 'orders', label: 'Orders' },
  { key: 'refunds', label: 'Refunds' },
  { key: 'payments', label: 'Payments' },
  { key: 'payouts', label: 'Payouts' },
  { key: 'agents', label: 'Ticket agents' },
  { key: 'reports', label: 'Reports' },
  { key: 'settings', label: 'Platform settings' },
]

const SECTION_PATHS: Record<Section, string> = {
  overview: '/admin-dashboard',
  users: '/admin-dashboard/users',
  organizers: '/admin-dashboard/organizers',
  events: '/admin-dashboard/events',
  tickets: '/admin-dashboard/tickets',
  orders: '/admin-dashboard/orders',
  refunds: '/admin-dashboard/refunds',
  payments: '/admin-dashboard/payments',
  payouts: '/admin-dashboard/payouts',
  agents: '/admin-dashboard/agents',
  reports: '/admin-dashboard/reports',
  settings: '/admin-dashboard/settings',
}

const NAV_ICONS: Record<Section, React.FC<{ size?: number; className?: string; style?: React.CSSProperties }>> = {
  overview: BarChartIcon,
  users: UserIcon,
  organizers: UsersIcon,
  events: CalendarIcon,
  tickets: TicketIcon,
  orders: ClipboardIcon,
  refunds: DollarSignIcon,
  payments: DollarSignIcon,
  payouts: ZapIcon,
  agents: KeyIcon,
  reports: TrendingUpIcon,
  settings: SettingsIcon,
}

function sectionFromPath(pathname: string): Section {
  const slug = pathname.split('/').filter(Boolean)[1]
  const section = Object.entries(SECTION_PATHS).find(([, path]) => path.split('/').pop() === slug)?.[0]
  return (section as Section | undefined) ?? 'overview'
}

function StatCard({ label, value, delta, icon: Icon, accent = 'var(--primary)' }: { label: string; value: string; delta: string; icon: React.FC<{ size?: number; className?: string; style?: React.CSSProperties }>; accent?: string }) {
  return (
    <div className="admin-stat-card rounded-2xl border p-5" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: `${accent}18`, color: accent }}>
          <Icon size={18} />
        </div>
        <span className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--muted-foreground)' }}>{delta}</span>
      </div>
      <p className="text-2xl font-black" style={{ fontFamily: 'Outfit, sans-serif', color: 'var(--foreground)' }}>{value}</p>
      <p className="mt-1 text-xs" style={{ color: 'var(--muted-foreground)' }}>{label}</p>
    </div>
  )
}

function TableCard({ title, subtitle, columns, rows }: { title: string; subtitle: string; columns: string[]; rows: Array<Array<string | React.ReactNode>> }) {
  return (
    <div className="admin-table-card overflow-hidden rounded-2xl border" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
      <div className="border-b px-5 py-4" style={{ borderColor: 'var(--border)' }}>
        <div>
          <h3 className="text-base font-black" style={{ fontFamily: 'Outfit, sans-serif' }}>{title}</h3>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--muted-foreground)' }}>{subtitle}</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-left text-sm">
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.035)' }}>
              {columns.map(column => (
                <th key={column} className="whitespace-nowrap px-5 py-3 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--muted-foreground)' }}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className="admin-table-row border-t transition-colors" style={{ borderColor: 'var(--border)' }}>
                {row.map((cell, cellIndex) => (
                  <td key={`${index}-${cellIndex}`} className="px-5 py-3 text-[13px]" style={{ color: 'var(--foreground)' }}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ToggleSetting({ label, description, checked, onChange, disabled = false }: { label: string; description: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,0.025)', opacity: disabled ? 0.55 : 1 }}>
      <span>
        <span className="block text-sm font-bold">{label}</span>
        <span className="mt-1 block text-xs leading-5" style={{ color: 'var(--muted-foreground)' }}>{description}</span>
      </span>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} className="sr-only" />
      <span className="mt-0.5 flex h-6 w-11 shrink-0 items-center rounded-full p-1 transition-colors" style={{ background: checked ? 'var(--primary)' : 'var(--muted)' }}>
        <span className="h-4 w-4 rounded-full bg-white shadow transition-transform" style={{ transform: checked ? 'translateX(20px)' : 'translateX(0)' }} />
      </span>
    </label>
  )
}

export default function AdminDashboardPage({ navigate }: { navigate: (page: string) => void }) {
  const { profile, user } = useAuth()
  const [section, setSection] = useState<Section>(() => sectionFromPath(window.location.pathname))
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [dashboardError, setDashboardError] = useState('')
  const [platformStats, setPlatformStats] = useState({
    totalEvents: 0,
    ticketsSold: 0,
    grossTicketValue: 0,
    platformRevenue: 0,
    activeOrganizers: 0,
    activeUsers: 0,
  })
  const [statDeltas, setStatDeltas] = useState({
    totalEvents: '+0.0%',
    ticketsSold: '+0.0%',
    grossTicketValue: '+0.0%',
    platformRevenue: '+0.0%',
    activeOrganizers: '+0.0%',
    activeUsers: '+0.0%',
  })
  const [weekTrend, setWeekTrend] = useState<number[]>([0, 0, 0, 0, 0, 0, 0])
  const [monthlyOrderCounts, setMonthlyOrderCounts] = useState<number[]>(Array(12).fill(0))
  const [monthlyRevenue, setMonthlyRevenue] = useState<number[]>(Array(12).fill(0))
  const [topOrganizers, setTopOrganizers] = useState<Array<{ name: string; sales: string; share: string }>>([])
  const [recentOrders, setRecentOrders] = useState<Array<{ customer: string; event: string; value: string; status: string }>>([])
  const [recentPayouts, setRecentPayouts] = useState<Array<{ organizer: string; amount: string; status: string; method: string }>>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d')
  const [sortMode, setSortMode] = useState<'recent' | 'name' | 'value'>('recent')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [refreshTick, setRefreshTick] = useState(0)
  const [userRows, setUserRows] = useState<Array<{ name: string; status: string; ticketsBought: string; joined: string }>>([])
  const [organizerRows, setOrganizerRows] = useState<Array<{ name: string; events: string; revenue: string; verification: string }>>([])
  const [verificationRequests, setVerificationRequests] = useState<VerificationRequest[]>([])
  const [verificationActionId, setVerificationActionId] = useState<string | null>(null)
  const [verificationNotice, setVerificationNotice] = useState('')
  const [eventRows, setEventRows] = useState<AdminEventRow[]>([])
  const [organizerOptions, setOrganizerOptions] = useState<Array<{ id: string; name: string }>>([])
  const [eventEditor, setEventEditor] = useState<AdminEventDraft | null>(null)
  const [eventSaving, setEventSaving] = useState(false)
  const [ticketRows, setTicketRows] = useState<Array<{ event: string; tier: string; sold: string; available: string; capacity: string; price: string; utilization: string }>>([])
  const [orderRows, setOrderRows] = useState<AdminOrderRow[]>([])
  const [paymentRows, setPaymentRows] = useState<AdminPaymentRow[]>([])
  const [reportDatasetKey, setReportDatasetKey] = useState<ReportDatasetKey>('orders')
  const [reportSortColumn, setReportSortColumn] = useState(0)
  const [reportSortDirection, setReportSortDirection] = useState<'asc' | 'desc'>('asc')
  const [reportDatasets, setReportDatasets] = useState<Record<ReportDatasetKey, ReportDataset>>({
    orders: { label: 'Orders', columns: [], rows: [] },
    payments: { label: 'Payments', columns: [], rows: [] },
    transactions: { label: 'Ledger transactions', columns: [], rows: [] },
    events: { label: 'Events', columns: [], rows: [] },
    tickets: { label: 'Ticket inventory', columns: [], rows: [] },
    refunds: { label: 'Refunds', columns: [], rows: [] },
    payouts: { label: 'Payouts', columns: [], rows: [] },
    agents: { label: 'Agents', columns: [], rows: [] },
    users: { label: 'Users', columns: [], rows: [] },
    organizers: { label: 'Organizers', columns: [], rows: [] },
  })
  const [payoutRows, setPayoutRows] = useState<Array<{ id: string; organizer: string; expected: string; status: string; window: string; method: string; destination: string; note: string | null }>>([])
  const [payoutActionId, setPayoutActionId] = useState<string | null>(null)
  const [eventActionId, setEventActionId] = useState<string | null>(null)
  const [refundRows, setRefundRows] = useState<AdminRefundRequest[]>([])
  const [refundActionId, setRefundActionId] = useState<string | null>(null)
  const [agentRows, setAgentRows] = useState<Array<{ agent: string; sales: string; revenue: string; commission: string; commissionRate: number }>>([])
  const [platformSettings, setPlatformSettings] = useState<PlatformSettings>(DEFAULT_PLATFORM_SETTINGS)
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsError, setSettingsError] = useState('')
  const [settingsNotice, setSettingsNotice] = useState('')
  const [healthMetrics, setHealthMetrics] = useState<HealthMetrics>({
    users: { signupsToday: 0, repeatBuyers: 0, adminAccounts: 0 },
    organizers: { awaitingVerification: 0, verified: 0, unverified: 0 },
    events: { published: 0, drafts: 0, totalCapacity: 0 },
    tickets: { lowInventory: 0, scansToday: 0, cancelled: 0 },
    orders: { confirmed: 0, pending: 0, refundedRate: 0 },
    payments: { successful: 0, failed: 0, pending: 0 },
    payouts: { paidAmount: 0, queued: 0, failed: 0 },
    agents: { topAgent: '—', active: 0, averageCommissionRate: 0 },
  })
  const [reportCards, setReportCards] = useState<{
    revenue: Array<{ label: string; value: string }>
    operations: Array<{ label: string; value: string }>
    growth: Array<{ label: string; value: string }>
  }>({ revenue: [], operations: [], growth: [] })

  useEffect(() => {
    const syncSectionWithPath = () => setSection(sectionFromPath(window.location.pathname))

    window.addEventListener('popstate', syncSectionWithPath)
    return () => window.removeEventListener('popstate', syncSectionWithPath)
  }, [])

  useEffect(() => {
    if (!user || profile?.role !== 'admin') return

    let isMounted = true
    const loadPlatformSettings = async () => {
      setSettingsLoading(true)
      setSettingsError('')
      const { data, error } = await supabase.from('platform_settings').select('id, platform_name, support_email, support_phone, contact_whatsapp, contact_address, checkout_notice, service_fee_percent, ticket_sales_enabled, mobile_money_enabled, card_payments_enabled, maintenance_mode, maintenance_message, marketplace_enabled, max_tickets_per_order, require_verified_organizers_to_publish, refund_requests_enabled, checkin_enabled, social_instagram_url, social_instagram_active, social_facebook_url, social_facebook_active, social_x_url, social_x_active, social_tiktok_url, social_tiktok_active, social_whatsapp_url, social_whatsapp_active, google_analytics_id, meta_pixel_id, updated_at').eq('id', true).maybeSingle()

      if (!isMounted) return
      if (error) {
        setSettingsError(error.message)
      } else if (data) {
        setPlatformSettings({
          id: true,
          platform_name: data.platform_name ?? DEFAULT_PLATFORM_SETTINGS.platform_name,
          support_email: data.support_email ?? DEFAULT_PLATFORM_SETTINGS.support_email,
          support_phone: data.support_phone ?? DEFAULT_PLATFORM_SETTINGS.support_phone,
          contact_whatsapp: data.contact_whatsapp ?? DEFAULT_PLATFORM_SETTINGS.contact_whatsapp,
          contact_address: data.contact_address ?? DEFAULT_PLATFORM_SETTINGS.contact_address,
          checkout_notice: data.checkout_notice ?? '',
          service_fee_percent: Number(data.service_fee_percent ?? DEFAULT_PLATFORM_SETTINGS.service_fee_percent),
          ticket_sales_enabled: data.ticket_sales_enabled ?? true,
          mobile_money_enabled: data.mobile_money_enabled ?? true,
          card_payments_enabled: data.card_payments_enabled ?? true,
          maintenance_mode: data.maintenance_mode ?? false,
          maintenance_message: data.maintenance_message ?? '',
          marketplace_enabled: data.marketplace_enabled ?? true,
          max_tickets_per_order: Number(data.max_tickets_per_order ?? DEFAULT_PLATFORM_SETTINGS.max_tickets_per_order),
          require_verified_organizers_to_publish: data.require_verified_organizers_to_publish ?? false,
          refund_requests_enabled: data.refund_requests_enabled ?? true,
          checkin_enabled: data.checkin_enabled ?? true,
          social_instagram_url: data.social_instagram_url ?? DEFAULT_PLATFORM_SETTINGS.social_instagram_url,
          social_instagram_active: data.social_instagram_active ?? DEFAULT_PLATFORM_SETTINGS.social_instagram_active,
          social_facebook_url: data.social_facebook_url ?? DEFAULT_PLATFORM_SETTINGS.social_facebook_url,
          social_facebook_active: data.social_facebook_active ?? DEFAULT_PLATFORM_SETTINGS.social_facebook_active,
          social_x_url: data.social_x_url ?? DEFAULT_PLATFORM_SETTINGS.social_x_url,
          social_x_active: data.social_x_active ?? DEFAULT_PLATFORM_SETTINGS.social_x_active,
          social_tiktok_url: data.social_tiktok_url ?? DEFAULT_PLATFORM_SETTINGS.social_tiktok_url,
          social_tiktok_active: data.social_tiktok_active ?? DEFAULT_PLATFORM_SETTINGS.social_tiktok_active,
          social_whatsapp_url: data.social_whatsapp_url ?? DEFAULT_PLATFORM_SETTINGS.social_whatsapp_url,
          social_whatsapp_active: data.social_whatsapp_active ?? DEFAULT_PLATFORM_SETTINGS.social_whatsapp_active,
          google_analytics_id: data.google_analytics_id ?? '',
          meta_pixel_id: data.meta_pixel_id ?? '',
          updated_at: data.updated_at ?? undefined,
        })
      }
      setSettingsLoading(false)
    }

    void loadPlatformSettings()
    return () => { isMounted = false }
  }, [user?.id, profile?.role])

  const rangeWindowMs = {
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
    '90d': 90 * 24 * 60 * 60 * 1000,
  } as const

  const withinDateRange = (value: string | null | undefined, targetRange: '7d' | '30d' | '90d' | 'all' = dateRange) => {
    if (!value) return false

    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return false
    if (targetRange === 'all') return date.getTime() <= Date.now()

    const now = Date.now()
    const cutoff = rangeWindowMs[targetRange]

    return date.getTime() <= now && now - date.getTime() <= cutoff
  }

  const computeDelta = (current: number, previous: number) => {
    if (previous === 0) return current === 0 ? '+0.0%' : '+100.0%'
    const delta = ((current - previous) / previous) * 100
    return `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`
  }

  useEffect(() => {
    if (!user || profile?.role !== 'admin') return

    let isMounted = true

    const load = async () => {
      setLoading(true)
      setDashboardError('')

      try {
        const [allEvents, allProfiles, allOrganizers, allOrders, allTicketTiers, allTransactions, allAgentSales, allTickets, allRefunds, allCommissions, allWithdrawals] = await Promise.all([
          fetchAllRows((from, to) => supabase.from('events').select('id, status, organizer_id, created_at, title, description, date, time, end_time, venue, category, city, capacity, organizers:organizer_id(name)').order('created_at', { ascending: false }).range(from, to)),
          fetchAllRows((from, to) => supabase.from('profiles').select('id, email, created_at, full_name, role').order('created_at', { ascending: false }).range(from, to)),
          fetchAllRows((from, to) => supabase.from('organizers').select('id, user_id, verified, verification_status, verification_requested_at, verification_note, verification_reviewed_at, created_at, name, city, phone, website').order('created_at', { ascending: false }).range(from, to)),
          fetchAllRows((from, to) => supabase.from('orders').select('id, customer_id, organizer_id, event_id, status, subtotal, service_fee, total, payment_method, created_at, profiles:customer_id(full_name), events:event_id(title), order_items:order_items(quantity, total_price, unit_price, ticket_tier_id)').order('created_at', { ascending: false }).range(from, to)),
          fetchAllRows((from, to) => supabase.from('ticket_tiers').select('id, name, sold, price, quantity, event_id, created_at, events:event_id(title)').order('created_at', { ascending: false }).range(from, to)),
          fetchAllRows((from, to) => supabase.from('transactions').select('id, organizer_id, type, amount, currency, status, created_at, reference, organizers:organizer_id(name)').order('created_at', { ascending: false }).range(from, to)),
          fetchAllRows((from, to) => supabase.from('agent_sales').select('id, order_id, agent_user_id, organizer_id, quantity, status, payment_mode, created_at, profiles:agent_user_id(full_name), organizers:organizer_id(name), orders:order_id(subtotal, status), commissions(amount, status)').order('created_at', { ascending: false }).range(from, to)),
          fetchAllRows((from, to) => supabase.from('tickets').select('id, order_id, ticket_tier_id, status, created_at, checked_in_at').order('created_at', { ascending: false }).range(from, to)),
          fetchAllRows((from, to) => supabase.from('refund_requests').select('id, order_id, ticket_id, customer_id, organizer_id, reason, status, organizer_note, created_at, reviewed_at, profiles:customer_id(full_name, email), events:event_id(title)').order('created_at', { ascending: false }).range(from, to)),
          fetchAllRows((from, to) => supabase.from('commissions').select('sale_id, amount, status, agent_sales!inner(order_id)').order('created_at', { ascending: false }).range(from, to)),
          fetchAllRows((from, to) => supabase.from('organizer_withdrawals').select('id, organizer_id, amount, payment_method, payment_reference, status, note, requested_at, organizers:organizer_id(name)').order('requested_at', { ascending: false }).range(from, to)),
        ])

        const events = allEvents.filter(event => withinDateRange(event.created_at as string | null))
        const profiles = allProfiles.filter(profileRow => withinDateRange(profileRow.created_at as string | null))
        const organizers = allOrganizers.filter(organizer => withinDateRange(organizer.created_at as string | null))
        const orders = allOrders.filter(order => withinDateRange(order.created_at as string | null))
        // Inventory is a current snapshot; filtering old tiers by creation date hides active ticket stock.
        const ticketTiers = allTicketTiers
        const transactions = allTransactions.filter(transaction => withinDateRange(transaction.created_at as string | null))
        const agentSales = allAgentSales.filter(sale => withinDateRange(sale.created_at as string | null))
        const withdrawals = allWithdrawals.filter(withdrawal => withinDateRange(withdrawal.requested_at as string | null))

        const previousWindowStart = dateRange === 'all' ? null : Date.now() - (rangeWindowMs[dateRange] * 2)
        const previousWindowEnd = dateRange === 'all' ? null : Date.now() - rangeWindowMs[dateRange]
        const previousOrders = dateRange === 'all'
          ? []
          : allOrders.filter(order => {
              if (!order.created_at) return false
              const value = new Date(order.created_at).getTime()
              return value >= previousWindowStart! && value < previousWindowEnd!
            })
        const previousProfiles = dateRange === 'all'
          ? []
          : allProfiles.filter(profileRow => {
              if (!profileRow.created_at) return false
              const value = new Date(profileRow.created_at).getTime()
              return value >= previousWindowStart! && value < previousWindowEnd!
            })
        const previousEvents = dateRange === 'all'
          ? []
          : allEvents.filter(event => {
              if (!event.created_at) return false
              const value = new Date(event.created_at).getTime()
              return value >= previousWindowStart! && value < previousWindowEnd!
            })
        const previousOrganizers = dateRange === 'all'
          ? []
          : allOrganizers.filter(organizer => {
              if (!organizer.created_at) return false
              const value = new Date(organizer.created_at).getTime()
              return value >= previousWindowStart! && value < previousWindowEnd!
            })

        const totalEvents = events.length
        const toOrderItemQuantity = (order: { order_items?: Array<{ quantity?: number | null }> | null }) => (order.order_items ?? []).reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)
        const toOrderItemValue = (order: { order_items?: Array<{ total_price?: number | null }> | null }) => (order.order_items ?? []).reduce((sum, item) => sum + (Number(item.total_price) || 0), 0)
        const ticketValueForOrder = (order: { subtotal?: number | null; order_items?: Array<{ total_price?: number | null }> | null }) => Number(order.subtotal) || toOrderItemValue(order)
        const serviceFeeForOrder = (order: { service_fee?: number | null }) => Math.max(0, Number(order.service_fee) || 0)
        const ordersById = new Map((allOrders as Array<{ id: string; order_items?: Array<{ ticket_tier_id?: string | null; unit_price?: number | null }> | null }>).map(order => [order.id, order]))
        const ticketsById = new Map((allTickets as Array<{ id: string; ticket_tier_id?: string | null }>).map(ticket => [ticket.id, ticket]))
        const refundAmountByOrder = new Map<string, number>()
        ;(allRefunds as Array<{ order_id: string; ticket_id?: string | null; status?: string | null }>).filter(refund => refund.status === 'processed').forEach(refund => {
          const ticket = refund.ticket_id ? ticketsById.get(refund.ticket_id) : undefined
          const order = ordersById.get(refund.order_id)
          const item = ticket ? order?.order_items?.find(orderItem => orderItem.ticket_tier_id === ticket.ticket_tier_id) : undefined
          const amount = Math.max(0, Number(item?.unit_price) || 0)
          refundAmountByOrder.set(refund.order_id, (refundAmountByOrder.get(refund.order_id) ?? 0) + amount)
        })
        const commissionAmountByOrder = new Map<string, number>()
        ;(allCommissions as Array<{ amount?: number | null; status?: string | null; agent_sales?: { order_id?: string | null } | Array<{ order_id?: string | null }> | null }>).filter(commission => commission.status !== 'reversed').forEach(commission => {
          const sale = Array.isArray(commission.agent_sales) ? commission.agent_sales[0] : commission.agent_sales
          if (sale?.order_id) commissionAmountByOrder.set(sale.order_id, (commissionAmountByOrder.get(sale.order_id) ?? 0) + (Number(commission.amount) || 0))
        })
        const netTicketRevenueForOrder = (order: { id: string; subtotal?: number | null; service_fee?: number | null; order_items?: Array<{ total_price?: number | null }> | null }) => Math.max(0, ticketValueForOrder(order) - serviceFeeForOrder(order) - (refundAmountByOrder.get(order.id) ?? 0) - (commissionAmountByOrder.get(order.id) ?? 0))
        const processedRefundCountForOrders = (orderIds: Set<string>) => new Set((allRefunds as Array<{ order_id: string; ticket_id?: string | null; status?: string | null }>)
          .filter(refund => refund.status === 'processed' && orderIds.has(refund.order_id))
          .map(refund => refund.ticket_id)
          .filter((ticketId): ticketId is string => Boolean(ticketId))).size

        const confirmedOrders = (orders as Array<{ id: string; status?: string; subtotal?: number | null; service_fee?: number | null; order_items?: Array<{ quantity?: number | null; total_price?: number | null }> | null }>).filter(order => order.status === 'confirmed')
        const ticketsSold = Math.max(0, confirmedOrders.reduce((sum, order) => sum + toOrderItemQuantity(order), 0) - processedRefundCountForOrders(new Set(confirmedOrders.map(order => order.id))))
        const grossTicketValue = confirmedOrders.reduce((sum, order) => sum + netTicketRevenueForOrder(order), 0)
        const platformRevenue = confirmedOrders.reduce((sum, order) => sum + serviceFeeForOrder(order), 0)

        const previousConfirmedOrders = (previousOrders as Array<{ id: string; status?: string; subtotal?: number | null; service_fee?: number | null; order_items?: Array<{ quantity?: number | null; total_price?: number | null }> | null }>).filter(order => order.status === 'confirmed')
        const previousPlatformRevenue = previousConfirmedOrders.reduce((sum, order) => sum + serviceFeeForOrder(order), 0)
        const previousTicketsSold = Math.max(0, previousConfirmedOrders.reduce((sum, order) => sum + toOrderItemQuantity(order), 0) - processedRefundCountForOrders(new Set(previousConfirmedOrders.map(order => order.id))))
        const previousGrossTicketValue = previousConfirmedOrders.reduce((sum, order) => sum + netTicketRevenueForOrder(order), 0)

        const today = new Date()
        const weekStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
        weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7))
        const mondayToSunday = Array.from({ length: 7 }, (_, index) => {
          const date = new Date(weekStart)
          date.setDate(weekStart.getDate() + index)
          const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)
          const dayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 0, 0)

          return (allOrders as Array<{ created_at?: string | null; status?: string | null; service_fee?: number | null }>).filter(order => {
            if (!order.created_at || order.status !== 'confirmed') return false
            const orderDate = new Date(order.created_at)
            return orderDate >= dayStart && orderDate < dayEnd
          }).reduce((sum, order) => sum + serviceFeeForOrder(order), 0)
        })

        const organizerRevenue = new Map<string, number>()
        for (const order of orders as Array<{ id: string; organizer_id?: string | null; status?: string | null; subtotal?: number | null; order_items?: Array<{ total_price?: number | null }> | null }>) {
          if (order.status === 'confirmed' && order.organizer_id) {
            organizerRevenue.set(order.organizer_id, (organizerRevenue.get(order.organizer_id) ?? 0) + netTicketRevenueForOrder(order))
          }
        }

        const maxOrganizerRevenue = organizerRevenue.size > 0 ? Math.max(...Array.from(organizerRevenue.values())) : 0
        const organizerRows = [...organizerRevenue.entries()]
          .map(([organizerId, sales]) => {
            const organizer = allOrganizers.find(item => item.id === organizerId)
            const percent = maxOrganizerRevenue > 0 ? Math.round((sales / maxOrganizerRevenue) * 100) : 0
            return {
              name: organizer?.name ?? 'Unknown organizer',
              sales: formatMoneyShort(sales),
              share: `${percent}%`,
            }
          })
          .sort((a, b) => toComparableNumber(b.sales) - toComparableNumber(a.sales))
          .slice(0, 4)

        const userRowsData = (profiles as Array<{ id?: string; full_name?: string | null; role?: string | null; created_at?: string | null }>).map(profileRow => {
          const userOrders = (orders as Array<{ customer_id?: string | null; status?: string | null; order_items?: Array<{ quantity?: number | null }> | null }>).filter(order => order.customer_id === profileRow.id && order.status === 'confirmed')
          return {
            name: profileRow.full_name ?? 'Unnamed user',
            status: profileRow.role ?? 'customer',
            ticketsBought: `${userOrders.reduce((total, order) => total + toOrderItemQuantity(order), 0)}`,
            joined: profileRow.created_at ? new Date(profileRow.created_at).toLocaleDateString() : '—',
          }
        })

        const organizerRowsData = (organizers as Array<{ name?: string | null; id?: string; verified?: boolean | null; verification_status?: string | null; created_at?: string | null }>).map(organizerRow => {
          const organizerEvents = (events as Array<{ organizer_id?: string | null }>).filter(event => event.organizer_id === organizerRow.id).length
          const organizerSales = (orders as Array<{ id: string; organizer_id?: string | null; subtotal?: number | null; order_items?: Array<{ total_price?: number | null }> | null; status?: string | null }>).filter(order => order.organizer_id === organizerRow.id && order.status === 'confirmed').reduce((sum, order) => sum + netTicketRevenueForOrder(order), 0)
          return {
            name: organizerRow.name ?? 'Unnamed organizer',
            events: `${organizerEvents}`,
            revenue: formatMoneyShort(organizerSales),
            verification: organizerVerificationStatus(organizerRow) === 'verified' ? 'Verified' : organizerVerificationStatus(organizerRow) === 'pending' ? 'Pending review' : 'Unverified',
          }
        })

        const verificationRequestsData = (allOrganizers as Array<{ id?: string; name?: string | null; city?: string | null; phone?: string | null; website?: string | null; verification_status?: string | null; verified?: boolean | null; verification_requested_at?: string | null }>)
          .filter(organizer => organizer.id && organizerVerificationStatus(organizer) === 'pending')
          .sort((left, right) => new Date(left.verification_requested_at ?? 0).getTime() - new Date(right.verification_requested_at ?? 0).getTime())
          .map(organizer => ({
            id: organizer.id!,
            name: organizer.name ?? 'Unnamed organizer',
            city: organizer.city ?? null,
            phone: organizer.phone ?? null,
            website: organizer.website ?? null,
            requestedAt: organizer.verification_requested_at ?? null,
          }))

        const eventRowsData = (events as Array<{ id: string; organizer_id: string; title?: string | null; description?: string | null; date?: string | null; time?: string | null; end_time?: string | null; venue?: string | null; category?: string | null; city?: string | null; organizers?: { name?: string | null } | null; capacity?: number | null; status?: string | null }>).map(eventRow => ({
          id: eventRow.id,
          event: eventRow.title ?? 'Untitled event',
          organizer: eventRow.organizers?.name ?? 'Unknown organizer',
          organizerId: eventRow.organizer_id,
          capacity: (eventRow.capacity ?? 0).toLocaleString(),
          status: eventRow.status ?? 'draft',
          category: eventRow.category ?? 'Other',
          city: eventRow.city ?? 'Bujumbura',
          date: eventRow.date ?? '',
          time: eventRow.time?.slice(0, 5) ?? '18:00',
          endTime: eventRow.end_time?.slice(0, 5) ?? '',
          venue: eventRow.venue ?? '',
          description: eventRow.description ?? '',
        }))

        const ticketRowsData = (ticketTiers as Array<{ name?: string | null; events?: { title?: string | null } | null; sold?: number | null; quantity?: number | null; price?: number | null }>).map(tier => {
          const sold = tier.sold ?? 0
          const quantity = tier.quantity ?? 0
          const utilization = quantity > 0 ? `${Math.round((sold / quantity) * 100)}%` : '0%'
          return {
            event: tier.events?.title ?? 'Event',
            tier: tier.name ?? 'Ticket tier',
            sold: sold.toLocaleString(),
            available: Math.max(quantity - sold, 0).toLocaleString(),
            capacity: quantity.toLocaleString(),
            price: formatMoneyShort(Number(tier.price) || 0),
            utilization,
          }
        })

        const orderRowsData = (orders as Array<{ id: string; profiles?: { full_name?: string | null }; events?: { title?: string | null }; total?: number | null; status?: string | null; payment_method?: string | null; created_at?: string | null; order_items?: Array<{ quantity?: number | null }> | null }>).map(order => ({
          id: order.id,
          customer: order.profiles?.full_name ?? 'Customer',
          event: order.events?.title ?? 'Event',
          amount: formatMoneyShort(order.total ?? 0),
          status: order.status ?? 'pending',
          method: order.payment_method?.replace('_', ' ') ?? '—',
          tickets: toOrderItemQuantity(order),
          created: order.created_at ? new Date(order.created_at).toLocaleString() : '—',
          createdAt: order.created_at ?? '',
          total: Number(order.total) || 0,
        }))

        const paymentRowsData = (orders as Array<{ id?: string | null; profiles?: { full_name?: string | null }; events?: { title?: string | null }; payment_method?: string | null; subtotal?: number | null; service_fee?: number | null; total?: number | null; status?: string | null; created_at?: string | null }>).map(order => ({
          reference: `TXN-${String(order.id ?? '').slice(0, 6).toUpperCase()}`,
          customer: order.profiles?.full_name ?? 'Customer',
          event: order.events?.title ?? 'Event',
          method: order.payment_method ? order.payment_method.replace('_', ' ') : 'Not recorded',
          amount: formatMoneyShort(order.total ?? 0),
          platformFee: formatMoneyShort(serviceFeeForOrder(order)),
          organizerProceeds: formatMoneyShort(Math.max(0, (Number(order.subtotal) || 0) - serviceFeeForOrder(order))),
          status: order.status ?? 'pending',
          created: order.created_at ? new Date(order.created_at).toLocaleString() : '—',
          createdAt: order.created_at ?? '',
        }))

        const payoutRowsData = (withdrawals as Array<{ id: string; organizers?: { name?: string | null }; amount?: number | null; status?: string | null; requested_at?: string | null; payment_method?: string | null; payment_reference?: string | null; note?: string | null }>).map(withdrawal => ({
          id: withdrawal.id,
          organizer: withdrawal.organizers?.name ?? 'Organizer',
          expected: formatMoneyShort(withdrawal.amount ?? 0),
          status: withdrawal.status ?? 'requested',
          window: withdrawal.requested_at ? new Date(withdrawal.requested_at).toLocaleDateString() : 'Today',
          method: withdrawal.payment_method === 'mobile_money' ? 'Mobile Money' : 'Bank transfer',
          destination: withdrawal.payment_reference ?? '—',
          note: withdrawal.note ?? null,
        }))

        const agentMetrics = new Map<string, { agent: string; tickets: number; revenue: number; commission: number }>()
        for (const agentSale of agentSales as Array<{ agent_user_id?: string | null; profiles?: { full_name?: string | null }; quantity?: number | null; status?: string | null; orders?: { subtotal?: number | null; status?: string | null } | Array<{ subtotal?: number | null; status?: string | null }> | null; commissions?: Array<{ amount?: number | null; status?: string | null }> | null }>) {
          const order = Array.isArray(agentSale.orders) ? agentSale.orders[0] : agentSale.orders
          if (agentSale.status !== 'paid' || order?.status !== 'confirmed') continue
          const key = agentSale.agent_user_id ?? agentSale.profiles?.full_name ?? 'unknown-agent'
          const current = agentMetrics.get(key) ?? { agent: agentSale.profiles?.full_name ?? 'Unknown agent', tickets: 0, revenue: 0, commission: 0 }
          const saleRevenue = Math.max(0, Number(order.subtotal) || 0)
          const saleCommission = (agentSale.commissions ?? []).filter(commission => commission.status !== 'reversed').reduce((sum, commission) => sum + (Number(commission.amount) || 0), 0)
          current.tickets += Number(agentSale.quantity) || 0
          current.revenue += saleRevenue
          current.commission += saleCommission
          agentMetrics.set(key, current)
        }
        const agentRowsData = [...agentMetrics.values()]
          .sort((left, right) => right.revenue - left.revenue)
          .map(agent => ({
            agent: agent.agent,
            sales: `${agent.tickets} tickets`,
            revenue: formatMoneyShort(agent.revenue),
            commission: formatMoneyShort(agent.commission),
            commissionRate: agent.revenue > 0 ? (agent.commission / agent.revenue) * 100 : 0,
          }))

        const ticketsByCustomer = new Map<string, number>()
        confirmedOrders.forEach(order => {
          const customerId = (order as { customer_id?: string | null }).customer_id
          if (customerId) ticketsByCustomer.set(customerId, (ticketsByCustomer.get(customerId) ?? 0) + toOrderItemQuantity(order))
        })
        const eventsByOrganizer = new Map<string, number>()
        events.forEach(event => { eventsByOrganizer.set(event.organizer_id, (eventsByOrganizer.get(event.organizer_id) ?? 0) + 1) })
        const allOrdersById = new Map((allOrders as Array<{ id: string; order_items?: Array<{ ticket_tier_id?: string | null; unit_price?: number | null }> | null }>).map(order => [order.id, order]))
        const allTicketsById = new Map((allTickets as Array<{ id: string; ticket_tier_id?: string | null }>).map(ticket => [ticket.id, ticket]))
        const monthlyCounts = Array(12).fill(0) as number[]
        const monthlySales = Array(12).fill(0) as number[]
        const currentYear = new Date().getFullYear()
        ;(allOrders as Array<{ id: string; status?: string | null; created_at?: string | null; subtotal?: number | null; service_fee?: number | null; order_items?: Array<{ total_price?: number | null }> | null }>).forEach(order => {
          if (order.status !== 'confirmed' || !order.created_at) return
          const createdAt = new Date(order.created_at)
          if (createdAt.getFullYear() !== currentYear) return
          const monthIndex = createdAt.getMonth()
          monthlyCounts[monthIndex] += 1
          monthlySales[monthIndex] += netTicketRevenueForOrder(order)
        })

        const reportDatasetsData: Record<ReportDatasetKey, ReportDataset> = {
          orders: {
            label: 'Orders',
            columns: ['Order ID', 'Customer', 'Event', 'Tickets', 'Method', 'Amount (BIF)', 'Status', 'Created'],
            rows: orderRowsData.map(row => [row.id, row.customer, row.event, row.tickets, row.method, row.total, row.status, row.createdAt]),
          },
          payments: {
            label: 'Payments',
            columns: ['Reference', 'Customer', 'Event', 'Method', 'Customer paid (BIF)', 'Platform fee (BIF)', 'Organizer proceeds (BIF)', 'Status', 'Created'],
            rows: paymentRowsData.map(row => [row.reference, row.customer, row.event, row.method, toComparableNumber(row.amount), toComparableNumber(row.platformFee), toComparableNumber(row.organizerProceeds), row.status, row.createdAt]),
          },
          transactions: {
            label: 'Ledger transactions',
            columns: ['Transaction ID', 'Organizer', 'Type', 'Amount', 'Currency', 'Status', 'Reference', 'Created'],
            rows: (transactions as Array<{ id: string; organizers?: { name?: string | null } | null; type?: string | null; amount?: number | null; currency?: string | null; status?: string | null; reference?: string | null; created_at?: string | null }>).map(row => [row.id, row.organizers?.name ?? 'Organizer', row.type ?? '—', Number(row.amount) || 0, row.currency ?? 'BIF', row.status ?? '—', row.reference ?? '', row.created_at ?? '—']),
          },
          events: {
            label: 'Events',
            columns: ['Event', 'Organizer', 'Category', 'City', 'Event date', 'Capacity', 'Status', 'Created'],
            rows: (events as Array<{ title?: string | null; organizers?: { name?: string | null } | null; category?: string | null; city?: string | null; date?: string | null; capacity?: number | null; status?: string | null; created_at?: string | null }>).map(row => [row.title ?? 'Untitled event', row.organizers?.name ?? 'Unknown organizer', row.category ?? '—', row.city ?? '—', row.date ?? '—', Number(row.capacity) || 0, row.status ?? 'draft', row.created_at ?? '—']),
          },
          tickets: {
            label: 'Ticket inventory',
            snapshot: true,
            columns: ['Event', 'Tier', 'Sold', 'Available', 'Capacity', 'Price (BIF)', 'Utilization'],
            rows: (ticketTiers as Array<{ name?: string | null; events?: { title?: string | null } | null; sold?: number | null; quantity?: number | null; price?: number | null }>).map(row => [row.events?.title ?? 'Event', row.name ?? 'Ticket tier', Number(row.sold) || 0, Math.max((Number(row.quantity) || 0) - (Number(row.sold) || 0), 0), Number(row.quantity) || 0, Number(row.price) || 0, Number(row.quantity) ? `${Math.round(((Number(row.sold) || 0) / Number(row.quantity)) * 100)}%` : '0%']),
          },
          refunds: {
            label: 'Refunds',
            columns: ['Request ID', 'Customer', 'Event', 'Order ID', 'Ticket ID', 'Amount (BIF)', 'Status', 'Reason', 'Requested', 'Reviewed'],
            rows: (allRefunds as AdminRefundRequest[]).filter(row => withinDateRange(row.created_at)).map(row => {
              const ticketTierId = row.ticket_id ? allTicketsById.get(row.ticket_id)?.ticket_tier_id : null
              const matchingItem = allOrdersById.get(row.order_id)?.order_items?.find(item => item.ticket_tier_id === ticketTierId)
              return [row.id, row.profiles?.full_name ?? row.profiles?.email ?? 'Customer', row.events?.title ?? 'Event', row.order_id, row.ticket_id ?? '', Number(matchingItem?.unit_price) || 0, row.status, row.reason, row.created_at, row.reviewed_at ?? '']
            }),
          },
          payouts: {
            label: 'Payouts',
            columns: ['Organizer', 'Amount (BIF)', 'Method', 'Destination', 'Status', 'Requested', 'Note'],
            rows: payoutRowsData.map(row => [row.organizer, toComparableNumber(row.expected), row.method, row.destination, row.status, row.window, row.note ?? '']),
          },
          agents: {
            label: 'Ticket agents',
            columns: ['Agent', 'Tickets sold', 'Revenue (BIF)', 'Commission (BIF)', 'Commission rate'],
            rows: agentRowsData.map(row => [row.agent, Number.parseInt(row.sales, 10) || 0, toComparableNumber(row.revenue), toComparableNumber(row.commission), `${row.commissionRate.toFixed(2)}%`]),
          },
          users: {
            label: 'Users',
            columns: ['Name', 'Role', 'Tickets purchased', 'Email', 'Joined'],
            rows: (profiles as Array<{ id?: string; full_name?: string | null; email?: string | null; role?: string | null; created_at?: string | null }>).map(row => [row.full_name ?? 'Unnamed user', row.role ?? 'customer', ticketsByCustomer.get(row.id ?? '') ?? 0, row.email ?? '', row.created_at ?? '—']),
          },
          organizers: {
            label: 'Organizers',
            columns: ['Organizer', 'City', 'Events', 'Net revenue (BIF)', 'Verification', 'Created'],
            rows: (organizers as Array<{ id?: string; name?: string | null; city?: string | null; created_at?: string | null }>).map(row => [row.name ?? 'Unnamed organizer', row.city ?? '—', eventsByOrganizer.get(row.id ?? '') ?? 0, organizerRevenue.get(row.id ?? '') ?? 0, organizerVerificationStatus(row), row.created_at ?? '—']),
          },
        }

        const startOfToday = new Date()
        startOfToday.setHours(0, 0, 0, 0)
        const startOfTomorrow = new Date(startOfToday)
        startOfTomorrow.setDate(startOfTomorrow.getDate() + 1)
        const selectedOrderIds = new Set((orders as Array<{ id: string }>).map(order => order.id))
        const customerOrderCounts = new Map<string, number>()
        confirmedOrders.forEach(order => {
          const customerId = (order as { customer_id?: string | null }).customer_id
          if (customerId) customerOrderCounts.set(customerId, (customerOrderCounts.get(customerId) ?? 0) + 1)
        })
        const processedRefundOrderIds = new Set((allRefunds as Array<{ order_id: string; status?: string | null }>)
          .filter(refund => refund.status === 'processed' && selectedOrderIds.has(refund.order_id))
          .map(refund => refund.order_id))
        const refundedOrderCount = new Set([
          ...(orders as Array<{ id: string; status?: string | null }>).filter(order => order.status === 'refunded').map(order => order.id),
          ...processedRefundOrderIds,
        ]).size
        const payoutTransactions = (transactions as Array<{ type?: string | null; amount?: number | null; status?: string | null }>).filter(transaction => transaction.type === 'payout')
        const inventoryTiers = allTicketTiers as Array<{ sold?: number | null; quantity?: number | null }>
        const allTicketRows = allTickets as Array<{ status?: string | null; checked_in_at?: string | null }>
        const totalAgentRevenue = [...agentMetrics.values()].reduce((sum, agent) => sum + agent.revenue, 0)
        const totalAgentCommission = [...agentMetrics.values()].reduce((sum, agent) => sum + agent.commission, 0)
        const health: HealthMetrics = {
          users: {
            signupsToday: (allProfiles as Array<{ created_at?: string | null }>).filter(profileRow => {
              if (!profileRow.created_at) return false
              const createdAt = new Date(profileRow.created_at)
              return createdAt >= startOfToday && createdAt < startOfTomorrow
            }).length,
            repeatBuyers: [...customerOrderCounts.values()].filter(count => count > 1).length,
            adminAccounts: (allProfiles as Array<{ role?: string | null }>).filter(profileRow => profileRow.role === 'admin').length,
          },
          organizers: {
            awaitingVerification: (allOrganizers as Array<{ verified?: boolean | null; verification_status?: string | null }>).filter(organizer => organizerVerificationStatus(organizer) === 'pending').length,
            verified: (allOrganizers as Array<{ verified?: boolean | null; verification_status?: string | null }>).filter(organizer => organizerVerificationStatus(organizer) === 'verified').length,
            unverified: (allOrganizers as Array<{ verified?: boolean | null; verification_status?: string | null }>).filter(organizer => organizerVerificationStatus(organizer) === 'unverified').length,
          },
          events: {
            published: (events as Array<{ status?: string | null }>).filter(event => event.status === 'published').length,
            drafts: (events as Array<{ status?: string | null }>).filter(event => event.status === 'draft').length,
            totalCapacity: (events as Array<{ capacity?: number | null }>).reduce((sum, event) => sum + (Number(event.capacity) || 0), 0),
          },
          tickets: {
            lowInventory: inventoryTiers.filter(tier => {
              const quantity = Number(tier.quantity) || 0
              const sold = Number(tier.sold) || 0
              return quantity > 0 && sold / quantity >= 0.85
            }).length,
            scansToday: allTicketRows.filter(ticket => {
              if (!ticket.checked_in_at) return false
              const checkedInAt = new Date(ticket.checked_in_at)
              return checkedInAt >= startOfToday && checkedInAt < startOfTomorrow
            }).length,
            cancelled: allTicketRows.filter(ticket => ticket.status === 'cancelled').length,
          },
          orders: {
            confirmed: confirmedOrders.length,
            pending: (orders as Array<{ status?: string | null }>).filter(order => order.status === 'pending').length,
            refundedRate: orders.length ? (Math.min(refundedOrderCount, orders.length) / orders.length) * 100 : 0,
          },
          payments: {
            successful: confirmedOrders.length,
            failed: (orders as Array<{ status?: string | null }>).filter(order => order.status === 'cancelled' || order.status === 'refunded').length,
            pending: (orders as Array<{ status?: string | null }>).filter(order => order.status === 'pending').length,
          },
          payouts: {
            paidAmount: payoutTransactions.filter(transaction => transaction.status === 'completed').reduce((sum, transaction) => sum + (Number(transaction.amount) || 0), 0),
            queued: payoutTransactions.filter(transaction => transaction.status === 'pending').length,
            failed: payoutTransactions.filter(transaction => transaction.status === 'failed').length,
          },
          agents: {
            topAgent: agentRowsData[0]?.agent ?? '—',
            active: agentMetrics.size,
            averageCommissionRate: totalAgentRevenue > 0 ? (totalAgentCommission / totalAgentRevenue) * 100 : 0,
          },
        }

        const avgOrderValue = confirmedOrders.length > 0 ? grossTicketValue / confirmedOrders.length : 0
        const totalCapacity = events.reduce((sum, event) => sum + (event.capacity ?? 0), 0)
        const fillRate = totalCapacity > 0 ? (ticketsSold / totalCapacity) * 100 : 0
        const uniqueBuyerCount = customerOrderCounts.size
        const repeatBuyerCount = [...customerOrderCounts.values()].filter(count => count > 1).length
        const returningCustomers = uniqueBuyerCount > 0 ? (repeatBuyerCount / uniqueBuyerCount) * 100 : 0

        const reports = {
          revenue: [
            { label: 'Net ticket sales', value: formatMoneyShort(grossTicketValue) },
            { label: 'Platform service fees', value: formatMoneyShort(platformRevenue) },
            { label: 'Avg ticket order', value: formatMoneyShort(avgOrderValue) },
            { label: 'Growth vs previous', value: computeDelta(platformRevenue, previousPlatformRevenue) },
          ],
          operations: [
            { label: 'Tickets sold', value: ticketsSold.toLocaleString() },
            { label: 'Capacity filled', value: `${fillRate.toFixed(1)}%` },
            { label: 'Live events', value: totalEvents.toLocaleString() },
          ],
          growth: [
            { label: 'New users', value: profiles.length.toLocaleString() },
            { label: 'Repeat customers', value: `${Math.min(100, Math.max(0, returningCustomers)).toFixed(1)}%` },
            { label: 'New organizers', value: organizers.length.toLocaleString() },
          ],
        }

        if (!isMounted) return

        const nextStatDeltas = {
          totalEvents: computeDelta(totalEvents, previousEvents.length),
          ticketsSold: computeDelta(ticketsSold, previousTicketsSold),
          grossTicketValue: computeDelta(grossTicketValue, previousGrossTicketValue),
          platformRevenue: computeDelta(platformRevenue, previousPlatformRevenue),
          activeOrganizers: computeDelta(organizers.length, previousOrganizers.length),
          activeUsers: computeDelta(profiles.length, previousProfiles.length),
        }

        setPlatformStats({
          totalEvents,
          ticketsSold,
          grossTicketValue,
          platformRevenue,
          activeOrganizers: organizers.length,
          activeUsers: profiles.length,
        })
        setStatDeltas(nextStatDeltas)
        setWeekTrend(mondayToSunday)
        setMonthlyOrderCounts(monthlyCounts)
        setMonthlyRevenue(monthlySales)
        setTopOrganizers(organizerRows.length ? organizerRows : [
          { name: 'No organizers yet', sales: 'BIF 0', share: '0%' },
        ])
        setRecentOrders((orders as Array<{ profiles?: { full_name?: string | null }; events?: { title?: string | null }; total?: number | null; status?: string | null }>).slice(0, 4).map(order => ({
          customer: order.profiles?.full_name ?? 'Customer',
          event: order.events?.title ?? 'Event',
          value: formatMoneyShort(order.total ?? 0),
          status: order.status ?? 'pending',
        })))
        setRecentPayouts(payoutRowsData.slice(0, 4).map(withdrawal => ({
          organizer: withdrawal.organizer,
          amount: withdrawal.expected,
          status: withdrawal.status,
          method: withdrawal.method,
        })))
        setUserRows(userRowsData)
        setOrganizerRows(organizerRowsData)
        setVerificationRequests(verificationRequestsData)
        setEventRows(eventRowsData)
        setOrganizerOptions((allOrganizers as Array<{ id: string; name?: string | null }>).map(organizer => ({ id: organizer.id, name: organizer.name ?? 'Organizer' })))
        setTicketRows(ticketRowsData)
        setOrderRows(orderRowsData)
        setPaymentRows(paymentRowsData)
        setPayoutRows(payoutRowsData)
        setRefundRows((allRefunds as AdminRefundRequest[]).map(request => {
          const ticketTierId = request.ticket_id ? allTicketsById.get(request.ticket_id)?.ticket_tier_id : null
          const matchingItem = allOrdersById.get(request.order_id)?.order_items?.find(item => item.ticket_tier_id === ticketTierId)
          return { ...request, amount: matchingItem?.unit_price ?? null }
        }))
        setAgentRows(agentRowsData)
        setHealthMetrics(health)
        setReportCards(reports)
        setReportDatasets(reportDatasetsData)
        setLastUpdated(new Date())
      } catch (error) {
        if (isMounted) setDashboardError(error instanceof Error ? error.message : 'Unable to load admin dashboard data.')
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    void load()

    return () => {
      isMounted = false
    }
  }, [user?.id, profile?.role, dateRange, refreshTick])

  useEffect(() => {
    if (!user || profile?.role !== 'admin') return
    let refreshTimeout: number | undefined
    const scheduleRefresh = () => {
      window.clearTimeout(refreshTimeout)
      refreshTimeout = window.setTimeout(() => setRefreshTick(current => current + 1), 500)
    }
    const channel = supabase.channel(`admin-analytics:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'organizers' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ticket_tiers' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'refund_requests' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commissions' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'organizer_withdrawals' }, scheduleRefresh)
      .subscribe()
    const refresh = () => setRefreshTick(current => current + 1)
    const interval = window.setInterval(refresh, 60_000)
    window.addEventListener('focus', refresh)
    return () => {
      window.clearTimeout(refreshTimeout)
      window.clearInterval(interval)
      window.removeEventListener('focus', refresh)
      void supabase.removeChannel(channel)
    }
  }, [user?.id, profile?.role])

  const formatMoneyShort = (value: number) => {
    return `BIF ${Math.round(value).toLocaleString()}`
  }

  const kpis = useMemo(
    () => [
      { label: 'New Events', value: platformStats.totalEvents.toLocaleString(), delta: statDeltas.totalEvents, icon: CalendarIcon, accent: '#8bc4ff' },
      { label: 'Tickets Sold', value: platformStats.ticketsSold.toLocaleString(), delta: statDeltas.ticketsSold, icon: TicketIcon, accent: '#ffb976' },
      { label: 'Organizer Net Revenue', value: formatMoneyShort(platformStats.grossTicketValue), delta: statDeltas.grossTicketValue, icon: DollarSignIcon, accent: '#9ae6b4' },
      { label: 'Platform Service Fees', value: formatMoneyShort(platformStats.platformRevenue), delta: statDeltas.platformRevenue, icon: TrendingUpIcon, accent: '#d7a7ff' },
      { label: 'New Organizers', value: platformStats.activeOrganizers.toLocaleString(), delta: statDeltas.activeOrganizers, icon: UsersIcon, accent: '#ff7a7a' },
      { label: 'New Users', value: platformStats.activeUsers.toLocaleString(), delta: statDeltas.activeUsers, icon: UserIcon, accent: '#7fe9d9' },
    ],
    [platformStats, statDeltas],
  )

  const handleSelectSection = (nextSection: Section) => {
    setSection(nextSection)
    setSidebarOpen(false)
    const nextPath = SECTION_PATHS[nextSection]
    if (window.location.pathname !== nextPath) window.history.pushState({}, '', nextPath)
  }

  const updatePlatformSetting = <Key extends keyof PlatformSettings>(key: Key, value: PlatformSettings[Key]) => {
    setSettingsError('')
    setSettingsNotice('')
    setPlatformSettings(current => ({ ...current, [key]: value }))
  }

  const savePlatformSettings = async () => {
    const platformName = platformSettings.platform_name.trim()
    const supportEmail = platformSettings.support_email.trim()
    const supportPhone = platformSettings.support_phone.trim()
    const contactWhatsApp = platformSettings.contact_whatsapp.trim()
    const contactAddress = platformSettings.contact_address.trim()
    const checkoutNotice = platformSettings.checkout_notice.trim()
    const maintenanceMessage = platformSettings.maintenance_message.trim()
    const googleAnalyticsId = platformSettings.google_analytics_id.trim()
    const metaPixelId = platformSettings.meta_pixel_id.trim()
    const serviceFeePercent = Number(platformSettings.service_fee_percent)
    const maxTicketsPerOrder = Number(platformSettings.max_tickets_per_order)

    if (!platformName) { setSettingsError('Enter a platform name.'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail)) { setSettingsError('Enter a valid support email address.'); return }
    if (!supportPhone) { setSettingsError('Enter a support phone number for your contact details.'); return }
    if (!contactAddress) { setSettingsError('Enter a contact address for your public footer.'); return }
    if (!Number.isFinite(serviceFeePercent) || serviceFeePercent < 0 || serviceFeePercent > 100) { setSettingsError('Service fee must be between 0% and 100%.'); return }
    if (!Number.isInteger(maxTicketsPerOrder) || maxTicketsPerOrder < 1 || maxTicketsPerOrder > 100) { setSettingsError('Tickets per order must be a whole number between 1 and 100.'); return }
    if (!platformSettings.mobile_money_enabled && !platformSettings.card_payments_enabled) { setSettingsError('Keep at least one payment method enabled.'); return }
    if (googleAnalyticsId && !/^G-[A-Z0-9]+$/i.test(googleAnalyticsId)) { setSettingsError(i18n.t('Enter a valid Google Analytics 4 measurement ID (G-XXXXXXXXXX).')); return }
    if (metaPixelId && !/^\d{5,20}$/.test(metaPixelId)) { setSettingsError(i18n.t('Enter a valid Meta Pixel ID containing digits only.')); return }

    setSettingsSaving(true)
    setSettingsError('')
    setSettingsNotice('')
    const nextSettings = {
      ...platformSettings,
      platform_name: platformName,
      support_email: supportEmail,
      support_phone: supportPhone,
      contact_whatsapp: contactWhatsApp,
      contact_address: contactAddress,
      checkout_notice: checkoutNotice,
      maintenance_message: maintenanceMessage,
      google_analytics_id: googleAnalyticsId,
      meta_pixel_id: metaPixelId,
      service_fee_percent: serviceFeePercent,
      max_tickets_per_order: maxTicketsPerOrder,
    }
    const { error } = await supabase.from('platform_settings').upsert({ ...nextSettings, updated_by: user?.id }, { onConflict: 'id' })
    if (error) {
      setSettingsError(error.message)
    } else {
      setPlatformSettings(nextSettings)
      setSettingsNotice('Platform settings saved. Operational changes are now active; pricing changes apply to new orders only.')
      window.dispatchEvent(new CustomEvent('tiketi:platform-settings-updated'))
    }
    setSettingsSaving(false)
  }

  const reviewWithdrawal = async (withdrawal: (typeof payoutRows)[number], status: 'processing' | 'paid' | 'rejected') => {
    const action = status === 'paid' ? 'mark this transfer as paid' : status === 'rejected' ? 'reject this payout request' : 'start processing this payout'
    if (!window.confirm(`Are you sure you want to ${action} for ${withdrawal.organizer} (${withdrawal.expected})?`)) return
    const note = window.prompt(status === 'rejected' ? 'Reason for rejecting this payout request' : status === 'paid' ? 'Transfer reference or confirmation note' : 'Optional processing note')
    if (note === null) return
    if (status === 'rejected' && !note.trim()) { setDashboardError('A reason is required to reject a payout.'); return }
    if (status === 'paid' && !note.trim()) { setDashboardError('Enter a transfer reference before marking a payout as paid.'); return }

    setPayoutActionId(withdrawal.id)
    setDashboardError('')
    try {
      const { error } = await supabase.rpc('review_organizer_withdrawal', {
        p_withdrawal_id: withdrawal.id,
        p_status: status,
        p_note: note.trim() || null,
      })
      if (error) throw error
      setRefreshTick(current => current + 1)
    } catch (error) {
      setDashboardError(error instanceof Error ? error.message : 'Unable to update payout request.')
    } finally {
      setPayoutActionId(null)
    }
  }

  const moderateEvent = async (event: (typeof eventRows)[number], status: 'draft' | 'published' | 'cancelled' | 'completed') => {
    if (event.status === status) return
    if (!window.confirm(`Change “${event.event}” from ${event.status} to ${status}?`)) return
    setEventActionId(event.id)
    setDashboardError('')
    try {
      const { error } = await supabase.rpc('admin_set_event_status', { p_event_id: event.id, p_status: status })
      if (error) throw error
      setRefreshTick(current => current + 1)
    } catch (error) {
      setDashboardError(error instanceof Error ? error.message : 'Unable to update event status.')
    } finally {
      setEventActionId(null)
    }
  }

  const saveAdminEvent = async () => {
    if (!eventEditor) return
    const capacity = Number(eventEditor.capacity.replace(/,/g, ''))
    if (!eventEditor.organizerId) { setDashboardError('Choose an organizer for this event.'); return }
    if (!eventEditor.event.trim() || !eventEditor.venue.trim() || !eventEditor.date || !eventEditor.time) { setDashboardError('Title, date, start time, and venue are required.'); return }
    if (!Number.isInteger(capacity) || capacity < 1) { setDashboardError('Capacity must be a positive whole number.'); return }
    if (eventEditor.endTime && eventEditor.endTime <= eventEditor.time) { setDashboardError('End time must be later than the start time.'); return }

    setEventSaving(true)
    setDashboardError('')
    const args = {
      p_organizer_id: eventEditor.organizerId,
      p_title: eventEditor.event.trim(),
      p_description: eventEditor.description.trim() || null,
      p_category: eventEditor.category.trim() || 'Other',
      p_date: eventEditor.date,
      p_time: eventEditor.time,
      p_end_time: eventEditor.endTime || null,
      p_venue: eventEditor.venue.trim(),
      p_city: eventEditor.city.trim() || 'Bujumbura',
      p_capacity: capacity,
    }
    try {
      const result = eventEditor.id
        ? await supabase.rpc('admin_update_event_details', { p_event_id: eventEditor.id, ...args })
        : await supabase.rpc('admin_create_event', args)
      if (result.error) throw result.error
      setEventEditor(null)
      setRefreshTick(current => current + 1)
    } catch (error) {
      setDashboardError(error instanceof Error ? error.message : 'Unable to save event.')
    } finally {
      setEventSaving(false)
    }
  }

  const reviewRefund = async (request: AdminRefundRequest, status: 'approved' | 'rejected' | 'processed') => {
    const needsNote = status === 'rejected' || status === 'processed'
    const prompt = status === 'approved' ? 'Optional note for this refund decision' : status === 'rejected' ? 'Reason for rejecting this refund request' : 'Payment provider reference confirming the refund was sent'
    const note = window.prompt(prompt)
    if (note === null) return
    if (needsNote && !note.trim()) { setDashboardError(status === 'processed' ? 'A payment reference is required before marking a refund processed.' : 'A reason is required to reject a refund request.'); return }
    const action = status === 'processed' ? 'mark this refund as processed' : status === 'approved' ? 'approve this refund request' : 'reject this refund request'
    if (!window.confirm(`Are you sure you want to ${action} for ${request.profiles?.full_name || request.profiles?.email || 'this customer'}?`)) return
    setRefundActionId(request.id)
    setDashboardError('')
    try {
      const { error } = await supabase.rpc('admin_review_ticket_refund', {
        p_request_id: request.id,
        p_status: status,
        p_note: note.trim() || null,
      })
      if (error) throw error
      setRefreshTick(current => current + 1)
    } catch (error) {
      setDashboardError(error instanceof Error ? error.message : 'Unable to update refund request.')
    } finally {
      setRefundActionId(null)
    }
  }

  const reviewOrganizerVerification = async (request: VerificationRequest, decision: 'approved' | 'rejected') => {
    const isApproval = decision === 'approved'
    if (!window.confirm(`${isApproval ? 'Approve' : 'Decline'} verification for ${request.name}?`)) return

    const note = window.prompt(
      isApproval ? 'Optional note for the organizer' : 'Reason for declining this verification request',
      isApproval ? '' : 'Please update your organizer profile and submit a new request.',
    )
    if (note === null) return

    setVerificationActionId(request.id)
    setDashboardError('')
    setVerificationNotice('')
    const { error } = await supabase.rpc('review_organizer_verification', {
      p_organizer_id: request.id,
      p_decision: decision,
      p_note: note,
    })
    setVerificationActionId(null)
    if (error) {
      setDashboardError(error.message)
      return
    }
    setVerificationNotice(`${request.name} has been ${isApproval ? 'verified' : 'declined'}.`)
    setRefreshTick(current => current + 1)
  }

  const toComparableNumber = (value: string) => Number.parseFloat(value.replace(/[^0-9.]/g, '')) || 0

  const sortRows = <T,>(rows: T[], primary: ((item: T) => number | string), secondary?: (item: T) => number | string) => {
    const sorted = [...rows].sort((a, b) => {
      const left = primary(a)
      const right = primary(b)
      const base = typeof left === 'number' && typeof right === 'number'
        ? left - right
        : String(left).localeCompare(String(right))

      if (base !== 0) return base
      if (!secondary) return 0
      const nextLeft = secondary(a)
      const nextRight = secondary(b)
      return typeof nextLeft === 'number' && typeof nextRight === 'number'
        ? nextLeft - nextRight
        : String(nextLeft).localeCompare(String(nextRight))
    })

    return sortMode === 'recent' ? sorted : sortMode === 'name' ? sorted.sort((a, b) => String(primary(a)).localeCompare(String(primary(b)))) : sorted.reverse()
  }

  const exportCurrentSection = () => {
    const rows = (() => {
      switch (section) {
        case 'users':
          return userRows.filter(row => `${row.name} ${row.status}`.toLowerCase().includes(searchTerm.toLowerCase())).map(row => [row.name, row.status, row.ticketsBought, row.joined])
        case 'organizers':
          return organizerRows.filter(row => `${row.name} ${row.verification}`.toLowerCase().includes(searchTerm.toLowerCase())).map(row => [row.name, row.events, row.revenue, row.verification])
        case 'events':
          return eventRows.filter(row => `${row.event} ${row.organizer}`.toLowerCase().includes(searchTerm.toLowerCase())).map(row => [row.id, row.event, row.organizer, row.capacity, row.status])
        case 'tickets':
          return ticketRows.filter(row => `${row.event} ${row.tier} ${row.utilization}`.toLowerCase().includes(searchTerm.toLowerCase())).map(row => [row.event, row.tier, row.sold, row.available, row.capacity, row.price, row.utilization])
        case 'orders':
          return orderRows.filter(row => `${row.id} ${row.customer} ${row.event} ${row.status} ${row.method}`.toLowerCase().includes(searchTerm.toLowerCase())).map(row => [row.id, row.customer, row.event, row.tickets, row.method, row.total, row.status, row.createdAt])
        case 'payments':
          return paymentRows.filter(row => `${row.reference} ${row.customer} ${row.event} ${row.status} ${row.method}`.toLowerCase().includes(searchTerm.toLowerCase())).map(row => [row.reference, row.customer, row.event, row.method, row.amount, row.platformFee, row.organizerProceeds, row.status, row.createdAt])
        case 'payouts':
          return payoutRows.filter(row => `${row.organizer} ${row.method} ${row.destination} ${row.status}`.toLowerCase().includes(searchTerm.toLowerCase())).map(row => [row.organizer, row.expected, row.method, row.destination, row.status, row.window])
        case 'agents':
          return agentRows.filter(row => `${row.agent} ${row.sales}`.toLowerCase().includes(searchTerm.toLowerCase())).map(row => [row.agent, row.sales, row.revenue, row.commission])
        case 'refunds':
          return refundRows.filter(row => `${row.profiles?.full_name ?? ''} ${row.profiles?.email ?? ''} ${row.events?.title ?? ''} ${row.status} ${row.reason}`.toLowerCase().includes(searchTerm.toLowerCase())).map(row => [row.id, row.profiles?.full_name ?? row.profiles?.email ?? 'Customer', row.events?.title ?? 'Event', row.order_id, row.ticket_id ?? '', row.amount ?? '', row.status, row.reason, row.organizer_note ?? '', row.created_at, row.reviewed_at ?? ''])
        case 'reports': {
          const report = reportDatasets[reportDatasetKey]
          return report.rows.filter(row => !searchTerm.trim() || row.join(' ').toLowerCase().includes(searchTerm.trim().toLowerCase())).sort((left, right) => {
            const comparison = String(left[reportSortColumn] ?? '').localeCompare(String(right[reportSortColumn] ?? ''), undefined, { numeric: true, sensitivity: 'base' })
            return reportSortDirection === 'asc' ? comparison : -comparison
          })
        }
        default:
          return []
      }
    })()

    if (!rows.length) return

    const columns = (() => {
      switch (section) {
        case 'users': return ['Name', 'Status', 'Tickets bought', 'Joined']
        case 'organizers': return ['Name', 'Events', 'Revenue', 'Verification']
        case 'events': return ['Event ID', 'Event', 'Organizer', 'Capacity', 'Status']
        case 'tickets': return ['Event', 'Tier', 'Sold', 'Available', 'Capacity', 'Price (BIF)', 'Utilization']
        case 'orders': return ['Order ID', 'Customer', 'Event', 'Tickets', 'Method', 'Amount (BIF)', 'Status', 'Created']
        case 'payments': return ['Reference', 'Customer', 'Event', 'Method', 'Customer paid (BIF)', 'Platform fee (BIF)', 'Organizer proceeds (BIF)', 'Status', 'Created']
        case 'payouts': return ['Organizer', 'Amount', 'Method', 'Destination', 'Status', 'Requested']
        case 'agents': return ['Agent', 'Sales', 'Revenue', 'Commission']
        case 'refunds': return ['Request ID', 'Customer', 'Event', 'Order ID', 'Ticket ID', 'Amount (BIF)', 'Status', 'Reason', 'Note', 'Created', 'Reviewed']
        case 'reports': return reportDatasets[reportDatasetKey].columns
        default: return []
      }
    })()

    const csv = [columns, ...rows].map(row => row.map(cell => {
      const value = String(cell)
      const safeValue = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
      return `"${safeValue.replace(/"/g, '""')}"`
    }).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${section === 'reports' ? reportDatasetKey : section}-report-${section === 'reports' && reportDatasets[reportDatasetKey].snapshot ? 'snapshot' : dateRange}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const overviewRevenueTotal = weekTrend.reduce((sum, value) => sum + value, 0)
  const overviewRevenueMax = Math.max(...weekTrend, 1)
  const overviewHealthSummary = platformStats.grossTicketValue > 0
    ? `Organizer net revenue is ${formatMoneyShort(platformStats.grossTicketValue)} after platform fees, processed refunds, and agent commissions. Platform fees total ${formatMoneyShort(platformStats.platformRevenue)}.`
    : 'Platform has no confirmed ticket sales yet. Live sales metrics will appear here once orders are created.'
  const overviewHealthTone = platformStats.grossTicketValue > 0 ? { background: 'rgba(34,197,94,0.12)', color: '#8ae6a3' } : { background: 'rgba(251,191,36,0.12)', color: '#f9d97d' }

  const renderOverview = () => (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {kpis.map(item => (
          <StatCard key={item.label} label={item.label} value={item.value} delta={item.delta} icon={item.icon} accent={item.accent} />
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.5fr_0.95fr]">
        <div className="rounded-2xl border p-5" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--muted-foreground)' }}>Sales overview</p>
              <h3 className="mt-1 text-xl font-black" style={{ fontFamily: 'Outfit, sans-serif' }}>Platform service fees</h3>
            </div>
            <div className="flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
              <TrendingUpIcon size={12} /> Current week
            </div>
          </div>
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <p className="text-2xl font-black" style={{ fontFamily: 'Outfit, sans-serif', color: 'var(--foreground)' }}>{formatMoneyShort(overviewRevenueTotal)}</p>
              <p className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>Monday–Sunday · Service fees · Updated {lastUpdated?.toLocaleTimeString() ?? 'loading'}</p>
            </div>
            <span className="rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.14em]" style={{ borderColor: 'var(--border)', color: 'var(--primary)' }}>Live data</span>
          </div>
          <div className="flex h-52 items-end gap-3">
            {weekTrend.map((value, index) => (
              <div key={index} className="flex flex-1 flex-col items-center justify-end gap-2">
                <div
                  className="w-full rounded-t-2xl"
                  style={{
                    height: `${value > 0 ? Math.max((value / overviewRevenueMax) * 180, 8) : 4}px`,
                      background: index === (new Date().getDay() + 6) % 7 ? 'linear-gradient(180deg, var(--primary), #ffd59c)' : 'linear-gradient(180deg, rgba(255,255,255,0.2), rgba(255,255,255,0.08))',
                    minHeight: '4px',
                      boxShadow: index === (new Date().getDay() + 6) % 7 ? '0 10px 25px rgba(255, 187, 104, 0.22)' : 'none',
                  }}
                />
                <span className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][index]}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border p-5" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--muted-foreground)' }}>Top performers</p>
              <h3 className="mt-1 text-xl font-black" style={{ fontFamily: 'Outfit, sans-serif' }}>Top organizers</h3>
            </div>
            <ShieldIcon size={18} style={{ color: 'var(--primary)' }} />
          </div>
          <div className="space-y-3">
            {topOrganizers.map((organizer, index) => {
              const fill = Number.parseInt(organizer.share, 10) || 0
              return (
                <div key={organizer.name} className="rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-black" style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--primary)' }}>{index + 1}</span>
                      <div>
                        <p className="text-sm font-bold">{organizer.name}</p>
                        <p className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>{organizer.share} of top revenue</p>
                      </div>
                    </div>
                    <p className="text-sm font-bold" style={{ color: 'var(--primary)' }}>{organizer.sales}</p>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.min(fill, 100)}%`, background: 'linear-gradient(90deg, var(--primary), #ffd59c)' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <TableCard
          title="Recent payouts"
          subtitle="Operations"
          columns={['Organizer', 'Amount', 'Status', 'Method']}
          rows={recentPayouts.length ? recentPayouts.map(item => [item.organizer, item.amount, <StatusBadge label={item.status} />, item.method]) : [['No payout data yet', 'BIF 0', <StatusBadge label="pending" />, '—']]}
        />

        <TableCard
          title="Recent orders"
          subtitle="Transactions"
          columns={['Customer', 'Event', 'Value', 'Status']}
          rows={recentOrders.length ? recentOrders.map(item => [item.customer, item.event, item.value, <StatusBadge label={item.status} />]) : [['No recent orders', '—', 'BIF 0', <StatusBadge label="pending" />]]}
        />
      </div>
    </div>
  )

  const renderSimpleList = (title: string, rows: Array<{ label: string; value: string; tone?: string }>, subtitle: string) => (
    <div className="rounded-2xl border p-5" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--muted-foreground)' }}>{subtitle}</p>
          <h3 className="mt-1 text-xl font-black" style={{ fontFamily: 'Outfit, sans-serif' }}>{title}</h3>
        </div>
        <div className="rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.14em]" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
          Live
        </div>
      </div>
      <div className="space-y-3">
        {rows.map(row => (
          <div key={row.label} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <span className="text-sm font-medium" style={{ color: 'var(--muted-foreground)' }}>{row.label}</span>
            <span className="rounded-full border px-2 py-1 text-xs font-bold" style={{ color: row.tone ?? 'var(--foreground)', borderColor: row.tone ? 'transparent' : 'var(--border)', background: row.tone ? `${row.tone}18` : 'rgba(255,255,255,0.04)' }}>{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  )

  const pageContent = () => {
    const normalizedSearch = searchTerm.trim().toLowerCase()

    const applySearchAndSort = <T extends Record<string, string | number>>(rows: T[], keyName: keyof T, valueKey?: keyof T) => {
      const filtered = rows.filter(row => {
        const haystack = Object.values(row).join(' ').toLowerCase()
        return !normalizedSearch || haystack.includes(normalizedSearch)
      })

      const directionFactor = sortDirection === 'asc' ? 1 : -1

      if (sortMode === 'name') {
        return filtered.sort((a, b) => directionFactor * String(a[keyName]).localeCompare(String(b[keyName])))
      }

      if (sortMode === 'value') {
        return filtered.sort((a, b) => {
          const left = valueKey ? Number(String(a[valueKey]).replace(/[^\d.-]/g, '')) || 0 : Number(String(a[keyName]).replace(/[^\d.-]/g, '')) || 0
          const right = valueKey ? Number(String(b[valueKey]).replace(/[^\d.-]/g, '')) || 0 : Number(String(b[keyName]).replace(/[^\d.-]/g, '')) || 0
          return directionFactor * (left - right)
        })
      }

      return filtered
    }

    const usersTable = applySearchAndSort(userRows.map(row => ({ ...row, nameValue: row.name, valueKey: row.ticketsBought })), 'nameValue', 'valueKey').map(row => [row.name, <StatusBadge label={row.status} />, row.ticketsBought, row.joined])
    const organizersTable = applySearchAndSort(organizerRows.map(row => ({ ...row, nameValue: row.name, valueKey: toComparableNumber(row.revenue) })), 'nameValue', 'valueKey').map(row => [row.name, row.events, row.revenue, <StatusBadge label={row.verification} />])
    const eventsTable = applySearchAndSort(eventRows.map(row => ({ ...row, nameValue: row.event, valueKey: row.capacity.replace(/,/g, '') })), 'nameValue', 'valueKey').map(row => [
      row.event,
      row.organizer,
      row.capacity,
      <StatusBadge label={row.status} />,
      <select aria-label={`Moderate ${row.event}`} value={row.status} disabled={eventActionId === row.id} onChange={event => void moderateEvent(row, event.target.value as 'draft' | 'published' | 'cancelled' | 'completed')} className="rounded-lg border px-2 py-1.5 text-xs disabled:opacity-50" style={{ background: 'var(--muted)', borderColor: 'var(--border)', color: 'var(--foreground)' }}>
        {(['draft', 'published', 'cancelled', 'completed'] as const).map(status => <option key={status} value={status}>{status}</option>)}
      </select>,
      <div className="flex gap-2"><button type="button" onClick={() => setEventEditor({ id: row.id, event: row.event, organizerId: row.organizerId, capacity: row.capacity.replace(/,/g, ''), category: row.category, city: row.city, date: row.date, time: row.time, endTime: row.endTime, venue: row.venue, description: row.description })} className="rounded-lg px-2.5 py-1.5 text-[10px] font-bold" style={{ background: 'rgba(255,255,255,.08)', color: 'var(--foreground)' }}>Edit</button><button type="button" disabled={row.status === 'cancelled' || eventActionId === row.id} onClick={() => void moderateEvent(row, 'cancelled')} className="rounded-lg px-2.5 py-1.5 text-[10px] font-bold disabled:opacity-50" style={{ background: 'rgba(239,68,68,.1)', color: '#fca5a5' }}>Archive</button></div>,
    ])
    const ticketsTable = applySearchAndSort(ticketRows.map(row => ({ ...row, nameValue: row.event, valueKey: Number(row.sold.replace(/,/g, '')) })), 'nameValue', 'valueKey').map(row => [row.event, row.sold, row.available, row.utilization])
    const orderTable = applySearchAndSort(orderRows.map(row => ({ ...row, nameValue: row.customer, valueKey: row.total })), 'nameValue', 'valueKey').map(row => [row.id, row.customer, row.event, row.tickets, row.method, formatMoneyShort(row.total), <StatusBadge label={row.status} />, row.created])
    const paymentTable = applySearchAndSort(paymentRows.map(row => ({ ...row, nameValue: row.reference, valueKey: toComparableNumber(row.amount) })), 'nameValue', 'valueKey').map(row => [row.reference, row.customer, row.event, row.method, row.amount, row.platformFee, row.organizerProceeds, <StatusBadge label={row.status} />, row.created])
    const visiblePayoutRows = applySearchAndSort(payoutRows.map(row => ({ ...row, note: row.note ?? '', nameValue: row.organizer, valueKey: toComparableNumber(row.expected) })), 'nameValue', 'valueKey')
    const agentTable = applySearchAndSort(agentRows.map(row => ({ ...row, nameValue: row.agent, valueKey: toComparableNumber(row.revenue) })), 'nameValue', 'valueKey').map(row => [row.agent, row.sales, row.revenue, row.commission])

    switch (section) {
      case 'users':
        return (
          <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-1 items-center gap-2 rounded-xl border px-3 py-2" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'var(--border)' }}>
                  <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Search</span>
                  <input value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="Filter users" className="w-full bg-transparent text-sm outline-none" style={{ color: 'var(--foreground)' }} />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--muted-foreground)' }}>Date</label>
                  <select value={dateRange} onChange={event => setDateRange(event.target.value as '7d' | '30d' | '90d' | 'all')} className="rounded-lg border px-2 py-2 text-xs" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'var(--border)', color: 'var(--foreground)' }}>
                    <option value="7d">7d</option>
                    <option value="30d">30d</option>
                    <option value="90d">90d</option>
                    <option value="all">All</option>
                  </select>
                  <label className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--muted-foreground)' }}>Sort</label>
                  <select value={sortMode} onChange={event => setSortMode(event.target.value as 'recent' | 'name' | 'value')} className="rounded-lg border px-2 py-2 text-xs" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'var(--border)', color: 'var(--foreground)' }}>
                    <option value="recent">Recent</option>
                    <option value="name">A–Z</option>
                    <option value="value">Highest value</option>
                  </select>
                  <button onClick={() => setSortDirection(current => current === 'asc' ? 'desc' : 'asc')} className="rounded-lg border px-2 py-2 text-[10px] font-bold uppercase" style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>
                    {sortDirection === 'asc' ? 'Asc' : 'Desc'}
                  </button>
                </div>
              </div>
              <TableCard title="Users" subtitle="Platform account overview" columns={['Name', 'Status', 'Tickets bought', 'Joined']} rows={usersTable.length ? usersTable : [['No matching users', '—', '0', '—']]} />
            </div>
            {renderSimpleList('User health', [
              { label: 'New signups today', value: healthMetrics.users.signupsToday.toLocaleString() },
              { label: 'Repeat buyers', value: healthMetrics.users.repeatBuyers.toLocaleString() },
              { label: 'Admin accounts', value: healthMetrics.users.adminAccounts.toLocaleString() },
            ], 'Retention')}
          </div>
        )
      case 'organizers':
        return (
          <div className="space-y-5">
            {verificationNotice ? <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{verificationNotice}</div> : null}
            <section className="rounded-2xl border p-5" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--muted-foreground)' }}>Quality control</p>
                  <h3 className="mt-1 text-xl font-black" style={{ fontFamily: 'Outfit, sans-serif' }}>Verification requests</h3>
                  <p className="mt-1 text-xs" style={{ color: 'var(--muted-foreground)' }}>Review the organizer’s public contact details before making a decision.</p>
                </div>
                <span className="rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ borderColor: 'var(--border)', color: verificationRequests.length ? '#f9d97d' : '#86efac' }}>{verificationRequests.length} awaiting review</span>
              </div>
              {verificationRequests.length ? <div className="mt-5 space-y-3">{verificationRequests.map(request => {
                const contact = [request.city, request.phone, request.website].filter(Boolean).join(' · ')
                const isReviewing = verificationActionId === request.id
                return <div key={request.id} className="flex flex-col gap-4 rounded-xl border p-4 lg:flex-row lg:items-center lg:justify-between" style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,0.025)' }}>
                  <div className="min-w-0">
                    <p className="font-bold">{request.name}</p>
                    <p className="mt-1 text-xs" style={{ color: 'var(--muted-foreground)' }}>{contact || 'No public contact details added'}</p>
                    <p className="mt-1 text-[11px]" style={{ color: 'var(--muted-foreground)' }}>Requested {request.requestedAt ? new Date(request.requestedAt).toLocaleString() : 'recently'}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2"><button type="button" disabled={isReviewing} onClick={() => void reviewOrganizerVerification(request, 'approved')} className="rounded-xl px-3 py-2 text-xs font-bold disabled:opacity-50" style={{ background: 'rgba(34,197,94,0.16)', color: '#86efac' }}>{isReviewing ? 'Saving…' : 'Approve'}</button><button type="button" disabled={isReviewing} onClick={() => void reviewOrganizerVerification(request, 'rejected')} className="rounded-xl px-3 py-2 text-xs font-bold disabled:opacity-50" style={{ background: 'rgba(239,68,68,0.14)', color: '#fca5a5' }}>Decline</button></div>
                </div>
              })}</div> : <p className="mt-5 rounded-xl px-3 py-4 text-sm" style={{ background: 'rgba(255,255,255,0.03)', color: 'var(--muted-foreground)' }}>No organizer verification requests are waiting for review.</p>}
            </section>

            <div className="grid gap-5 xl:grid-cols-[1.4fr_0.6fr]">
              <div className="space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-1 items-center gap-2 rounded-xl border px-3 py-2" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'var(--border)' }}>
                  <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Search</span>
                  <input value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="Filter organizers" className="w-full bg-transparent text-sm outline-none" style={{ color: 'var(--foreground)' }} />
                </div>
                <div className="flex items-center gap-2">
                  <select value={dateRange} onChange={event => setDateRange(event.target.value as '7d' | '30d' | '90d' | 'all')} className="rounded-lg border px-2 py-2 text-xs" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'var(--border)', color: 'var(--foreground)' }}>
                    <option value="7d">7d</option>
                    <option value="30d">30d</option>
                    <option value="90d">90d</option>
                    <option value="all">All</option>
                  </select>
                  <button onClick={() => setSortDirection(current => current === 'asc' ? 'desc' : 'asc')} className="rounded-lg border px-2 py-2 text-[10px] font-bold uppercase" style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>{sortDirection === 'asc' ? 'Asc' : 'Desc'}</button>
                  <button onClick={exportCurrentSection} className="rounded-xl px-3 py-2 text-[10px] font-bold uppercase tracking-wide" style={{ background: 'var(--primary)', color: '#000' }}>Export CSV</button>
                </div>
              </div>
              <TableCard title="Organizers" subtitle="Account activity" columns={['Name', 'Events', 'Revenue', 'Verification']} rows={organizersTable.length ? organizersTable : [['No matching organizers', '0', 'BIF 0', 'Pending']]} />
            </div>
              {renderSimpleList('Verification queue', [
                { label: 'Awaiting verification', value: healthMetrics.organizers.awaitingVerification.toLocaleString() },
                { label: 'Verified', value: healthMetrics.organizers.verified.toLocaleString() },
                { label: 'Unverified', value: healthMetrics.organizers.unverified.toLocaleString() },
              ], 'Quality control')}
            </div>
          </div>
        )
      case 'events':
        return (
          <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(16rem,.6fr)]">
            <div className="space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-1 items-center gap-2 rounded-xl border px-3 py-2" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'var(--border)' }}>
                  <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Search</span>
                  <input value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="Filter events" className="w-full bg-transparent text-sm outline-none" style={{ color: 'var(--foreground)' }} />
                </div>
                <div className="flex items-center gap-2">
                  <select value={dateRange} onChange={event => setDateRange(event.target.value as '7d' | '30d' | '90d' | 'all')} className="rounded-lg border px-2 py-2 text-xs" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'var(--border)', color: 'var(--foreground)' }}>
                    <option value="7d">7d</option>
                    <option value="30d">30d</option>
                    <option value="90d">90d</option>
                    <option value="all">All</option>
                  </select>
                  <button onClick={() => setSortDirection(current => current === 'asc' ? 'desc' : 'asc')} className="rounded-lg border px-2 py-2 text-[10px] font-bold uppercase" style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>{sortDirection === 'asc' ? 'Asc' : 'Desc'}</button>
                  <button onClick={exportCurrentSection} className="rounded-xl px-3 py-2 text-[10px] font-bold uppercase tracking-wide" style={{ background: 'var(--primary)', color: '#000' }}>Export CSV</button>
                  <button type="button" onClick={() => setEventEditor({ event: '', organizerId: organizerOptions[0]?.id ?? '', capacity: '100', category: 'Other', city: 'Bujumbura', date: '', time: '18:00', endTime: '', venue: '', description: '' })} disabled={!organizerOptions.length} className="rounded-xl px-3 py-2 text-[10px] font-bold uppercase tracking-wide disabled:opacity-50" style={{ background: 'var(--primary)', color: '#000' }}>+ New event</button>
                </div>
              </div>
              <TableCard title={`Events · ${eventsTable.length.toLocaleString()} shown`} subtitle="Inventory, editing and lifecycle moderation · archive preserves historical orders" columns={['Event', 'Organizer', 'Capacity', 'Status', 'Moderate', 'Actions']} rows={eventsTable.length ? eventsTable : [['No matching events', '—', '0', '—', '—', '—']]} />
            </div>
            {renderSimpleList('Compliance', [
              { label: 'Published events', value: healthMetrics.events.published.toLocaleString() },
              { label: 'Draft events', value: healthMetrics.events.drafts.toLocaleString() },
              { label: 'Listed capacity', value: healthMetrics.events.totalCapacity.toLocaleString() },
            ], 'Status')}
            {eventEditor && <div className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-black/75 p-4"><section role="dialog" aria-modal="true" aria-labelledby="admin-event-editor-title" className="my-auto w-full max-w-2xl rounded-2xl border p-5 shadow-2xl sm:p-6" style={{ background: '#171918', borderColor: 'var(--border)' }}>
              <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[.18em]" style={{ color: 'var(--primary)' }}>Event management</p><h2 id="admin-event-editor-title" className="mt-1 text-xl font-black" style={{ fontFamily: 'Outfit, sans-serif' }}>{eventEditor.id ? 'Edit event details' : 'Create event draft'}</h2></div><button type="button" onClick={() => setEventEditor(null)} className="rounded-lg px-2 py-1 text-lg" aria-label="Close event editor">×</button></div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold sm:col-span-2" style={{ color: 'var(--muted-foreground)' }}>Organizer<select value={eventEditor.organizerId} onChange={event => setEventEditor(current => current ? { ...current, organizerId: event.target.value } : current)} className="mt-1.5 w-full rounded-xl border px-3 py-2.5 text-sm" style={{ background: 'var(--muted)', borderColor: 'var(--border)', color: 'var(--foreground)' }}>{organizerOptions.map(organizer => <option key={organizer.id} value={organizer.id}>{organizer.name}</option>)}</select></label>
                <label className="text-xs font-semibold sm:col-span-2" style={{ color: 'var(--muted-foreground)' }}>Event title<input value={eventEditor.event} onChange={event => setEventEditor(current => current ? { ...current, event: event.target.value } : current)} className="mt-1.5 w-full rounded-xl border px-3 py-2.5 text-sm" style={{ background: 'var(--muted)', borderColor: 'var(--border)', color: 'var(--foreground)' }} /></label>
                <label className="text-xs font-semibold" style={{ color: 'var(--muted-foreground)' }}>Category<input value={eventEditor.category} onChange={event => setEventEditor(current => current ? { ...current, category: event.target.value } : current)} className="mt-1.5 w-full rounded-xl border px-3 py-2.5 text-sm" style={{ background: 'var(--muted)', borderColor: 'var(--border)', color: 'var(--foreground)' }} /></label>
                <label className="text-xs font-semibold" style={{ color: 'var(--muted-foreground)' }}>City<input value={eventEditor.city} onChange={event => setEventEditor(current => current ? { ...current, city: event.target.value } : current)} className="mt-1.5 w-full rounded-xl border px-3 py-2.5 text-sm" style={{ background: 'var(--muted)', borderColor: 'var(--border)', color: 'var(--foreground)' }} /></label>
                <label className="text-xs font-semibold" style={{ color: 'var(--muted-foreground)' }}>Date<input type="date" value={eventEditor.date} onChange={event => setEventEditor(current => current ? { ...current, date: event.target.value } : current)} className="mt-1.5 w-full rounded-xl border px-3 py-2.5 text-sm" style={{ background: 'var(--muted)', borderColor: 'var(--border)', color: 'var(--foreground)' }} /></label>
                <div className="grid grid-cols-2 gap-2"><label className="text-xs font-semibold" style={{ color: 'var(--muted-foreground)' }}>Start<input type="time" value={eventEditor.time} onChange={event => setEventEditor(current => current ? { ...current, time: event.target.value } : current)} className="mt-1.5 w-full rounded-xl border px-3 py-2.5 text-sm" style={{ background: 'var(--muted)', borderColor: 'var(--border)', color: 'var(--foreground)' }} /></label><label className="text-xs font-semibold" style={{ color: 'var(--muted-foreground)' }}>End<input type="time" value={eventEditor.endTime} onChange={event => setEventEditor(current => current ? { ...current, endTime: event.target.value } : current)} className="mt-1.5 w-full rounded-xl border px-3 py-2.5 text-sm" style={{ background: 'var(--muted)', borderColor: 'var(--border)', color: 'var(--foreground)' }} /></label></div>
                <label className="text-xs font-semibold sm:col-span-2" style={{ color: 'var(--muted-foreground)' }}>Venue<input value={eventEditor.venue} onChange={event => setEventEditor(current => current ? { ...current, venue: event.target.value } : current)} className="mt-1.5 w-full rounded-xl border px-3 py-2.5 text-sm" style={{ background: 'var(--muted)', borderColor: 'var(--border)', color: 'var(--foreground)' }} /></label>
                <label className="text-xs font-semibold" style={{ color: 'var(--muted-foreground)' }}>Capacity<input type="number" min="1" step="1" value={eventEditor.capacity} onChange={event => setEventEditor(current => current ? { ...current, capacity: event.target.value } : current)} className="mt-1.5 w-full rounded-xl border px-3 py-2.5 text-sm" style={{ background: 'var(--muted)', borderColor: 'var(--border)', color: 'var(--foreground)' }} /></label>
                <label className="text-xs font-semibold sm:col-span-2" style={{ color: 'var(--muted-foreground)' }}>Description<textarea rows={3} value={eventEditor.description} onChange={event => setEventEditor(current => current ? { ...current, description: event.target.value } : current)} className="mt-1.5 w-full resize-y rounded-xl border px-3 py-2.5 text-sm" style={{ background: 'var(--muted)', borderColor: 'var(--border)', color: 'var(--foreground)' }} /></label>
              </div>
              <div className="mt-5 flex flex-col-reverse justify-end gap-2 sm:flex-row"><button type="button" onClick={() => setEventEditor(null)} className="rounded-xl px-4 py-2.5 text-sm font-bold" style={{ background: 'var(--muted)', color: 'var(--foreground)' }}>Cancel</button><button type="button" onClick={() => void saveAdminEvent()} disabled={eventSaving || !organizerOptions.length} className="rounded-xl px-4 py-2.5 text-sm font-bold disabled:opacity-50" style={{ background: 'var(--primary)', color: '#000' }}>{eventSaving ? 'Saving…' : eventEditor.id ? 'Save changes' : 'Create draft'}</button></div>
            </section></div>}
          </div>
        )
      case 'tickets':
        return (
          <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-1 items-center gap-2 rounded-xl border px-3 py-2" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'var(--border)' }}>
                  <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Search</span>
                  <input value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="Filter tickets" className="w-full bg-transparent text-sm outline-none" style={{ color: 'var(--foreground)' }} />
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setSortDirection(current => current === 'asc' ? 'desc' : 'asc')} className="rounded-lg border px-2 py-2 text-[10px] font-bold uppercase" style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>{sortDirection === 'asc' ? 'Asc' : 'Desc'}</button>
                  <button onClick={exportCurrentSection} className="rounded-xl px-3 py-2 text-[10px] font-bold uppercase tracking-wide" style={{ background: 'var(--primary)', color: '#000' }}>Export CSV</button>
                </div>
              </div>
              <TableCard title={`Ticket inventory · ${ticketsTable.length.toLocaleString()} tiers`} subtitle="Current inventory snapshot · date range does not apply" columns={['Event', 'Tier', 'Sold', 'Available', 'Capacity', 'Price (BIF)', 'Utilization']} rows={ticketsTable.length ? ticketsTable : [['No matching ticket rows', '—', '0', '0', '0', 'BIF 0', '0%']]} />
            </div>
            {renderSimpleList('Ticket health', [
              { label: 'Low inventory alerts', value: healthMetrics.tickets.lowInventory.toLocaleString(), tone: '#ffb976' },
              { label: 'Scans today', value: healthMetrics.tickets.scansToday.toLocaleString() },
              { label: 'Cancelled tickets', value: healthMetrics.tickets.cancelled.toLocaleString() },
            ], 'Operations')}
          </div>
        )
      case 'orders':
        {
        const orderCounts = orderRows.reduce((counts, order) => {
          counts[order.status] = (counts[order.status] ?? 0) + 1
          return counts
        }, {} as Record<string, number>)
        return (
          <div className="min-w-0 space-y-5">
            <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-4">
              {(['confirmed', 'pending', 'cancelled', 'refunded'] as const).map(status => <div key={status} className="min-w-0 rounded-2xl border p-4" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}><p className="truncate text-2xl font-black" style={{ color: status === 'confirmed' ? '#86efac' : status === 'pending' ? '#fcd34d' : status === 'refunded' ? '#93c5fd' : '#fca5a5' }}>{(orderCounts[status] ?? 0).toLocaleString()}</p><p className="mt-1 truncate text-[10px] font-bold uppercase tracking-[0.15em]" style={{ color: 'var(--muted-foreground)' }}>{status}</p></div>)}
            </div>
            <div className="min-w-0 space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-1 items-center gap-2 rounded-xl border px-3 py-2" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'var(--border)' }}>
                  <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Search</span>
                  <input value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="Filter orders" className="w-full bg-transparent text-sm outline-none" style={{ color: 'var(--foreground)' }} />
                </div>
                <div className="flex items-center gap-2">
                  <select value={dateRange} onChange={event => setDateRange(event.target.value as '7d' | '30d' | '90d' | 'all')} className="rounded-lg border px-2 py-2 text-xs" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'var(--border)', color: 'var(--foreground)' }}>
                    <option value="7d">7d</option>
                    <option value="30d">30d</option>
                    <option value="90d">90d</option>
                    <option value="all">All</option>
                  </select>
                  <button onClick={() => setSortDirection(current => current === 'asc' ? 'desc' : 'asc')} className="rounded-lg border px-2 py-2 text-[10px] font-bold uppercase" style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>{sortDirection === 'asc' ? 'Asc' : 'Desc'}</button>
                  <button onClick={exportCurrentSection} className="rounded-xl px-3 py-2 text-[10px] font-bold uppercase tracking-wide" style={{ background: 'var(--primary)', color: '#000' }}>Export CSV</button>
                </div>
              </div>
              <TableCard title={`Orders · ${orderTable.length.toLocaleString()} of ${orderRows.length.toLocaleString()}`} subtitle={`All orders created in the selected ${dateRange} range · generated from Supabase orders`} columns={['Order ID', 'Customer', 'Event', 'Tickets', 'Method', 'Amount (BIF)', 'Status', 'Created']} rows={orderTable.length ? orderTable : [['—', 'No matching orders', '—', 0, '—', 'BIF 0', '—', '—']]} />
            </div>
          </div>
        )
        }
      case 'refunds': {
        const filteredRefunds = refundRows.filter(request => {
          const searchHaystack = `${request.profiles?.full_name ?? ''} ${request.profiles?.email ?? ''} ${request.events?.title ?? ''} ${request.order_id} ${request.status} ${request.reason}`.toLowerCase()
          return !normalizedSearch || searchHaystack.includes(normalizedSearch)
        })
        const pendingRefunds = refundRows.filter(request => request.status === 'pending').length
        const approvedRefunds = refundRows.filter(request => request.status === 'approved').length
        const processedRefunds = refundRows.filter(request => request.status === 'processed').length
        return (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              {[['Awaiting review', pendingRefunds, '#fbbf24'], ['Awaiting payment', approvedRefunds, '#60a5fa'], ['Processed', processedRefunds, '#86efac']].map(([label, count, color]) => <div key={label} className="rounded-2xl border p-4" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}><p className="text-2xl font-black" style={{ color }}>{count}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--muted-foreground)' }}>{label}</p></div>)}
            </div>
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border p-3" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
              <input value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="Search customer, event, order, or reason" className="min-w-[16rem] flex-1 rounded-xl border px-3 py-2.5 text-sm outline-none" style={{ background: 'var(--muted)', borderColor: 'var(--border)', color: 'var(--foreground)' }} />
              <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{filteredRefunds.length} of {refundRows.length} requests</span>
            </div>
            {filteredRefunds.length === 0 ? <div className="rounded-2xl border p-12 text-center" style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>No refund requests match this search.</div> : <div className="space-y-3">{filteredRefunds.map(request => {
              const busy = refundActionId === request.id
              return <article key={request.id} className="rounded-2xl border p-5" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><h3 className="font-bold">{request.profiles?.full_name || request.profiles?.email || 'Customer'}</h3><StatusBadge label={request.status} /></div>
                    <p className="mt-1 text-xs" style={{ color: 'var(--muted-foreground)' }}>{request.events?.title || 'Event'} · {request.amount == null ? 'Amount unavailable' : formatMoneyShort(request.amount)} · requested {new Date(request.created_at).toLocaleString()}</p>
                    <p className="mt-3 text-sm leading-relaxed">{request.reason}</p>
                    <p className="mt-2 font-mono text-[10px]" style={{ color: 'var(--muted-foreground)' }}>Order {request.order_id.slice(0, 8)}…{request.ticket_id ? ` · Ticket ${request.ticket_id.slice(0, 8)}…` : ''}</p>
                    {request.organizer_note && <p className="mt-2 rounded-xl px-3 py-2 text-xs" style={{ background: 'rgba(255,255,255,.035)', color: 'var(--muted-foreground)' }}>Latest note: {request.organizer_note}</p>}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {request.status === 'pending' && <><button type="button" disabled={busy} onClick={() => void reviewRefund(request, 'approved')} className="rounded-xl px-3 py-2 text-xs font-bold disabled:opacity-50" style={{ background: 'rgba(34,197,94,.14)', color: '#86efac' }}>{busy ? 'Saving…' : 'Approve'}</button><button type="button" disabled={busy} onClick={() => void reviewRefund(request, 'rejected')} className="rounded-xl px-3 py-2 text-xs font-bold disabled:opacity-50" style={{ background: 'rgba(239,68,68,.14)', color: '#fca5a5' }}>Reject</button></>}
                    {request.status === 'approved' && <button type="button" disabled={busy} onClick={() => void reviewRefund(request, 'processed')} className="rounded-xl px-3 py-2 text-xs font-bold disabled:opacity-50" style={{ background: 'rgba(96,165,250,.14)', color: '#93c5fd' }}>{busy ? 'Saving…' : 'Mark refund paid'}</button>}
                    {['processed', 'rejected'].includes(request.status) && <span className="self-center text-xs" style={{ color: 'var(--muted-foreground)' }}>Finalized</span>}
                  </div>
                </div>
              </article>
            })}</div>}
          </div>
        )
      }
      case 'payments':
        return (
          <div className="min-w-0 space-y-5">
            <div className="grid min-w-0 grid-cols-2 gap-3 xl:grid-cols-4">
              {[
                { label: 'Payment records', value: paymentRows.length.toLocaleString(), detail: 'orders in selected date range', color: 'var(--foreground)' },
                { label: 'Confirmed received', value: formatMoneyShort(paymentRows.filter(row => row.status === 'confirmed').reduce((sum, row) => sum + toComparableNumber(row.amount), 0)), detail: `${paymentRows.filter(row => row.status === 'confirmed').length} orders`, color: '#86efac' },
                { label: 'Pending', value: formatMoneyShort(paymentRows.filter(row => row.status === 'pending').reduce((sum, row) => sum + toComparableNumber(row.amount), 0)), detail: `${paymentRows.filter(row => row.status === 'pending').length} orders`, color: '#fcd34d' },
                { label: 'Service fees', value: formatMoneyShort(paymentRows.filter(row => row.status === 'confirmed').reduce((sum, row) => sum + toComparableNumber(row.platformFee), 0)), detail: 'on confirmed orders', color: 'var(--primary)' },
              ].map(card => <div key={card.label} className="min-w-0 overflow-hidden rounded-2xl border p-3 sm:p-4" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}><p className="truncate text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--muted-foreground)' }}>{card.label}</p><p className="mt-2 break-words text-base font-black sm:text-xl" style={{ color: card.color, fontFamily: 'Outfit, sans-serif', overflowWrap: 'anywhere' }}>{card.value}</p><p className="mt-1 truncate text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{card.detail}</p></div>)}
            </div>
            <div className="min-w-0 space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-1 items-center gap-2 rounded-xl border px-3 py-2" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'var(--border)' }}>
                  <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Search</span>
                  <input value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="Filter payments" className="w-full bg-transparent text-sm outline-none" style={{ color: 'var(--foreground)' }} />
                </div>
                <div className="flex items-center gap-2">
                  <select value={dateRange} onChange={event => setDateRange(event.target.value as '7d' | '30d' | '90d' | 'all')} className="rounded-lg border px-2 py-2 text-xs" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'var(--border)', color: 'var(--foreground)' }}>
                    <option value="7d">7d</option>
                    <option value="30d">30d</option>
                    <option value="90d">90d</option>
                    <option value="all">All</option>
                  </select>
                  <button onClick={() => setSortDirection(current => current === 'asc' ? 'desc' : 'asc')} className="rounded-lg border px-2 py-2 text-[10px] font-bold uppercase" style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>{sortDirection === 'asc' ? 'Asc' : 'Desc'}</button>
                  <button onClick={exportCurrentSection} className="rounded-xl px-3 py-2 text-[10px] font-bold uppercase tracking-wide" style={{ background: 'var(--primary)', color: '#000' }}>Export CSV</button>
                </div>
              </div>
              <TableCard title={`Payments · ${paymentTable.length.toLocaleString()} of ${paymentRows.length.toLocaleString()}`} subtitle={`Real confirmed and pending orders · ${dateRange} date range`} columns={['Reference', 'Customer', 'Event', 'Method', 'Customer paid', 'Platform fee', 'Organizer proceeds', 'Status', 'Created']} rows={paymentTable.length ? paymentTable : [['—', 'No matching payments', '—', '—', 'BIF 0', 'BIF 0', 'BIF 0', '—', '—']]} />
            </div>
          </div>
        )
      case 'payouts':
        return (
          <div className="grid gap-5 xl:grid-cols-[1.3fr_0.7fr]">
            <div className="space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-1 items-center gap-2 rounded-xl border px-3 py-2" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'var(--border)' }}>
                  <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Search</span>
                  <input value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="Filter payouts" className="w-full bg-transparent text-sm outline-none" style={{ color: 'var(--foreground)' }} />
                </div>
                <div className="flex items-center gap-2">
                  <select value={dateRange} onChange={event => setDateRange(event.target.value as '7d' | '30d' | '90d' | 'all')} className="rounded-lg border px-2 py-2 text-xs" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'var(--border)', color: 'var(--foreground)' }}>
                    <option value="7d">7d</option>
                    <option value="30d">30d</option>
                    <option value="90d">90d</option>
                    <option value="all">All</option>
                  </select>
                  <button onClick={() => setSortDirection(current => current === 'asc' ? 'desc' : 'asc')} className="rounded-lg border px-2 py-2 text-[10px] font-bold uppercase" style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>{sortDirection === 'asc' ? 'Asc' : 'Desc'}</button>
                  <button onClick={exportCurrentSection} className="rounded-xl px-3 py-2 text-[10px] font-bold uppercase tracking-wide" style={{ background: 'var(--primary)', color: '#000' }}>Export CSV</button>
                </div>
              </div>
              <div className="rounded-2xl border" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                <div className="border-b px-5 py-4" style={{ borderColor: 'var(--border)' }}>
                  <h3 className="text-sm font-black" style={{ fontFamily: 'Outfit, sans-serif' }}>Withdrawal requests</h3>
                  <p className="mt-1 text-[10px] uppercase tracking-widest" style={{ color: 'var(--muted-foreground)' }}>Review the transfer, then mark it paid only after it has been sent.</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px] text-left text-sm">
                    <thead><tr style={{ background: 'rgba(255,255,255,0.02)' }}>{['Organizer', 'Amount', 'Destination', 'Status', 'Requested', 'Action'].map(column => <th key={column} className="px-5 py-3 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--muted-foreground)' }}>{column}</th>)}</tr></thead>
                    <tbody>
                      {visiblePayoutRows.length === 0 ? <tr><td colSpan={6} className="px-5 py-10 text-center text-xs" style={{ color: 'var(--muted-foreground)' }}>No matching withdrawal requests.</td></tr> : visiblePayoutRows.map(row => {
                        const actionInProgress = payoutActionId === row.id
                        const finalStatus = row.status === 'paid' || row.status === 'rejected' || row.status === 'cancelled'
                        return <tr key={row.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                          <td className="px-5 py-3 font-semibold">{row.organizer}</td>
                          <td className="px-5 py-3 font-bold">{row.expected}</td>
                          <td className="px-5 py-3"><p className="text-sm">{row.method}</p><p className="mt-0.5 max-w-[180px] truncate font-mono text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{row.destination}</p></td>
                          <td className="px-5 py-3"><StatusBadge label={row.status} />{row.note && <p className="mt-1 max-w-[160px] text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{row.note}</p>}</td>
                          <td className="px-5 py-3 text-xs" style={{ color: 'var(--muted-foreground)' }}>{row.window}</td>
                          <td className="px-5 py-3">{finalStatus ? <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Finalized</span> : <div className="flex flex-wrap gap-2">{row.status === 'requested' && <button type="button" disabled={actionInProgress} onClick={() => void reviewWithdrawal(row, 'processing')} className="rounded-lg px-2.5 py-1.5 text-[10px] font-bold" style={{ background: 'rgba(251,191,36,0.14)', color: '#fcd34d', opacity: actionInProgress ? 0.6 : 1 }}>Start processing</button>}<button type="button" disabled={actionInProgress} onClick={() => void reviewWithdrawal(row, 'paid')} className="rounded-lg px-2.5 py-1.5 text-[10px] font-bold" style={{ background: 'rgba(34,197,94,0.14)', color: '#86efac', opacity: actionInProgress ? 0.6 : 1 }}>{actionInProgress ? 'Saving…' : 'Mark paid'}</button><button type="button" disabled={actionInProgress} onClick={() => void reviewWithdrawal(row, 'rejected')} className="rounded-lg px-2.5 py-1.5 text-[10px] font-bold" style={{ background: 'rgba(239,68,68,0.14)', color: '#fca5a5', opacity: actionInProgress ? 0.6 : 1 }}>Reject</button></div>}</td>
                        </tr>
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            {renderSimpleList('Payout health', [
              { label: 'Paid in selected period', value: formatMoneyShort(healthMetrics.payouts.paidAmount) },
              { label: 'Queued', value: healthMetrics.payouts.queued.toLocaleString() },
              { label: 'Failed', value: healthMetrics.payouts.failed.toLocaleString() },
            ], 'Cash flow')}
          </div>
        )
      case 'agents':
        return (
          <div className="grid gap-5 xl:grid-cols-[1.4fr_0.6fr]">
            <div className="space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-1 items-center gap-2 rounded-xl border px-3 py-2" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'var(--border)' }}>
                  <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Search</span>
                  <input value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="Filter agents" className="w-full bg-transparent text-sm outline-none" style={{ color: 'var(--foreground)' }} />
                </div>
                <div className="flex items-center gap-2">
                  <select value={dateRange} onChange={event => setDateRange(event.target.value as '7d' | '30d' | '90d' | 'all')} className="rounded-lg border px-2 py-2 text-xs" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'var(--border)', color: 'var(--foreground)' }}>
                    <option value="7d">7d</option>
                    <option value="30d">30d</option>
                    <option value="90d">90d</option>
                    <option value="all">All</option>
                  </select>
                  <button onClick={() => setSortDirection(current => current === 'asc' ? 'desc' : 'asc')} className="rounded-lg border px-2 py-2 text-[10px] font-bold uppercase" style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>{sortDirection === 'asc' ? 'Asc' : 'Desc'}</button>
                  <button onClick={exportCurrentSection} className="rounded-xl px-3 py-2 text-[10px] font-bold uppercase tracking-wide" style={{ background: 'var(--primary)', color: '#000' }}>Export CSV</button>
                </div>
              </div>
              <TableCard title="Ticket agents" subtitle="Sales leaderboard" columns={['Agent', 'Sales', 'Revenue', 'Commission']} rows={agentTable.length ? agentTable : [['No matching agents', '0 tickets', 'BIF 0', 'BIF 0']]} />
            </div>
            {renderSimpleList('Agent performance', [
              { label: 'Top agent', value: healthMetrics.agents.topAgent },
              { label: 'Active agents', value: healthMetrics.agents.active.toLocaleString() },
              { label: 'Avg commission', value: `${healthMetrics.agents.averageCommissionRate.toFixed(1)}%` },
            ], 'Leaderboard')}
          </div>
        )
      case 'reports': {
        const report = reportDatasets[reportDatasetKey]
        const normalizedReportSearch = searchTerm.trim().toLowerCase()
        const filteredReportRows = report.rows.filter(row => !normalizedReportSearch || row.join(' ').toLowerCase().includes(normalizedReportSearch)).sort((left, right) => {
          const comparison = String(left[reportSortColumn] ?? '').localeCompare(String(right[reportSortColumn] ?? ''), undefined, { numeric: true, sensitivity: 'base' })
          return reportSortDirection === 'asc' ? comparison : -comparison
        })
        const maxMonthlyOrders = Math.max(...monthlyOrderCounts, 1)
        const maxMonthlyRevenue = Math.max(...monthlyRevenue, 1)
        const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        const ordersByStatus = orderRows.reduce((counts, order) => {
          counts[order.status] = (counts[order.status] ?? 0) + 1
          return counts
        }, {} as Record<string, number>)
        const maxStatusOrders = Math.max(...Object.values(ordersByStatus), 1)
        const orderStatuses = [
          { key: 'confirmed', label: 'Confirmed', color: '#22c55e' },
          { key: 'pending', label: 'Pending', color: '#f59e0b' },
          { key: 'cancelled', label: 'Cancelled', color: '#ef4444' },
          { key: 'refunded', label: 'Refunded', color: '#60a5fa' },
        ]
        return (
          <div className="min-w-0 space-y-5">
            <div className="grid min-w-0 gap-4 xl:grid-cols-3">
              {renderSimpleList('Revenue reports', reportCards.revenue, 'Finance')}
              {renderSimpleList('Operational reports', reportCards.operations, 'Operations')}
              {renderSimpleList('Engagement reports', reportCards.growth, 'Growth')}
            </div>
            <div className="grid min-w-0 gap-5 xl:grid-cols-2">
              <section className="min-w-0 overflow-hidden rounded-2xl border p-5" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-black" style={{ fontFamily: 'Outfit, sans-serif' }}>Confirmed orders by month</h3><p className="mt-1 text-xs" style={{ color: 'var(--muted-foreground)' }}>January–December {new Date().getFullYear()} · all loaded order records</p></div><ClipboardIcon size={17} style={{ color: 'var(--primary)' }} /></div>
                <div className="grid h-48 grid-cols-12 items-end gap-1.5 sm:gap-2">{monthlyOrderCounts.map((count, index) => <div key={monthLabels[index]} className="flex h-full min-w-0 flex-col items-center justify-end gap-2" title={`${monthLabels[index]}: ${count} confirmed orders`}><span className="text-[9px]" style={{ color: 'var(--muted-foreground)' }}>{count || ''}</span><div className="w-full rounded-t-md" style={{ height: `${count ? Math.max(5, count / maxMonthlyOrders * 130) : 3}px`, background: 'linear-gradient(180deg, var(--primary), rgba(249,112,21,.35))' }} /><span className="text-[9px]" style={{ color: 'var(--muted-foreground)' }}>{monthLabels[index]}</span></div>)}</div>
              </section>
              <section className="min-w-0 overflow-hidden rounded-2xl border p-5" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-black" style={{ fontFamily: 'Outfit, sans-serif' }}>Net ticket revenue by month</h3><p className="mt-1 text-xs" style={{ color: 'var(--muted-foreground)' }}>January–December {new Date().getFullYear()} · confirmed orders less fees/refunds/commission</p></div><TrendingUpIcon size={17} style={{ color: 'var(--primary)' }} /></div>
                <div className="grid h-48 grid-cols-12 items-end gap-1.5 sm:gap-2">{monthlyRevenue.map((amount, index) => <div key={monthLabels[index]} className="flex h-full min-w-0 flex-col items-center justify-end gap-2" title={`${monthLabels[index]}: ${formatMoneyShort(amount)}`}><span className="max-w-full truncate text-[8px]" style={{ color: 'var(--muted-foreground)' }}>{amount ? `${Math.round(amount / 1000)}k` : ''}</span><div className="w-full rounded-t-md" style={{ height: `${amount ? Math.max(5, amount / maxMonthlyRevenue * 130) : 3}px`, background: 'linear-gradient(180deg, #8bc4ff, rgba(139,196,255,.28))' }} /><span className="text-[9px]" style={{ color: 'var(--muted-foreground)' }}>{monthLabels[index]}</span></div>)}</div>
              </section>
            </div>
            <section className="min-w-0 rounded-2xl border p-5" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
              <div className="mb-5"><h3 className="font-black" style={{ fontFamily: 'Outfit, sans-serif' }}>Order status mix</h3><p className="mt-1 text-xs" style={{ color: 'var(--muted-foreground)' }}>{dateRange === 'all' ? 'All time' : `Last ${dateRange.replace('d', ' days')}`} · {orderRows.length.toLocaleString()} real orders</p></div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{orderStatuses.map(status => {
                const count = ordersByStatus[status.key] ?? 0
                return <div key={status.key} className="min-w-0 rounded-xl border p-3" style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,.025)' }}><div className="flex items-center justify-between gap-2"><span className="truncate text-xs font-semibold" style={{ color: 'var(--muted-foreground)' }}>{status.label}</span><strong className="text-sm" style={{ color: status.color }}>{count.toLocaleString()}</strong></div><div className="mt-3 h-2 overflow-hidden rounded-full" style={{ background: 'var(--muted)' }}><div className="h-full rounded-full" style={{ width: `${count ? Math.max(3, count / maxStatusOrders * 100) : 0}%`, background: status.color }} /></div></div>
              })}</div>
            </section>
            <section className="min-w-0 overflow-hidden rounded-2xl border" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
              <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5" style={{ borderColor: 'var(--border)' }}>
                <div className="min-w-0"><h3 className="font-black" style={{ fontFamily: 'Outfit, sans-serif' }}>{report.label} report</h3><p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--muted-foreground)' }}>{filteredReportRows.length.toLocaleString()} matching rows · {report.snapshot ? 'current inventory snapshot' : `${dateRange} selected range`} · data refreshed {lastUpdated?.toLocaleTimeString() ?? 'loading'}</p></div>
                <div className="flex min-w-0 flex-wrap gap-2">
                  <select aria-label="Report dataset" value={reportDatasetKey} onChange={event => { setReportDatasetKey(event.target.value as ReportDatasetKey); setReportSortColumn(0); setReportSortDirection('asc') }} className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-xs sm:flex-none" style={{ background: 'var(--muted)', borderColor: 'var(--border)', color: 'var(--foreground)' }}>{(Object.keys(reportDatasets) as ReportDatasetKey[]).map(key => <option key={key} value={key}>{reportDatasets[key].label}</option>)}</select>
                  <select aria-label="Report date range" value={dateRange} onChange={event => setDateRange(event.target.value as '7d' | '30d' | '90d' | 'all')} className="rounded-xl border px-3 py-2 text-xs" style={{ background: 'var(--muted)', borderColor: 'var(--border)', color: 'var(--foreground)' }}><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="90d">Last 90 days</option><option value="all">All time</option></select>
                  <button type="button" onClick={exportCurrentSection} disabled={!filteredReportRows.length} className="rounded-xl px-3 py-2 text-xs font-bold disabled:opacity-50" style={{ background: 'var(--primary)', color: '#000' }}>Export CSV</button>
                </div>
              </div>
              <div className="border-b p-3" style={{ borderColor: 'var(--border)' }}><input value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder={`Search ${report.label.toLowerCase()} report`} className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none" style={{ background: 'var(--muted)', borderColor: 'var(--border)', color: 'var(--foreground)' }} /></div>
                <div className="max-w-full overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead><tr style={{ background: 'rgba(255,255,255,.035)' }}>{report.columns.map((column, index) => <th key={column} className="whitespace-nowrap px-4 py-3 text-[10px] font-bold uppercase tracking-[.12em]" style={{ color: 'var(--muted-foreground)' }}><button type="button" onClick={() => { if (reportSortColumn === index) setReportSortDirection(direction => direction === 'asc' ? 'desc' : 'asc'); else { setReportSortColumn(index); setReportSortDirection('asc') } }} className="text-left">{column}{reportSortColumn === index ? (reportSortDirection === 'asc' ? ' ↑' : ' ↓') : ''}</button></th>)}</tr></thead><tbody>{filteredReportRows.map((row, rowIndex) => <tr key={`${reportDatasetKey}-${rowIndex}`} className="admin-table-row border-t" style={{ borderColor: 'var(--border)' }}>{row.map((cell, cellIndex) => { const column = report.columns[cellIndex] ?? ''; const display = typeof cell === 'number' && /BIF/.test(column) ? formatMoneyShort(cell) : String(cell); return <td key={cellIndex} className="max-w-[24rem] truncate px-4 py-3" title={display}>{/status|verification|^role$/i.test(column) && display !== '—' ? <StatusBadge label={display} /> : display}</td> })}</tr>)}{!filteredReportRows.length && <tr><td colSpan={Math.max(report.columns.length, 1)} className="px-5 py-12 text-center" style={{ color: 'var(--muted-foreground)' }}>No report rows match the selected range or search.</td></tr>}</tbody></table></div>
            </section>
          </div>
        )
      }
      case 'settings':
        return (
          <div className="mx-auto w-full max-w-5xl space-y-5">
            <div className="flex flex-col gap-4 rounded-2xl border p-5 sm:flex-row sm:items-start sm:justify-between" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--muted-foreground)' }}>Platform configuration</p>
                <h2 className="mt-1 text-xl font-black" style={{ fontFamily: 'Outfit, sans-serif' }}>Platform operations settings</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6" style={{ color: 'var(--muted-foreground)' }}>Manage public availability, checkout, event publishing, refunds, and check-in from one source of truth. The controls below are enforced by the app and database.</p>
              </div>
              <button type="button" onClick={() => void savePlatformSettings()} disabled={settingsLoading || settingsSaving} className="shrink-0 rounded-xl px-4 py-3 text-sm font-bold" style={{ background: 'var(--primary)', color: '#000', opacity: settingsLoading || settingsSaving ? 0.65 : 1 }}>
                {settingsSaving ? 'Saving…' : 'Save changes'}
              </button>
            </div>

            {settingsError && <div className="rounded-xl border px-4 py-3 text-sm" style={{ background: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.25)', color: '#fca5a5' }}>{settingsError}</div>}
            {settingsNotice && <div className="rounded-xl border px-4 py-3 text-sm" style={{ background: 'rgba(34,197,94,0.1)', borderColor: 'rgba(34,197,94,0.25)', color: '#86efac' }}>{settingsNotice}</div>}

            {settingsLoading ? (
              <div className="grid gap-5 lg:grid-cols-2">
                <div className="h-72 animate-pulse rounded-2xl border" style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'var(--border)' }} />
                <div className="h-72 animate-pulse rounded-2xl border" style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'var(--border)' }} />
              </div>
            ) : (
              <div className="grid gap-5 lg:grid-cols-2">
                <section className="rounded-2xl border p-5" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--muted-foreground)' }}>Brand and support</p>
                  <h3 className="mt-1 text-lg font-black" style={{ fontFamily: 'Outfit, sans-serif' }}>Public platform details</h3>
                  <div className="mt-5 space-y-4">
                    <label className="block text-sm font-semibold">Platform name<input value={platformSettings.platform_name} onChange={event => updatePlatformSetting('platform_name', event.target.value)} className="mt-1.5 w-full rounded-xl border px-3 py-2.5 text-sm outline-none" style={{ background: 'var(--muted)', borderColor: 'var(--border)', color: 'var(--foreground)' }} /></label>
                    <label className="block text-sm font-semibold">Support email<input type="email" value={platformSettings.support_email} onChange={event => updatePlatformSetting('support_email', event.target.value)} className="mt-1.5 w-full rounded-xl border px-3 py-2.5 text-sm outline-none" style={{ background: 'var(--muted)', borderColor: 'var(--border)', color: 'var(--foreground)' }} /></label>
                    <label className="block text-sm font-semibold">Support phone<input value={platformSettings.support_phone} onChange={event => updatePlatformSetting('support_phone', event.target.value)} className="mt-1.5 w-full rounded-xl border px-3 py-2.5 text-sm outline-none" style={{ background: 'var(--muted)', borderColor: 'var(--border)', color: 'var(--foreground)' }} /></label>
                    <label className="block text-sm font-semibold">Contact WhatsApp<input value={platformSettings.contact_whatsapp} onChange={event => updatePlatformSetting('contact_whatsapp', event.target.value)} className="mt-1.5 w-full rounded-xl border px-3 py-2.5 text-sm outline-none" style={{ background: 'var(--muted)', borderColor: 'var(--border)', color: 'var(--foreground)' }} /></label>
                    <label className="block text-sm font-semibold">Contact address<input value={platformSettings.contact_address} onChange={event => updatePlatformSetting('contact_address', event.target.value)} className="mt-1.5 w-full rounded-xl border px-3 py-2.5 text-sm outline-none" style={{ background: 'var(--muted)', borderColor: 'var(--border)', color: 'var(--foreground)' }} /></label>
                    <label className="block text-sm font-semibold">Checkout notice<span className="mt-1 block text-xs font-normal leading-5" style={{ color: 'var(--muted-foreground)' }}>Shown to customers when ticket sales are paused.</span><textarea value={platformSettings.checkout_notice} onChange={event => updatePlatformSetting('checkout_notice', event.target.value)} placeholder="Ticket sales are temporarily unavailable. Please check back soon." rows={3} className="mt-2 w-full resize-y rounded-xl border px-3 py-2.5 text-sm outline-none" style={{ background: 'var(--muted)', borderColor: 'var(--border)', color: 'var(--foreground)' }} /></label>
                  </div>
                </section>

                <section className="rounded-2xl border p-5" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--muted-foreground)' }}>Checkout controls</p>
                  <h3 className="mt-1 text-lg font-black" style={{ fontFamily: 'Outfit, sans-serif' }}>Sales and payment rules</h3>
                  <div className="mt-5 space-y-3">
                    <label className="block rounded-xl border p-4 text-sm font-bold" style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,0.025)' }}>Organizer service fee (%)<span className="mt-1 block text-xs font-normal leading-5" style={{ color: 'var(--muted-foreground)' }}>Deducted server-side from organizer proceeds on each new order. Customers pay the ticket price only.</span><input type="number" min="0" max="100" step="0.01" value={platformSettings.service_fee_percent} onChange={event => updatePlatformSetting('service_fee_percent', Number(event.target.value))} className="mt-3 w-full rounded-lg border px-3 py-2 text-sm outline-none" style={{ background: 'var(--muted)', borderColor: 'var(--border)', color: 'var(--foreground)' }} /></label>
                    <ToggleSetting label="Ticket sales" description="Allow customers to create new checkout orders." checked={platformSettings.ticket_sales_enabled} onChange={value => updatePlatformSetting('ticket_sales_enabled', value)} />
                    <ToggleSetting label="Mobile Money" description="Make Mobile Money available in checkout and test payment confirmation." checked={platformSettings.mobile_money_enabled} onChange={value => updatePlatformSetting('mobile_money_enabled', value)} />
                    <ToggleSetting label="Card payments" description="Make card payments available in checkout and test payment confirmation." checked={platformSettings.card_payments_enabled} onChange={value => updatePlatformSetting('card_payments_enabled', value)} />
                  </div>
                </section>

                <section className="rounded-2xl border p-5" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--muted-foreground)' }}>Availability</p>
                  <h3 className="mt-1 text-lg font-black" style={{ fontFamily: 'Outfit, sans-serif' }}>Public platform access</h3>
                  <div className="mt-5 space-y-3">
                    <ToggleSetting label="Maintenance mode" description="Show a maintenance screen to non-admin users while you carry out platform work." checked={platformSettings.maintenance_mode} onChange={value => updatePlatformSetting('maintenance_mode', value)} />
                    <label className="block rounded-xl border p-4 text-sm font-bold" style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,0.025)' }}>Maintenance message<span className="mt-1 block text-xs font-normal leading-5" style={{ color: 'var(--muted-foreground)' }}>Shown when maintenance mode is enabled. Leave blank to use the default message.</span><textarea value={platformSettings.maintenance_message} onChange={event => updatePlatformSetting('maintenance_message', event.target.value)} placeholder="We are making a few improvements. Please check back shortly." rows={3} className="mt-3 w-full resize-y rounded-lg border px-3 py-2 text-sm font-normal outline-none" style={{ background: 'var(--muted)', borderColor: 'var(--border)', color: 'var(--foreground)' }} /></label>
                    <ToggleSetting label="Marketplace visibility" description="Show published events in the public discovery catalog. Organizers keep access to their own events." checked={platformSettings.marketplace_enabled} onChange={value => updatePlatformSetting('marketplace_enabled', value)} />
                  </div>
                </section>

                <section className="rounded-2xl border p-5 lg:col-span-2" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--muted-foreground)' }}>Social media</p>
                  <h3 className="mt-1 text-lg font-black" style={{ fontFamily: 'Outfit, sans-serif' }}>Public social links</h3>
                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    {[
                      { key: 'social_instagram', label: 'Instagram', url: platformSettings.social_instagram_url, active: platformSettings.social_instagram_active },
                      { key: 'social_facebook', label: 'Facebook', url: platformSettings.social_facebook_url, active: platformSettings.social_facebook_active },
                      { key: 'social_x', label: 'X / Twitter', url: platformSettings.social_x_url, active: platformSettings.social_x_active },
                      { key: 'social_tiktok', label: 'TikTok', url: platformSettings.social_tiktok_url, active: platformSettings.social_tiktok_active },
                    ].map(item => (
                      <div key={item.key} className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,0.025)' }}>
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <span className="text-sm font-bold">{item.label}</span>
                          <ToggleSetting label="Active" description="" checked={item.active} onChange={value => updatePlatformSetting(`${item.key}_active` as keyof PlatformSettings, value as never)} />
                        </div>
                        <input value={item.url} onChange={event => updatePlatformSetting(`${item.key}_url` as keyof PlatformSettings, event.target.value as never)} placeholder={`https://...${item.label.toLowerCase()}`} className="w-full rounded-lg border px-3 py-2 text-sm outline-none" style={{ background: 'var(--muted)', borderColor: 'var(--border)', color: 'var(--foreground)' }} />
                      </div>
                    ))}
                    <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,0.025)' }}>
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <span className="text-sm font-bold">WhatsApp</span>
                        <ToggleSetting label="Active" description="" checked={platformSettings.social_whatsapp_active} onChange={value => updatePlatformSetting('social_whatsapp_active', value)} />
                      </div>
                      <input value={platformSettings.social_whatsapp_url} onChange={event => updatePlatformSetting('social_whatsapp_url', event.target.value)} placeholder="https://wa.me/25700000000" className="w-full rounded-lg border px-3 py-2 text-sm outline-none" style={{ background: 'var(--muted)', borderColor: 'var(--border)', color: 'var(--foreground)' }} />
                    </div>
                  </div>
                </section>

                <section className="rounded-2xl border p-5 lg:col-span-2" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--muted-foreground)' }}>{i18n.t('Consent-gated tracking')}</p>
                  <h3 className="mt-1 text-lg font-black" style={{ fontFamily: 'Outfit, sans-serif' }}>{i18n.t('Analytics and marketing tools')}</h3>
                  <p className="mt-2 max-w-3xl text-sm leading-6" style={{ color: 'var(--muted-foreground)' }}>{i18n.t('Vendor scripts load only after a visitor accepts cookies. GA4 receives page views, event views, checkout starts, and confirmed purchases. Meta Pixel receives page views, content views, checkout starts, and confirmed purchases. Customer contact details are never sent.')}</p>
                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <label className="block text-sm font-semibold">{i18n.t('Google Analytics 4 measurement ID')}<span className="mt-1 block text-xs font-normal leading-5" style={{ color: 'var(--muted-foreground)' }}>{i18n.t('Optional. Format: G-XXXXXXXXXX. Reports are available in Google Analytics.')}</span><input value={platformSettings.google_analytics_id} onChange={event => updatePlatformSetting('google_analytics_id', event.target.value)} placeholder="G-XXXXXXXXXX" autoComplete="off" className="mt-2 w-full rounded-xl border px-3 py-2.5 text-sm outline-none" style={{ background: 'var(--muted)', borderColor: 'var(--border)', color: 'var(--foreground)' }} /></label>
                    <label className="block text-sm font-semibold">{i18n.t('Meta Pixel ID')}<span className="mt-1 block text-xs font-normal leading-5" style={{ color: 'var(--muted-foreground)' }}>{i18n.t('Optional. Digits only. Events appear in Meta Events Manager for reporting and ad attribution.')}</span><input value={platformSettings.meta_pixel_id} onChange={event => updatePlatformSetting('meta_pixel_id', event.target.value)} placeholder="123456789012345" inputMode="numeric" autoComplete="off" className="mt-2 w-full rounded-xl border px-3 py-2.5 text-sm outline-none" style={{ background: 'var(--muted)', borderColor: 'var(--border)', color: 'var(--foreground)' }} /></label>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-4 text-sm font-semibold">
                    <a href="https://analytics.google.com/analytics/web/" target="_blank" rel="noreferrer" className="underline underline-offset-4">{i18n.t('Open Google Analytics')}</a>
                    <a href="https://business.facebook.com/events_manager/" target="_blank" rel="noreferrer" className="underline underline-offset-4">{i18n.t('Open Meta Events Manager')}</a>
                  </div>
                  <p className="mt-4 text-xs leading-5" style={{ color: 'var(--muted-foreground)' }}>{i18n.t('Visitors who have not accepted are not sent to these services. Clear an ID and save to stop enabling that integration for new visitors. Existing vendor accounts remain managed in their respective dashboards.')}</p>
                </section>

                <section className="rounded-2xl border p-5" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--muted-foreground)' }}>Operations policy</p>
                  <h3 className="mt-1 text-lg font-black" style={{ fontFamily: 'Outfit, sans-serif' }}>Event, support and entry rules</h3>
                  <div className="mt-5 space-y-3">
                    <label className="block rounded-xl border p-4 text-sm font-bold" style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,0.025)' }}>Maximum tickets per order<span className="mt-1 block text-xs font-normal leading-5" style={{ color: 'var(--muted-foreground)' }}>Applied to the total number of tickets, including tickets in group tiers.</span><input type="number" min="1" max="100" step="1" value={platformSettings.max_tickets_per_order} onChange={event => updatePlatformSetting('max_tickets_per_order', Number(event.target.value))} className="mt-3 w-full rounded-lg border px-3 py-2 text-sm outline-none" style={{ background: 'var(--muted)', borderColor: 'var(--border)', color: 'var(--foreground)' }} /></label>
                    <ToggleSetting label="Verified organizers only" description="Require an organizer to be verified before they can newly publish an event." checked={platformSettings.require_verified_organizers_to_publish} onChange={value => updatePlatformSetting('require_verified_organizers_to_publish', value)} />
                    <ToggleSetting label="Refund requests" description="Allow customers to open new refund requests. Existing requests can still be reviewed when this is off." checked={platformSettings.refund_requests_enabled} onChange={value => updatePlatformSetting('refund_requests_enabled', value)} />
                    <ToggleSetting label="Ticket check-in" description="Allow organizers and their staff to scan guests into eligible events." checked={platformSettings.checkin_enabled} onChange={value => updatePlatformSetting('checkin_enabled', value)} />
                  </div>
                </section>
              </div>
            )}

            {!settingsLoading && <p className="px-1 text-xs" style={{ color: 'var(--muted-foreground)' }}>Last saved: {platformSettings.updated_at ? new Date(platformSettings.updated_at).toLocaleString() : 'Not yet saved'}. Pricing and ticket caps affect new orders only; other operational switches take effect immediately.</p>}
          </div>
        )
      default:
        return renderOverview()
    }
  }

  return (
    <div className="admin-dashboard-shell relative min-h-screen w-full overflow-x-hidden" style={{ background: 'linear-gradient(135deg, #0b0c0c 0%, #11100e 48%, #0b0c0c 100%)', color: 'var(--foreground)' }}>
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r shadow-2xl transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}
        style={{ background: 'rgba(12,13,13,0.96)', borderColor: 'rgba(255,255,255,0.09)', backdropFilter: 'blur(24px)' }}
      >
        <div className="border-b px-5 py-5" style={{ borderColor: 'rgba(255,255,255,0.09)' }}>
          <a href="/admin-dashboard" onClick={event => { event.preventDefault(); handleSelectSection('overview') }} className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl text-sm font-black" style={{ background: 'var(--primary)', color: '#17100a' }}>Q</span>
            <span className="text-lg font-black tracking-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>QPassa admin</span>
          </a>
          <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--muted-foreground)' }}>Platform operations</p>
          <p className="mt-1 truncate text-xs" style={{ color: 'rgba(255,255,255,0.72)' }}>{profile?.full_name?.trim() || 'Admin workspace'}</p>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto py-3">
          {NAV.map(({ key, label }) => {
            const Icon = NAV_ICONS[key]
            return (
              <button
                key={key}
                type="button"
                onClick={() => handleSelectSection(key)}
                className="admin-nav-item flex w-full items-center gap-3 px-5 py-2.5 text-left text-sm font-semibold transition-colors"
                style={{
                  background: section === key ? 'rgba(200,169,110,0.08)' : 'transparent',
                  color: section === key ? 'var(--foreground)' : 'rgba(255,255,255,0.45)',
                  borderLeft: section === key ? '2px solid var(--accent)' : '2px solid transparent',
                }}
              >
                <Icon size={15} />
                {label}
              </button>
            )
          })}
        </nav>

        <div className="space-y-2 border-t p-4" style={{ borderColor: 'rgba(255,255,255,0.09)' }}>
          <button type="button" onClick={() => navigate('home')} aria-label="Back to site" title="Back to site" className="mx-auto flex h-10 w-10 items-center justify-center rounded-full" style={{ color: 'var(--muted-foreground)' }}>
            <ArrowLeftIcon size={18} />
          </button>
        </div>
      </aside>

      {sidebarOpen && <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      <main className="relative flex min-h-screen min-w-0 flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-20 flex w-full items-center justify-between border-b px-5 py-3.5" style={{ background: 'rgba(11,12,12,0.88)', backdropFilter: 'blur(20px)', borderColor: 'rgba(255,255,255,0.09)' }}>
          <div className="flex items-center gap-3">
            <button className="rounded-lg p-1.5 lg:hidden" style={{ background: 'var(--muted)' }} onClick={() => setSidebarOpen(v => !v)}>
              <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor"><rect y="2" width="16" height="1.5" rx="1"/><rect y="7" width="16" height="1.5" rx="1"/><rect y="12" width="16" height="1.5" rx="1"/></svg>
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-black" style={{ fontFamily: 'Outfit, sans-serif' }}>{NAV.find(item => item.key === section)?.label ?? 'Overview'}</h1>
                <span className="hidden rounded-md px-2 py-1 text-[10px] font-mono sm:inline" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--muted-foreground)' }}>{SECTION_PATHS[section]}</span>
              </div>
              <p className="mt-1 text-xs" style={{ color: 'var(--muted-foreground)' }}>Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, platform ops team</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => navigate('home')} className="flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold" style={{ borderColor: 'rgba(255,255,255,0.12)', color: 'var(--foreground)' }}>
              <EyeIcon size={14} /> View site
            </button>
            <LanguageSwitcher bare />
            <button onClick={() => setRefreshTick(value => value + 1)} className="flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold" style={{ borderColor: 'rgba(255,255,255,0.12)', color: 'var(--foreground)' }} aria-label="Refresh admin data">
              <ZapIcon size={14} /> Refresh
            </button>
            <button onClick={exportCurrentSection} className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold" style={{ background: 'var(--primary)', color: '#000' }}>
              <CheckIcon size={14} /> Export report
            </button>
          </div>
        </header>

        <div className="w-full p-5 lg:p-7">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--primary)' }}>Admin control room</p>
              <h2 className="mt-1 text-2xl font-black sm:text-3xl" style={{ fontFamily: 'Outfit, sans-serif' }}>{section === 'overview' ? 'Operations overview' : NAV.find(item => item.key === section)?.label}</h2>
              <p className="mt-1 text-xs" style={{ color: 'var(--muted-foreground)' }}>{section === 'overview' ? overviewHealthSummary : 'Review and manage platform operations.'}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>Updated {lastUpdated?.toLocaleTimeString() ?? 'loading'}</span>
              <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold" style={{ background: overviewHealthTone.background, color: overviewHealthTone.color }}>
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" /> Live
              </div>
            </div>
          </div>

          {dashboardError ? (
            <div className="mb-5 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              {dashboardError}
            </div>
          ) : null}

          {loading ? (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="h-28 animate-pulse rounded-2xl border" style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'var(--border)' }} />
                ))}
              </div>
              <div className="grid gap-5 lg:grid-cols-2">
                {Array.from({ length: 2 }).map((_, index) => (
                  <div key={index} className="h-64 animate-pulse rounded-2xl border" style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'var(--border)' }} />
                ))}
              </div>
            </div>
          ) : pageContent()}
        </div>
      </main>
    </div>
  )
}
