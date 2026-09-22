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

type Section =
  | 'overview'
  | 'users'
  | 'organizers'
  | 'events'
  | 'tickets'
  | 'orders'
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
  updated_at?: string
}

const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  id: true,
  platform_name: 'Tiketi',
  support_email: 'hello@tiketi.events',
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
}

const NAV: { key: Section; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'users', label: 'Users' },
  { key: 'organizers', label: 'Organizers' },
  { key: 'events', label: 'Events' },
  { key: 'tickets', label: 'Tickets' },
  { key: 'orders', label: 'Orders' },
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
    <div className="rounded-2xl border p-4" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
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
    <div className="rounded-2xl border" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
      <div className="flex items-center justify-between gap-3 border-b px-5 py-4" style={{ borderColor: 'var(--border)' }}>
        <div>
          <h3 className="text-sm font-black" style={{ fontFamily: 'Outfit, sans-serif' }}>{title}</h3>
          <p className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--muted-foreground)' }}>{subtitle}</p>
        </div>
        <button className="rounded-lg px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--muted-foreground)' }}>
          View all
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-left text-sm">
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
              {columns.map(column => (
                <th key={column} className="px-5 py-3 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--muted-foreground)' }}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className="border-t" style={{ borderColor: 'var(--border)' }}>
                {row.map((cell, cellIndex) => (
                  <td key={`${index}-${cellIndex}`} className="px-5 py-3 text-sm" style={{ color: 'var(--foreground)' }}>{cell}</td>
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
  const [topOrganizers, setTopOrganizers] = useState<Array<{ name: string; sales: string; active: string }>>([])
  const [recentOrders, setRecentOrders] = useState<Array<{ customer: string; event: string; value: string; status: string }>>([])
  const [recentPayouts, setRecentPayouts] = useState<Array<{ organizer: string; amount: string; status: string; method: string }>>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d')
  const [sortMode, setSortMode] = useState<'recent' | 'name' | 'value'>('recent')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [refreshTick, setRefreshTick] = useState(0)
  const [userRows, setUserRows] = useState<Array<{ name: string; status: string; ticketsBought: string; lastActive: string }>>([])
  const [organizerRows, setOrganizerRows] = useState<Array<{ name: string; events: string; revenue: string; verification: string }>>([])
  const [eventRows, setEventRows] = useState<Array<{ event: string; organizer: string; capacity: string; status: string }>>([])
  const [ticketRows, setTicketRows] = useState<Array<{ event: string; sold: string; available: string; utilization: string }>>([])
  const [orderRows, setOrderRows] = useState<Array<{ customer: string; event: string; amount: string; status: string }>>([])
  const [paymentRows, setPaymentRows] = useState<Array<{ reference: string; customer: string; method: string; amount: string }>>([])
  const [payoutRows, setPayoutRows] = useState<Array<{ organizer: string; expected: string; status: string; window: string }>>([])
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
      const { data, error } = await supabase.from('platform_settings').select('id, platform_name, support_email, checkout_notice, service_fee_percent, ticket_sales_enabled, mobile_money_enabled, card_payments_enabled, maintenance_mode, maintenance_message, marketplace_enabled, max_tickets_per_order, require_verified_organizers_to_publish, refund_requests_enabled, checkin_enabled, updated_at').eq('id', true).maybeSingle()

      if (!isMounted) return
      if (error) {
        setSettingsError(error.message)
      } else if (data) {
        setPlatformSettings({
          id: true,
          platform_name: data.platform_name ?? DEFAULT_PLATFORM_SETTINGS.platform_name,
          support_email: data.support_email ?? DEFAULT_PLATFORM_SETTINGS.support_email,
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
    if (!value || targetRange === 'all') return true

    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return true

    const now = Date.now()
    const cutoff = rangeWindowMs[targetRange]

    return now - date.getTime() <= cutoff
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
        const [eventsResult, profilesResult, organizersResult, ordersResult, ticketTierResult, transactionsResult, agentSalesResult, ticketsResult, refundsResult, commissionsResult] = await Promise.all([
          supabase.from('events').select('id, status, organizer_id, created_at, title, capacity, organizers:organizer_id(name)').order('created_at', { ascending: false }),
          supabase.from('profiles').select('id, created_at, full_name, role').order('created_at', { ascending: false }),
          supabase.from('organizers').select('id, user_id, verified, created_at, name').order('created_at', { ascending: false }),
          supabase.from('orders').select('id, customer_id, organizer_id, event_id, status, subtotal, service_fee, total, payment_method, created_at, profiles:customer_id(full_name), events:event_id(title), order_items:order_items(quantity, total_price, unit_price)').order('created_at', { ascending: false }),
          supabase.from('ticket_tiers').select('id, sold, price, quantity, event_id, created_at, events:event_id(title)').order('created_at', { ascending: false }),
          supabase.from('transactions').select('id, organizer_id, type, amount, status, created_at, reference, organizers:organizer_id(name)').order('created_at', { ascending: false }),
          supabase.from('agent_sales').select('id, order_id, agent_user_id, organizer_id, quantity, status, payment_mode, created_at, profiles:agent_user_id(full_name), organizers:organizer_id(name), orders:order_id(subtotal, status), commissions(amount, status)').order('created_at', { ascending: false }),
          supabase.from('tickets').select('id, order_id, ticket_tier_id, status, created_at, checked_in_at'),
          supabase.from('refund_requests').select('order_id, ticket_id, status'),
          supabase.from('commissions').select('sale_id, amount, status, agent_sales!inner(order_id)'),
        ])

        if (eventsResult.error) throw eventsResult.error
        if (profilesResult.error) throw profilesResult.error
        if (organizersResult.error) throw organizersResult.error
        if (ordersResult.error) throw ordersResult.error
        if (ticketTierResult.error) throw ticketTierResult.error
        if (transactionsResult.error) throw transactionsResult.error
        if (agentSalesResult.error) throw agentSalesResult.error
        if (ticketsResult.error) throw ticketsResult.error
        if (refundsResult.error) throw refundsResult.error
        if (commissionsResult.error) throw commissionsResult.error

        const allEvents = eventsResult.data ?? []
        const allProfiles = profilesResult.data ?? []
        const allOrganizers = organizersResult.data ?? []
        const allOrders = ordersResult.data ?? []
        const allTicketTiers = ticketTierResult.data ?? []
        const allTransactions = transactionsResult.data ?? []
        const allAgentSales = agentSalesResult.data ?? []
        const allTickets = ticketsResult.data ?? []
        const allRefunds = refundsResult.data ?? []
        const allCommissions = commissionsResult.data ?? []

        const events = allEvents.filter(event => withinDateRange(event.created_at as string | null))
        const profiles = allProfiles.filter(profileRow => withinDateRange(profileRow.created_at as string | null))
        const organizers = allOrganizers.filter(organizer => withinDateRange(organizer.created_at as string | null))
        const orders = allOrders.filter(order => withinDateRange(order.created_at as string | null))
        const ticketTiers = allTicketTiers.filter(tier => withinDateRange((tier as { created_at?: string | null }).created_at as string | null))
        const transactions = allTransactions.filter(transaction => withinDateRange(transaction.created_at as string | null))
        const agentSales = allAgentSales.filter(sale => withinDateRange(sale.created_at as string | null))

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
        const netTicketRevenueForOrder = (order: { id: string; subtotal?: number | null; order_items?: Array<{ total_price?: number | null }> | null }) => Math.max(0, ticketValueForOrder(order) - (refundAmountByOrder.get(order.id) ?? 0) - (commissionAmountByOrder.get(order.id) ?? 0))
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

        const last7Days = Array.from({ length: 7 }, (_, index) => {
          const date = new Date()
          date.setDate(date.getDate() - (6 - index))
          const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)
          const dayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999)

          return (allOrders as Array<{ created_at?: string | null; status?: string | null; service_fee?: number | null }>).filter(order => {
            if (!order.created_at || order.status !== 'confirmed') return false
            const orderDate = new Date(order.created_at)
            return orderDate >= dayStart && orderDate <= dayEnd
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
            const percent = maxOrganizerRevenue > 0 ? Math.min(98, Math.max(30, Math.round((sales / maxOrganizerRevenue) * 100))) : 0
            return {
              name: organizer?.name ?? 'Unknown organizer',
              sales: formatMoneyShort(sales),
              active: `${percent}%`,
            }
          })
          .sort((a, b) => toComparableNumber(b.sales) - toComparableNumber(a.sales))
          .slice(0, 4)

        const userRowsData = (profiles as Array<{ id?: string; full_name?: string | null; role?: string | null; created_at?: string | null }>).slice(0, 6).map(profileRow => {
          const userOrders = (orders as Array<{ customer_id?: string | null; total?: number | null }>).filter(order => order.customer_id === profileRow.id).length
          const daysAgo = profileRow.created_at ? Math.max(0, Math.round((Date.now() - new Date(profileRow.created_at).getTime()) / 86400000)) : 0
          return {
            name: profileRow.full_name ?? 'Unnamed user',
            status: profileRow.role ?? 'customer',
            ticketsBought: `${userOrders}`,
            lastActive: daysAgo === 0 ? 'Today' : `${daysAgo}d ago`,
          }
        })

        const organizerRowsData = (organizers as Array<{ name?: string | null; id?: string; verified?: boolean | null; created_at?: string | null }>).slice(0, 6).map(organizerRow => {
          const organizerEvents = (events as Array<{ organizer_id?: string | null }>).filter(event => event.organizer_id === organizerRow.id).length
          const organizerSales = (orders as Array<{ id: string; organizer_id?: string | null; subtotal?: number | null; order_items?: Array<{ total_price?: number | null }> | null; status?: string | null }>).filter(order => order.organizer_id === organizerRow.id && order.status === 'confirmed').reduce((sum, order) => sum + netTicketRevenueForOrder(order), 0)
          return {
            name: organizerRow.name ?? 'Unnamed organizer',
            events: `${organizerEvents}`,
            revenue: formatMoneyShort(organizerSales),
            verification: organizerRow.verified ? 'Verified' : 'Pending',
          }
        })

        const eventRowsData = (events as Array<{ title?: string | null; organizers?: { name?: string | null } | null; capacity?: number | null; status?: string | null }>).slice(0, 6).map(eventRow => ({
          event: eventRow.title ?? 'Untitled event',
          organizer: eventRow.organizers?.name ?? 'Unknown organizer',
          capacity: (eventRow.capacity ?? 0).toLocaleString(),
          status: eventRow.status ?? 'draft',
        }))

        const ticketRowsData = (ticketTiers as Array<{ events?: { title?: string | null } | null; sold?: number | null; quantity?: number | null; price?: number | null }>).slice(0, 6).map(tier => {
          const sold = tier.sold ?? 0
          const quantity = tier.quantity ?? 0
          const utilization = quantity > 0 ? `${Math.round((sold / quantity) * 100)}%` : '0%'
          return {
            event: tier.events?.title ?? 'Event',
            sold: sold.toLocaleString(),
            available: Math.max(quantity - sold, 0).toLocaleString(),
            utilization,
          }
        })

        const orderRowsData = (orders as Array<{ profiles?: { full_name?: string | null }; events?: { title?: string | null }; total?: number | null; status?: string | null }>).slice(0, 6).map(order => ({
          customer: order.profiles?.full_name ?? 'Customer',
          event: order.events?.title ?? 'Event',
          amount: formatMoneyShort(order.total ?? 0),
          status: order.status ?? 'pending',
        }))

        const paymentRowsData = (orders as Array<{ id?: string | null; profiles?: { full_name?: string | null }; payment_method?: string | null; total?: number | null; status?: string | null }>).filter(order => order.status === 'confirmed' || order.status === 'pending').slice(0, 6).map(order => ({
          reference: `TXN-${String(order.id ?? '').slice(0, 6).toUpperCase()}`,
          customer: order.profiles?.full_name ?? 'Customer',
          method: order.payment_method ? order.payment_method.replace('_', ' ') : 'Card',
          amount: formatMoneyShort(order.total ?? 0),
        }))

        const payoutRowsData = (transactions as Array<{ organizers?: { name?: string | null }; amount?: number | null; status?: string | null; created_at?: string | null; type?: string | null }>).filter(transaction => transaction.type === 'payout').slice(0, 6).map(transaction => ({
          organizer: transaction.organizers?.name ?? 'Organizer',
          expected: formatMoneyShort(transaction.amount ?? 0),
          status: transaction.status ?? 'pending',
          window: transaction.created_at ? new Date(transaction.created_at).toLocaleDateString() : 'Today',
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
          .slice(0, 6)
          .map(agent => ({
            agent: agent.agent,
            sales: `${agent.tickets} tickets`,
            revenue: formatMoneyShort(agent.revenue),
            commission: formatMoneyShort(agent.commission),
            commissionRate: agent.revenue > 0 ? (agent.commission / agent.revenue) * 100 : 0,
          }))

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
            awaitingVerification: (allOrganizers as Array<{ verified?: boolean | null }>).filter(organizer => !organizer.verified).length,
            verified: (allOrganizers as Array<{ verified?: boolean | null }>).filter(organizer => organizer.verified).length,
            unverified: (allOrganizers as Array<{ verified?: boolean | null }>).filter(organizer => !organizer.verified).length,
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
            refundedRate: confirmedOrders.length ? (refundedOrderCount / confirmedOrders.length) * 100 : 0,
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
        const uniqueCustomers = new Set((orders as Array<{ customer_id?: string | null }>).filter(order => order.customer_id).map(order => order.customer_id)).size
        const customerRetentionRate = profiles.length > 0 ? (uniqueCustomers / profiles.length) * 100 : 0
        const returningCustomers = orders.filter(order => order.customer_id).length > 0 ? (new Set((orders as Array<{ customer_id?: string | null }>).filter(order => order.customer_id).map(order => order.customer_id!)).size / Math.max(profiles.length, 1)) * 100 : 0

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
            { label: 'Active users', value: profiles.length.toLocaleString() },
            { label: 'Repeat customers', value: `${Math.min(100, Math.max(0, returningCustomers)).toFixed(1)}%` },
            { label: 'Organizers active', value: organizers.length.toLocaleString() },
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
        setWeekTrend(last7Days)
        setTopOrganizers(organizerRows.length ? organizerRows : [
          { name: 'No organizers yet', sales: 'BIF 0', active: '0%' },
        ])
        setRecentOrders((orders as Array<{ profiles?: { full_name?: string | null }; events?: { title?: string | null }; total?: number | null; status?: string | null }>).slice(0, 4).map(order => ({
          customer: order.profiles?.full_name ?? 'Customer',
          event: order.events?.title ?? 'Event',
          value: formatMoneyShort(order.total ?? 0),
          status: order.status ?? 'pending',
        })))
        setRecentPayouts((transactions as Array<{ organizers?: { name?: string | null }; amount?: number | null; status?: string | null; type?: string | null }>).filter(transaction => transaction.type === 'payout').slice(0, 4).map(transaction => ({
          organizer: transaction.organizers?.name ?? 'Organizer',
          amount: formatMoneyShort(transaction.amount ?? 0),
          status: transaction.status ?? 'pending',
          method: 'Bank transfer',
        })))
        setUserRows(userRowsData)
        setOrganizerRows(organizerRowsData)
        setEventRows(eventRowsData)
        setTicketRows(ticketRowsData)
        setOrderRows(orderRowsData)
        setPaymentRows(paymentRowsData)
        setPayoutRows(payoutRowsData)
        setAgentRows(agentRowsData)
        setHealthMetrics(health)
        setReportCards(reports)
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

  const formatMoneyShort = (value: number) => {
    return `BIF ${Math.round(value).toLocaleString()}`
  }

  const kpis = useMemo(
    () => [
      { label: 'Total Events', value: platformStats.totalEvents.toLocaleString(), delta: statDeltas.totalEvents, icon: CalendarIcon, accent: '#8bc4ff' },
      { label: 'Tickets Sold', value: platformStats.ticketsSold.toLocaleString(), delta: statDeltas.ticketsSold, icon: TicketIcon, accent: '#ffb976' },
      { label: 'Organizer Net Revenue', value: formatMoneyShort(platformStats.grossTicketValue), delta: statDeltas.grossTicketValue, icon: DollarSignIcon, accent: '#9ae6b4' },
      { label: 'Platform Service Fees', value: formatMoneyShort(platformStats.platformRevenue), delta: statDeltas.platformRevenue, icon: TrendingUpIcon, accent: '#d7a7ff' },
      { label: 'Active Organizers', value: platformStats.activeOrganizers.toLocaleString(), delta: statDeltas.activeOrganizers, icon: UsersIcon, accent: '#ff7a7a' },
      { label: 'Active Users', value: platformStats.activeUsers.toLocaleString(), delta: statDeltas.activeUsers, icon: UserIcon, accent: '#7fe9d9' },
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
    const checkoutNotice = platformSettings.checkout_notice.trim()
    const maintenanceMessage = platformSettings.maintenance_message.trim()
    const serviceFeePercent = Number(platformSettings.service_fee_percent)
    const maxTicketsPerOrder = Number(platformSettings.max_tickets_per_order)

    if (!platformName) { setSettingsError('Enter a platform name.'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail)) { setSettingsError('Enter a valid support email address.'); return }
    if (!Number.isFinite(serviceFeePercent) || serviceFeePercent < 0 || serviceFeePercent > 100) { setSettingsError('Service fee must be between 0% and 100%.'); return }
    if (!Number.isInteger(maxTicketsPerOrder) || maxTicketsPerOrder < 1 || maxTicketsPerOrder > 100) { setSettingsError('Tickets per order must be a whole number between 1 and 100.'); return }
    if (!platformSettings.mobile_money_enabled && !platformSettings.card_payments_enabled) { setSettingsError('Keep at least one payment method enabled.'); return }

    setSettingsSaving(true)
    setSettingsError('')
    setSettingsNotice('')
    const nextSettings = { ...platformSettings, platform_name: platformName, support_email: supportEmail, checkout_notice: checkoutNotice, maintenance_message: maintenanceMessage, service_fee_percent: serviceFeePercent, max_tickets_per_order: maxTicketsPerOrder }
    const { error } = await supabase.from('platform_settings').upsert({ ...nextSettings, updated_by: user?.id }, { onConflict: 'id' })
    if (error) {
      setSettingsError(error.message)
    } else {
      setPlatformSettings(nextSettings)
      setSettingsNotice('Platform settings saved. Operational changes are now active; pricing changes apply to new orders only.')
    }
    setSettingsSaving(false)
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
          return userRows.filter(row => `${row.name} ${row.status}`.toLowerCase().includes(searchTerm.toLowerCase())).map(row => [row.name, row.status, row.ticketsBought, row.lastActive])
        case 'organizers':
          return organizerRows.filter(row => `${row.name} ${row.verification}`.toLowerCase().includes(searchTerm.toLowerCase())).map(row => [row.name, row.events, row.revenue, row.verification])
        case 'events':
          return eventRows.filter(row => `${row.event} ${row.organizer}`.toLowerCase().includes(searchTerm.toLowerCase())).map(row => [row.event, row.organizer, row.capacity, row.status])
        case 'tickets':
          return ticketRows.filter(row => `${row.event} ${row.utilization}`.toLowerCase().includes(searchTerm.toLowerCase())).map(row => [row.event, row.sold, row.available, row.utilization])
        case 'orders':
          return orderRows.filter(row => `${row.customer} ${row.event}`.toLowerCase().includes(searchTerm.toLowerCase())).map(row => [row.customer, row.event, row.amount, row.status])
        case 'payments':
          return paymentRows.filter(row => `${row.reference} ${row.customer}`.toLowerCase().includes(searchTerm.toLowerCase())).map(row => [row.reference, row.customer, row.method, row.amount])
        case 'payouts':
          return payoutRows.filter(row => `${row.organizer} ${row.status}`.toLowerCase().includes(searchTerm.toLowerCase())).map(row => [row.organizer, row.expected, row.status, row.window])
        case 'agents':
          return agentRows.filter(row => `${row.agent} ${row.sales}`.toLowerCase().includes(searchTerm.toLowerCase())).map(row => [row.agent, row.sales, row.revenue, row.commission])
        default:
          return []
      }
    })()

    if (!rows.length) return

    const columns = (() => {
      switch (section) {
        case 'users': return ['Name', 'Status', 'Tickets bought', 'Last active']
        case 'organizers': return ['Name', 'Events', 'Revenue', 'Verification']
        case 'events': return ['Event', 'Organizer', 'Capacity', 'Status']
        case 'tickets': return ['Event', 'Sold', 'Available', 'Utilization']
        case 'orders': return ['Customer', 'Event', 'Amount', 'Status']
        case 'payments': return ['Reference', 'Customer', 'Method', 'Amount']
        case 'payouts': return ['Organizer', 'Expected', 'Status', 'Window']
        case 'agents': return ['Agent', 'Sales', 'Revenue', 'Commission']
        default: return []
      }
    })()

    const csv = [columns, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${section}-report.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const overviewRevenueTotal = weekTrend.reduce((sum, value) => sum + value, 0)
  const overviewRevenueMax = Math.max(...weekTrend, 1)
  const overviewHealthSummary = platformStats.grossTicketValue > 0
    ? `Organizer net revenue is ${formatMoneyShort(platformStats.grossTicketValue)} after processed refunds and agent commissions, with ${formatMoneyShort(platformStats.platformRevenue)} in service fees.`
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
              <TrendingUpIcon size={12} /> Last 7 days
            </div>
          </div>
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <p className="text-2xl font-black" style={{ fontFamily: 'Outfit, sans-serif', color: 'var(--foreground)' }}>{formatMoneyShort(overviewRevenueTotal)}</p>
              <p className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>Service fees in the last 7 days</p>
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
                    background: index === weekTrend.length - 1 ? 'linear-gradient(180deg, var(--primary), #ffd59c)' : 'linear-gradient(180deg, rgba(255,255,255,0.2), rgba(255,255,255,0.08))',
                    minHeight: '4px',
                    boxShadow: index === weekTrend.length - 1 ? '0 10px 25px rgba(255, 187, 104, 0.22)' : 'none',
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
              const fill = Number.parseInt(organizer.active, 10) || 0
              return (
                <div key={organizer.name} className="rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-black" style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--primary)' }}>{index + 1}</span>
                      <div>
                        <p className="text-sm font-bold">{organizer.name}</p>
                        <p className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>{organizer.active} active</p>
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
          rows={recentPayouts.length ? recentPayouts.map(item => [item.organizer, item.amount, item.status, item.method]) : [['No payout data yet', 'BIF 0', 'pending', '—']]}
        />

        <TableCard
          title="Recent orders"
          subtitle="Transactions"
          columns={['Customer', 'Event', 'Value', 'Status']}
          rows={recentOrders.length ? recentOrders.map(item => [item.customer, item.event, item.value, item.status]) : [['No recent orders', '—', 'BIF 0', 'pending']]}
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

    const usersTable = applySearchAndSort(userRows.map(row => ({ ...row, nameValue: row.name, valueKey: row.ticketsBought })), 'nameValue', 'valueKey').map(row => [row.name, row.status, row.ticketsBought, row.lastActive])
    const organizersTable = applySearchAndSort(organizerRows.map(row => ({ ...row, nameValue: row.name, valueKey: toComparableNumber(row.revenue) })), 'nameValue', 'valueKey').map(row => [row.name, row.events, row.revenue, row.verification])
    const eventsTable = applySearchAndSort(eventRows.map(row => ({ ...row, nameValue: row.event, valueKey: row.capacity.replace(/,/g, '') })), 'nameValue', 'valueKey').map(row => [row.event, row.organizer, row.capacity, row.status])
    const ticketsTable = applySearchAndSort(ticketRows.map(row => ({ ...row, nameValue: row.event, valueKey: Number(row.sold.replace(/,/g, '')) })), 'nameValue', 'valueKey').map(row => [row.event, row.sold, row.available, row.utilization])
    const orderTable = applySearchAndSort(orderRows.map(row => ({ ...row, nameValue: row.customer, valueKey: toComparableNumber(row.amount) })), 'nameValue', 'valueKey').map(row => [row.customer, row.event, row.amount, row.status])
    const paymentTable = applySearchAndSort(paymentRows.map(row => ({ ...row, nameValue: row.reference, valueKey: toComparableNumber(row.amount) })), 'nameValue', 'valueKey').map(row => [row.reference, row.customer, row.method, row.amount])
    const payoutTable = applySearchAndSort(payoutRows.map(row => ({ ...row, nameValue: row.organizer, valueKey: toComparableNumber(row.expected) })), 'nameValue', 'valueKey').map(row => [row.organizer, row.expected, row.status, row.window])
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
              <TableCard title="Users" subtitle="Platform account overview" columns={['Name', 'Status', 'Tickets bought', 'Last active']} rows={usersTable.length ? usersTable : [['No matching users', '—', '0', '—']]} />
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
        )
      case 'events':
        return (
          <div className="grid gap-5 xl:grid-cols-[1.4fr_0.6fr]">
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
                </div>
              </div>
              <TableCard title="Events" subtitle="Inventory" columns={['Event', 'Organizer', 'Capacity', 'Status']} rows={eventsTable.length ? eventsTable : [['No matching events', '—', '0', 'draft']]} />
            </div>
            {renderSimpleList('Compliance', [
              { label: 'Published events', value: healthMetrics.events.published.toLocaleString() },
              { label: 'Draft events', value: healthMetrics.events.drafts.toLocaleString() },
              { label: 'Listed capacity', value: healthMetrics.events.totalCapacity.toLocaleString() },
            ], 'Status')}
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
              <TableCard title="Ticket inventory" subtitle="Scanning and availability" columns={['Event', 'Sold', 'Available', 'Utilization']} rows={ticketsTable.length ? ticketsTable : [['No matching ticket rows', '0', '0', '0%']]} />
            </div>
            {renderSimpleList('Ticket health', [
              { label: 'Low inventory alerts', value: healthMetrics.tickets.lowInventory.toLocaleString(), tone: '#ffb976' },
              { label: 'Scans today', value: healthMetrics.tickets.scansToday.toLocaleString() },
              { label: 'Cancelled tickets', value: healthMetrics.tickets.cancelled.toLocaleString() },
            ], 'Operations')}
          </div>
        )
      case 'orders':
        return (
          <div className="grid gap-5 xl:grid-cols-[1.4fr_0.6fr]">
            <div className="space-y-4">
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
              <TableCard title="Orders" subtitle="Checkout activity" columns={['Customer', 'Event', 'Amount', 'Status']} rows={orderTable.length ? orderTable : [['No matching orders', '—', 'BIF 0', 'pending']]} />
            </div>
            {renderSimpleList('Order health', [
              { label: 'Confirmed orders', value: healthMetrics.orders.confirmed.toLocaleString() },
              { label: 'Pending orders', value: healthMetrics.orders.pending.toLocaleString() },
              { label: 'Processed refund rate', value: `${healthMetrics.orders.refundedRate.toFixed(1)}%` },
            ], 'Conversion')}
          </div>
        )
      case 'payments':
        return (
          <div className="grid gap-5 xl:grid-cols-[1.3fr_0.7fr]">
            <div className="space-y-4">
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
              <TableCard title="Payments" subtitle="Transactions" columns={['Reference', 'Customer', 'Method', 'Amount']} rows={paymentTable.length ? paymentTable : [['No matching payments', '—', '—', 'BIF 0']]} />
            </div>
            {renderSimpleList('Settlement status', [
              { label: 'Successful payments', value: healthMetrics.payments.successful.toLocaleString() },
              { label: 'Failed payments', value: healthMetrics.payments.failed.toLocaleString() },
              { label: 'Pending reconciliation', value: healthMetrics.payments.pending.toLocaleString() },
            ], 'Finance')}
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
              <TableCard title="Payouts" subtitle="To organizers" columns={['Organizer', 'Expected', 'Status', 'Window']} rows={payoutTable.length ? payoutTable : [['No matching payouts', 'BIF 0', 'pending', '—']]} />
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
      case 'reports':
        return (
          <div className="grid gap-5 xl:grid-cols-3">
            {renderSimpleList('Revenue reports', reportCards.revenue, 'Finance')}
            {renderSimpleList('Operational reports', reportCards.operations, 'Operations')}
            {renderSimpleList('Engagement reports', reportCards.growth, 'Growth')}
          </div>
        )
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
                    <label className="block text-sm font-semibold">Checkout notice<span className="mt-1 block text-xs font-normal leading-5" style={{ color: 'var(--muted-foreground)' }}>Shown to customers when ticket sales are paused.</span><textarea value={platformSettings.checkout_notice} onChange={event => updatePlatformSetting('checkout_notice', event.target.value)} placeholder="Ticket sales are temporarily unavailable. Please check back soon." rows={3} className="mt-2 w-full resize-y rounded-xl border px-3 py-2.5 text-sm outline-none" style={{ background: 'var(--muted)', borderColor: 'var(--border)', color: 'var(--foreground)' }} /></label>
                  </div>
                </section>

                <section className="rounded-2xl border p-5" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--muted-foreground)' }}>Checkout controls</p>
                  <h3 className="mt-1 text-lg font-black" style={{ fontFamily: 'Outfit, sans-serif' }}>Sales and payment rules</h3>
                  <div className="mt-5 space-y-3">
                    <label className="block rounded-xl border p-4 text-sm font-bold" style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,0.025)' }}>Service fee (%)<span className="mt-1 block text-xs font-normal leading-5" style={{ color: 'var(--muted-foreground)' }}>Applied server-side to every new customer order.</span><input type="number" min="0" max="100" step="0.01" value={platformSettings.service_fee_percent} onChange={event => updatePlatformSetting('service_fee_percent', Number(event.target.value))} className="mt-3 w-full rounded-lg border px-3 py-2 text-sm outline-none" style={{ background: 'var(--muted)', borderColor: 'var(--border)', color: 'var(--foreground)' }} /></label>
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
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r bg-[#0c0d0d] shadow-2xl transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}
        style={{ background: 'rgba(12,13,13,0.96)', borderColor: 'rgba(255,255,255,0.09)' }}
      >
        <div className="border-b px-5 py-5" style={{ borderColor: 'rgba(255,255,255,0.09)' }}>
          <a href="/admin-dashboard" onClick={event => { event.preventDefault(); handleSelectSection('overview') }} className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl text-sm font-black" style={{ background: 'var(--primary)', color: '#17100a' }}>t</span>
            <span className="text-lg font-black tracking-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>tiketi admin</span>
          </a>
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--muted-foreground)' }}>Platform operations</p>
          <p className="mt-1 text-xs" style={{ color: 'rgba(255,255,255,0.72)' }}>Internal analytics</p>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto py-3">
          {NAV.map(({ key, label }) => {
            const Icon = NAV_ICONS[key]
            return (
              <button
                key={key}
                type="button"
                onClick={() => handleSelectSection(key)}
                className="flex w-full items-center gap-3 px-5 py-2.5 text-left text-sm font-medium transition-colors"
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
          <button onClick={() => navigate('home')} className="flex w-full items-center justify-center gap-2 py-2 text-xs" style={{ color: 'var(--muted-foreground)' }}>
            <ArrowLeftIcon size={14} /> Back to site
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
            <button className="flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold" style={{ borderColor: 'rgba(255,255,255,0.12)', color: 'var(--foreground)' }}>
              <BellIcon size={14} /> Alerts
            </button>
            <button onClick={() => setRefreshTick(value => value + 1)} className="flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold" style={{ borderColor: 'rgba(255,255,255,0.12)', color: 'var(--foreground)' }}>
              Refresh
            </button>
            <button onClick={exportCurrentSection} className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold" style={{ background: 'var(--primary)', color: '#000' }}>
              <CheckIcon size={14} /> Export report
            </button>
          </div>
        </header>

        <div className="w-full p-5">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4" style={{ background: 'rgba(255,255,255,0.025)', borderColor: 'var(--border)' }}>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--muted-foreground)' }}>Operations snapshot</p>
              <h2 className="mt-1 text-2xl font-black" style={{ fontFamily: 'Outfit, sans-serif' }}>{overviewHealthSummary}</h2>
            </div>
            <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold" style={{ background: overviewHealthTone.background, color: overviewHealthTone.color }}>
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" /> Live
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
