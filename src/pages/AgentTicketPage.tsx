import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { ArrowLeftIcon, BarChartIcon, BellIcon, CalendarIcon, ClipboardIcon, DownloadIcon, ShareIcon, TicketIcon, UserIcon } from '../components/Icon'

type AgentTicketData = {
  event: Record<string, any>
  info: { name: string; phone: string; email: string }
  ticket?: string | null
  ticketStatus?: 'valid' | 'used' | 'cancelled'
  ticketType?: string
  ticketPrice?: number
  purchasedAt?: string
  ticketExtraInfo?: string
  ticketExpiry?: string
  ticketGroupSize?: number
}

type Props = { data: AgentTicketData; navigate: (page: string, extra?: unknown) => void }

async function imageDataUrl(url: string) {
  try {
    const response = await fetch(url)
    const blob = await response.blob()
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

function eventHasEnded(date: string, time: string, endTime?: string | null) {
  const timestamp = new Date(`${date}T${endTime || time || '23:59:59'}`).getTime()
  return Number.isFinite(timestamp) && timestamp < Date.now()
}

export default function AgentTicketPage({ data, navigate }: Props) {
  const { user, profile } = useAuth()
  const [message, setMessage] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const event = data.event
  const title = event.title ?? event.name ?? 'Event ticket'
  const ticketCode = data.ticket ?? ''
  const image = event.cover_image ?? event.image ?? ''
  const date = (event.date ?? '') as string
  const time = ((event.time as string | undefined)?.slice(0, 5)) ?? ''
  const venue = (event.venue ?? '') as string
  const ticketType = data.ticketType ?? 'REGULAR'
  const ticketPrice = data.ticketPrice ?? 0
  const purchasedAt = data.purchasedAt ? new Date(data.purchasedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—'
  const ticketExtraInfo = data.ticketExtraInfo?.trim() || ''
  const ticketExpiry = data.ticketExpiry ? new Date(`${data.ticketExpiry}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
  const ticketGroupSize = data.ticketGroupSize && data.ticketGroupSize > 1 ? data.ticketGroupSize : null
  const status = event.status === 'cancelled' || data.ticketStatus === 'cancelled' ? 'CANCELLED' : data.ticketStatus === 'used' ? 'USED' : eventHasEnded(date, time, event.end_time) ? 'EXPIRED' : 'VALID'

  const createPdf = async () => {
    const { jsPDF } = await import('jspdf')
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [280, 140] })
    const cover = image ? await imageDataUrl(image) : null
    const qr = ticketCode ? await imageDataUrl(`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(ticketCode)}&size=420x420&format=png`) : null
    pdf.setFillColor(10, 10, 10)
    pdf.rect(0, 0, 280, 140, 'F')
    if (cover) {
      pdf.addImage(cover, 'JPEG', 0, 0, 280, 140)
      pdf.setFillColor(5, 5, 5)
      pdf.setGState(new (pdf.GState as any)({ opacity: 0.28 }))
      pdf.rect(0, 0, 280, 140, 'F')
      pdf.setGState(new (pdf.GState as any)({ opacity: 1 }))
    }
    pdf.setFillColor(249, 112, 21)
    pdf.rect(0, 0, 18, 140, 'F')
    pdf.setFillColor(250, 250, 250)
    pdf.roundedRect(97, 28, 177, 90, 4, 4, 'F')
    pdf.setTextColor(25, 25, 25)
    pdf.setFontSize(12)
    pdf.text(title.slice(0, 38), 103, 41)
    pdf.setTextColor(70, 70, 70)
    pdf.setFontSize(6)
    pdf.text('DATE', 103, 48); pdf.text('TIME', 137, 48); pdf.text('TICKET TYPE', 163, 48)
    pdf.setTextColor(25, 25, 25)
    pdf.setFontSize(7)
    pdf.setTextColor(249, 112, 21)
    pdf.setFontSize(8)
    pdf.text(ticketType.slice(0, 15), 163, 54)
    pdf.setTextColor(25, 25, 25)
    pdf.setFontSize(7)
    pdf.text(date || '—', 103, 54); pdf.text(time || '—', 137, 54)
    pdf.setTextColor(100, 100, 100)
    pdf.setFontSize(6)
    pdf.text('VENUE', 103, 62)
    pdf.setTextColor(25, 25, 25)
    pdf.setFontSize(7)
    pdf.text(venue.slice(0, 42) || '—', 103, 68)
    pdf.setDrawColor(220, 220, 220)
    pdf.line(103, 72, 226, 72)
    pdf.setTextColor(100, 100, 100)
    pdf.setFontSize(6)
    pdf.text('TICKET HOLDER', 103, 79)
    pdf.setTextColor(25, 25, 25)
    pdf.setFontSize(8)
    pdf.text((data.info.name || 'Guest').slice(0, 24), 103, 85)
    pdf.setTextColor(100, 100, 100)
    pdf.setFontSize(6)
    pdf.text((data.info.phone || data.info.email || 'Customer details').slice(0, 28), 103, 91)
    pdf.text('PRICE', 103, 99)
    pdf.setTextColor(25, 25, 25)
    pdf.setFontSize(7)
    pdf.text(`${ticketPrice.toLocaleString()} BIF`, 103, 105)
    pdf.setTextColor(100, 100, 100)
    pdf.text('PURCHASED', 145, 99)
    pdf.setTextColor(25, 25, 25)
    pdf.text(purchasedAt.slice(0, 20), 145, 105)
    let metadataY = 114
    if (ticketGroupSize) { pdf.text(`GROUP ${ticketGroupSize}`, 103, metadataY); metadataY += 5 }
    if (ticketExpiry) { pdf.text(`EXPIRES ${ticketExpiry}`, 145, 114) }
    if (ticketExtraInfo) { pdf.text(`INFO: ${ticketExtraInfo.slice(0, 46)}`, 103, metadataY) }
    if (qr) {
      pdf.addImage(qr, 'PNG', 238, 46, 29, 29)
      pdf.setTextColor(45, 45, 45)
      pdf.setFontSize(5)
      pdf.text(ticketCode.slice(0, 22) || 'Unavailable', 238, 82)
    }
    pdf.setTextColor(130, 130, 130)
    pdf.setFontSize(5)
    pdf.text('Powered by Tiketi', 244, 114)
    return pdf
  }

  const downloadTicket = async () => {
    const pdf = await createPdf()
    pdf.save(`${String(title).replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-ticket.pdf`)
    setMessage('Ticket PDF downloaded.')
  }

  const copyTicket = async () => {
    await navigator.clipboard?.writeText(`${title}\nTicket: ${ticketCode}\nCustomer: ${data.info.name}`)
    setMessage('Ticket details copied.')
  }

  const shareTicket = async () => {
    const text = `${title}\nCustomer: ${data.info.name}\nTicket: ${ticketCode}`
    try {
      const pdf = await createPdf()
      const blob = pdf.output('blob')
      const file = new File([blob], `${String(title).replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-ticket.pdf`, { type: 'application/pdf' })
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) await navigator.share({ title: `${title} ticket`, text, files: [file] })
      else await navigator.clipboard?.writeText(text)
      setMessage(typeof navigator.share === 'function' ? 'PDF share options opened.' : 'Ticket details copied.')
    } catch {
      setMessage('Sharing was cancelled.')
    }
  }

  return (
    <div className="agent-dashboard-shell agent-ticket-page flex min-h-screen" style={{ background: 'linear-gradient(135deg, #0b0c0c 0%, #11100e 48%, #0b0c0c 100%)', color: 'var(--foreground)' }}>
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 flex flex-col border-r transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`} style={{ background: 'rgba(12,13,13,0.96)', borderColor: 'rgba(255,255,255,0.09)' }}>
        <div className="border-b px-5 py-5" style={{ borderColor: 'rgba(255,255,255,0.09)' }}>
          <button type="button" onClick={() => navigate('agent-dashboard')} className="flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-xl text-sm font-black" style={{ background: 'var(--primary)', color: '#17100a' }}>t</span><span className="text-lg font-black tracking-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>agent studio</span></button>
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--muted-foreground)' }}>Sales workspace</p>
          <p className="mt-1 truncate text-xs" style={{ color: 'rgba(255,255,255,0.72)' }}>{profile?.full_name || user?.email || 'Sales agent'}</p>
        </div>
        <nav className="flex-1 overflow-y-auto py-3">
          {[
            ['Overview', BarChartIcon], ['Assigned Events', CalendarIcon], ['Sell Tickets', TicketIcon],
            ['Sales', ClipboardIcon], ['Commissions', TicketIcon], ['Wallet', TicketIcon],
            ['Withdrawals', ClipboardIcon], ['Notifications', BellIcon], ['Profile', UserIcon],
          ].map(([label, Icon]) => (
            <button key={label as string} type="button" onClick={() => navigate('agent-dashboard')} className="flex w-full items-center gap-3 px-5 py-2.5 text-left text-sm font-medium transition-colors" style={{ background: label === 'Sales' ? 'rgba(200,169,110,0.08)' : 'transparent', color: label === 'Sales' ? 'var(--foreground)' : 'rgba(255,255,255,0.45)', borderLeft: label === 'Sales' ? '2px solid var(--accent)' : '2px solid transparent' }}>
              <Icon size={15} /> {label as string}
            </button>
          ))}
        </nav>
        <div className="border-t p-4" style={{ borderColor: 'rgba(255,255,255,0.09)' }}><button type="button" onClick={() => navigate('home')} className="flex w-full items-center justify-center gap-2 py-2 text-xs" style={{ color: 'var(--muted-foreground)' }}><ArrowLeftIcon size={14} /> Back to site</button></div>
      </aside>
      {sidebarOpen && <button type="button" aria-label="Close sidebar" className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setSidebarOpen(false)} />}
      <main className="min-h-screen min-w-0 flex-1 lg:pl-64">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b px-5 py-3.5" style={{ background: 'rgba(11,12,12,0.88)', backdropFilter: 'blur(20px)', borderColor: 'rgba(255,255,255,0.09)' }}>
          <div className="flex items-center gap-3"><button type="button" className="rounded-lg p-1.5 lg:hidden" style={{ background: 'var(--muted)' }} onClick={() => setSidebarOpen(value => !value)}><svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor"><rect y="2" width="16" height="1.5" rx="1" /><rect y="7" width="16" height="1.5" rx="1" /><rect y="12" width="16" height="1.5" rx="1" /></svg></button><div><div className="flex items-center gap-2"><h1 className="text-base font-black" style={{ fontFamily: 'Outfit, sans-serif' }}>Sales</h1><span className="hidden rounded-md px-2 py-1 text-[10px] font-mono sm:inline" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--muted-foreground)' }}>agent dashboard</span></div><p className="mt-1 text-xs" style={{ color: 'var(--muted-foreground)' }}>Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, {profile?.full_name?.split(' ')[0] ?? 'Agent'} 👋</p></div></div>
          <div className="flex items-center gap-2"><button type="button" aria-label="Notifications" title="Notifications" className="relative flex h-9 w-9 items-center justify-center rounded-xl border transition-colors" style={{ background: 'transparent', borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.78)' }}><BellIcon size={18} /></button><button type="button" aria-label="Profile menu" title="Profile menu" onClick={() => navigate('agent-dashboard')} className="flex h-9 w-9 items-center justify-center rounded-xl border transition-colors" style={{ background: 'transparent', borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.78)' }}>{profile?.profile_image || profile?.avatar_url ? <img src={profile.profile_image || profile.avatar_url || ''} alt={profile.full_name || 'Agent'} className="h-7 w-7 rounded-full object-cover" /> : <UserIcon size={18} />}</button></div>
        </header>
        <div className="min-h-screen px-4 pb-10 pt-6 sm:px-6">
        <div className="mx-auto max-w-3xl">
        <button onClick={() => navigate('agent-dashboard')} className="mb-6 inline-flex items-center gap-2 text-sm font-bold" style={{ color: 'var(--muted-foreground)' }}><ArrowLeftIcon size={15} /> Back to agent sales</button>
        <div className="mb-5 flex items-end justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--primary)' }}>Agent ticket management</p><h1 className="mt-1 text-3xl font-black" style={{ fontFamily: 'Outfit, sans-serif' }}>Issued ticket</h1><p className="mt-1 text-sm" style={{ color: 'var(--muted-foreground)' }}>Manage delivery for this customer from your sales workspace.</p></div><span className="rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest" style={{ background: status === 'VALID' ? 'rgba(34,197,94,.12)' : status === 'USED' ? 'rgba(96,165,250,.12)' : 'rgba(239,68,68,.12)', color: status === 'VALID' ? '#22c55e' : status === 'USED' ? '#60a5fa' : '#ef4444' }}>{status}</span></div>

        <section className="overflow-hidden rounded-2xl border" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
          <div className="relative h-48 overflow-hidden sm:h-64" style={{ background: '#111' }}>
            {image && <img src={image} alt={title} className="h-full w-full object-cover" />}
            <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(0,0,0,.8), rgba(0,0,0,.18))' }} />
            <div className="absolute inset-0 flex flex-col justify-end p-5 sm:p-7"><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/65">{event.organizers?.name ?? 'Tiketi event'}</p><h2 className="mt-2 max-w-2xl text-2xl font-black text-white sm:text-4xl" style={{ fontFamily: 'Outfit, sans-serif' }}>{title}</h2><p className="mt-2 text-sm text-white/75">{date}{time ? ` · ${time}` : ''} · {event.venue ?? 'Venue unavailable'}</p></div>
          </div>

          <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_14rem]">
            <div>
              <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border p-4" style={{ borderColor: 'var(--border)' }}><p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--muted-foreground)' }}>Customer</p><p className="mt-2 font-bold">{data.info.name || 'Guest'}</p><p className="mt-1 text-xs" style={{ color: 'var(--muted-foreground)' }}>{data.info.phone || data.info.email || 'No contact details'}</p></div><div className="rounded-xl border p-4" style={{ borderColor: 'var(--border)' }}><p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--muted-foreground)' }}>Ticket</p><p className="mt-2 font-bold">{data.ticketType ?? 'Ticket'}</p><p className="mt-1 text-xs" style={{ color: 'var(--muted-foreground)' }}>{data.ticketPrice ? `${data.ticketPrice.toLocaleString()} BIF` : 'Paid'}</p></div></div>
              <div className="mt-4 rounded-xl border p-4" style={{ borderColor: 'var(--border)' }}><p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--muted-foreground)' }}>Ticket code</p><p className="mt-2 break-all font-mono text-sm font-bold">{ticketCode || 'Unavailable'}</p><p className="mt-2 text-xs" style={{ color: 'var(--muted-foreground)' }}>Purchased {data.purchasedAt ? new Date(data.purchasedAt).toLocaleString() : 'just now'}</p></div>
              {message && <p className="mt-4 rounded-xl px-3 py-3 text-xs" style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}>{message}</p>}
              <div className="mt-5 grid gap-2 sm:grid-cols-3"><button onClick={() => void downloadTicket()} className="inline-flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-xs font-bold" style={{ background: 'var(--primary)', color: '#000' }}><DownloadIcon size={14} /> Download PDF</button><button onClick={() => void shareTicket()} className="inline-flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-xs font-bold" style={{ background: 'var(--muted)', color: 'var(--foreground)' }}><ShareIcon size={14} /> Share PDF</button><button onClick={() => void copyTicket()} className="inline-flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-xs font-bold" style={{ background: 'var(--muted)', color: 'var(--foreground)' }}><ClipboardIcon size={14} /> Copy details</button></div>
            </div>
            <div className="flex flex-col items-center justify-center rounded-2xl border p-4" style={{ borderColor: 'var(--border)', background: '#fff' }}><img src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(ticketCode)}&size=240x240&format=svg`} alt="Ticket QR code" className="h-44 w-44" /><p className="mt-3 text-center text-[10px] font-bold uppercase tracking-widest" style={{ color: '#333' }}>Scan to enter</p></div>
          </div>
        </section>
      </div>
        </div>
      </main>
    </div>
  )
}
