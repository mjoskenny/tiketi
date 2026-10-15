import { useEffect, useState } from 'react'
import { CalendarIcon, MapPinIcon, ShieldIcon, TicketIcon, CheckIcon, ArrowLeftIcon } from '../components/Icon'
import type { Event, TicketTier } from '../lib/types'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { trackConsentedEvent, trackConsentedMarketingEvent } from '../lib/consentedTracking'
import { sendOrderTicketEmails } from '../lib/ticketEmail'
import { projectId, publicAnonKey } from '../../utils/supabase/info'

type CheckoutData = {
  event: Event
  quantities: Record<string, number>
  subtotal: number
  total: number
}

type Props = { data: CheckoutData; navigate: (p: string, extra?: unknown) => void }
type HolderEntry = { id: string; tierId: string; tierName: string; name: string }
type CheckoutSettings = {
  ticket_sales_enabled: boolean
  mobile_money_enabled: boolean
  card_payments_enabled: boolean
  checkout_notice: string | null
}

const DEFAULT_CHECKOUT_SETTINGS: CheckoutSettings = {
  ticket_sales_enabled: true,
  mobile_money_enabled: true,
  card_payments_enabled: true,
  checkout_notice: null,
}

function fmtPrice(n: number) { return n <= 0 ? 'Free' : n.toLocaleString() + ' BIF' }

async function callPaymentFunction<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Sign in again to continue with payment.')
  const response = await fetch(`https://${projectId}.supabase.co/functions/v1/server/make-server-4880c4b3/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: publicAnonKey,
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  })
  const result = await response.json().catch(() => ({})) as T & { error?: string }
  if (!response.ok) throw new Error(result.error || 'Payment request could not be completed.')
  return result
}

const PhoneIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>
  </svg>
)
const CreditCardIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>
  </svg>
)
const BankIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="22" x2="21" y2="22"/><line x1="6" y1="18" x2="6" y2="11"/><line x1="10" y1="18" x2="10" y2="11"/><line x1="14" y1="18" x2="14" y2="11"/><line x1="18" y1="18" x2="18" y2="11"/><polygon points="12 2 20 7 4 7"/>
  </svg>
)

export default function CheckoutPage({ data, navigate }: Props) {
  const [step, setStep] = useState(1)
  const [info, setInfo] = useState({ name: '', phone: '', email: '' })
  const [holders, setHolders] = useState<HolderEntry[]>([])
  const [mobileMoneyPhone, setMobileMoneyPhone] = useState('')
  const [payMethod, setPayMethod] = useState<'mobilemoney' | 'ihela' | 'card'>('mobilemoney')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [paymentProvider, setPaymentProvider] = useState('')
  const [ihelaConfigured, setIhelaConfigured] = useState(false)
  const [paymentConfigurationError, setPaymentConfigurationError] = useState('')
  const [pendingIhela, setPendingIhela] = useState<{ orderId: string; billCode: string; confirmationUri?: string } | null>(null)
  const [paymentCheckMessage, setPaymentCheckMessage] = useState('')
  const [checkoutSettings, setCheckoutSettings] = useState<CheckoutSettings>(DEFAULT_CHECKOUT_SETTINGS)
  const { user } = useAuth()

  const { event, quantities, subtotal } = data
  const tiers: TicketTier[] = (event.ticket_tiers ?? []).filter(t => (quantities[t.name] ?? quantities[t.id] ?? 0) > 0)
  const total = subtotal
  const isFreeEvent = total <= 0

  useEffect(() => {
    let active = true
    fetch(`https://${projectId}.supabase.co/functions/v1/server/make-server-4880c4b3/payments/health`, {
      headers: { apikey: publicAnonKey },
    }).then(response => response.json()).then(result => {
      if (!active) return
      if (typeof result.provider === 'string' && result.provider !== 'unconfigured') setPaymentProvider(result.provider)
      setIhelaConfigured(result.ihelaConfigured === true)
      if (result.configured === false) setPaymentConfigurationError(result.error || 'No payment provider is configured on the Supabase Edge Function.')
    }).catch(() => {
      if (active) setPaymentConfigurationError('Could not reach the Supabase payment Edge Function.')
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let isMounted = true
    const loadCheckoutSettings = async () => {
      const { data: settingsData } = await supabase.rpc('get_public_platform_checkout_settings')
      const settings = Array.isArray(settingsData) ? settingsData[0] : settingsData
      if (!isMounted) return
      setCheckoutSettings({
        ticket_sales_enabled: settings?.ticket_sales_enabled ?? true,
        mobile_money_enabled: settings?.mobile_money_enabled ?? true,
        card_payments_enabled: settings?.card_payments_enabled ?? true,
        checkout_notice: settings?.checkout_notice ?? null,
      })
    }
    void loadCheckoutSettings()
    return () => { isMounted = false }
  }, [])

  useEffect(() => {
    if (payMethod === 'mobilemoney' && !checkoutSettings.mobile_money_enabled) setPayMethod('card')
    if (payMethod === 'card' && !checkoutSettings.card_payments_enabled) setPayMethod('mobilemoney')
  }, [checkoutSettings.card_payments_enabled, checkoutSettings.mobile_money_enabled, payMethod])

  useEffect(() => {
    const next: HolderEntry[] = []
    tiers.forEach(tier => {
      for (let index = 0; index < getQty(tier); index += 1) {
        const existing = holders.find(holder => holder.tierId === tier.id && holder.id.endsWith(`-${index}`))
        next.push(existing ?? { id: `${tier.id}-${index}`, tierId: tier.id, tierName: tier.name, name: '' })
      }
    })
    setHolders(next)
  }, [quantities])

  useEffect(() => {
    const saved = window.sessionStorage.getItem(`tiketi-checkout:${event.id}`)
    if (!saved) return
    try {
      const parsed = JSON.parse(saved) as { info?: typeof info; holders?: HolderEntry[]; mobileMoneyPhone?: string; step?: number }
      if (parsed.info) setInfo(parsed.info)
      if (parsed.holders?.length) setHolders(parsed.holders)
      if (parsed.mobileMoneyPhone) setMobileMoneyPhone(parsed.mobileMoneyPhone)
      if (parsed.step && parsed.step >= 1 && parsed.step <= 3) setStep(parsed.step)
    } catch {
      window.sessionStorage.removeItem(`tiketi-checkout:${event.id}`)
    }
  }, [event.id])

  useEffect(() => {
    window.sessionStorage.setItem(`tiketi-checkout:${event.id}`, JSON.stringify({ info, holders, mobileMoneyPhone, step }))
  }, [event.id, info, holders, mobileMoneyPhone, step])

  const validateInfo = () => {
    if (info.name.trim().length < 2) return 'Enter your full name.'
    if (!/^\+?[0-9 ()-]{8,20}$/.test(info.phone.trim())) return 'Enter a valid phone number.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(info.email.trim())) return 'Enter a valid email address.'
    if (holders.some(holder => holder.name.trim().length < 2)) return 'Enter a name for every ticket holder.'
    return ''
  }

  const setCheckoutStep = (nextStep: number) => {
    setStep(nextStep)
    const stepName = ['tickets', 'info', 'payment'][nextStep - 1] ?? 'tickets'
    window.history.pushState({}, '', `/checkout/${event.id}/${stepName}`)
  }

  useEffect(() => {
    const syncStepFromUrl = () => {
      const stepName = window.location.pathname.split('/').pop()
      const nextStep = { tickets: 1, info: 2, payment: 3 }[stepName ?? '']
      if (nextStep) setStep(nextStep)
    }
    window.addEventListener('popstate', syncStepFromUrl)
    return () => window.removeEventListener('popstate', syncStepFromUrl)
  }, [])

  function getQty(t: TicketTier) { return quantities[t.name] ?? quantities[t.id] ?? 0 }

  const handleFreeCheckout = async () => {
    if (!user) { navigate('auth-customer'); return }
    if (!checkoutSettings.ticket_sales_enabled) {
      setError(checkoutSettings.checkout_notice || 'Ticket sales are currently paused. Please try again later.')
      return
    }
    const validationError = validateInfo()
    if (validationError) { setError(validationError); setStep(2); return }

    setLoading(true)
    setError('')

    try {
      const quantitiesByTierId = Object.fromEntries(tiers.map(tier => [tier.id, getQty(tier)]))
      const { data: orderId, error: purchaseError } = await supabase.rpc('create_pending_ticket_order', {
        p_event_id: event.id,
        p_organizer_id: event.organizer_id,
        p_quantities: quantitiesByTierId,
        p_holder_name: info.name,
        p_holder_email: info.email,
        p_holder_phone: info.phone,
        p_holder_details: Object.fromEntries(tiers.map(tier => [tier.id, holders.filter(holder => holder.tierId === tier.id).map(holder => ({ name: holder.name }))])),
      })
      if (purchaseError) throw purchaseError
      if (!orderId) throw new Error('Unable to create the free ticket reservation.')

      const { data: completed, error: completionError } = await supabase.rpc('complete_test_ticket_order', {
        p_order_id: orderId,
        p_payment_method: 'free',
      })
      if (completionError || !completed?.[0]) throw completionError ?? new Error('Your free reservation could not be confirmed.')

      const purchasedItems = tiers.map(tier => ({ item_id: tier.id, item_name: tier.name, price: tier.price, quantity: getQty(tier) }))
      trackConsentedEvent('purchase', { transaction_id: orderId, currency: 'BIF', value: 0, items: purchasedItems })
      trackConsentedMarketingEvent('Purchase', {
        content_ids: purchasedItems.map(item => item.item_id),
        content_name: event.title,
        content_type: 'product',
        currency: 'BIF',
        value: 0,
        num_items: purchasedItems.reduce((sum, item) => sum + item.quantity, 0),
      })
      const emailDelivery = await sendOrderTicketEmails(orderId)
      window.sessionStorage.removeItem(`tiketi-checkout:${event.id}`)
      const firstTicket = completed[0]
      const firstTicketTier = tiers.find(tier => tier.id === firstTicket.ticket_tier_id) ?? tiers[0]
      navigate('ticket', {
        event,
        info,
        tickets: completed.map(ticket => ({
          id: ticket.ticket_id,
          qr_code: ticket.qr_code,
          holder_name: ticket.holder_name,
          holder_email: ticket.holder_email,
          ticket_tier_id: ticket.ticket_tier_id,
          created_at: ticket.created_at,
        })),
        ticketId: firstTicket.ticket_id,
        ticket: firstTicket.qr_code,
        ticketStatus: 'valid',
        ticketType: firstTicketTier?.name,
        ticketKind: firstTicketTier?.ticket_type,
        ticketPrice: firstTicketTier?.price ?? 0,
        purchasedAt: firstTicket.created_at,
        ticketExtraInfo: firstTicketTier?.extra_info ?? '',
        ticketExpiry: firstTicketTier?.expires_at ?? '',
        ticketGroupSize: firstTicketTier?.group_size ?? 1,
        emailDelivery,
      })
    } catch (checkoutError) {
      const message = typeof checkoutError === 'object' && checkoutError !== null && 'message' in checkoutError
        ? String(checkoutError.message)
        : 'Unable to complete the free reservation.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const handlePay = async () => {
    if (!user) { navigate('auth-customer'); return }
    if (isFreeEvent) {
      await handleFreeCheckout()
      return
    }
    if (!checkoutSettings.ticket_sales_enabled) {
      setError(checkoutSettings.checkout_notice || 'Ticket sales are currently paused. Please try again later.')
      return
    }
    if (payMethod === 'mobilemoney' && !checkoutSettings.mobile_money_enabled) { setError('Mobile Money payments are currently unavailable.'); return }
    if (payMethod === 'ihela' && !checkoutSettings.mobile_money_enabled) { setError('Mobile Money payments are currently unavailable.'); return }
    if (payMethod === 'card' && !checkoutSettings.card_payments_enabled) { setError('Card payments are currently unavailable.'); return }
    const validationError = validateInfo()
    if (validationError) { setError(validationError); setStep(2); return }
    if (payMethod === 'mobilemoney' && !/^\+?[0-9 ()-]{8,20}$/.test(mobileMoneyPhone.trim())) {
      setError('Enter the mobile money number that should receive the payment prompt.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const quantitiesByTierId = Object.fromEntries(tiers.map(tier => [tier.id, getQty(tier)]))
      const { data: orderId, error: purchaseError } = await supabase.rpc('create_pending_ticket_order', {
        p_event_id: event.id,
        p_organizer_id: event.organizer_id,
        p_quantities: quantitiesByTierId,
        p_holder_name: info.name,
        p_holder_email: info.email,
        p_holder_phone: info.phone,
        p_holder_details: Object.fromEntries(tiers.map(tier => [tier.id, holders.filter(holder => holder.tierId === tier.id).map(holder => ({ name: holder.name }))])),
      })
      if (purchaseError) throw purchaseError
      if (!orderId) throw new Error('Unable to create the ticket order.')

      const session = await callPaymentFunction<{ provider: string; reference: string; checkoutUrl?: string; confirmationUri?: string }>(
        'payments/initialize',
        { orderId, method: payMethod === 'ihela' ? 'ihela' : payMethod === 'mobilemoney' ? 'mobile_money' : 'card', paymentPhone: mobileMoneyPhone },
      )
      setLoading(false)
      if (session.provider === 'ihela') {
        setPendingIhela({ orderId, billCode: session.reference, confirmationUri: session.confirmationUri })
        setPaymentCheckMessage('Waiting for iHela to confirm your payment. This page checks securely every few seconds.')
        return
      }
      if (session.provider === 'demo') {
        await callPaymentFunction('payments/demo/complete', { orderId })
        window.sessionStorage.removeItem(`tiketi-checkout:${event.id}`)
        navigate('my-tickets')
        return
      }
      if (!session.checkoutUrl) throw new Error('The payment provider did not return a checkout link.')
      window.location.assign(session.checkoutUrl)
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : 'Unable to initialize payment.')
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!pendingIhela) return
    let active = true
    let checking = false
    let interval: number | undefined
    const checkStatus = async () => {
      if (!active || checking) return
      checking = true
      try {
        const result = await callPaymentFunction<{ status: 'succeeded' | 'pending' | 'failed' | 'expired' }>(
          'payments/ihela/status',
          { orderId: pendingIhela.orderId },
        )
        if (!active) return
        if (result.status === 'succeeded') {
          active = false
          if (interval !== undefined) window.clearInterval(interval)
          window.sessionStorage.removeItem(`tiketi-checkout:${event.id}`)
          const purchasedItems = tiers.map(tier => ({ item_id: tier.id, item_name: tier.name, price: tier.price, quantity: getQty(tier) }))
          trackConsentedEvent('purchase', { transaction_id: pendingIhela.orderId, currency: 'BIF', value: total, items: purchasedItems })
          trackConsentedMarketingEvent('Purchase', {
            content_ids: purchasedItems.map(item => item.item_id),
            content_name: event.title,
            content_type: 'product',
            currency: 'BIF',
            value: total,
            num_items: purchasedItems.reduce((sum, item) => sum + item.quantity, 0),
          })
          setPaymentCheckMessage('Payment confirmed. Your tickets are available in My Tickets and have been emailed to you.')
          setPendingIhela(null)
          navigate('my-tickets')
          return
        }
        if (result.status === 'failed' || result.status === 'expired') {
          active = false
          if (interval !== undefined) window.clearInterval(interval)
          setPaymentCheckMessage(result.status === 'expired' ? 'This iHela bill has expired.' : 'iHela could not complete this payment.')
          return
        }
        setPaymentCheckMessage('Payment is still pending. Complete it in iHela; this page will update automatically.')
      } catch (statusError) {
        if (active) setError(statusError instanceof Error ? statusError.message : 'Unable to check payment status.')
      } finally {
        checking = false
      }
    }
    void checkStatus()
    interval = window.setInterval(() => { void checkStatus() }, 6000)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [pendingIhela?.orderId])

  const stepDone = (n: number) => step > n

  return (
    <div className="min-h-screen pt-20" style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">

        {/* Step indicators */}
        <div className="flex items-center gap-3 mb-10">
          {[{ n: 1, label: 'Tickets' }, { n: 2, label: 'Your info' }, { n: 3, label: isFreeEvent ? 'Confirm' : 'Payment' }].map(({ n, label }, i) => (
            <div key={n} className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{ background: step >= n ? 'var(--primary)' : 'var(--muted)', color: step >= n ? 'var(--primary-foreground)' : 'var(--muted-foreground)' }}>
                  {stepDone(n) ? <CheckIcon size={12} /> : n}
                </div>
                <span className="text-sm font-medium hidden sm:block" style={{ color: step === n ? 'var(--foreground)' : 'var(--muted-foreground)' }}>{label}</span>
              </div>
              {i < 2 && <div className="h-px w-8 sm:w-16 flex-shrink-0" style={{ background: step > n ? 'var(--primary)' : 'var(--border)' }} />}
            </div>
          ))}
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          {/* Left form */}
          <div className="flex-1">

            {step === 1 && (
              <div>
                <h2 className="text-2xl font-bold mb-6" style={{ fontFamily: 'Outfit, sans-serif' }}>Your tickets</h2>
                <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                  <div className="p-4 border-b flex items-center gap-3" style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}>
                    <img src={(event as any).cover_image ?? (event as any).image ?? ''} alt={(event as any).title ?? (event as any).name} className="w-14 h-14 rounded-xl object-cover flex-shrink-0" style={{ background: 'var(--secondary)' }} />
                    <div>
                      <p className="font-bold text-sm">{(event as any).title ?? (event as any).name}</p>
                      <p className="text-xs flex items-center gap-1.5 mt-1" style={{ color: 'var(--muted-foreground)' }}>
                        <CalendarIcon size={11} /> {(event as any).date}
                      </p>
                      <p className="text-xs flex items-center gap-1.5 mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                        <MapPinIcon size={11} /> {(event as any).venue}
                      </p>
                    </div>
                  </div>
                  {tiers.map(t => (
                    <div key={t.id} className="flex justify-between items-center px-4 py-3 border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
                      <div>
                        <p className="font-semibold text-sm">{t.name}</p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{getQty(t)} × {fmtPrice(t.price)}</p>
                      </div>
                      <p className="font-bold text-sm" style={{ color: 'var(--accent)' }}>{fmtPrice(getQty(t) * t.price)}</p>
                    </div>
                  ))}
                </div>
                <button onClick={() => setCheckoutStep(2)} className="w-full mt-6 py-4 rounded-xl font-bold text-sm"
                  style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
                  Continue
                </button>
              </div>
            )}

            {step === 2 && (
              <div>
                <h2 className="text-2xl font-bold mb-6" style={{ fontFamily: 'Outfit, sans-serif' }}>Your information</h2>
                {error && <div role="alert" className="mb-5 rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', color: '#fca5a5' }}>{error}</div>}
                <div className="space-y-5">
                  {[
                    { key: 'name', label: 'Full name', type: 'text', placeholder: 'Jean Pierre Nzeyimana' },
                    { key: 'phone', label: 'Phone number', type: 'tel', placeholder: '+257 79 000 000' },
                    { key: 'email', label: 'Email address', type: 'email', placeholder: 'you@email.com' },
                  ].map(({ key, label, type, placeholder }) => (
                    <div key={key}>
                      <label className="block text-sm font-medium mb-1.5">{label}</label>
                      <input type={type} placeholder={placeholder}
                        value={info[key as keyof typeof info]}
                        onChange={e => { setInfo(i => ({ ...i, [key]: e.target.value })); setError('') }}
                        className="w-full px-4 py-3.5 rounded-xl text-sm outline-none"
                        style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
                        onFocus={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)')}
                        onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')} />
                    </div>
                  ))}
                </div>
                <p className="text-xs mt-3 mb-6" style={{ color: 'var(--muted-foreground)' }}>Tickets will be sent to this phone number and email.</p>
                <div className="mt-8 space-y-4">
                  <h3 className="font-bold">Ticket holders</h3>
                  <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Add a different name for each ticket.</p>
                  {holders.map((holder, index) => <label key={holder.id} className="block text-sm font-medium">{holder.tierName} ticket {index + 1}<input value={holder.name} onChange={event => { setHolders(current => current.map(item => item.id === holder.id ? { ...item, name: event.target.value } : item)); setError('') }} placeholder="Ticket holder name" className="mt-2 w-full px-4 py-3.5 rounded-xl text-sm outline-none" style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--foreground)' }} /></label>)}
                </div>
                <div className="mt-8 flex gap-3">
                  <button type="button" onClick={() => setCheckoutStep(1)} aria-label="Back to tickets" title="Back to tickets" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
                    style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}>
                    <ArrowLeftIcon size={18} />
                  </button>
                  <button onClick={() => { const validationError = validateInfo(); if (validationError) { setError(validationError); return } setError(''); setCheckoutStep(3) }}
                    className="flex-1 py-4 rounded-xl font-bold text-sm transition-all"
                    style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>
                    Continue
                  </button>
                </div>
              </div>
            )}

            {step === 3 && isFreeEvent ? (
              <div>
                <h2 className="text-2xl font-bold mb-6" style={{ fontFamily: 'Outfit, sans-serif' }}>Free reservation</h2>
                {error && <div className="mb-5 rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', color: '#fca5a5' }}>{error}</div>}
                <div className="rounded-2xl p-5 mb-6" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                  <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>This event is free. No payment is required, and your tickets will be confirmed immediately.</p>
                </div>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setCheckoutStep(2)} aria-label="Back to your information" title="Back to your information"
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
                    style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}>
                    <ArrowLeftIcon size={18} />
                  </button>
                  <button onClick={handleFreeCheckout} disabled={loading}
                    className="flex-1 py-4 rounded-xl font-bold text-sm transition-all"
                    style={{ background: 'var(--primary)', color: 'var(--primary-foreground)', opacity: loading ? 0.7 : 1 }}>
                    {loading ? 'Confirming your tickets…' : 'Complete free reservation'}
                  </button>
                </div>
              </div>
            ) : step === 3 && (
              <div>
                <h2 className="text-2xl font-bold mb-6" style={{ fontFamily: 'Outfit, sans-serif' }}>Payment</h2>
                {error && <div className="mb-5 rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', color: '#fca5a5' }}>{error}</div>}
                {paymentConfigurationError && <div role="status" className="mb-5 rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.24)', color: '#fcd34d' }}>Payment setup needs attention: {paymentConfigurationError}</div>}
                {pendingIhela ? (
                  <div className="rounded-2xl p-5" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full border-2 border-current border-t-transparent animate-spin" style={{ color: 'var(--accent)' }} />
                      <div>
                        <h3 className="font-bold">Complete payment with iHela</h3>
                        <p className="mt-1 text-xs" style={{ color: 'var(--muted-foreground)' }}>Open iHela and pay this bill. Tickets are issued only after iHela confirms payment.</p>
                      </div>
                    </div>
                    <div className="mt-5 rounded-xl p-4 text-center" style={{ background: 'var(--muted)' }}>
                      <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted-foreground)' }}>iHela bill code</p>
                      <p className="mt-2 break-all font-mono text-xl font-black" style={{ color: 'var(--accent)' }}>{pendingIhela.billCode}</p>
                      <button type="button" onClick={() => void navigator.clipboard?.writeText(pendingIhela.billCode)} className="mt-3 rounded-lg px-3 py-2 text-xs font-bold" style={{ background: 'var(--card)', color: 'var(--foreground)' }}>
                        Copy bill code
                      </button>
                      {pendingIhela.confirmationUri && <a href={pendingIhela.confirmationUri} target="_blank" rel="noreferrer" className="ml-2 inline-block rounded-lg px-3 py-2 text-xs font-bold" style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}>Open iHela</a>}
                    </div>
                    <p role="status" className="mt-4 text-sm" style={{ color: 'var(--muted-foreground)' }}>{paymentCheckMessage}</p>
                    <p className="mt-2 text-xs" style={{ color: 'var(--muted-foreground)' }}>Order reference: {pendingIhela.orderId}</p>
                  </div>
                ) : <>
                <div className="space-y-3 mb-6">
                  {[
                    { id: 'mobilemoney' as const, label: 'Mobile Money', sub: paymentProvider && paymentProvider !== 'unconfigured' ? 'Continue with your configured Mobile Money provider' : 'Lumicash · EcoCash · Mobicash', Icon: PhoneIcon, enabled: checkoutSettings.mobile_money_enabled },
                    { id: 'ihela' as const, label: 'iHela', sub: ihelaConfigured ? 'Pay with an iHela bill code' : 'Unavailable until iHela sandbox is configured', Icon: PhoneIcon, enabled: checkoutSettings.mobile_money_enabled && ihelaConfigured },
                    { id: 'card' as const, label: 'Debit / Credit Card', sub: 'Visa · Mastercard', Icon: CreditCardIcon, enabled: checkoutSettings.card_payments_enabled },
                  ].filter(method => method.id === 'ihela' ? checkoutSettings.mobile_money_enabled : method.enabled).map(({ id, label, sub, Icon }) => (
                    <button key={id} onClick={() => setPayMethod(id)} disabled={id === 'ihela' && !ihelaConfigured}
                      className="w-full flex items-center gap-4 p-4 rounded-xl text-left disabled:cursor-not-allowed disabled:opacity-55"
                      style={{
                        background: payMethod === id ? 'rgba(200,169,110,0.06)' : 'var(--card)',
                        border: payMethod === id ? '2px solid var(--accent)' : '1px solid var(--border)',
                      }}>
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: 'var(--muted)', color: payMethod === id ? 'var(--accent)' : 'var(--muted-foreground)' }}>
                        <Icon size={16} />
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-sm">{label}</p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{sub}</p>
                      </div>
                      <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                        style={{ borderColor: payMethod === id ? 'var(--accent)' : 'var(--border)' }}>
                        {payMethod === id && <div className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--accent)' }} />}
                      </div>
                    </button>
                  ))}
                </div>

                {payMethod === 'mobilemoney' && (
                  <div className="p-4 rounded-xl mb-6" style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}>
                    <p className="text-sm font-medium mb-2.5">Mobile Money number</p>
                    <input type="tel" placeholder="+257 79 000 000" value={mobileMoneyPhone} onChange={e => setMobileMoneyPhone(e.target.value)}
                      className="w-full px-4 py-3 rounded-lg text-sm outline-none"
                      style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--foreground)' }} />
                    <p className="text-xs mt-2" style={{ color: 'var(--muted-foreground)' }}>Your payment provider will securely process this payment.</p>
                  </div>
                )}

                {payMethod === 'ihela' && <p className="mb-6 rounded-xl px-4 py-3 text-xs" style={{ background: 'rgba(200,169,110,0.08)', border: '1px solid rgba(200,169,110,0.2)', color: 'var(--accent)' }}>iHela will generate a bill code for you to pay. Tickets are issued only after payment is confirmed.</p>}

                {paymentProvider === 'demo' && <p className="mb-6 rounded-xl px-4 py-3 text-xs" style={{ background: 'rgba(200,169,110,0.08)', border: '1px solid rgba(200,169,110,0.2)', color: 'var(--accent)' }}>Demo payment mode is active. This does not charge a real payment method.</p>}

                <div className="flex items-center justify-center gap-6 mb-6">
                  {[
                    { Icon: ShieldIcon, label: 'SSL Secured' },
                    { Icon: CheckIcon, label: 'Verified' },
                    { Icon: TicketIcon, label: 'Official ticket' },
                  ].map(({ Icon, label }) => (
                    <div key={label} className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--muted-foreground)' }}>
                      <Icon size={12} /> {label}
                    </div>
                  ))}
                </div>

                <div className="flex gap-3">
                  <button type="button" onClick={() => setCheckoutStep(2)} aria-label="Back to your information" title="Back to your information"
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
                    style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}>
                    <ArrowLeftIcon size={18} />
                  </button>
                  <button onClick={handlePay} disabled={loading}
                    className="flex-1 py-4 rounded-xl font-bold text-sm transition-all"
                    style={{ background: 'var(--primary)', color: 'var(--primary-foreground)', opacity: loading ? 0.7 : 1 }}>
                    {loading ? 'Starting secure payment…' : `Continue to payment · ${fmtPrice(total)}`}
                  </button>
                </div>
                </>}
              </div>
            )}
          </div>

          {/* Order summary */}
          <div className="lg:w-80 flex-shrink-0">
            <div className="sticky top-24 rounded-2xl p-6" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
              <h3 className="font-bold mb-4" style={{ fontFamily: 'Outfit, sans-serif' }}>Order Summary</h3>
              <div className="space-y-2 text-sm mb-4">
                {tiers.map(t => (
                  <div key={t.id} className="flex justify-between">
                    <span style={{ color: 'var(--muted-foreground)' }}>{t.name} × {getQty(t)}</span>
                    <span>{fmtPrice(getQty(t) * t.price)}</span>
                  </div>
                ))}
                <div className="flex justify-between pt-2 border-t" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
                  <span>Subtotal</span><span>{fmtPrice(subtotal)}</span>
                </div>
                <div className="flex justify-between font-bold text-base pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                  <span>Total you pay</span>
                  <span style={{ color: 'var(--accent)' }}>{fmtPrice(total)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 p-3 rounded-xl text-xs" style={{ background: 'rgba(200,169,110,0.06)', border: '1px solid rgba(200,169,110,0.15)', color: 'var(--accent)' }}>
                <CheckIcon size={12} /> Official ticket guaranteed. Secure checkout.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
