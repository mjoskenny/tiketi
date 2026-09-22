import { useState } from 'react'
import { ArrowLeftIcon, CheckIcon, DownloadIcon, ShareIcon, TicketIcon } from '../components/Icon'

type TicketInfo = { name: string; phone: string; email: string }
type TicketData = { event: Record<string, unknown>; info: TicketInfo; tickets?: Array<{ qr_code: string; holder_name?: string | null; holder_email?: string | null; ticket_tier_id?: string; created_at?: string }>; ticket?: string | null; ticketStatus?: 'valid' | 'used' | 'cancelled'; ticketType?: string; ticketKind?: 'consumable' | 'non_consumable'; ticketPrice?: number; purchasedAt?: string; ticketExtraInfo?: string; ticketExpiry?: string; ticketGroupSize?: number }
type Props = { data: TicketData; navigate: (p: string) => void }

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

export default function DigitalTicketPage({ data, navigate }: Props) {
  const { event, info } = data
  const [exporting, setExporting] = useState(false)
  const [shareMessage, setShareMessage] = useState('')
  const title = (event.title ?? event.name ?? 'Event') as string
  const date = (event.date ?? '') as string
  const time = ((event.time as string | undefined)?.slice(0, 5)) ?? ''
  const venue = (event.venue ?? '') as string
  const image = (event.cover_image ?? event.image ?? '') as string
  const ticketNumber = data.ticket ?? ''
  const ticketType = data.ticketType ?? 'REGULAR'
  const ticketPrice = data.ticketPrice ?? 0
  const purchasedAt = data.purchasedAt ? new Date(data.purchasedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—'
  const ticketExtraInfo = data.ticketExtraInfo?.trim() || ''
  const ticketExpiry = data.ticketExpiry ? new Date(`${data.ticketExpiry}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
  const ticketGroupSize = data.ticketGroupSize && data.ticketGroupSize > 1 ? data.ticketGroupSize : null
  const status = event.status === 'cancelled' || data.ticketStatus === 'cancelled' ? 'CANCELLED' : data.ticketStatus === 'used' ? 'USED' : eventHasEnded(date, time, event.end_time) ? 'EXPIRED' : 'VALID'
  const statusColor = status === 'VALID' ? '#15803d' : '#b91c1c'

  const createPdf = async (ticketOverride?: { qr_code: string; holder_name?: string | null; holder_email?: string | null; created_at?: string }) => {
    const { jsPDF } = await import('jspdf')
    const pdfTicketNumber = ticketOverride?.qr_code ?? ticketNumber
    const pdfHolderName = ticketOverride?.holder_name ?? info.name
    const pdfPurchasedAt = ticketOverride?.created_at ? new Date(ticketOverride.created_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : purchasedAt
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [280, 140] })
    const cover = image ? await imageDataUrl(image) : null
    const qr = pdfTicketNumber ? await imageDataUrl(`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(pdfTicketNumber)}&size=420x420&format=png`) : null
    pdf.setFillColor(10, 10, 10)
    pdf.rect(0, 0, 280, 140, 'F')
    if (cover) {
      pdf.addImage(cover, 'JPEG', 0, 0, 280, 140)
      pdf.setFillColor(5, 5, 5)
      pdf.setGState(new pdf.GState({ opacity: 0.28 }))
      pdf.rect(0, 0, 280, 140, 'F')
      pdf.setGState(new pdf.GState({ opacity: 1 }))
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
    pdf.text((pdfHolderName || 'Guest').slice(0, 24), 103, 85)
    pdf.setTextColor(100, 100, 100)
    pdf.setFontSize(6)
    pdf.text((info.phone || info.email || 'Customer details').slice(0, 28), 103, 91)
    pdf.text('PRICE', 103, 99)
    pdf.setTextColor(25, 25, 25)
    pdf.setFontSize(7)
    pdf.text(`${ticketPrice.toLocaleString()} BIF`, 103, 105)
    pdf.setTextColor(100, 100, 100)
    pdf.text('PURCHASED', 145, 99)
    pdf.setTextColor(25, 25, 25)
    pdf.text(pdfPurchasedAt.slice(0, 20), 145, 105)
    pdf.setTextColor(100, 100, 100)
    pdf.setTextColor(100, 100, 100)
    let metadataY = 114
    if (ticketGroupSize) { pdf.text(`GROUP ${ticketGroupSize}`, 103, metadataY); metadataY += 5 }
    if (ticketExpiry) { pdf.text(`EXPIRES ${ticketExpiry}`, 145, 114); }
    if (ticketExtraInfo) { pdf.text(`INFO: ${ticketExtraInfo.slice(0, 46)}`, 103, metadataY); }
    if (qr) {
      pdf.addImage(qr, 'PNG', 238, 46, 29, 29)
      pdf.setTextColor(45, 45, 45)
      pdf.setFontSize(5)
      pdf.text(pdfTicketNumber.slice(0, 22) || 'Unavailable', 238, 82)
    }
    pdf.setTextColor(130, 130, 130)
    pdf.setFontSize(5)
    pdf.text('Powered by Tiketi', 244, 114)
    return pdf
  }

  const downloadPdf = async () => {
    setExporting(true)
    try {
      const pdf = await createPdf()
      pdf.save(`${title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-ticket.pdf`)
      setShareMessage('PDF ticket downloaded.')
    } catch {
      setShareMessage('Unable to create the PDF ticket.')
    } finally {
      setExporting(false)
    }
  }

  const downloadAllPdfs = async () => {
    const allTickets = data.tickets ?? []
    if (!allTickets.length) { await downloadPdf(); return }
    setExporting(true)
    try {
      for (const [index, ticket] of allTickets.entries()) {
        const pdf = await createPdf(ticket)
        pdf.save(`${title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${index + 1}-${ticket.holder_name?.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'ticket'}.pdf`)
      }
      setShareMessage(`${allTickets.length} ticket PDFs downloaded.`)
    } catch {
      setShareMessage('Unable to create the ticket PDFs.')
    } finally {
      setExporting(false)
    }
  }

  const sharePdf = async () => {
    setExporting(true)
    try {
      const pdf = await createPdf()
      const blob = pdf.output('blob')
      const file = new File([blob], `${title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-ticket.pdf`, { type: 'application/pdf' })
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ title: `${title} ticket`, text: 'My event ticket', files: [file] })
        setShareMessage('Choose WhatsApp, email, or another app to send the PDF.')
      } else {
        await navigator.clipboard?.writeText(`${title} ticket\nTicket ID: ${ticketNumber}`)
        setShareMessage('PDF sharing is unavailable here. Ticket details copied instead.')
      }
    } catch {
      setShareMessage('Ticket sharing was cancelled.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="digital-ticket-page min-h-screen pt-24 pb-16 flex flex-col items-center justify-center px-4"
      style={{ background: 'var(--background)', color: 'var(--foreground)' }}>

      <button type="button" onClick={() => navigate('my-tickets')} className="digital-ticket-back flex items-center gap-2 text-sm font-semibold" aria-label="Back to my tickets">
        <ArrowLeftIcon size={16} /> Back to my tickets
      </button>

      {/* Success banner */}
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
          style={{ background: status === 'VALID' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)', border: `2px solid ${statusColor}` }}>
          {status === 'VALID' ? <CheckIcon size={22} style={{ color: statusColor }} /> : <span className="text-xl font-black" style={{ color: statusColor }}>!</span>}
        </div>
        <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: 'Outfit, sans-serif', letterSpacing: '-0.02em' }}>
          You&apos;re in!
        </h1>
        <p style={{ color: 'var(--muted-foreground)' }}>{status === 'VALID' ? 'Your ticket has been confirmed. See you there.' : `This ticket is ${status.toLowerCase()}.`}</p>
      </div>

      {/* Ticket card */}
      <div className="w-full max-w-sm">
        <div className="rounded-3xl overflow-hidden" style={{ background: 'var(--card)', border: '1px solid var(--border)', boxShadow: '0 40px 80px rgba(0,0,0,0.5)' }}>

          {/* Cover */}
          <div className="relative h-40 overflow-hidden" style={{ background: '#111' }}>
            {image && <img src={image} alt={title} className="w-full h-full object-cover opacity-60" />}
            <div className="absolute inset-0 flex flex-col justify-between p-5"
              style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.4), rgba(0,0,0,0.7))' }}>
              <div className="text-xl font-black" style={{ fontFamily: 'Outfit, sans-serif', color: 'var(--primary)' }}>TIKETI</div>
              <div>
                <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full mb-2"
                  style={{ background: statusColor, color: '#fff' }}>
                  {status === 'VALID' && <CheckIcon size={10} style={{ color: '#fff' }} />} {status}
                </span>
                <h2 className="font-bold text-lg leading-snug" style={{ fontFamily: 'Outfit, sans-serif' }}>{title}</h2>
              </div>
            </div>
          </div>

          {/* Details */}
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Date', value: date },
                { label: 'Time', value: time || '—' },
                { label: 'Venue', value: venue || '—' },
                { label: 'Ticket type', value: ticketType, highlight: true },
              ].map(({ label, value, highlight }) => (
                <div key={label}>
                  <p className="text-xs mb-0.5" style={{ color: 'var(--muted-foreground)' }}>{label}</p>
                  <p className="font-semibold text-sm" style={highlight ? { color: 'var(--accent)' } : {}}>{value}</p>
                </div>
              ))}
            </div>

            <div className="py-3 border-y" style={{ borderColor: 'var(--border)' }}>
              <p className="text-xs mb-0.5" style={{ color: 'var(--muted-foreground)' }}>Ticket holder</p>
              <p className="font-bold">{info.name || 'Guest'}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{info.phone}</p>
            </div>

            {/* Divider */}
            <div className="relative flex items-center gap-2">
              <div className="flex-1 h-px border-t border-dashed" style={{ borderColor: 'var(--border)' }} />
              <span className="text-xs font-bold tracking-widest flex-shrink-0" style={{ color: 'var(--muted-foreground)' }}>SCAN TO ENTER</span>
              <div className="flex-1 h-px border-t border-dashed" style={{ borderColor: 'var(--border)' }} />
            </div>

            {/* QR code */}
            <div className="flex flex-col items-center">
              <div className="w-44 h-44 rounded-2xl overflow-hidden p-3" style={{ background: '#fff' }}>
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(ticketNumber)}&size=160x160&format=svg`}
                  alt="QR Code"
                  className="w-full h-full"
                />
              </div>
              <p className="mt-3 w-full break-all text-center text-xs font-mono tracking-widest" style={{ color: 'var(--muted-foreground)' }}>
                {ticketNumber || 'Ticket code unavailable'}
              </p>
            </div>

            <p className="text-center text-xs" style={{ color: 'var(--muted-foreground)' }}>
              Show this QR code at the entrance.
            </p>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      {shareMessage && <p className="mb-3 text-center text-xs" style={{ color: 'var(--muted-foreground)' }}>{shareMessage}</p>}
      <div className="flex gap-3 mt-8 w-full max-w-sm">
        <button onClick={() => void sharePdf()} disabled={exporting} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold"
          style={{ background: 'var(--muted)', border: '1px solid var(--border)', color: 'var(--muted-foreground)' }}>
          <ShareIcon size={14} /> Share
        </button>
        <button onClick={() => void downloadPdf()} disabled={exporting} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold"
          style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
          <DownloadIcon size={14} /> {exporting ? 'Preparing…' : 'Download PDF'}
        </button>
      </div>
      {(data.tickets?.length ?? 0) > 1 && <button onClick={() => void downloadAllPdfs()} disabled={exporting} className="mt-3 text-sm font-semibold" style={{ color: 'var(--primary)' }}>{exporting ? 'Preparing tickets…' : `Download all ${data.tickets.length} PDFs`}</button>}

      <button onClick={() => navigate('my-tickets')} className="mt-6 text-sm font-medium"
        style={{ color: 'var(--muted-foreground)' }}>
        View all my tickets
      </button>
    </div>
  )
}
