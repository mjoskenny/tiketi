import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { signOut, supabase } from '../lib/supabase'
import { formatPrice } from '../data/events'
import { BarChartIcon, BellIcon, CalendarIcon, ClipboardIcon, DollarSignIcon, TicketIcon, UserIcon, ArrowLeftIcon, EyeIcon } from '../components/Icon'
import type { Event, TicketTier } from '../lib/types'

type Section = 'overview' | 'events' | 'sell' | 'sales' | 'commissions' | 'wallet' | 'withdrawals' | 'notifications' | 'profile'
type AgentSale = {
  id: string
  order_id: string
  assignment_id: string
  quantity: number
  payment_mode: 'mobile_money' | 'card' | 'bank' | 'cash'
  status: 'awaiting_payment' | 'paid' | 'cancelled' | 'refunded'
  created_at: string
  paid_at: string | null
  orders?: {
    id: string
    total: number
    status: string
    holder_name: string | null
    holder_email: string | null
    holder_phone: string | null
    created_at: string
    event_id: string
    events?: { title: string | null; date: string | null }
  } | null
  assignments?: {
    id: string
    commission_rate: number
    event_id: string
    events?: { title: string | null; date: string | null }
  } | null
}

type CommissionRow = {
  id: string
  sale_id: string
  assignment_id: string
  amount: number
  status: 'pending' | 'available' | 'paid' | 'reversed'
  available_at: string
  created_at: string
  agent_user_id: string
  organizer_id: string
  rate: number
}

type WalletEntry = {
  id: string
  entry_type: 'commission' | 'reversal' | 'withdrawal'
  amount: number
  created_at: string
  commission_id?: string | null
  withdrawal_id?: string | null
}

type WithdrawalRow = {
  id: string
  amount: number
  payment_method: string
  payment_reference: string | null
  status: 'requested' | 'processing' | 'paid' | 'rejected'
  requested_at: string
  processed_at: string | null
}

type AgentNotification = {
  id: string
  type: string
  title: string
  body: string
  read_at: string | null
  created_at: string
  event_id: string | null
  recipient_scope: string
}

type AgentTicket = {
  id: string
  order_id: string
  ticket_tier_id: string
  event_id: string
  holder_name: string | null
  holder_email: string | null
  holder_phone: string | null
  qr_code: string
  status: 'valid' | 'used' | 'cancelled'
  created_at: string
  events?: Event
  ticket_tiers?: TicketTier
}

type SaleForm = {
  assignmentId: string
  tierId: string
  quantity: string
  name: string
  phone: string
  email: string
  paymentMode: 'mobile_money' | 'card' | 'bank' | 'cash'
}

const SIDEBAR_ITEMS: { key: Section; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'events', label: 'Assigned Events' },
  { key: 'sell', label: 'Sell Tickets' },
  { key: 'sales', label: 'Sales' },
  { key: 'commissions', label: 'Commissions' },
  { key: 'wallet', label: 'Wallet' },
  { key: 'withdrawals', label: 'Withdrawals' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'profile', label: 'Profile' },
]

const SECTION_ICONS: Record<Section, React.ComponentType<{ size?: number }>> = {
  overview: BarChartIcon,
  events: CalendarIcon,
  sell: TicketIcon,
  sales: ClipboardIcon,
  commissions: DollarSignIcon,
  wallet: DollarSignIcon,
  withdrawals: ClipboardIcon,
  notifications: BellIcon,
  profile: UserIcon,
}

const STATUS_COLORS: Record<string, string> = {
  paid: '#22c55e',
  awaiting_payment: '#f59e0b',
  pending: '#f59e0b',
  available: '#60a5fa',
  processing: '#60a5fa',
  requested: '#f59e0b',
  rejected: '#ef4444',
  cancelled: '#ef4444',
  refunded: '#ef4444',
  active: '#22c55e',
  used: '#22c55e',
  confirmed: '#22c55e',
}

const AGENT_SECTION_PATHS: Record<Section, string> = {
  overview: '/agent-dashboard/overview',
  events: '/agent-dashboard/events',
  sell: '/agent-dashboard/sell',
  sales: '/agent-dashboard/sales',
  commissions: '/agent-dashboard/commissions',
  wallet: '/agent-dashboard/wallet',
  withdrawals: '/agent-dashboard/withdrawals',
  notifications: '/agent-dashboard/notifications',
  profile: '/agent-dashboard/profile',
}

function sectionFromPath(pathname: string): Section {
  const segments = pathname.split('/').filter(Boolean)
  const agentIndex = segments.findIndex(segment => segment === 'agent-dashboard')
  const sectionName = agentIndex >= 0 ? segments[agentIndex + 1] : undefined
  const section = (sectionName && AGENT_SECTION_PATHS[sectionName as Section]) ? sectionName as Section : 'overview'
  return section
}

function price(value: number) {
  return `${value.toLocaleString()} BIF`
}

function eventHasEnded(event?: Event | null) {
  if (!event?.date) return false
  const timestamp = new Date(`${event.date}T${event.end_time || event.time || '23:59:59'}`).getTime()
  return Number.isFinite(timestamp) && timestamp < Date.now()
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em]"
      style={{ background: `${color}20`, color }}>
      {label}
    </span>
  )
}

function StatCard({ label, value, sub, Icon }: { label: string; value: string; sub?: string; Icon: React.ComponentType<{ size?: number }> }) {
  return (
    <div className="dashboard-stat-card min-w-0 rounded-2xl p-3 sm:p-5" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
      <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-xl sm:mb-4 sm:h-9 sm:w-9" style={{ background: 'var(--muted)', color: 'var(--muted-foreground)', border: '1px solid var(--border)' }}>
        <Icon size={16} />
      </div>
      <p className="dashboard-stat-value mb-0.5 truncate text-xl font-bold leading-tight sm:text-2xl" style={{ fontFamily: 'Outfit, sans-serif', color: 'var(--foreground)' }}>{value}</p>
      <p className="dashboard-stat-label truncate text-[11px] font-medium sm:text-xs" style={{ color: 'var(--muted-foreground)' }}>{label}</p>
      {sub && <p className="dashboard-stat-sub mt-1 truncate text-[10px] sm:text-xs" style={{ color: 'var(--accent)' }}>{sub}</p>}
    </div>
  )
}

function RevenueChart({ data }: { data: Array<{ label: string; revenue: number }> }) {
  const max = Math.max(...data.map(item => item.revenue), 1)
  return (
    <div className="space-y-3">
      {data.map(item => (
        <div key={item.label} className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-3 text-xs">
          <span className="truncate font-semibold" style={{ color: 'var(--muted-foreground)' }}>{item.label}</span>
          <div className="h-2.5 overflow-hidden rounded-full" style={{ background: 'var(--muted)' }}>
            <div className="h-full rounded-full" style={{ width: `${item.revenue ? Math.max((item.revenue / max) * 100, 4) : 0}%`, background: 'var(--primary)' }} />
          </div>
          <span className="font-bold" style={{ color: item.revenue ? 'var(--foreground)' : 'var(--muted-foreground)' }}>{formatPrice(item.revenue)}</span>
        </div>
      ))}
    </div>
  )
}

function SalesChart({ data }: { data: Array<{ label: string; count: number }> }) {
  const max = Math.max(...data.map(item => item.count), 1)
  return (
    <div className="space-y-3">
      {data.map(item => (
        <div key={item.label} className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-3 text-xs">
          <span className="truncate font-semibold" style={{ color: 'var(--muted-foreground)' }}>{item.label}</span>
          <div className="h-2.5 overflow-hidden rounded-full" style={{ background: 'var(--muted)' }}>
            <div className="h-full rounded-full" style={{ width: `${item.count ? Math.max((item.count / max) * 100, 5) : 0}%`, background: 'var(--accent)' }} />
          </div>
          <span className="font-bold" style={{ color: item.count ? 'var(--foreground)' : 'var(--muted-foreground)' }}>{item.count}</span>
        </div>
      ))}
    </div>
  )
}

function EventPerformanceChart({ data }: { data: Array<{ title: string; revenue: number }> }) {
  const max = Math.max(...data.map(item => item.revenue), 1)
  return (
    <div className="space-y-4">
      {data.map(item => (
        <div key={item.title}>
          <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
            <span className="truncate font-medium">{item.title}</span>
            <span className="shrink-0 font-bold" style={{ color: 'var(--primary)' }}>{formatPrice(item.revenue)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full" style={{ background: 'var(--muted)' }}>
            <div className="h-full rounded-full" style={{ width: `${item.revenue ? Math.max((item.revenue / max) * 100, 5) : 0}%`, background: 'linear-gradient(90deg, var(--primary), var(--accent))' }} />
          </div>
        </div>
      ))}
      {!data.length && <p className="py-8 text-center text-xs" style={{ color: 'var(--muted-foreground)' }}>Create a sale to see event performance</p>}
    </div>
  )
}

export default function AgentDashboardPage({ navigate }: { navigate: (page: string, extra?: unknown) => void }) {
  const { user, profile, agentAssignments, agentInvitations, refreshProfile } = useAuth()
  const [tab, setTab] = useState<Section>(() => sectionFromPath(window.location.pathname))
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [utilityPopup, setUtilityPopup] = useState<'notifications' | 'profile' | null>(null)
  const [sales, setSales] = useState<AgentSale[]>([])
  const [commissions, setCommissions] = useState<CommissionRow[]>([])
  const [walletLedger, setWalletLedger] = useState<WalletEntry[]>([])
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([])
  const [notifications, setNotifications] = useState<AgentNotification[]>([])
  const [tickets, setTickets] = useState<AgentTicket[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [withdrawAmount, setWithdrawAmount] = useState('50000')
  const [paymentMethod, setPaymentMethod] = useState('mobile_money')
  const [form, setForm] = useState<SaleForm>({ assignmentId: '', tierId: '', quantity: '1', name: '', phone: '', email: '', paymentMode: 'mobile_money' })

  const activeAssignment = useMemo(
    () => agentAssignments.find(item => item.id === form.assignmentId) ?? agentAssignments[0],
    [agentAssignments, form.assignmentId],
  )

  const tiers = useMemo<TicketTier[]>(() => {
    if (!activeAssignment?.events?.ticket_tiers) return []
    return activeAssignment.events.ticket_tiers.filter((tier) => {
      if (activeAssignment.allow_all_ticket_types) return true
      return activeAssignment.ticket_tier_ids.includes(tier.id)
    })
  }, [activeAssignment])

  const selectedTier = useMemo(() => {
    if (!tiers.length) return null
    return tiers.find(tier => tier.id === form.tierId) ?? tiers[0]
  }, [form.tierId, tiers])

  useEffect(() => {
    if (!agentAssignments.length) return
    const assignmentId = form.assignmentId || agentAssignments[0].id
    setForm((current) => ({ ...current, assignmentId, tierId: current.tierId || (agentAssignments[0]?.events?.ticket_tiers?.[0]?.id ?? '') }))
  }, [agentAssignments, form.assignmentId])

  const loadAgentData = useCallback(async () => {
    if (!user) return
    setLoading(true)

    await supabase.rpc('release_matured_agent_commissions')

    const [salesResult, commissionResult, ledgerResult, withdrawalResult, notificationResult] = await Promise.all([
      supabase
        .from('agent_sales')
        .select('*, orders(id, total, status, holder_name, holder_email, holder_phone, created_at, event_id, events(title, date)), assignments:agent_assignments(id, commission_rate, event_id, events(title, date))')
        .eq('agent_user_id', user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('commissions')
        .select('*')
        .eq('agent_user_id', user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('commission_ledger')
        .select('*')
        .eq('agent_user_id', user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('agent_withdrawals')
        .select('*')
        .eq('agent_user_id', user.id)
        .order('requested_at', { ascending: false }),
      supabase
        .from('notifications')
        .select('id, type, title, body, read_at, created_at, event_id, recipient_scope')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50),
    ])

    if (salesResult.error) {
      setError(`Sales could not be loaded: ${salesResult.error.message}`)
    }

    const nextSales = (salesResult.data ?? []) as AgentSale[]
    const saleOrderIds = nextSales.map(sale => sale.order_id)
    const { data: ticketData } = saleOrderIds.length
      ? await supabase.from('tickets').select('*, events(title, date, time, venue, cover_image, category, status), ticket_tiers(name, price, description, ticket_type, extra_info, expires_at, group_size)').in('order_id', saleOrderIds).order('created_at', { ascending: false })
      : { data: [] }

    setSales(nextSales)
    setCommissions((commissionResult.data ?? []) as CommissionRow[])
    setWalletLedger((ledgerResult.data ?? []) as WalletEntry[])
    setWithdrawals((withdrawalResult.data ?? []) as WithdrawalRow[])
    setNotifications((notificationResult.data ?? []) as AgentNotification[])
    setTickets((ticketData ?? []) as AgentTicket[])
    setLoading(false)
  }, [user])

  useEffect(() => {
    const handlePopState = () => setTab(sectionFromPath(window.location.pathname))
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    const nextPath = AGENT_SECTION_PATHS[tab]
    if (window.location.pathname !== nextPath) window.history.pushState({}, '', nextPath)
  }, [tab])

  useEffect(() => { void loadAgentData() }, [loadAgentData])

  useEffect(() => {
    if (!user || !agentAssignments.length) return

    const channel = supabase.channel(`agent-dashboard:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_sales', filter: `agent_user_id=eq.${user.id}` }, () => { void loadAgentData() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commissions', filter: `agent_user_id=eq.${user.id}` }, () => { void loadAgentData() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commission_ledger', filter: `agent_user_id=eq.${user.id}` }, () => { void loadAgentData() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_withdrawals', filter: `agent_user_id=eq.${user.id}` }, () => { void loadAgentData() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, () => { void loadAgentData() })
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [loadAgentData, user])

  const respond = async (id: string, accept: boolean) => {
    setError('')
    setMessage('')
    const { error: responseError } = await supabase.rpc('respond_to_agent_invitation', { p_invitation_id: id, p_accept: accept })
    if (responseError) {
      setError(responseError.message)
      return
    }

    setMessage(accept ? 'Agent access activated.' : 'Invitation declined.')
    await refreshProfile()
  }

  const setField = (key: keyof SaleForm, value: string) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const createSale = async () => {
    setError('')
    setMessage('')
    if (!activeAssignment || !selectedTier || !user) {
      setError('Select an assigned event and a valid ticket tier.')
      return
    }
    if (eventHasEnded(activeAssignment.events)) {
      setError('This event has ended. Tickets can no longer be sold.')
      return
    }

    const quantity = Number(form.quantity)
    if (!Number.isInteger(quantity) || quantity < 1) {
      setError('Choose a valid quantity.')
      return
    }

    setSaving(true)

    const { data: orderId, error: saleError } = await supabase.rpc('create_agent_sale', {
      p_assignment_id: activeAssignment.id,
      p_ticket_tier_id: selectedTier.id,
      p_quantity: quantity,
      p_holder_name: form.name,
      p_holder_email: form.email,
      p_holder_phone: form.phone,
      p_payment_mode: form.paymentMode,
    })

    if (saleError || !orderId) {
      setError(saleError?.message ?? 'Could not create the sale.')
      setSaving(false)
      return
    }

    if (form.paymentMode === 'cash') {
      await loadAgentData()
      setSaving(false)
      setMessage('Cash sale saved. The organizer must confirm payment before tickets and commission are recorded.')
      return
    }

    const { data: completed, error: completionError } = await supabase.rpc('complete_test_ticket_order', {
      p_order_id: orderId,
      p_payment_method: form.paymentMode,
    })
    if (completionError || !completed?.[0]) {
      setError(completionError?.message ?? 'Test payment could not be completed.')
      setSaving(false)
      return
    }

    await loadAgentData()
    setSaving(false)
    const issuedTicket = completed[0]
    const event = activeAssignment.events as Event | undefined
    if (!event) {
      setError('The assigned event could not be loaded.')
      return
    }
    viewAgentTicket({
      id: issuedTicket.ticket_id,
      order_id: orderId,
      ticket_tier_id: selectedTier.id,
      event_id: activeAssignment.event_id,
      holder_name: issuedTicket.holder_name ?? form.name,
      holder_email: issuedTicket.holder_email ?? form.email,
      holder_phone: form.phone,
      qr_code: issuedTicket.qr_code,
      status: 'valid',
      created_at: new Date().toISOString(),
      events: event,
      ticket_tiers: selectedTier,
    })
  }

  const requestWithdrawal = async () => {
    setError('')
    setMessage('')
    const amount = Number(withdrawAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a valid withdrawal amount.')
      return
    }

    const { error: withdrawalError } = await supabase.rpc('request_agent_withdrawal', {
      p_amount: amount,
      p_payment_method: paymentMethod,
      p_payment_reference: paymentMethod === 'mobile_money' ? user?.phone ?? null : null,
    })

    if (withdrawalError) {
      setError(withdrawalError.message)
      return
    }

    setMessage('Withdrawal request submitted.')
    setWithdrawAmount('50000')
  }

  const totalRevenue = sales.reduce((sum, sale) => {
    const isRevenueSale = sale.status === 'paid' || sale.orders?.status === 'confirmed'
    return isRevenueSale ? sum + (sale.orders?.total ?? 0) : sum
  }, 0)
  const totalCommission = commissions.reduce((sum, row) => sum + row.amount, 0)
  const availableCommission = commissions.filter(item => item.status === 'available').reduce((sum, row) => sum + row.amount, 0)
  const pendingCommission = commissions.filter(item => item.status === 'pending').reduce((sum, row) => sum + row.amount, 0)
  const paidCommission = commissions.filter(item => item.status === 'paid').reduce((sum, row) => sum + row.amount, 0)

  const chartData = Array.from({ length: 7 }, (_, index) => {
    const date = new Date()
    date.setHours(0, 0, 0, 0)
    date.setDate(date.getDate() - (6 - index))
    const nextDate = new Date(date)
    nextDate.setDate(date.getDate() + 1)
    const daySales = sales.filter(sale => {
      const createdAt = new Date(sale.orders?.created_at ?? sale.created_at)
      return createdAt >= date && createdAt < nextDate
    })
    return {
      label: date.toLocaleDateString('en', { weekday: 'short' }),
      revenue: daySales.reduce((sum, sale) => {
        const isRevenueSale = sale.status === 'paid' || sale.orders?.status === 'confirmed'
        return isRevenueSale ? sum + (sale.orders?.total ?? 0) : sum
      }, 0),
      count: daySales.length,
    }
  })

  const eventPerformance = agentAssignments.map(assignment => ({
    title: assignment.events?.title ?? 'Assigned event',
    revenue: sales.filter(sale => sale.assignment_id === assignment.id && (sale.status === 'paid' || sale.orders?.status === 'confirmed')).reduce((sum, sale) => sum + (sale.orders?.total ?? 0), 0),
  })).sort((a, b) => b.revenue - a.revenue).slice(0, 5)

  const handleSignOut = async () => {
    await signOut()
    navigate('home')
  }

  const openNotification = async (notification: AgentNotification) => {
    if (!notification.read_at) {
      const readAt = new Date().toISOString()
      await supabase.from('notifications').update({ read_at: readAt }).eq('id', notification.id).eq('user_id', user?.id ?? '')
      setNotifications(current => current.map(item => item.id === notification.id ? { ...item, read_at: readAt } : item))
    }
    setUtilityPopup(null)
    setTab(notification.type === 'payment' ? 'commissions' : notification.type === 'team' ? 'events' : 'notifications')
  }

  const markAllNotificationsRead = async () => {
    if (!user) return
    const readAt = new Date().toISOString()
    const { error: readError } = await supabase.from('notifications').update({ read_at: readAt }).eq('user_id', user.id).is('read_at', null)
    if (readError) {
      setError(readError.message)
      return
    }
    setNotifications(current => current.map(item => ({ ...item, read_at: item.read_at ?? readAt })))
  }

  const viewAgentTicket = (ticket: AgentTicket) => {
    const event = ticket.events as Event | undefined
    if (!event) {
      setError('The ticket event could not be loaded.')
      return
    }
    const tier = ticket.ticket_tiers
    const openTicket = navigate as (page: string, extra?: unknown) => void
    openTicket('agent-ticket', {
      event,
      info: { name: ticket.holder_name ?? 'Guest', phone: ticket.holder_phone ?? '', email: ticket.holder_email ?? '' },
      ticket: ticket.qr_code,
      ticketStatus: ticket.status,
      ticketType: tier?.name ?? 'Ticket',
      ticketPrice: tier?.price ?? 0,
      purchasedAt: ticket.created_at,
      ticketExtraInfo: tier?.extra_info ?? '',
      ticketExpiry: tier?.expires_at ?? '',
      ticketGroupSize: tier?.group_size ?? 1,
    })
  }

  if (agentInvitations.length > 0) {
    return (
      <main className="min-h-screen px-4 py-10" style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
        <div className="mx-auto max-w-2xl">
          <button onClick={() => navigate('home')} className="mb-8 text-sm font-bold" style={{ color: 'var(--muted-foreground)' }}>Back to Tiketi</button>
          <h1 className="text-4xl font-black" style={{ fontFamily: 'Outfit, sans-serif' }}>Agent invitations</h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--muted-foreground)' }}>Choose whether to accept each assigned sales opportunity.</p>
          {agentInvitations.map(invitation => (
            <section key={invitation.id} className="mt-6 rounded-2xl border p-5" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--primary)' }}>Invitation</p>
              <h2 className="mt-3 text-2xl font-black">{invitation.organizers?.name ?? 'Organizer team'}</h2>
              {invitation.message && <p className="mt-3 text-sm leading-6" style={{ color: 'var(--muted-foreground)' }}>{invitation.message}</p>}
              <div className="mt-5 flex gap-3">
                <button onClick={() => void respond(invitation.id, true)} className="flex-1 rounded-xl px-4 py-3 font-bold" style={{ background: 'var(--primary)', color: '#000' }}>Accept</button>
                <button onClick={() => void respond(invitation.id, false)} className="rounded-xl px-4 py-3 font-bold" style={{ background: 'var(--muted)', color: 'var(--foreground)' }}>Decline</button>
              </div>
            </section>
          ))}
          {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
          {message && <p className="mt-4 text-sm" style={{ color: 'var(--primary)' }}>{message}</p>}
        </div>
      </main>
    )
  }

  if (!agentAssignments.length) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6" style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
        <div className="max-w-lg text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--primary)' }}>System status</p>
          <h1 className="mt-3 text-4xl font-black" style={{ fontFamily: 'Outfit, sans-serif' }}>No active agent assignments</h1>
          <p className="mt-3 text-sm leading-6" style={{ color: 'var(--muted-foreground)' }}>This account is active, but no organizer has assigned event inventory for sales yet.</p>
          <button onClick={() => navigate('home')} className="mt-6 rounded-xl px-5 py-3 text-sm font-bold" style={{ background: 'var(--primary)', color: '#000' }}>Back to Tiketi</button>
        </div>
      </main>
    )
  }

  return (
    <div className="agent-dashboard-shell flex min-h-screen" style={{ background: 'linear-gradient(135deg, #0b0c0c 0%, #11100e 48%, #0b0c0c 100%)', color: 'var(--foreground)' }}>
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 flex flex-col border-r transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
        style={{ background: 'rgba(12,13,13,0.96)', borderColor: 'rgba(255,255,255,0.09)' }}
      >
        <div className="border-b px-5 py-5" style={{ borderColor: 'rgba(255,255,255,0.09)' }}>
          <a href="/agent-dashboard" onClick={(event) => { event.preventDefault(); setTab('overview') }} className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl text-sm font-black" style={{ background: 'var(--primary)', color: '#17100a' }}>t</span>
            <span className="text-lg font-black tracking-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>agent studio</span>
          </a>
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--muted-foreground)' }}>Sales workspace</p>
          <p className="mt-1 truncate text-xs" style={{ color: 'rgba(255,255,255,0.72)' }}>{profile?.full_name || user?.email || 'Sales agent'}</p>
        </div>

        <nav className="flex-1 overflow-y-auto py-3">
          {SIDEBAR_ITEMS.map(({ key, label }) => {
            const Icon = SECTION_ICONS[key]
            const active = tab === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => { setTab(key); setSidebarOpen(false) }}
                className="flex w-full items-center gap-3 px-5 py-2.5 text-left text-sm font-medium transition-colors"
                style={{
                  background: active ? 'rgba(200,169,110,0.08)' : 'transparent',
                  color: active ? 'var(--foreground)' : 'rgba(255,255,255,0.45)',
                  borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
                }}
              >
                <Icon size={15} />
                {label}
              </button>
            )
          })}
        </nav>

        <div className="space-y-2 border-t p-4" style={{ borderColor: 'rgba(255,255,255,0.09)' }}>
          <button type="button" onClick={() => navigate('home')} className="flex w-full items-center justify-center gap-2 py-2 text-xs" style={{ color: 'var(--muted-foreground)' }}>
            <ArrowLeftIcon size={14} /> Back to site
          </button>
        </div>
      </aside>

      {sidebarOpen && <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      <main className="flex-1 min-w-0 lg:pl-64">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b px-5 py-3.5" style={{ background: 'rgba(11,12,12,0.88)', backdropFilter: 'blur(20px)', borderColor: 'rgba(255,255,255,0.09)' }}>
          <div className="flex items-center gap-3">
            <button className="rounded-lg p-1.5 lg:hidden" style={{ background: 'var(--muted)' }} onClick={() => setSidebarOpen(v => !v)}>
              <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor"><rect y="2" width="16" height="1.5" rx="1" /><rect y="7" width="16" height="1.5" rx="1" /><rect y="12" width="16" height="1.5" rx="1" /></svg>
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-black" style={{ fontFamily: 'Outfit, sans-serif' }}>{SIDEBAR_ITEMS.find(item => item.key === tab)?.label ?? 'Overview'}</h1>
                <span className="hidden rounded-md px-2 py-1 text-[10px] font-mono sm:inline" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--muted-foreground)' }}>agent dashboard</span>
              </div>
              <p className="mt-1 text-xs" style={{ color: 'var(--muted-foreground)' }}>Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, {profile?.full_name?.split(' ')[0] ?? 'Agent'} 👋</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {utilityPopup && <button className="fixed inset-0 z-10 cursor-default" aria-label="Close popup" onClick={() => setUtilityPopup(null)} />}
            <div className="relative z-20">
              <button onClick={() => setUtilityPopup(current => current === 'notifications' ? null : 'notifications')} aria-label="Notifications" title="Notifications" className="relative flex h-9 w-9 items-center justify-center rounded-xl border transition-colors" style={{ background: utilityPopup === 'notifications' ? 'rgba(200,169,110,0.14)' : 'transparent', borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.78)' }}>
                <BellIcon size={18} />
                {notifications.filter(notification => !notification.read_at).length > 0 && <span className="absolute -right-2 -top-2 min-w-5 rounded-full px-1 text-center text-[10px] font-black" style={{ background: 'var(--primary)', color: '#000' }}>{notifications.filter(notification => !notification.read_at).length > 99 ? '99+' : notifications.filter(notification => !notification.read_at).length}</span>}
              </button>
              {utilityPopup === 'notifications' && (
                <div className="absolute right-0 top-11 flex max-h-96 w-72 flex-col rounded-2xl border p-4 shadow-2xl" style={{ background: '#171918', borderColor: 'rgba(255,255,255,0.12)' }}>
                  <div className="flex items-center justify-between gap-3"><p className="text-sm font-bold">Agent notifications</p><BellIcon size={15} /></div>
                  <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                    {notifications.slice(0, 3).map(notification => <button key={notification.id} onClick={() => void openNotification(notification)} className="w-full rounded-xl px-3 py-2 text-left" style={{ background: notification.read_at ? 'rgba(255,255,255,0.04)' : 'rgba(200,169,110,0.12)' }}><p className="text-xs font-semibold">{notification.title}</p><p className="mt-1 text-[11px]" style={{ color: 'var(--muted-foreground)' }}>{notification.body}</p></button>)}
                    {!notifications.length && <p className="py-2 text-xs" style={{ color: 'var(--muted-foreground)' }}>No agent notifications yet.</p>}
                  </div>
                  <button onClick={() => { setUtilityPopup(null); setTab('notifications') }} className="mt-2 w-full shrink-0 rounded-lg py-2 text-xs font-bold" style={{ color: 'var(--primary)', background: 'rgba(249,112,21,0.08)' }}>View all notifications</button>
                </div>
              )}
            </div>
            <div className="relative z-20">
              <button onClick={() => setUtilityPopup(current => current === 'profile' ? null : 'profile')} aria-label="Profile menu" title="Profile menu" className="flex h-9 w-9 items-center justify-center rounded-xl border transition-colors" style={{ background: utilityPopup === 'profile' ? 'rgba(200,169,110,0.14)' : 'transparent', borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.78)' }}>
                {profile?.profile_image || profile?.avatar_url ? <img src={profile.profile_image || profile.avatar_url || ''} alt={profile.full_name || 'Agent'} className="h-7 w-7 rounded-full object-cover" /> : <UserIcon size={18} />}
              </button>
              {utilityPopup === 'profile' && (
                <div className="absolute right-0 top-11 w-56 rounded-2xl border p-2 shadow-2xl" style={{ background: '#171918', borderColor: 'rgba(255,255,255,0.12)' }}>
                  <p className="px-3 py-2 text-xs font-semibold" style={{ color: 'var(--muted-foreground)' }}>{profile?.full_name || user?.email || 'Agent'}</p>
                  <button onClick={() => { setUtilityPopup(null); setTab('profile') }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold hover:bg-white/5"><UserIcon size={14} /> Agent profile</button>
                  <button onClick={() => { setUtilityPopup(null); navigate('home') }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold hover:bg-white/5"><EyeIcon size={14} /> View site</button>
                  <button onClick={() => void handleSignOut()} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold hover:bg-white/5" style={{ color: '#f87171' }}><ArrowLeftIcon size={14} /> Sign out</button>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-5">
          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }} />
            </div>
          )}

          {!loading && (
            <>
              {tab === 'overview' && (
                <div className="space-y-6">
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <StatCard Icon={TicketIcon} label="Sales" value={sales.length.toLocaleString()} sub={`${totalRevenue > 0 ? price(totalRevenue) : 'No revenue yet'}`} />
                    <StatCard Icon={DollarSignIcon} label="Revenue" value={price(totalRevenue)} sub={`${sales.filter(item => item.status === 'paid').length} paid`} />
                    <StatCard Icon={DollarSignIcon} label="Pending commission" value={price(pendingCommission)} sub={`${commissions.filter(item => item.status === 'pending').length} entries`} />
                    <StatCard Icon={DollarSignIcon} label="Available" value={price(availableCommission)} sub={`${withdrawals.filter(item => item.status === 'paid').length} withdrawals`} />
                  </div>

                  <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                    <div className="rounded-2xl border p-5 lg:col-span-2" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                      <div className="mb-5 flex items-start justify-between gap-3">
                        <div><h2 className="font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>Revenue by period</h2><p className="mt-1 text-[10px]" style={{ color: 'var(--muted-foreground)' }}>Last seven days · paid agent sales</p></div>
                        <div className="text-right"><p className="text-sm font-bold" style={{ color: 'var(--primary)' }}>{price(totalRevenue)}</p><p className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{sales.filter(item => item.status === 'paid').length} paid sales</p></div>
                      </div>
                      <RevenueChart data={chartData} />
                    </div>
                    <div className="rounded-2xl border p-5" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                      <div className="mb-5 flex items-start justify-between gap-3">
                        <div><h2 className="font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>Sales by period</h2><p className="mt-1 text-[10px]" style={{ color: 'var(--muted-foreground)' }}>All sale statuses</p></div>
                        <p className="text-sm font-bold" style={{ color: 'var(--accent)' }}>{sales.length}</p>
                      </div>
                      <SalesChart data={chartData} />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
                    <div className="rounded-2xl border p-5 xl:col-span-3" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                      <div className="mb-5 flex items-center justify-between"><div><h2 className="font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>Event performance</h2><p className="mt-1 text-[10px]" style={{ color: 'var(--muted-foreground)' }}>Paid revenue by assigned event</p></div><BarChartIcon size={17} style={{ color: 'var(--accent)' }} /></div>
                      <EventPerformanceChart data={eventPerformance} />
                    </div>
                    <div className="rounded-2xl border p-5 xl:col-span-2" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                      <div className="mb-5 flex items-center justify-between"><div><h2 className="font-bold" style={{ fontFamily: 'Outfit, sans-serif' }}>Recent activity</h2><p className="mt-1 text-[10px]" style={{ color: 'var(--muted-foreground)' }}>Latest sales from Supabase</p></div><ClipboardIcon size={17} style={{ color: 'var(--primary)' }} /></div>
                      <div className="space-y-3">
                        {sales.slice(0, 5).map(sale => <div key={sale.id} className="flex items-center justify-between gap-3 border-b pb-3 last:border-0 last:pb-0" style={{ borderColor: 'var(--border)' }}><div className="min-w-0"><p className="truncate text-xs font-semibold">{sale.orders?.events?.title ?? 'Assigned event'}</p><p className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{sale.quantity} ticket{sale.quantity === 1 ? '' : 's'} · {new Date(sale.created_at).toLocaleDateString()}</p></div><Badge label={sale.status.replace('_', ' ')} color={STATUS_COLORS[sale.status] ?? '#888'} /></div>)}
                        {!sales.length && <p className="py-8 text-center text-xs" style={{ color: 'var(--muted-foreground)' }}>No activity yet</p>}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-5 lg:grid-cols-3">
                    <div className="rounded-2xl border p-5 lg:col-span-2" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                      <div className="mb-4 flex items-center justify-between">
                        <h2 className="text-lg font-bold">Active assignments</h2>
                        <button onClick={() => setTab('events')} className="text-xs font-bold" style={{ color: 'var(--primary)' }}>View all</button>
                      </div>
                      <div className="space-y-3">
                        {agentAssignments.map((assignment) => (
                          <div key={assignment.id} className="rounded-2xl border p-4" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'var(--border)' }}>
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-xl font-black">{assignment.events?.title ?? 'Assigned event'}</p>
                                <p className="mt-1 text-sm" style={{ color: 'var(--muted-foreground)' }}>{assignment.events?.date ? new Date(assignment.events.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Event date'}</p>
                              </div>
                              <Badge label={eventHasEnded(assignment.events) ? 'Ended' : `${assignment.commission_rate}% commission`} color={eventHasEnded(assignment.events) ? '#ef4444' : STATUS_COLORS.active || '#22c55e'} />
                            </div>
                            <div className="mt-4 flex items-center justify-between text-sm" style={{ color: 'var(--muted-foreground)' }}>
                              <span>Ticket access</span>
                              <strong style={{ color: 'var(--foreground)' }}>{assignment.allow_all_ticket_types ? 'All tiers' : `${assignment.ticket_tier_ids.length} tiers`}</strong>
                            </div>
                            <div className="mt-4 flex gap-2">
                              <button disabled={eventHasEnded(assignment.events)} onClick={() => { setTab('sell'); setForm((current) => ({ ...current, assignmentId: assignment.id, tierId: current.tierId || assignment.events?.ticket_tiers?.[0]?.id || '' })) }} className="flex-1 rounded-xl px-4 py-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50" style={{ background: eventHasEnded(assignment.events) ? 'var(--muted)' : 'var(--primary)', color: eventHasEnded(assignment.events) ? 'var(--muted-foreground)' : '#000' }}>{eventHasEnded(assignment.events) ? 'Event ended' : 'Sell tickets'}</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-2xl border p-5" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                      <h2 className="text-lg font-bold">Commission summary</h2>
                      <div className="mt-4 space-y-3">
                        <div className="rounded-xl border p-3" style={{ borderColor: 'var(--border)' }}>
                          <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Pending</p>
                          <strong className="mt-2 block text-2xl font-black" style={{ fontFamily: 'Outfit, sans-serif' }}>{price(pendingCommission)}</strong>
                        </div>
                        <div className="rounded-xl border p-3" style={{ borderColor: 'var(--border)' }}>
                          <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Available</p>
                          <strong className="mt-2 block text-2xl font-black" style={{ fontFamily: 'Outfit, sans-serif' }}>{price(availableCommission)}</strong>
                        </div>
                        <div className="rounded-xl border p-3" style={{ borderColor: 'var(--border)' }}>
                          <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Paid</p>
                          <strong className="mt-2 block text-2xl font-black" style={{ fontFamily: 'Outfit, sans-serif' }}>{price(paidCommission)}</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {tab === 'events' && (
                <div className="rounded-2xl border p-5" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <h2 className="text-lg font-bold">Assigned events</h2>
                    <span className="rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em]" style={{ background: 'rgba(255,122,24,0.12)', color: 'var(--primary)' }}>{agentAssignments.length} active</span>
                  </div>
                  <div className="space-y-3">
                    {agentAssignments.map((assignment) => (
                      <div key={assignment.id} className="rounded-2xl border p-4" style={{ borderColor: 'var(--border)' }}>
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xl font-black">{assignment.events?.title ?? 'Assigned event'}</p>
                            <p className="mt-1 text-sm" style={{ color: 'var(--muted-foreground)' }}>{assignment.events?.date ? new Date(assignment.events.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Event date'}</p>
                          </div>
                          <Badge label={eventHasEnded(assignment.events) ? 'Ended' : `${assignment.commission_rate}% commission`} color={eventHasEnded(assignment.events) ? '#ef4444' : STATUS_COLORS.active || '#22c55e'} />
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2 text-xs" style={{ color: 'var(--muted-foreground)' }}>
                          {assignment.events?.ticket_tiers?.slice(0, 4).map((tier) => (
                            <span key={tier.id} className="rounded-full border px-2 py-1" style={{ borderColor: 'var(--border)' }}>{tier.name} · {price(tier.price)}</span>
                          ))}
                        </div>
                        <button disabled={eventHasEnded(assignment.events)} onClick={() => { setTab('sell'); setForm((current) => ({ ...current, assignmentId: assignment.id })) }} className="mt-4 w-full rounded-xl px-4 py-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50" style={{ background: eventHasEnded(assignment.events) ? 'var(--muted)' : 'var(--primary)', color: eventHasEnded(assignment.events) ? 'var(--muted-foreground)' : '#000' }}>{eventHasEnded(assignment.events) ? 'Event ended' : 'Sell tickets'}</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {tab === 'sell' && (
                <section className="mx-auto max-w-5xl space-y-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div><p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--primary)' }}>Customer checkout</p><h2 className="mt-1 text-2xl font-black" style={{ fontFamily: 'Outfit, sans-serif' }}>Sell tickets</h2><p className="mt-1 text-sm" style={{ color: 'var(--muted-foreground)' }}>Choose an assigned event, collect customer details, and complete the sale.</p></div>
                    <Badge label="Live inventory" color={STATUS_COLORS.paid || '#22c55e'} />
                  </div>

                  <div className="overflow-hidden rounded-2xl border" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                    <div className="relative h-48 overflow-hidden sm:h-56" style={{ background: '#141414' }}>
                      {activeAssignment?.events?.cover_image && <img src={activeAssignment.events.cover_image} alt={activeAssignment.events.title} className="h-full w-full object-cover" />}
                      <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(0,0,0,.82), rgba(0,0,0,.18))' }} />
                      <div className="absolute inset-0 flex flex-col justify-end p-5 sm:p-6">
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--primary)' }}>Assigned event</p>
                        <h3 className="mt-2 max-w-xl text-2xl font-black text-white sm:text-3xl" style={{ fontFamily: 'Outfit, sans-serif' }}>{activeAssignment?.events?.title ?? 'Choose an event'}</h3>
                        <p className="mt-2 text-xs text-white/70">{activeAssignment?.events?.date ? new Date(activeAssignment.events.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Event date'} · {activeAssignment?.events?.venue ?? 'Venue'}</p>
                      </div>
                    </div>
                    <div className="border-b p-4 sm:p-5" style={{ borderColor: 'var(--border)' }}>
                      <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--muted-foreground)' }}>Event</label>
                      <select value={activeAssignment?.id ?? ''} onChange={(event) => { setField('assignmentId', event.target.value); setField('tierId', '') }} className="w-full rounded-xl border px-3 py-3 text-sm" style={{ background: 'var(--muted)', borderColor: 'var(--border)', color: 'var(--foreground)' }}>
                        {agentAssignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{assignment.events?.title ?? 'Assigned event'}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
                    <div className="space-y-5">
                      <div className="rounded-2xl border p-5" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                        <div className="mb-4 flex items-center justify-between"><div><h3 className="font-bold">Choose tickets</h3><p className="mt-1 text-xs" style={{ color: 'var(--muted-foreground)' }}>Select a tier available to your assignment.</p></div><TicketIcon size={18} style={{ color: 'var(--primary)' }} /></div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {tiers.map((tier) => {
                            const selected = selectedTier?.id === tier.id
                            return <button key={tier.id} type="button" data-selected={selected} onClick={() => setField('tierId', tier.id)} className="agent-glass-option relative rounded-2xl border p-4 text-left transition-[border-color,box-shadow,transform,background] hover:-translate-y-0.5" style={{ background: selected ? 'rgba(249,112,21,0.14)' : 'rgba(255,255,255,0.045)', borderColor: selected ? 'var(--primary)' : 'rgba(255,255,255,0.12)', boxShadow: selected ? '0 0 0 1px var(--primary), 0 14px 30px rgba(249,112,21,0.12)' : 'inset 0 1px 0 rgba(255,255,255,0.08)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}><span className="absolute right-4 top-4 flex h-4 w-4 items-center justify-center rounded-full border" style={{ borderColor: selected ? 'var(--primary)' : 'var(--muted-foreground)', background: selected ? 'var(--primary)' : 'transparent' }}>{selected && <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#000' }} />}</span><div className="flex items-start justify-between gap-3 pr-7"><span className="font-bold">{tier.name}</span><span className="text-sm font-black" style={{ color: 'var(--primary)' }}>{price(tier.price)}</span></div><p className="mt-2 text-xs" style={{ color: 'var(--muted-foreground)' }}>{Math.max(0, tier.quantity - tier.sold)} available · {tier.description || 'Official event ticket'}</p>{selected && <span className="mt-3 inline-flex rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-widest" style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--primary)' }}>Selected</span>}</button>
                          })}
                          {!tiers.length && <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>No ticket tiers are available for this assignment.</p>}
                        </div>
                        <div className="mt-4 flex items-center justify-between rounded-xl border p-3" style={{ borderColor: 'var(--border)' }}><span className="text-sm font-medium">Quantity</span><div className="flex items-center gap-3"><button type="button" onClick={() => setField('quantity', String(Math.max(1, Number(form.quantity) - 1)))} className="h-8 w-8 rounded-lg text-lg font-bold" style={{ background: 'var(--muted)' }}>-</button><span className="w-8 text-center font-bold">{form.quantity}</span><button type="button" onClick={() => setField('quantity', String(Math.max(1, Number(form.quantity) + 1)))} className="h-8 w-8 rounded-lg text-lg font-bold" style={{ background: 'var(--muted)' }}>+</button></div></div>
                      </div>

                      <div className="rounded-2xl border p-5" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                        <div className="mb-4"><h3 className="font-bold">Customer details</h3><p className="mt-1 text-xs" style={{ color: 'var(--muted-foreground)' }}>These details are saved with the order and printed on the ticket.</p></div>
                        <div className="grid gap-3 sm:grid-cols-2"><input value={form.name} onChange={(event) => setField('name', event.target.value)} placeholder="Full name" className="rounded-xl border px-3 py-3 text-sm sm:col-span-2" style={{ background: 'var(--muted)', borderColor: 'var(--border)', color: 'var(--foreground)' }} /><input value={form.phone} onChange={(event) => setField('phone', event.target.value)} placeholder="Phone number" type="tel" className="rounded-xl border px-3 py-3 text-sm" style={{ background: 'var(--muted)', borderColor: 'var(--border)', color: 'var(--foreground)' }} /><input value={form.email} onChange={(event) => setField('email', event.target.value)} placeholder="Email address" type="email" className="rounded-xl border px-3 py-3 text-sm" style={{ background: 'var(--muted)', borderColor: 'var(--border)', color: 'var(--foreground)' }} /></div>
                      </div>
                    </div>

                    <aside className="h-fit rounded-2xl border p-5 lg:sticky lg:top-24" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                      <h3 className="font-bold">Order summary</h3><div className="mt-4 flex items-center gap-3"><div className="h-12 w-12 overflow-hidden rounded-xl" style={{ background: 'var(--muted)' }}>{activeAssignment?.events?.cover_image && <img src={activeAssignment.events.cover_image} alt="" className="h-full w-full object-cover" />}</div><div className="min-w-0"><p className="truncate text-sm font-bold">{activeAssignment?.events?.title ?? 'Event'}</p><p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{selectedTier?.name ?? 'Ticket tier'} × {form.quantity}</p></div></div>
                      <div className="my-4 border-t" style={{ borderColor: 'var(--border)' }} />
                      <div className="flex items-center justify-between text-sm"><span style={{ color: 'var(--muted-foreground)' }}>Tickets</span><strong>{selectedTier ? price(selectedTier.price * Math.max(1, Number(form.quantity) || 1)) : '—'}</strong></div><div className="mt-2 flex items-center justify-between text-sm"><span style={{ color: 'var(--muted-foreground)' }}>Service fee</span><strong>{selectedTier ? price(Math.round(selectedTier.price * Math.max(1, Number(form.quantity) || 1) * .05)) : '—'}</strong></div><div className="mt-4 flex items-center justify-between border-t pt-4 text-base" style={{ borderColor: 'var(--border)' }}><span className="font-bold">Total</span><strong style={{ color: 'var(--primary)' }}>{selectedTier ? price(Math.round(selectedTier.price * Math.max(1, Number(form.quantity) || 1) * 1.05)) : '—'}</strong></div>
                      <div className="mt-5 space-y-2"><p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--muted-foreground)' }}>Payment method</p>{([['mobile_money', 'Mobile money', 'Payment prompt on the customer phone'], ['card', 'Card', 'Secure card checkout'], ['bank', 'Bank transfer', 'Secure payment provider checkout'], ['cash', 'Cash', 'Organizer confirmation required']] as const).map(([value, label, description]) => { const selected = form.paymentMode === value; return <button key={value} type="button" data-selected={selected} onClick={() => setForm((current) => ({ ...current, paymentMode: value }))} className="agent-glass-option flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-[border-color,box-shadow,background,transform] hover:-translate-y-0.5" style={{ background: selected ? 'rgba(249,112,21,0.14)' : 'rgba(255,255,255,0.045)', borderColor: selected ? 'var(--primary)' : 'rgba(255,255,255,0.12)', boxShadow: selected ? '0 0 0 1px var(--primary), 0 10px 24px rgba(249,112,21,0.1)' : 'inset 0 1px 0 rgba(255,255,255,0.08)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}><span className="flex h-4 w-4 items-center justify-center rounded-full border" style={{ borderColor: selected ? 'var(--primary)' : 'var(--muted-foreground)', background: selected ? 'var(--primary)' : 'transparent' }}>{selected && <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#000' }} />}</span><span><span className="block text-xs font-bold">{label}</span><span className="mt-0.5 block text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{description}</span></span></button> })}</div>
                      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}{message && <p className="mt-3 text-xs" style={{ color: 'var(--primary)' }}>{message}</p>}
                      {eventHasEnded(activeAssignment?.events) && <p className="mt-3 rounded-xl px-3 py-3 text-xs" style={{ background: 'rgba(239,68,68,.1)', color: '#f87171' }}>This event has ended. New ticket purchases are disabled.</p>}
                      <button type="button" onClick={() => void createSale()} disabled={saving || !selectedTier || !form.name || !form.phone || !form.email || eventHasEnded(activeAssignment?.events)} className="mt-4 w-full rounded-xl px-4 py-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50" style={{ background: eventHasEnded(activeAssignment?.events) ? 'var(--muted)' : 'var(--primary)', color: eventHasEnded(activeAssignment?.events) ? 'var(--muted-foreground)' : '#000' }}>{saving ? 'Processing...' : eventHasEnded(activeAssignment?.events) ? 'Event ended' : form.paymentMode === 'cash' ? 'Save for organizer confirmation' : 'Continue to secure payment'}</button>
                    </aside>
                  </div>
                </section>
              )}

              {tab === 'sales' && (
                <div className="rounded-2xl border overflow-hidden" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                  <div className="border-b px-5 py-4" style={{ borderColor: 'var(--border)' }}>
                    <h2 className="text-lg font-bold">Sales activity</h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ background: 'var(--muted)' }}>
                          {['Event', 'Customer', 'Amount', 'Status', 'Mode', 'Date', 'Ticket'].map((label) => (
                            <th key={label} className="px-4 py-3 text-left text-xs font-semibold" style={{ color: 'var(--muted-foreground)' }}>{label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sales.map((sale) => (
                          <tr key={sale.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                            <td className="px-4 py-3 font-medium">{sale.orders?.events?.title ?? sale.assignments?.events?.title ?? 'Assigned event'}</td>
                            <td className="px-4 py-3 text-xs" style={{ color: 'var(--muted-foreground)' }}>{sale.orders?.holder_name ?? 'Guest'}</td>
                            <td className="px-4 py-3 text-xs font-bold" style={{ color: 'var(--primary)' }}>{sale.orders ? price(sale.orders.total) : '—'}</td>
                            <td className="px-4 py-3"><Badge label={sale.status.replace('_', ' ')} color={STATUS_COLORS[sale.status] ?? '#888'} /></td>
                            <td className="px-4 py-3 text-xs capitalize">{sale.payment_mode}</td>
                            <td className="px-4 py-3 text-xs" style={{ color: 'var(--muted-foreground)' }}>{new Date(sale.created_at).toLocaleDateString()}</td>
                            <td className="px-4 py-3">{tickets.filter(ticket => ticket.order_id === sale.order_id).slice(0, 1).map(ticket => <button key={ticket.id} type="button" onClick={() => viewAgentTicket(ticket)} className="rounded-lg px-2.5 py-1.5 text-xs font-bold" style={{ background: 'var(--primary)', color: '#000' }}>View / share</button>)}{!tickets.some(ticket => ticket.order_id === sale.order_id) && <span className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>Pending</span>}</td>
                          </tr>
                        ))}
                        {!sales.length && (
                          <tr><td colSpan={7} className="px-4 py-12 text-center text-xs" style={{ color: 'var(--muted-foreground)' }}>No sales yet</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {tab === 'commissions' && (
                <div className="rounded-2xl border overflow-hidden" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                  <div className="border-b px-5 py-4" style={{ borderColor: 'var(--border)' }}>
                    <h2 className="text-lg font-bold">Commission ledger</h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ background: 'var(--muted)' }}>
                          {['Amount', 'Rate', 'Status', 'Created', 'Available at'].map((label) => (
                            <th key={label} className="px-4 py-3 text-left text-xs font-semibold" style={{ color: 'var(--muted-foreground)' }}>{label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {commissions.map((commission) => (
                          <tr key={commission.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                            <td className="px-4 py-3 text-xs font-bold" style={{ color: 'var(--primary)' }}>{price(commission.amount)}</td>
                            <td className="px-4 py-3 text-xs">{commission.rate}%</td>
                            <td className="px-4 py-3"><Badge label={commission.status} color={STATUS_COLORS[commission.status] ?? '#888'} /></td>
                            <td className="px-4 py-3 text-xs" style={{ color: 'var(--muted-foreground)' }}>{new Date(commission.created_at).toLocaleDateString()}</td>
                            <td className="px-4 py-3 text-xs" style={{ color: 'var(--muted-foreground)' }}>{new Date(commission.available_at).toLocaleDateString()}</td>
                          </tr>
                        ))}
                        {!commissions.length && (
                          <tr><td colSpan={5} className="px-4 py-12 text-center text-xs" style={{ color: 'var(--muted-foreground)' }}>No commission records yet</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {tab === 'wallet' && (
                <div className="space-y-5">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <StatCard Icon={DollarSignIcon} label="Available" value={price(availableCommission)} />
                    <StatCard Icon={DollarSignIcon} label="Pending" value={price(pendingCommission)} />
                    <StatCard Icon={DollarSignIcon} label="Paid" value={price(paidCommission)} />
                  </div>

                  <div className="rounded-2xl border overflow-hidden" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                    <div className="border-b px-5 py-4" style={{ borderColor: 'var(--border)' }}>
                      <h2 className="text-lg font-bold">Wallet ledger</h2>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr style={{ background: 'var(--muted)' }}>
                            {['Type', 'Amount', 'Date'].map((label) => (
                              <th key={label} className="px-4 py-3 text-left text-xs font-semibold" style={{ color: 'var(--muted-foreground)' }}>{label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {walletLedger.map((entry) => (
                            <tr key={entry.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                              <td className="px-4 py-3 text-xs font-medium capitalize">{entry.entry_type}</td>
                              <td className="px-4 py-3 text-xs font-bold" style={{ color: entry.amount > 0 ? 'var(--primary)' : '#f87171' }}>{entry.amount > 0 ? '+' : '-'}{price(Math.abs(entry.amount))}</td>
                              <td className="px-4 py-3 text-xs" style={{ color: 'var(--muted-foreground)' }}>{new Date(entry.created_at).toLocaleDateString()}</td>
                            </tr>
                          ))}
                          {!walletLedger.length && (
                            <tr><td colSpan={3} className="px-4 py-12 text-center text-xs" style={{ color: 'var(--muted-foreground)' }}>No wallet activity yet</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {tab === 'withdrawals' && (
                <div className="rounded-2xl border p-5" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <h2 className="text-lg font-bold">Withdrawals</h2>
                    <Badge label="Request" color={STATUS_COLORS.requested || '#f59e0b'} />
                  </div>

                  <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                    <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--border)' }}>
                      <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--muted-foreground)' }}>Amount</label>
                      <input value={withdrawAmount} onChange={(event) => setWithdrawAmount(event.target.value)} className="w-full rounded-xl border px-3 py-3 text-sm" style={{ background: 'var(--muted)', borderColor: 'var(--border)', color: 'var(--foreground)' }} />

                      <label className="mt-4 mb-2 block text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--muted-foreground)' }}>Payment method</label>
                      <div className="grid grid-cols-2 gap-2">
                        {['mobile_money', 'bank'].map((method) => (
                          <button key={method} type="button" onClick={() => setPaymentMethod(method)} className="rounded-xl px-3 py-3 text-sm font-bold capitalize" style={{ background: paymentMethod === method ? 'var(--primary)' : 'var(--muted)', color: paymentMethod === method ? '#000' : 'var(--foreground)' }}>{method.replace('_', ' ')}</button>
                        ))}
                      </div>

                      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
                      {message && <p className="mt-4 text-sm" style={{ color: 'var(--primary)' }}>{message}</p>}
                      <button type="button" onClick={() => void requestWithdrawal()} className="mt-4 w-full rounded-xl px-4 py-3 text-sm font-bold" style={{ background: 'var(--primary)', color: '#000' }}>Request withdrawal</button>
                    </div>

                    <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--border)' }}>
                      <p className="text-sm font-bold">Withdrawal status</p>
                      <div className="mt-4 space-y-3 text-sm" style={{ color: 'var(--muted-foreground)' }}>
                        {withdrawals.map((row) => (
                          <div key={row.id} className="flex items-center justify-between gap-3 border-b pb-2 last:border-b-0" style={{ borderColor: 'var(--border)' }}>
                            <span className="capitalize">{row.status}</span>
                            <div className="text-right">
                              <strong style={{ color: 'var(--foreground)' }}>{price(row.amount)}</strong>
                              <div className="mt-1 text-[10px] uppercase tracking-[0.12em]">{row.payment_method}</div>
                            </div>
                          </div>
                        ))}
                        {!withdrawals.length && <p className="text-xs">No withdrawal requests yet.</p>}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {tab === 'notifications' && (
                <div className="rounded-2xl border p-5" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                  <div className="flex items-center justify-between gap-3">
                    <div><p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--primary)' }}>Sales workspace signal</p><h2 className="mt-1 text-2xl font-black" style={{ fontFamily: 'Outfit, sans-serif' }}>Agent notifications</h2></div>
                    {notifications.some(notification => !notification.read_at) && <button type="button" onClick={() => void markAllNotificationsRead()} className="rounded-xl border px-3 py-2 text-xs font-bold" style={{ borderColor: 'rgba(249,112,21,0.35)', color: 'var(--primary)', background: 'rgba(249,112,21,0.08)' }}>Mark all read</button>}
                  </div>
                  <div className="mt-4 space-y-3">
                    {notifications.map((notification) => (
                      <button key={notification.id} type="button" onClick={() => void openNotification(notification)} className="w-full rounded-2xl border p-4 text-left" style={{ borderColor: 'var(--border)', background: notification.read_at ? 'transparent' : 'rgba(249,112,21,0.055)' }}>
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-bold">{notification.title}</p>
                          {!notification.read_at && <span className="h-2 w-2 rounded-full" style={{ background: 'var(--primary)' }} />}
                        </div>
                        <p className="mt-2 text-sm" style={{ color: 'var(--muted-foreground)' }}>{notification.body}</p>
                        <p className="mt-2 text-[10px] uppercase tracking-[0.12em]" style={{ color: 'var(--muted-foreground)' }}>{new Date(notification.created_at).toLocaleString()}</p>
                      </button>
                    ))}
                    {!notifications.length && <p className="py-8 text-center text-xs" style={{ color: 'var(--muted-foreground)' }}>No agent notifications yet.</p>}
                  </div>
                </div>
              )}

              {tab === 'profile' && (
                <div className="rounded-2xl border p-5" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                  <h2 className="text-lg font-bold">Profile</h2>
                  <div className="mt-4 space-y-4">
                    <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--border)' }}>
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--muted-foreground)' }}>Name</p>
                      <p className="mt-2 text-xl font-black">{profile?.full_name ?? 'Agent User'}</p>
                    </div>
                    <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--border)' }}>
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--muted-foreground)' }}>Email</p>
                      <p className="mt-2 text-xl font-black">{user?.email ?? 'agent@tiketi.app'}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => navigate('home')} className="flex-1 rounded-xl px-4 py-3 text-sm font-bold" style={{ background: 'var(--muted)', color: 'var(--foreground)' }}>Back to Tiketi</button>
                      <button onClick={() => navigate('auth-customer')} className="flex-1 rounded-xl px-4 py-3 text-sm font-bold" style={{ background: 'var(--primary)', color: '#000' }}>Edit profile</button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}
