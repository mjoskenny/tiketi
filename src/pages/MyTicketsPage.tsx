import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Ticket } from '../lib/types'
import { DownloadIcon, ShareIcon, TicketIcon } from '../components/Icon'
import { FEATURES } from '../lib/features'

type Props = { navigate: (p: string) => void }
type Tab = 'upcoming' | 'past' | 'cancelled'
type RefundStatus = 'pending' | 'approved' | 'rejected' | 'processed'
type RefundRequest = { id: string; ticket_id: string | null; status: RefundStatus; reason: string; organizer_note: string | null; created_at: string; reviewed_at: string | null }

export default function MyTicketsPage({ navigate }: Props) {
  const { user, profile } = useAuth()
  const [tab, setTab] = useState<Tab>('upcoming')
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [retryToken, setRetryToken] = useState(0)
  const [showQR, setShowQR] = useState<string | null>(null)
  const [loadError, setLoadError] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [refundTicket, setRefundTicket] = useState<Ticket | null>(null)
  const [refundReason, setRefundReason] = useState('')
  const [refundBusy, setRefundBusy] = useState(false)
  const [refundRequests, setRefundRequests] = useState<Record<string, RefundRequest>>({})

  useEffect(() => {
    if (!user) return
    let active = true
    setLoading(true)
    setLoadError('')
    const loadTickets = async () => {
      try {
        // Fetch order IDs first, then tickets
        const { data: orders, error: ordersError } = await supabase
          .from('orders')
          .select('id')
          .eq('customer_id', user.id)
        if (ordersError) throw ordersError

        const orderIds = (orders ?? []).map((o: any) => o.id)

        if (orderIds.length === 0) {
          setTickets([])
          setRefundRequests({})
          setLoading(false)
          return
        }

        const { data, error: ticketsError } = await supabase
          .from('tickets')
          .select('*, events(title, date, time, venue, cover_image, category, tags, status), ticket_tiers(name, price, description, ticket_type, extra_info, expires_at, group_size)')
          .in('order_id', orderIds)
        if (ticketsError) throw ticketsError

        if (active) {
          const loadedTickets = (data ?? []) as Ticket[]
          setTickets(loadedTickets)
          const ticketIds = loadedTickets.map(ticket => ticket.id)
          if (ticketIds.length) {
            const { data: requests, error: refundsError } = await supabase
              .from('refund_requests')
              .select('id, ticket_id, status, reason, organizer_note, created_at, reviewed_at')
              .in('ticket_id', ticketIds)
              .order('created_at', { ascending: false })
            if (refundsError) throw refundsError
            const byTicket: Record<string, RefundRequest> = {}
            for (const request of (requests ?? []) as RefundRequest[]) {
              if (request.ticket_id && !byTicket[request.ticket_id]) byTicket[request.ticket_id] = request
            }
            setRefundRequests(byTicket)
          } else setRefundRequests({})
        }
      } catch (error) {
        if (active) {
          setTickets([])
          setLoadError(error instanceof Error ? error.message : 'Unable to load your tickets.')
        }
      } finally {
        if (active) setLoading(false)
      }
    }
    void loadTickets()
    const ordersChannel = supabase.channel(`my-tickets-orders:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `customer_id=eq.${user.id}` }, () => { void loadTickets() })
      .subscribe()
    const ticketsChannel = supabase.channel(`my-tickets-tickets:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => { void loadTickets() })
      .subscribe()
    const refundsChannel = supabase.channel(`my-tickets-refunds:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'refund_requests', filter: `customer_id=eq.${user.id}` }, () => { void loadTickets() })
      .subscribe()
    return () => {
      active = false
      void supabase.removeChannel(ordersChannel)
      void supabase.removeChannel(ticketsChannel)
      void supabase.removeChannel(refundsChannel)
    }
  }, [user?.id, retryToken])

  const now = Date.now()
  const eventHasEnded = (event: any) => {
    if (!event?.date) return false
    const eventTime = event.end_time ? `${event.date}T${event.end_time}` : `${event.date}T23:59:59`
    const timestamp = new Date(eventTime).getTime()
    return Number.isFinite(timestamp) && timestamp < now
  }
  const eventTime = (event: any) => {
    if (!event?.date) return 0
    const eventTimeValue = event.end_time ? `${event.date}T${event.end_time}` : `${event.date}T23:59:59`
    return new Date(eventTimeValue).getTime()
  }
  const sortTicketsByEventDate = (a: Ticket, b: Ticket) => {
    const aEvent = (a as any).events
    const bEvent = (b as any).events
    const aUpcoming = !!aEvent?.date && !eventHasEnded(aEvent)
    const bUpcoming = !!bEvent?.date && !eventHasEnded(bEvent)

    if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1
    return aUpcoming ? eventTime(aEvent) - eventTime(bEvent) : eventTime(bEvent) - eventTime(aEvent)
  }
  const eventIsCancelled = (event: any) => event?.status === 'cancelled'
  const upcoming = [...tickets].filter(t => t.status === 'valid' && !eventIsCancelled((t as any).events) && !eventHasEnded((t as any).events)).sort(sortTicketsByEventDate)
  const past = [...tickets].filter(t => !eventIsCancelled((t as any).events) && (t.status === 'used' || (t.status === 'valid' && eventHasEnded((t as any).events)))).sort(sortTicketsByEventDate)
  const cancelled = [...tickets].filter(t => t.status === 'cancelled' || eventIsCancelled((t as any).events)).sort(sortTicketsByEventDate)

  const tabTickets = { upcoming, past, cancelled }[tab]
  const ticketCounts = { upcoming: upcoming.length, past: past.length, cancelled: cancelled.length }

  const FALLBACK_IMG = 'https://images.unsplash.com/photo-1506157786151-b8491531f063?w=200&h=150&fit=crop&auto=format'

  const ticketEvent = (ticket: Ticket) => (ticket as any).events ?? {}
  const viewTicket = (ticket: Ticket) => {
    const tier = (ticket as any).ticket_tiers
    navigate('ticket', {
      event: ticketEvent(ticket),
      info: { name: ticket.holder_name ?? profile?.full_name ?? 'Guest', phone: ticket.holder_phone ?? profile?.phone ?? '', email: ticket.holder_email ?? profile?.email ?? user?.email ?? '' },
      ticket: ticket.qr_code,
      ticketStatus: ticket.status,
      ticketType: tier?.name ?? 'REGULAR',
      ticketPrice: tier?.price ?? 0,
      purchasedAt: ticket.created_at,
      ticketExtraInfo: tier?.extra_info ?? '',
      ticketExpiry: tier?.expires_at ?? '',
      ticketGroupSize: tier?.group_size ?? 1,
    })
  }
  const downloadTicket = (ticket: Ticket) => {
    const link = document.createElement('a')
    link.href = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(ticket.qr_code)}&size=512x512&format=svg`
    link.download = `${ticketEvent(ticket).title ?? 'tiketi-ticket'}-qr.svg`
    link.target = '_blank'
    link.rel = 'noopener'
    link.click()
  }
  const shareTicket = async (ticket: Ticket) => {
    const title = ticketEvent(ticket).title ?? 'Tiketi ticket'
    const text = `${title}\nTicket: ${ticket.qr_code}`
    try {
      if (navigator.share) await navigator.share({ title, text })
      else if (navigator.clipboard) await navigator.clipboard.writeText(text)
      setActionMessage(navigator.share ? 'Ticket share sheet opened.' : 'Ticket details copied.')
    } catch {
      setActionMessage('Ticket sharing was cancelled.')
    }
    window.setTimeout(() => setActionMessage(''), 2500)
  }

  const requestRefund = async () => {
    if (!refundTicket || !refundReason.trim()) return
    setRefundBusy(true)
    const { error } = await supabase.rpc('request_ticket_refund', { p_ticket_id: refundTicket.id, p_reason: refundReason.trim() })
    setRefundBusy(false)
    if (error) { setActionMessage(error.message); return }
    setRefundTicket(null)
    setRefundReason('')
    setRefundRequests(current => ({ ...current, [refundTicket.id]: { id: 'local', ticket_id: refundTicket.id, status: 'pending', reason: refundReason.trim(), organizer_note: null, created_at: new Date().toISOString(), reviewed_at: null } }))
    setActionMessage('Refund request sent to the organizer.')
  }

  return (
    <div className="min-h-screen pt-24 pb-16" style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
      <div className="max-w-2xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-black" style={{ fontFamily: 'Outfit, sans-serif' }}>My Tickets</h1>
            <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>{profile?.full_name ?? profile?.email}</p>
          </div>
          <button onClick={() => navigate('events')} className="px-4 py-2 rounded-xl text-sm font-bold" style={{ background: 'var(--primary)', color: '#000' }}>
            + Get Tickets
          </button>
        </div>
        {actionMessage && <p className="mb-4 rounded-xl px-4 py-3 text-center text-xs" style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}>{actionMessage}</p>}

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-xl mb-6" style={{ background: 'var(--muted)' }}>
          {(['upcoming', 'past', 'cancelled'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex-1 py-2.5 rounded-lg text-sm font-semibold capitalize transition-all"
              style={{ background: tab === t ? 'var(--card)' : 'transparent', color: tab === t ? '#fff' : 'var(--muted-foreground)' }}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
              {' '}
              <span className="text-xs opacity-50">({ticketCounts[t]})</span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => <div key={i} className="h-28 rounded-2xl animate-pulse" style={{ background: 'var(--muted)' }} />)}
          </div>
        ) : loadError ? (
          <div className="rounded-2xl px-5 py-8 text-center text-sm" style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', color: '#fca5a5' }}>
            <p>{loadError}</p>
            <button onClick={() => setRetryToken(current => current + 1)} className="mt-4 rounded-xl px-4 py-2 text-xs font-bold" style={{ background: 'var(--primary)', color: '#000' }}>Try again</button>
          </div>
        ) : tabTickets.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 mx-auto mb-5 rounded-2xl flex items-center justify-center" style={{ background: 'var(--muted)' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--muted-foreground)' }}>
                <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/>
                <path d="M13 5v2M13 17v2M13 11v2"/>
              </svg>
            </div>
            <p className="font-bold text-xl mb-2">No {tab} tickets</p>
            <p className="text-sm mb-5" style={{ color: 'var(--muted-foreground)' }}>
              {tab === 'upcoming' ? "You don't have any upcoming events. Browse and get your first ticket!" : tab === 'past' ? "No past events yet." : "No cancelled tickets."}
            </p>
            {tab === 'upcoming' && (
              <button onClick={() => navigate('events')} className="px-6 py-3 rounded-xl text-sm font-bold" style={{ background: 'var(--primary)', color: '#fff' }}>
                Browse Events
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {tabTickets.map((ticket) => {
              const ev = (ticket as any).events
              const tier = (ticket as any).ticket_tiers
              const eventCancelled = eventIsCancelled(ev)
              const eventEnded = eventHasEnded(ev)
              const displayStatus = eventCancelled || ticket.status === 'cancelled' ? 'CANCELLED' : ticket.status === 'used' ? 'USED' : eventEnded ? 'EXPIRED' : 'VALID'
              const canShowQr = ticket.status === 'valid' && !eventCancelled && !eventEnded
              const refund = refundRequests[ticket.id]
              return (
                <div key={ticket.id} className="rounded-2xl overflow-hidden" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                  <div className="flex gap-4 p-4">
                    <img src={ev?.cover_image || FALLBACK_IMG} alt={ev?.title ?? ''}
                      className="w-20 h-20 rounded-xl object-cover flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h3 className="font-bold leading-snug text-sm" style={{ fontFamily: 'Outfit, sans-serif' }}>{ev?.title ?? 'Unknown Event'}</h3>
                        <span className="flex-shrink-0 text-xs font-bold px-2.5 py-1 rounded-full"
                          style={{
                            background: displayStatus === 'VALID' ? 'rgba(200,255,87,0.12)' : displayStatus === 'CANCELLED' ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.06)',
                            color: displayStatus === 'VALID' ? 'var(--accent)' : displayStatus === 'CANCELLED' ? '#ef4444' : 'var(--muted-foreground)',
                          }}>
                          {displayStatus}
                        </span>
                      </div>
                      {ev && (
                        <p className="text-xs mb-1" style={{ color: 'var(--muted-foreground)' }}>
                          {new Date(ev.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · {ev.venue}
                        </p>
                      )}
                      <p className="text-xs font-bold" style={{ color: 'var(--primary)' }}>{tier?.name ?? 'TICKET'} · {ticket.holder_name ?? 'Guest'}</p>
                    </div>
                  </div>

                  {FEATURES.refunds && refund && <div className="mx-4 mb-3 rounded-xl px-3 py-2.5 text-xs" style={{ background: refund.status === 'rejected' ? 'rgba(239,68,68,0.1)' : refund.status === 'approved' ? 'rgba(34,197,94,0.1)' : 'rgba(249,112,21,0.1)', color: refund.status === 'rejected' ? '#fca5a5' : refund.status === 'approved' ? '#86efac' : 'var(--accent)', border: `1px solid ${refund.status === 'rejected' ? 'rgba(239,68,68,0.2)' : refund.status === 'approved' ? 'rgba(34,197,68,0.2)' : 'rgba(249,112,21,0.2)'}` }}>
                    <p className="font-bold">Refund request: {refund.status === 'pending' ? 'Under review' : refund.status === 'approved' ? 'Approved for processing' : refund.status === 'processed' ? 'Processed' : 'Declined'}</p>
                    {refund.organizer_note && <p className="mt-1">{refund.organizer_note}</p>}
                    {refund.status === 'approved' && <p className="mt-1 opacity-80">Tiketi support still needs to complete the payment-provider step.</p>}
                  </div>}

                  <div className="px-4 pb-4 flex items-center justify-between border-t pt-3" style={{ borderColor: 'var(--border)' }}>
                    <p className="text-xs font-mono" style={{ color: 'var(--muted-foreground)' }}>{ticket.qr_code.slice(0, 20)}…</p>
                    <div className="flex flex-wrap justify-end gap-2">
                      <button onClick={() => viewTicket(ticket)} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold" style={{ background: 'var(--primary)', color: '#000' }}><TicketIcon size={13} />View ticket</button>
                      {canShowQr && <button onClick={() => setShowQR(showQR === ticket.id ? null : ticket.id)} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold" style={{ background: showQR === ticket.id ? 'var(--primary)' : 'var(--muted)', color: showQR === ticket.id ? '#000' : 'rgba(255,255,255,0.7)' }}>{showQR === ticket.id ? 'Hide QR' : 'View QR'}</button>}
                      {FEATURES.refunds && ticket.status === 'valid' && !eventCancelled && !eventEnded && !refund && <button onClick={() => setRefundTicket(ticket)} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold" style={{ background: 'rgba(239,68,68,0.12)', color: '#fca5a5' }}>Request refund</button>}
                      <button onClick={() => downloadTicket(ticket)} aria-label="Download ticket QR" className="inline-flex items-center justify-center rounded-lg p-2" style={{ background: 'var(--muted)', color: 'var(--foreground)' }}><DownloadIcon size={14} /></button>
                      <button onClick={() => void shareTicket(ticket)} aria-label="Share ticket" className="inline-flex items-center justify-center rounded-lg p-2" style={{ background: 'var(--muted)', color: 'var(--foreground)' }}><ShareIcon size={14} /></button>
                    </div>
                  </div>

                  {showQR === ticket.id && (
                    <div className="flex flex-col items-center pb-5 gap-2">
                      <div className="w-40 h-40 rounded-2xl p-3" style={{ background: '#fff' }}>
                        <img
                          src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(ticket.qr_code)}&size=136x136`}
                          alt="QR Code"
                          className="w-full h-full"
                        />
                      </div>
                      <p className="w-full px-5 text-center text-xs font-mono break-all" style={{ color: 'var(--muted-foreground)' }}>{ticket.qr_code}</p>
                      <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Show this at the entrance</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
        {FEATURES.refunds && refundTicket && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="refund-title">
          <div className="w-full max-w-md rounded-2xl p-6" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            <h2 id="refund-title" className="text-xl font-bold">Request a refund</h2>
            <p className="mt-2 text-sm" style={{ color: 'var(--muted-foreground)' }}>The organizer will review this request. Your ticket remains valid until a decision is made.</p>
            <label className="mt-5 block text-sm font-semibold">Reason<textarea value={refundReason} onChange={event => setRefundReason(event.target.value)} rows={4} placeholder="Tell the organizer why you need a refund" className="mt-2 w-full rounded-xl px-3 py-3 text-sm outline-none" style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: 'var(--foreground)' }} /></label>
            <div className="mt-5 flex gap-3"><button onClick={() => { setRefundTicket(null); setRefundReason('') }} className="flex-1 rounded-xl py-3 text-sm font-semibold" style={{ background: 'var(--muted)', color: 'var(--foreground)' }}>Cancel</button><button onClick={() => void requestRefund()} disabled={refundBusy || !refundReason.trim()} className="flex-1 rounded-xl py-3 text-sm font-bold disabled:opacity-50" style={{ background: '#ef4444', color: '#fff' }}>{refundBusy ? 'Sending...' : 'Send request'}</button></div>
          </div>
        </div>}
      </div>
    </div>
  )
}
