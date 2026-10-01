import { useMemo, useState } from 'react'
import { ArrowLeftIcon, CalendarIcon, CheckIcon, ClockIcon, DollarSignIcon, DownloadIcon, MapPinIcon, SearchIcon, TicketIcon, TrendingUpIcon, UsersIcon } from '../components/Icon'
import { formatPrice } from '../data/events'
import type { Event, Order, Ticket } from '../lib/types'
import { supabase } from '../lib/supabase'
import { sendOrderTicketEmails } from '../lib/ticketEmail'
import CheckInPanel from './CheckInPage'

type Props = {
  event: Event | null
  orders: Order[]
  tickets: Ticket[]
  agentOrderMeta: Record<string, { payment_mode: string }>
  canCheckIn: boolean
  canRecordTransaction: boolean
  onTicketsChanged: () => void
  onSaleRecorded: () => void
  loading: boolean
  onBack: () => void
  onEdit: (event: Event) => void
  navigate: (page: string, extra?: unknown) => void
}

function formatDate(value: string) {
  if (!value) return 'Date to be announced'
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function Detail({ Icon, label, value }: { Icon: React.FC<{ size?: number }>; label: string; value: string }) {
  return <div className="flex min-w-0 items-start gap-3 rounded-xl border p-4" style={{ background: 'rgba(255,255,255,0.025)', borderColor: 'var(--border)' }}>
    <span className="mt-0.5 text-[var(--primary)]"><Icon size={17} /></span>
    <span className="min-w-0"><small className="block text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--muted-foreground)' }}>{label}</small><b className="mt-1 block break-words text-sm">{value}</b></span>
  </div>
}

function TrafficChart({ orders }: { orders: Order[] }) {
  const points = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const day = new Date()
    day.setHours(0, 0, 0, 0)
    day.setDate(day.getDate() - (6 - index))
    const nextDay = new Date(day)
    nextDay.setDate(day.getDate() + 1)
    return {
      label: day.toLocaleDateString('en', { weekday: 'short' }),
      count: orders.filter(order => {
        const created = new Date(order.created_at)
        return created >= day && created < nextDay
      }).length,
    }
  }), [orders])
  const max = Math.max(...points.map(point => point.count), 1)

  return <div className="mt-4 grid h-36 grid-cols-7 items-end gap-2" aria-label="Ticket order activity for the past seven days">
    {points.map(point => <div key={point.label} className="flex h-full flex-col items-center justify-end gap-2">
      <span className="text-[10px] font-bold" style={{ color: 'var(--muted-foreground)' }}>{point.count}</span>
      <div className="flex w-full flex-1 items-end"><div className="w-full rounded-t-md" style={{ height: `${point.count ? Math.max(10, point.count / max * 100) : 4}%`, background: 'linear-gradient(180deg, var(--primary), rgba(249,112,21,.28))' }} /></div>
      <span className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{point.label}</span>
    </div>)}
  </div>
}

function TicketCircle({ capacity, reserved, scanned }: { capacity: number; reserved: number; scanned: number }) {
  const radius = 43
  const circumference = 2 * Math.PI * radius
  const safeCapacity = Math.max(1, capacity)
  const scannedLength = Math.min(scanned / safeCapacity, 1) * circumference
  const reservedLength = Math.min(Math.max(reserved - scanned, 0) / safeCapacity, 1) * circumference
  const reservedPercent = capacity > 0 ? Math.min(100, Math.round(reserved / capacity * 100)) : 0

  return <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-7">
    <div className="relative h-36 w-36 shrink-0">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" role="img" aria-label={`${reservedPercent}% of event ticket capacity reserved`}>
        <circle cx="50" cy="50" r={radius} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="10" />
        <circle cx="50" cy="50" r={radius} fill="none" stroke="#60a5fa" strokeWidth="10" strokeDasharray={`${scannedLength} ${circumference - scannedLength}`} strokeLinecap="round" />
        <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--primary)" strokeWidth="10" strokeDasharray={`${reservedLength} ${circumference - reservedLength}`} strokeDashoffset={-scannedLength} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center"><strong className="text-2xl font-black">{reservedPercent}%</strong><span className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>reserved</span></div>
    </div>
    <div className="grid w-full grid-cols-1 gap-3 text-sm">
      {[["Reserved tickets", reserved, 'var(--primary)'], ['Scanned tickets', scanned, '#60a5fa'], ['Available tickets', Math.max(0, capacity - reserved), 'rgba(255,255,255,.32)']].map(([label, value, color]) => <div key={String(label)} className="flex items-center justify-between gap-4"><span className="flex items-center gap-2 text-xs" style={{ color: 'var(--muted-foreground)' }}><i className="h-2.5 w-2.5 rounded-full" style={{ background: String(color) }} />{String(label)}</span><b>{Number(value).toLocaleString()}</b></div>)}
    </div>
  </div>
}

export default function OrganizerEventViewPage({ event, orders, tickets, agentOrderMeta, canCheckIn, canRecordTransaction, onTicketsChanged, onSaleRecorded, loading, onBack, onEdit, navigate }: Props) {
  const [checkInOpen, setCheckInOpen] = useState(false)
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerStatus, setCustomerStatus] = useState('all')
  const [selectedTierId, setSelectedTierId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [recipientEmail, setRecipientEmail] = useState('')
  const [recipientName, setRecipientName] = useState('')
  const [saleMessage, setSaleMessage] = useState('')
  const [saleError, setSaleError] = useState('')
  const [savingSale, setSavingSale] = useState(false)
  if (!event) {
    return <div className="mx-auto max-w-5xl py-14 text-center">
      <button onClick={onBack} className="mb-6 inline-flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--muted-foreground)' }}><ArrowLeftIcon size={16} /> Back to events</button>
      <p className="font-bold">{loading ? 'Loading event…' : 'Event not found'}</p>
      {!loading && <p className="mt-2 text-sm" style={{ color: 'var(--muted-foreground)' }}>This event may have been removed or you may not have access to it.</p>}
    </div>
  }

  const tiers = event.ticket_tiers ?? []
  const eventOrders = orders.filter(order => order.event_id === event.id)
  const confirmedOrders = eventOrders.filter(order => order.status === 'confirmed')
  const eventTickets = tickets.filter(ticket => ticket.event_id === event.id)
  const maxTickets = tiers.length
    ? tiers.reduce((sum, tier) => sum + tier.quantity * Math.max(1, tier.group_size ?? 1), 0)
    : event.capacity
  const ticketsReserved = eventTickets.filter(ticket => ticket.status !== 'cancelled').length
  const checkedIn = eventTickets.filter(ticket => ticket.checked_in_at || ticket.status === 'used').length
  const remaining = Math.max(0, maxTickets - ticketsReserved)
  const salesProgress = maxTickets > 0 ? Math.min(100, Math.round((ticketsReserved / maxTickets) * 100)) : 0
  const netInAppSales = confirmedOrders
    .filter(order => order.payment_method !== 'cash')
    .reduce((sum, order) => sum + order.total, 0)
  const cashSales = confirmedOrders
    .filter(order => order.payment_method === 'cash' || agentOrderMeta[order.id]?.payment_mode === 'cash')
    .reduce((sum, order) => sum + order.total, 0)
  const trafficOrders = eventOrders.filter(order => order.status === 'confirmed')
  const selectedTier = tiers.find(tier => tier.id === selectedTierId) ?? tiers[0]
  const saleQuantity = Number(quantity)
  const saleAmount = selectedTier && Number.isInteger(saleQuantity) && saleQuantity > 0 ? selectedTier.price * saleQuantity : 0
  const customers = (() => {
    const rows = eventOrders.filter(order => order.status === 'confirmed').map(order => {
      const orderTickets = eventTickets.filter(ticket => ticket.order_id === order.id)
      return {
      key: ((order as any).holder_email || (order as any).profiles?.email || order.id).toLowerCase(),
      name: (order as any).holder_name || orderTickets[0]?.holder_name || (order as any).profiles?.full_name || 'Customer',
      email: (order as any).holder_email || orderTickets[0]?.holder_email || (order as any).profiles?.email || '',
      phone: (order as any).holder_phone || orderTickets[0]?.holder_phone || '',
      ticketCount: orderTickets.length || order.order_items?.reduce((sum, item) => sum + item.quantity, 0) || 0,
      amount: order.total,
      createdAt: order.created_at,
      status: orderTickets.some(ticket => ticket.status === 'used' || ticket.checked_in_at) ? 'scanned' : 'valid',
    }})
    const grouped = new Map<string, (typeof rows)[number]>()
    rows.forEach(row => {
      const existing = grouped.get(row.key)
      if (existing) {
        existing.ticketCount += row.ticketCount
        existing.amount += row.amount
        if (row.status === 'scanned') existing.status = 'scanned'
        if (row.createdAt < existing.createdAt) existing.createdAt = row.createdAt
      } else grouped.set(row.key, { ...row })
    })
    return [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name))
  })()
  const filteredCustomers = customers.filter(customer => {
    const query = customerSearch.trim().toLowerCase()
    const matchesQuery = !query || `${customer.name} ${customer.email} ${customer.phone}`.toLowerCase().includes(query)
    const matchesStatus = customerStatus === 'all' || customer.status === customerStatus
    return matchesQuery && matchesStatus
  })

  const exportCustomers = () => {
    const csvRows = [
      ['Customer', 'Email', 'Phone', 'Tickets', 'Amount', 'Status', 'Purchase date'],
      ...filteredCustomers.map(customer => [customer.name, customer.email, customer.phone, customer.ticketCount, customer.amount, customer.status, new Date(customer.createdAt).toLocaleString()]),
    ]
    const csv = csvRows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n')
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    link.download = `${event.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-customers.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const recordTransaction = async () => {
    setSaleError('')
    setSaleMessage('')
    const count = Number(quantity)
    if (!selectedTier) { setSaleError('Choose a ticket type first.'); return }
    if (!Number.isInteger(count) || count < 1) { setSaleError('Enter a valid ticket quantity.'); return }
    if (!paymentMethod) { setSaleError('Select the payment method used.'); return }
    if (!recipientEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail.trim())) { setSaleError('Enter a valid email address for ticket delivery.'); return }
    setSavingSale(true)
    const { data: orderId, error } = await supabase.rpc('record_organizer_ticket_sale', {
      p_event_id: event.id,
      p_ticket_tier_id: selectedTier.id,
      p_quantity: count,
      p_payment_method: paymentMethod,
      p_holder_name: recipientName.trim() || null,
      p_holder_email: recipientEmail.trim().toLowerCase(),
      p_amount: saleAmount,
    })
    setSavingSale(false)
    if (error || !orderId) { setSaleError(error?.message ?? 'The transaction could not be recorded.'); return }
    const emailDelivery = await sendOrderTicketEmails(orderId)
    setSaleMessage(emailDelivery.failedCount
      ? `Transaction recorded and tickets issued. ${emailDelivery.sentCount} of ${emailDelivery.total} ticket emails sent. ${emailDelivery.reason ?? ''}`
      : `Transaction recorded. ${emailDelivery.sentCount} ticket${emailDelivery.sentCount === 1 ? '' : 's'} emailed successfully.`)
    setRecipientEmail('')
    setRecipientName('')
    setQuantity('1')
    onSaleRecorded()
  }
  const mapQuery = typeof event.venue_latitude === 'number' && typeof event.venue_longitude === 'number'
    ? `${event.venue_latitude},${event.venue_longitude}`
    : `${event.venue}, ${event.city}`
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`

  return <>
  <div className="mx-auto w-full max-w-6xl space-y-5 pb-10">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <button onClick={onBack} className="inline-flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-semibold transition hover:bg-white/5" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}><ArrowLeftIcon size={16} /> All events</button>
      <div className="flex flex-wrap gap-2">
        {event.status === 'published' && <button onClick={() => navigate('event-detail', event)} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition hover:bg-white/5" style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>Preview public page</button>}
        {canCheckIn && event.status === 'published' && <button type="button" onClick={() => setCheckInOpen(true)} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition hover:bg-white/5" style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}><CheckIcon size={15} /> Check in guests</button>}
        <button onClick={() => onEdit(event)} className="rounded-xl px-4 py-2.5 text-sm font-bold" style={{ background: 'var(--primary)', color: '#111' }}>Edit event</button>
      </div>
    </div>

    <section className="relative min-h-[260px] overflow-hidden rounded-3xl border" style={{ borderColor: 'var(--border)', background: event.cover_image ? `linear-gradient(90deg, rgba(7,8,8,.94) 0%, rgba(7,8,8,.72) 54%, rgba(7,8,8,.2) 100%), url(${event.cover_image}) center/cover` : 'linear-gradient(130deg, #262018, #121414 70%)' }}>
      <div className="flex min-h-[260px] flex-col justify-end p-6 sm:p-9">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider" style={{ color: event.status === 'published' ? '#86efac' : event.status === 'draft' ? '#ffd27a' : '#fca5a5', background: event.status === 'published' ? 'rgba(34,197,94,.13)' : event.status === 'draft' ? 'rgba(240,165,0,.14)' : 'rgba(239,68,68,.14)' }}>{event.status}</span>
          <span className="rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white/75" style={{ borderColor: 'rgba(255,255,255,.17)', background: 'rgba(0,0,0,.25)' }}>{event.category}</span>
        </div>
        <h1 className="max-w-3xl text-3xl font-black leading-tight tracking-tight text-white sm:text-5xl">{event.title}</h1>
        <p className="mt-3 flex items-center gap-2 text-sm text-white/75"><MapPinIcon size={15} />{event.venue}{event.city ? ` · ${event.city}` : ''}</p>
      </div>
    </section>

    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {[
        { label: 'Net In-App Sales', value: formatPrice(netInAppSales), note: 'Confirmed in-app orders', Icon: DollarSignIcon, color: 'var(--primary)' },
        { label: 'Cash Sales', value: formatPrice(cashSales), note: 'Confirmed cash orders', Icon: DollarSignIcon, color: '#86efac' },
      ].map(({ label, value, note, Icon, color }) => <div key={label} className="rounded-2xl border p-4 sm:p-5" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: `${color}18`, color }}><Icon size={17} /></div>
        <p className="mt-4 break-words text-lg font-black sm:text-2xl">{value}</p><p className="mt-1 text-xs font-semibold">{label}</p><p className="mt-1 text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{note}</p>
      </div>)}
    </section>

    <div className="grid gap-5 lg:grid-cols-2">
    <section className="rounded-2xl border p-5 sm:p-6" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
      <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.2em]" style={{ color: 'var(--primary)' }}>Traffic</p><h2 className="mt-1 text-lg font-bold">Ticket activity</h2></div><span className="rounded-lg px-2.5 py-1 text-[10px] font-bold" style={{ background: 'rgba(249,112,21,.1)', color: 'var(--primary)' }}>Last 7 days</span></div>
      <TrafficChart orders={trafficOrders} />
      <p className="mt-3 text-[10px]" style={{ color: 'var(--muted-foreground)' }}>Orders per day. Public page visit tracking is not currently collected.</p>
    </section>

    <section className="rounded-2xl border p-5 sm:p-6" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-[10px] font-black uppercase tracking-[.2em]" style={{ color: 'var(--primary)' }}>Attendance and inventory</p><h2 className="mt-1 text-lg font-bold">Tickets summary</h2></div>
      </div>
      <div className="mt-4"><TicketCircle capacity={maxTickets} reserved={ticketsReserved} scanned={checkedIn} /></div>
      <div className="mt-5 flex items-center justify-between border-t pt-4 text-xs" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}><span>Max tickets</span><b style={{ color: 'var(--foreground)' }}>{maxTickets.toLocaleString()}</b></div>
      <p className="mt-4 border-t pt-4 text-xs" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>{eventTickets.length.toLocaleString()} issued tickets · {remaining.toLocaleString()} remaining · {checkedIn.toLocaleString()} scanned</p>
    </section>
    </div>

    <section className="overflow-hidden rounded-2xl border" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
      <div className="flex flex-col gap-4 border-b p-5 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: 'var(--border)' }}>
        <div><p className="text-[10px] font-black uppercase tracking-[.2em]" style={{ color: 'var(--primary)' }}>Audience</p><h2 className="mt-1 text-lg font-bold">Event customers <span className="text-sm font-medium" style={{ color: 'var(--muted-foreground)' }}>({filteredCustomers.length})</span></h2></div>
        <button type="button" onClick={exportCustomers} disabled={!filteredCustomers.length} className="inline-flex items-center justify-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-40" style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}><DownloadIcon size={14} /> Export CSV</button>
      </div>
      <div className="flex flex-col gap-3 p-4 sm:flex-row">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border px-3" style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,.025)' }}><SearchIcon size={15} /><input value={customerSearch} onChange={input => setCustomerSearch(input.target.value)} placeholder="Search name, email, or phone" className="min-w-0 flex-1 bg-transparent py-2.5 text-xs outline-none" /></label>
        <select value={customerStatus} onChange={input => setCustomerStatus(input.target.value)} aria-label="Filter customers by ticket status" className="rounded-xl border px-3 py-2.5 text-xs" style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}><option value="all">All ticket status</option><option value="valid">Valid</option><option value="scanned">Scanned</option><option value="cancelled">Cancelled</option></select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-xs">
          <thead><tr style={{ background: 'rgba(255,255,255,.025)', color: 'var(--muted-foreground)' }}>{['Customer', 'Email', 'Phone', 'Tickets', 'Amount', 'Status', 'Purchased'].map(label => <th key={label} className="px-4 py-3 font-semibold">{label}</th>)}</tr></thead>
          <tbody>{filteredCustomers.map(customer => <tr key={customer.key} className="border-t" style={{ borderColor: 'var(--border)' }}><td className="px-4 py-3 font-semibold">{customer.name}</td><td className="px-4 py-3" style={{ color: 'var(--muted-foreground)' }}>{customer.email || '—'}</td><td className="px-4 py-3" style={{ color: 'var(--muted-foreground)' }}>{customer.phone || '—'}</td><td className="px-4 py-3">{customer.ticketCount}</td><td className="px-4 py-3 font-bold" style={{ color: 'var(--primary)' }}>{formatPrice(customer.amount)}</td><td className="px-4 py-3 capitalize">{customer.status}</td><td className="px-4 py-3" style={{ color: 'var(--muted-foreground)' }}>{new Date(customer.createdAt).toLocaleDateString()}</td></tr>)}
            {filteredCustomers.length === 0 && <tr><td colSpan={7} className="px-4 py-12 text-center" style={{ color: 'var(--muted-foreground)' }}>{customers.length ? 'No customers match these filters.' : 'No ticket holders for this event yet.'}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>

    {canRecordTransaction && <section className="rounded-2xl border p-5 sm:p-6" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
      <div className="mb-5"><p className="text-[10px] font-black uppercase tracking-[.2em]" style={{ color: 'var(--primary)' }}>Manual sale</p><h2 className="mt-1 text-lg font-bold">Record Transaction</h2><p className="mt-1 text-xs" style={{ color: 'var(--muted-foreground)' }}>Record a completed payment and issue tickets to the customer.</p></div>
      {saleError && <p role="alert" className="mb-4 rounded-xl border px-4 py-3 text-xs" style={{ borderColor: 'rgba(239,68,68,.3)', background: 'rgba(239,68,68,.08)', color: '#fca5a5' }}>{saleError}</p>}
      {saleMessage && <p role="status" className="mb-4 rounded-xl border px-4 py-3 text-xs" style={{ borderColor: 'rgba(34,197,94,.3)', background: 'rgba(34,197,94,.08)', color: '#86efac' }}>{saleMessage}</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs font-semibold" style={{ color: 'var(--muted-foreground)' }}>Ticket<select value={selectedTier?.id ?? ''} onChange={input => setSelectedTierId(input.target.value)} className="mt-1.5 w-full rounded-xl border px-3 py-3 text-sm" style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }}><option value="">Select ticket</option>{tiers.map(tier => <option key={tier.id} value={tier.id}>{tier.name} · {formatPrice(tier.price)}</option>)}</select></label>
        <label className="text-xs font-semibold" style={{ color: 'var(--muted-foreground)' }}>How Many Bought?<input type="number" min="1" max={selectedTier ? Math.max(1, selectedTier.quantity - selectedTier.sold) : undefined} value={quantity} onChange={input => setQuantity(input.target.value)} className="mt-1.5 w-full rounded-xl border px-3 py-3 text-sm" style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }} /></label>
        <label className="text-xs font-semibold" style={{ color: 'var(--muted-foreground)' }}>Method used<select value={paymentMethod} onChange={input => setPaymentMethod(input.target.value)} className="mt-1.5 w-full rounded-xl border px-3 py-3 text-sm" style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }}><option value="">Select method</option><option value="cash">Cash</option><option value="mobile_money">Mobile Money</option><option value="card">Card</option></select></label>
        <label className="text-xs font-semibold" style={{ color: 'var(--muted-foreground)' }}>Send ticket to (email)<input type="email" value={recipientEmail} onChange={input => setRecipientEmail(input.target.value)} placeholder="customer@example.com" className="mt-1.5 w-full rounded-xl border px-3 py-3 text-sm" style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }} /></label>
        <label className="text-xs font-semibold" style={{ color: 'var(--muted-foreground)' }}>Customer name<input value={recipientName} onChange={input => setRecipientName(input.target.value)} placeholder="Customer name (optional)" className="mt-1.5 w-full rounded-xl border px-3 py-3 text-sm" style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--foreground)' }} /></label>
        <div className="rounded-xl border px-3 py-3" style={{ background: 'var(--background)', borderColor: 'var(--border)' }}><p className="text-xs font-semibold" style={{ color: 'var(--muted-foreground)' }}>Amount</p><p className="mt-1 text-lg font-black" style={{ color: 'var(--primary)' }}>{formatPrice(saleAmount)}</p><p className="mt-0.5 text-[10px]" style={{ color: 'var(--muted-foreground)' }}>Calculated from ticket price × quantity</p></div>
      </div>
      <button type="button" onClick={() => void recordTransaction()} disabled={savingSale || !selectedTier || !paymentMethod || !recipientEmail.trim() || saleAmount <= 0} className="mt-5 rounded-xl px-5 py-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50" style={{ background: 'var(--primary)', color: '#111' }}>{savingSale ? 'Recording…' : 'Record transaction & issue ticket'}</button>
    </section>}

    <div className="grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
      <div className="space-y-5">
        <section className="rounded-2xl border p-5 sm:p-6" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
          <div className="mb-4 flex items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.2em]" style={{ color: 'var(--primary)' }}>Event overview</p><h2 className="mt-1 text-lg font-bold">Details</h2></div><TrendingUpIcon size={18} /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Detail Icon={CalendarIcon} label="Date" value={formatDate(event.date)} />
            <Detail Icon={ClockIcon} label="Time" value={`${event.time?.slice(0, 5) || 'TBA'}${event.end_time ? ` – ${event.end_time.slice(0, 5)}` : ''}`} />
            <Detail Icon={MapPinIcon} label="Venue" value={`${event.venue}${event.city ? `, ${event.city}` : ''}`} />
            <Detail Icon={UsersIcon} label="Capacity" value={`${event.capacity.toLocaleString()} guests`} />
          </div>
          {event.description && <div className="mt-5 border-t pt-5" style={{ borderColor: 'var(--border)' }}><h3 className="text-sm font-bold">About this event</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6" style={{ color: 'var(--muted-foreground)' }}>{event.description}</p></div>}
          {!!event.tags?.length && <div className="mt-5 flex flex-wrap gap-2">{event.tags.map(tag => <span key={tag} className="rounded-full border px-3 py-1 text-xs" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>#{tag}</span>)}</div>}
        </section>

        <section className="rounded-2xl border p-5 sm:p-6" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
          <div className="mb-4 flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-[.2em]" style={{ color: 'var(--primary)' }}>Inventory</p><h2 className="mt-1 text-lg font-bold">Ticket tiers</h2></div><span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{ticketsReserved.toLocaleString()} reserved</span></div>
          {tiers.length === 0 ? <p className="rounded-xl border p-5 text-sm" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>No ticket tiers have been added.</p> : <div className="space-y-3">{tiers.map(tier => {
            const tierRemaining = Math.max(0, tier.quantity - tier.sold)
            const tierPercent = tier.quantity ? Math.min(100, Math.round(tier.sold / tier.quantity * 100)) : 0
            return <div key={tier.id} className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,.02)' }}>
              <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold">{tier.name}</h3><p className="mt-1 text-xs" style={{ color: 'var(--muted-foreground)' }}>{tier.price === 0 ? 'Free' : formatPrice(tier.price)} · {tier.ticket_type === 'consumable' ? 'Consumable' : 'Non-consumable'}</p></div><span className="text-xs font-bold" style={{ color: 'var(--primary)' }}>{tier.sold.toLocaleString()} sold</span></div>
              {tier.description && <p className="mt-2 text-xs leading-5" style={{ color: 'var(--muted-foreground)' }}>{tier.description}</p>}
              {(tier.extra_info || (tier.group_size ?? 1) > 1 || tier.expires_at || tier.ticket_type === 'consumable') && <p className="mt-2 text-[11px]" style={{ color: 'var(--muted-foreground)' }}>{[tier.extra_info, tier.consumable_amount ? `Includes ${tier.consumable_amount} consumable(s)` : null, (tier.group_size ?? 1) > 1 ? `${tier.group_size} tickets per purchase` : null, tier.expires_at ? `Expires ${formatDate(tier.expires_at)}` : null].filter(Boolean).join(' · ')}</p>}
              <div className="mt-3 flex items-center gap-3"><div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,.08)' }}><div className="h-full rounded-full" style={{ width: `${tierPercent}%`, background: 'var(--primary)' }} /></div><span className="shrink-0 text-[10px]" style={{ color: 'var(--muted-foreground)' }}>{tierRemaining.toLocaleString()} left / {tier.quantity.toLocaleString()}</span></div>
            </div>
          })}</div>}
        </section>
      </div>

      <div className="space-y-5">
        <section className="rounded-2xl border p-5 sm:p-6" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
          <div className="mb-4"><p className="text-[10px] font-black uppercase tracking-[.2em]" style={{ color: 'var(--primary)' }}>Location</p><h2 className="mt-1 text-lg font-bold">Venue</h2></div>
          <div className="mb-4 flex items-start gap-3"><MapPinIcon size={17} /><div><p className="text-sm font-semibold">{event.venue}</p><p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{event.city}</p></div></div>
          <div className="overflow-hidden rounded-xl border" style={{ borderColor: 'var(--border)' }}><iframe title={`${event.venue} location map`} src={`https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&output=embed`} className="h-56 w-full border-0" loading="lazy" referrerPolicy="no-referrer-when-downgrade" /></div>
          <a href={mapUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs font-bold" style={{ color: 'var(--primary)' }}>Open in Google Maps ↗</a>
        </section>

        <section className="rounded-2xl border p-5 sm:p-6" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
          <p className="text-[10px] font-black uppercase tracking-[.2em]" style={{ color: 'var(--primary)' }}>Entry information</p><h2 className="mt-1 text-lg font-bold">Policies</h2>
          <div className="mt-4 space-y-3"><div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,.03)' }}><p className="text-xs font-bold">Refund policy</p><p className="mt-1 text-sm" style={{ color: 'var(--muted-foreground)' }}>{event.refund_policy || 'Tickets are non-refundable'}</p></div><div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,.03)' }}><p className="text-xs font-bold">Entry policy</p><p className="mt-1 text-sm" style={{ color: 'var(--muted-foreground)' }}>{event.entry_policy || 'Valid ID required at entry'}</p></div></div>
        </section>

        <section className="rounded-2xl border p-5 sm:p-6" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.2em]" style={{ color: 'var(--primary)' }}>Sales progress</p><h2 className="mt-1 text-lg font-bold">Capacity</h2></div><span className="text-sm font-black">{salesProgress}%</span></div>
          <div className="mt-4 h-2.5 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,.08)' }}><div className="h-full rounded-full" style={{ width: `${salesProgress}%`, background: 'linear-gradient(90deg, var(--primary), #ffc176)' }} /></div>
          <div className="mt-2 flex justify-between text-xs" style={{ color: 'var(--muted-foreground)' }}><span>{ticketsReserved.toLocaleString()} reserved</span><span>{maxTickets.toLocaleString()} total tickets</span></div>
          <p className="mt-4 border-t pt-4 text-xs" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>{eventOrders.length.toLocaleString()} total orders · {checkedIn.toLocaleString()} checked in</p>
        </section>
      </div>
    </div>
  </div>
  {checkInOpen && <CheckInPanel eventId={event.id} eventTitle={event.title} tickets={eventTickets} onTicketsChanged={onTicketsChanged} onClose={() => setCheckInOpen(false)} />}
  </>
}
