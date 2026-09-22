import { XMLParser } from "npm:fast-xml-parser";

export type PaymentMethod = 'card' | 'mobile_money'

export type PaymentCustomer = {
  name: string
  email: string
  phone?: string
}

export type CreatePaymentInput = {
  orderId: string
  amount: number
  currency: string
  method: PaymentMethod
  customer: PaymentCustomer
  returnUrl: string
  webhookUrl: string
  serviceDate?: string
  metadata?: Record<string, string>
}

export type PaymentSession = {
  provider: string
  reference: string
  status: 'pending'
  checkoutUrl: string
  expiresAt?: string
}

export type PaymentWebhook = {
  provider: string
  reference: string
  status: 'succeeded' | 'failed' | 'cancelled' | 'pending'
  amount?: number
  currency?: string
  orderId?: string
  raw: unknown
}

export interface PaymentAdapter {
  readonly name: string
  createPayment(input: CreatePaymentInput): Promise<PaymentSession>
  verifyWebhook(request: Request): Promise<PaymentWebhook>
}

class DemoPaymentAdapter implements PaymentAdapter {
  readonly name = 'demo'

  async createPayment(input: CreatePaymentInput): Promise<PaymentSession> {
    return {
      provider: this.name,
      reference: `demo-${input.orderId}`,
      status: 'pending',
      checkoutUrl: `${input.returnUrl}?demo_payment=1&order_id=${encodeURIComponent(input.orderId)}`,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    }
  }

  async verifyWebhook(request: Request): Promise<PaymentWebhook> {
    const payload = await request.json() as { orderId?: string; reference?: string }
    if (!payload.orderId) throw new Error('Demo payment webhook requires orderId')
    return { provider: this.name, reference: payload.reference ?? `demo-${payload.orderId}`, orderId: payload.orderId, status: 'succeeded', raw: payload }
  }
}

function xmlEscape(value: string) {
  return value.replace(/[<>&'\"]/g, character => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[character] ?? character)
}

function xmlValue(xml: Record<string, unknown>, key: string) {
  const value = xml[key]
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

function splitName(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean)
  return { first: parts[0] ?? 'Tiketi', last: parts.slice(1).join(' ') || 'Customer' }
}

function pickNestedString(value: unknown, keys: string[]): string | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  for (const key of keys) {
    const nestedValue = record[key]
    if (typeof nestedValue === 'string' && nestedValue.trim()) return nestedValue.trim()
    if (typeof nestedValue === 'number') return String(nestedValue)
  }
  for (const nested of Object.values(record)) {
    const match = pickNestedString(nested, keys)
    if (match) return match
  }
  return undefined
}

function pickNestedUrl(value: unknown): string | undefined {
  const url = pickNestedString(value, ['checkoutUrl', 'paymentUrl', 'redirectUrl', 'url', 'link', 'checkout_url', 'payment_url', 'redirect_url'])
  if (url) return url
  if (typeof value === 'string' && /^https?:\/\//i.test(value.trim())) return value.trim()
  return undefined
}

class UnipesaPaymentAdapter implements PaymentAdapter {
  readonly name = 'unipesa'
  private readonly apiUrl: string
  private readonly apiKey: string
  private readonly secretKey: string
  private readonly merchantId: string
  private readonly merchantCode: string

  constructor(private readonly env: Record<string, string | undefined>) {
    this.apiUrl = env.UNIPESA_API_URL?.trim() || 'https://api.unipesa.com'
    this.apiKey = env.UNIPESA_API_KEY?.trim() || ''
    this.secretKey = env.UNIPESA_SECRET_KEY?.trim() || ''
    this.merchantId = env.UNIPESA_MERCHANT_ID?.trim() || ''
    this.merchantCode = env.UNIPESA_MERCHANT_CODE?.trim() || ''
    if (!this.apiKey) throw new Error('UNIPESA_API_KEY is not configured')
    if (!this.merchantId && !this.merchantCode) throw new Error('UNIPESA_MERCHANT_ID or UNIPESA_MERCHANT_CODE is not configured')
  }

  async createPayment(input: CreatePaymentInput): Promise<PaymentSession> {
    const merchantReference = this.merchantId || this.merchantCode
    const response = await fetch(`${this.apiUrl.replace(/\/$/, '')}/api/payments/initiate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        'x-api-key': this.apiKey,
        ...(this.secretKey ? { 'x-secret-key': this.secretKey } : {}),
      },
      body: JSON.stringify({
        merchantId: merchantReference,
        merchantCode: this.merchantCode || undefined,
        amount: Number(input.amount.toFixed(2)),
        currency: input.currency.toUpperCase(),
        orderId: input.orderId,
        reference: input.orderId,
        externalReference: input.orderId,
        customerName: input.customer.name,
        customerEmail: input.customer.email,
        customerPhone: input.customer.phone ?? '',
        paymentMethod: input.method,
        returnUrl: input.returnUrl,
        webhookUrl: input.webhookUrl,
      }),
    })

    const responseText = await response.text()
    let payload: Record<string, unknown> = {}
    try {
      payload = responseText ? JSON.parse(responseText) as Record<string, unknown> : {}
    } catch {
      payload = {}
    }

    const data = (payload.data ?? payload.result ?? payload.response ?? payload) as Record<string, unknown>
    const checkoutUrl = pickNestedUrl(data) ?? pickNestedUrl(payload)
    const reference = pickNestedString(data, ['reference', 'transactionId', 'transaction_id', 'paymentReference', 'payment_reference', 'id']) || input.orderId
    if (!response.ok || !checkoutUrl) {
      const detail = pickNestedString(data, ['message', 'error', 'details', 'detail']) || `HTTP ${response.status}`
      throw new Error(`Unipesa payment initialization failed: ${detail}`)
    }

    return { provider: this.name, reference, status: 'pending', checkoutUrl, expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString() }
  }

  async verifyWebhook(request: Request): Promise<PaymentWebhook> {
    const bodyText = await request.text()
    let payload: Record<string, unknown> = {}
    try {
      payload = bodyText ? JSON.parse(bodyText) as Record<string, unknown> : {}
    } catch {
      payload = Object.fromEntries(new URLSearchParams(bodyText).entries()) as Record<string, unknown>
    }

    const data = (payload.data ?? payload.result ?? payload.response ?? payload) as Record<string, unknown>
    const statusValue = pickNestedString(data, ['status', 'state', 'transactionStatus', 'paymentStatus', 'transaction_status', 'payment_status']) || 'pending'
    const normalized = statusValue.toLowerCase()
    const reference = pickNestedString(data, ['reference', 'transactionId', 'transaction_id', 'paymentReference', 'payment_reference', 'orderId', 'order_id']) || undefined
    const orderId = pickNestedString(data, ['orderId', 'order_id', 'externalReference', 'external_reference', 'merchantReference', 'merchant_reference']) || undefined
    const amount = Number(pickNestedString(data, ['amount', 'totalAmount', 'total_amount']) ?? '') || undefined
    const currency = pickNestedString(data, ['currency']) || undefined

    const mappedStatus = normalized.includes('success') || normalized.includes('paid') || normalized.includes('approved') || normalized.includes('completed')
      ? 'succeeded'
      : normalized.includes('cancel') || normalized.includes('failed') || normalized.includes('decline')
        ? 'failed'
        : normalized.includes('pending') ? 'pending' : 'pending'

    return { provider: this.name, reference: reference ?? orderId ?? 'unipesa', status: mappedStatus, amount, currency, orderId, raw: data }
  }
}

class DpoPayAdapter implements PaymentAdapter {
  readonly name = 'dpo_pay'
  private readonly apiUrl: string
  private readonly checkoutUrl: string
  private readonly companyToken: string
  private readonly paymentCountry: string
  private readonly mobileNetwork: string

  constructor(private readonly env: Record<string, string | undefined>) {
    this.apiUrl = env.DPO_API_URL?.trim() || 'https://secure.3gdirectpay.com/API/v6/'
    this.checkoutUrl = env.DPO_CHECKOUT_URL?.trim() || 'https://secure.3gdirectpay.com/pay.asp?ID='
    this.companyToken = env.DPO_COMPANY_TOKEN?.trim() || ''
    this.paymentCountry = env.DPO_PAYMENT_COUNTRY?.trim() || 'Burundi'
    this.mobileNetwork = env.DPO_PAYMENT_MNO?.trim() || ''
    if (!this.companyToken) throw new Error('DPO_COMPANY_TOKEN is not configured')
  }

  async createPayment(input: CreatePaymentInput): Promise<PaymentSession> {
    const customer = splitName(input.customer.name)
    const defaultPayment = input.method === 'mobile_money' ? 'MO' : 'CC'
    const metadata = JSON.stringify({ orderId: input.orderId, ...(input.metadata ?? {}) })
    const serviceDate = input.serviceDate || new Date().toISOString().slice(0, 16).replace('T', ' ')
    const optionalMobileFields = input.method === 'mobile_money'
      ? `<DefaultPaymentCountry>${xmlEscape(this.paymentCountry)}</DefaultPaymentCountry>${this.mobileNetwork ? `<DefaultPaymentMNO>${xmlEscape(this.mobileNetwork)}</DefaultPaymentMNO>` : ''}`
      : ''
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<API3G>
  <CompanyToken>${xmlEscape(this.companyToken)}</CompanyToken>
  <Request>createToken</Request>
  <Transaction>
    <PaymentAmount>${input.amount.toFixed(2)}</PaymentAmount>
    <PaymentCurrency>${xmlEscape(input.currency.toUpperCase())}</PaymentCurrency>
    <CompanyRefUnique>1</CompanyRefUnique>
    <CompanyRef>${xmlEscape(input.orderId)}</CompanyRef>
    <OrderNumber>${xmlEscape(input.orderId.slice(0, 15))}</OrderNumber>
    <RedirectURL>${xmlEscape(input.returnUrl)}</RedirectURL>
    <BackURL>${xmlEscape(input.webhookUrl)}</BackURL>
    <PTL>30</PTL>
    <PTLtype>minutes</PTLtype>
    <customerFirstName>${xmlEscape(customer.first)}</customerFirstName>
    <customerLastName>${xmlEscape(customer.last)}</customerLastName>
    <customerEmail>${xmlEscape(input.customer.email)}</customerEmail>
    ${input.customer.phone ? `<customerPhone>${xmlEscape(input.customer.phone)}</customerPhone>` : ''}
    <DefaultPayment>${defaultPayment}</DefaultPayment>
    ${optionalMobileFields}
    <MetaData><![CDATA[${metadata}]]></MetaData>
  </Transaction>
  <Services>
    <Service>
      <ServiceTypeName>Event ticket</ServiceTypeName>
      <ServiceDescription>Tiketi event ticket purchase</ServiceDescription>
      <ServiceDate>${xmlEscape(serviceDate)}</ServiceDate>
    </Service>
  </Services>
</API3G>`

    const response = await fetch(this.apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/xml; charset=utf-8', Accept: 'application/xml' }, body: xml })
    const responseText = await response.text()
    const parsed = new XMLParser({ ignoreAttributes: true }).parse(responseText).API3G as Record<string, unknown>
    const result = xmlValue(parsed, 'Result')
    const token = xmlValue(parsed, 'TransToken')
    if (!response.ok || result !== '000' || !token) throw new Error(`DPO payment initialization failed: ${xmlValue(parsed, 'ResultExplanation') || `HTTP ${response.status}`}`)
    return { provider: this.name, reference: xmlValue(parsed, 'TransRef') || input.orderId, status: 'pending', checkoutUrl: `${this.checkoutUrl}${encodeURIComponent(token)}`, expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString() }
  }

  async verifyWebhook(request: Request): Promise<PaymentWebhook> {
    const body = await request.text()
    const parsed = new XMLParser({ ignoreAttributes: true }).parse(body).API3G as Record<string, unknown>
    const token = xmlValue(parsed, 'TransactionToken') || xmlValue(parsed, 'TransToken')
    const reference = xmlValue(parsed, 'TransactionRef') || xmlValue(parsed, 'CompanyRef')
    if (!token && !reference) throw new Error('DPO callback did not include a transaction token or reference')
    const verifyXml = `<?xml version="1.0" encoding="utf-8"?><API3G><CompanyToken>${xmlEscape(this.companyToken)}</CompanyToken><Request>verifyToken</Request>${token ? `<TransactionToken>${xmlEscape(token)}</TransactionToken>` : ''}${reference ? `<CompanyRef>${xmlEscape(reference)}</CompanyRef>` : ''}<VerifyTransaction>1</VerifyTransaction></API3G>`
    const verifyResponse = await fetch(this.apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/xml; charset=utf-8', Accept: 'application/xml' }, body: verifyXml })
    const verifyText = await verifyResponse.text()
    const verified = new XMLParser({ ignoreAttributes: true }).parse(verifyText).API3G as Record<string, unknown>
    const result = xmlValue(verified, 'Result')
    const status = result === '000' ? 'succeeded' : ['900', '003', '005'].includes(result) ? 'pending' : 'failed'
    return { provider: this.name, reference: xmlValue(verified, 'CompanyRef') || reference, status, amount: Number(xmlValue(verified, 'TransactionAmount')) || undefined, currency: xmlValue(verified, 'TransactionCurrency') || undefined, orderId: xmlValue(verified, 'CompanyRef') || undefined, raw: verified }
  }
}

class UnconfiguredPaymentAdapter implements PaymentAdapter {
  readonly name = 'unconfigured'

  private unavailable(): never {
    throw new Error('No payment provider is configured. Set PAYMENT_PROVIDER and its server-side credentials before accepting payments.')
  }

  createPayment(_input: CreatePaymentInput): Promise<PaymentSession> {
    return Promise.reject(this.unavailable())
  }

  verifyWebhook(_request: Request): Promise<PaymentWebhook> {
    return Promise.reject(this.unavailable())
  }
}

export function createPaymentAdapter(env: Record<string, string | undefined> = Deno.env.toObject()): PaymentAdapter {
  const provider = env.PAYMENT_PROVIDER?.trim().toLowerCase()
  if (!provider) return new UnconfiguredPaymentAdapter()
  if (provider === 'demo' || provider === 'test') return new DemoPaymentAdapter()
  if (provider === 'unipesa' || provider === 'unipesa_pay' || provider === 'uni_pesa') return new UnipesaPaymentAdapter(env)
  if (provider === 'dpo_pay' || provider === 'dpo') return new DpoPayAdapter(env)
  throw new Error(`Payment provider "${provider}" has no adapter implementation yet.`)
}
