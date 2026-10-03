import { Hono, type Context } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.tsx";
import { createPaymentAdapter } from "./payments.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import { jsPDF } from "npm:jspdf@4.2.1";
const app = new Hono();

const admin = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

async function imageDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = '';
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return `data:${response.headers.get('content-type') || 'image/png'};base64,${btoa(binary)}`;
  } catch {
    return null;
  }
}

async function pdfAttachment(ticket: {
  qr_code: string;
  holder_name?: string | null;
  holder_email?: string | null;
  holder_phone?: string | null;
  created_at?: string | null;
}, order: { holder_name?: string | null; holder_email?: string | null; holder_phone?: string | null }, event: {
  title?: string | null;
  date?: string | null;
  time?: string | null;
  end_time?: string | null;
  venue?: string | null;
  cover_image?: string | null;
}, tier: { name?: string | null; price?: number | null; group_size?: number | null; expires_at?: string | null; extra_info?: string | null }) {
  // Keep this layout in sync with DigitalTicketPage.createPdf().
  const title = event.title || 'Event';
  const date = event.date || '';
  const time = event.time?.slice(0, 5) || '';
  const venue = event.venue || '';
  const ticketNumber = ticket.qr_code;
  const ticketType = tier.name || 'REGULAR';
  const ticketPrice = Number(tier.price) || 0;
  const ticketHolderName = ticket.holder_name || order.holder_name || 'Guest';
  const ticketContact = ticket.holder_phone || order.holder_phone || ticket.holder_email || order.holder_email || 'Customer details';
  const purchasedAt = ticket.created_at
    ? new Date(ticket.created_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
    : '—';
  const ticketGroupSize = tier.group_size && tier.group_size > 1 ? tier.group_size : null;
  const ticketExpiry = tier.expires_at
    ? new Date(`${tier.expires_at}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';
  const ticketExtraInfo = tier.extra_info?.trim() || '';
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [280, 140] });
  const cover = event.cover_image ? await imageDataUrl(event.cover_image) : null;
  const qr = ticketNumber
    ? await imageDataUrl(`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(ticketNumber)}&size=420x420&format=png`)
    : null;

  pdf.setFillColor(10, 10, 10);
  pdf.rect(0, 0, 280, 140, 'F');
  if (cover) {
    pdf.addImage(cover, 'JPEG', 0, 0, 280, 140);
    pdf.setFillColor(5, 5, 5);
    pdf.setGState(new pdf.GState({ opacity: 0.28 }));
    pdf.rect(0, 0, 280, 140, 'F');
    pdf.setGState(new pdf.GState({ opacity: 1 }));
  }
  pdf.setFillColor(249, 112, 21);
  pdf.rect(0, 0, 18, 140, 'F');
  pdf.setFillColor(250, 250, 250);
  pdf.roundedRect(97, 28, 177, 90, 4, 4, 'F');
  pdf.setTextColor(25, 25, 25);
  pdf.setFontSize(12);
  pdf.text(title.slice(0, 38), 103, 41);
  pdf.setTextColor(70, 70, 70);
  pdf.setFontSize(6);
  pdf.text('DATE', 103, 48); pdf.text('TIME', 137, 48); pdf.text('TICKET TYPE', 163, 48);
  pdf.setTextColor(25, 25, 25);
  pdf.setFontSize(7);
  pdf.setTextColor(249, 112, 21);
  pdf.setFontSize(8);
  pdf.text(ticketType.slice(0, 15), 163, 54);
  pdf.setTextColor(25, 25, 25);
  pdf.setFontSize(7);
  pdf.text(date || '—', 103, 54); pdf.text(time || '—', 137, 54);
  pdf.setTextColor(100, 100, 100);
  pdf.setFontSize(6);
  pdf.text('VENUE', 103, 62);
  pdf.setTextColor(25, 25, 25);
  pdf.setFontSize(7);
  pdf.text(venue.slice(0, 42) || '—', 103, 68);
  pdf.setDrawColor(220, 220, 220);
  pdf.line(103, 72, 226, 72);
  pdf.setTextColor(100, 100, 100);
  pdf.setFontSize(6);
  pdf.text('TICKET HOLDER', 103, 79);
  pdf.setTextColor(25, 25, 25);
  pdf.setFontSize(8);
  pdf.text(ticketHolderName.slice(0, 24), 103, 85);
  pdf.setTextColor(100, 100, 100);
  pdf.setFontSize(6);
  pdf.text(ticketContact.slice(0, 28), 103, 91);
  pdf.text('PRICE', 103, 99);
  pdf.setTextColor(25, 25, 25);
  pdf.setFontSize(7);
  pdf.text(`${ticketPrice.toLocaleString()} BIF`, 103, 105);
  pdf.setTextColor(100, 100, 100);
  pdf.text('PURCHASED', 145, 99);
  pdf.setTextColor(25, 25, 25);
  pdf.text(purchasedAt.slice(0, 20), 145, 105);
  pdf.setTextColor(100, 100, 100);
  let metadataY = 114;
  if (ticketGroupSize) { pdf.text(`GROUP ${ticketGroupSize}`, 103, metadataY); metadataY += 5; }
  if (ticketExpiry) pdf.text(`EXPIRES ${ticketExpiry}`, 145, 114);
  if (ticketExtraInfo) pdf.text(`INFO: ${ticketExtraInfo.slice(0, 46)}`, 103, metadataY);
  if (qr) {
    pdf.addImage(qr, 'PNG', 238, 46, 29, 29);
    pdf.setTextColor(45, 45, 45);
    pdf.setFontSize(5);
    pdf.text(ticketNumber.slice(0, 22) || 'Unavailable', 238, 82);
  }
  pdf.setTextColor(130, 130, 130);
  pdf.setFontSize(5);
  pdf.text('Powered by Tiketi', 244, 114);
  return pdf.output('arraybuffer');
}

async function sendConfirmationEmail(to: string, title: string, ticketPdf: ArrayBuffer): Promise<{ sent: boolean; reason?: string }> {
  if (!to || !to.includes('@')) return { sent: false, reason: 'Ticket holder has no valid email address' };
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('EMAIL_FROM') || 'Tiketi <onboarding@resend.dev>';
  if (!apiKey) return { sent: false, reason: 'Email delivery is not configured: RESEND_API_KEY is missing' };
  const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
  try {
    const ticketPdfBytes = new Uint8Array(ticketPdf);
    let ticketPdfBinary = '';
    const chunkSize = 0x8000;
    for (let offset = 0; offset < ticketPdfBytes.length; offset += chunkSize) {
      ticketPdfBinary += String.fromCharCode(...ticketPdfBytes.subarray(offset, offset + chunkSize));
    }
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject: `Your Tiketi ticket for ${title}`, html: `<p>Hello,</p><p>Your ticket for <strong>${escapeHtml(title)}</strong> is confirmed. Your downloadable ticket PDF is attached.</p><p>Please present the QR code on the ticket at the event entrance.</p>`, attachments: [{ filename: 'tiketi-ticket.pdf', content: btoa(ticketPdfBinary) }] }),
    });
    if (!response.ok) {
      const providerError = await response.json().catch(() => null) as { message?: string; error?: string } | null;
      return { sent: false, reason: providerError?.message || providerError?.error || `Email provider returned HTTP ${response.status}` };
    }
    return { sent: true };
  } catch {
    return { sent: false, reason: 'Unable to connect to the email provider' };
  }
}

async function sendIssuedOrderEmails(db: ReturnType<typeof admin>, orderId: string) {
  const [{ data: order, error: orderError }, { data: tickets, error: ticketsError }] = await Promise.all([
    db.from('orders').select('id, status, holder_name, holder_email, event_id').eq('id', orderId).maybeSingle(),
    db.from('tickets').select('qr_code, holder_email, holder_name, holder_phone, created_at, ticket_tiers(name, price, group_size, expires_at, extra_info)').eq('order_id', orderId),
  ]);
  if (orderError || !order || order.status !== 'confirmed') return { sentCount: 0, total: 0, failedCount: 1, reason: 'Confirmed ticket order not found' };
  if (ticketsError || !tickets?.length) return { sentCount: 0, total: 0, failedCount: 1, reason: 'No issued tickets were found' };

  const { data: event } = await db.from('events').select('title, date, time, end_time, venue, city, cover_image').eq('id', order.event_id).maybeSingle();
  const results: Array<{ sent: boolean; reason?: string }> = [];
  for (let index = 0; index < tickets.length; index += 5) {
    const batch = tickets.slice(index, index + 5);
    const batchResults = await Promise.all(batch.map(async ticket => {
      const ticketTitle = event?.title ?? 'your event';
      const ticketPdf = await pdfAttachment(ticket, order, event ?? {}, ticket.ticket_tiers ?? {});
      return sendConfirmationEmail(ticket.holder_email || order.holder_email, ticketTitle, ticketPdf);
    }));
    results.push(...batchResults);
  }
  const sentCount = results.filter(result => result.sent).length;
  return {
    sentCount,
    total: tickets.length,
    failedCount: tickets.length - sentCount,
    reason: results.find(result => !result.sent)?.reason,
  };
}

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "apikey"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Health check endpoint
app.get("/make-server-4880c4b3/health", (c) => {
  return c.json({ status: "ok" });
});

app.get("/make-server-4880c4b3/payments/health", (c) => {
  try {
    const adapter = createPaymentAdapter();
    const configured = adapter.name !== 'unconfigured';
    return c.json({ configured, provider: adapter.name }, configured ? 200 : 503);
  } catch (error) {
    return c.json({ configured: false, error: error instanceof Error ? error.message : "Payment provider unavailable" }, 503);
  }
});

async function initializePayment(c: Parameters<typeof app.post>[1]) {
  try {
    const authorization = c.req.header('Authorization');
    if (!authorization) return c.json({ error: 'Sign in is required to start a payment' }, 401);
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authorization } },
    });
    const accessToken = authorization.replace(/^Bearer\s+/i, '');
    const { data: { user }, error: authError } = await userClient.auth.getUser(accessToken);
    if (authError || !user) return c.json({ error: 'Your session is invalid or expired' }, 401);

    const input = await c.req.json() as { orderId?: string; method?: 'card' | 'mobile_money'; paymentPhone?: string };
    if (!input.orderId || !['card', 'mobile_money'].includes(input.method ?? '')) {
      return c.json({ error: 'orderId and a supported payment method are required' }, 400);
    }

    const db = admin();
    const { data: order, error: orderReadError } = await db.from('orders')
      .select('id, customer_id, status, total, holder_name, holder_email, holder_phone')
      .eq('id', input.orderId)
      .maybeSingle();
    if (orderReadError || !order || order.customer_id !== user.id) return c.json({ error: 'Order not found' }, 404);
    if (order.status !== 'pending') return c.json({ error: 'This order is not awaiting payment' }, 409);

    const { data: settings } = await db.from('platform_settings')
      .select('ticket_sales_enabled, card_payments_enabled, mobile_money_enabled')
      .eq('id', true)
      .maybeSingle();
    if (!settings?.ticket_sales_enabled) return c.json({ error: 'Ticket sales are currently paused' }, 409);
    if (input.method === 'card' && !settings.card_payments_enabled) return c.json({ error: 'Card payments are currently unavailable' }, 409);
    if (input.method === 'mobile_money' && !settings.mobile_money_enabled) return c.json({ error: 'Mobile Money payments are currently unavailable' }, 409);

    const paymentPhone = input.method === 'mobile_money' ? (input.paymentPhone?.trim() || order.holder_phone || '') : order.holder_phone || '';
    if (input.method === 'mobile_money' && !/^\+?[0-9 ()-]{8,20}$/.test(paymentPhone)) {
      return c.json({ error: 'A valid Mobile Money phone number is required' }, 400);
    }

    const appBaseUrl = Deno.env.get('APP_BASE_URL') || c.req.header('Origin');
    if (!appBaseUrl) return c.json({ error: 'APP_BASE_URL is not configured for payment returns' }, 503);
    const appUrl = new URL(appBaseUrl);
    if (appUrl.protocol !== 'https:' && appUrl.hostname !== 'localhost' && appUrl.hostname !== '127.0.0.1') {
      return c.json({ error: 'Payment return URL must use HTTPS' }, 400);
    }
    const returnUrl = new URL('/payment-return', appUrl);
    returnUrl.searchParams.set('order_id', order.id);
    const webhookUrl = Deno.env.get('PAYMENT_WEBHOOK_URL') || `${Deno.env.get('SUPABASE_URL')}/functions/v1/server/make-server-4880c4b3/payments/webhook`;
    const adapter = createPaymentAdapter();
    const method = input.method!;
    const session = await adapter.createPayment({
      orderId: order.id,
      amount: Number(order.total),
      currency: 'BIF',
      method,
      customer: { name: order.holder_name || 'Tiketi Customer', email: order.holder_email || '', phone: paymentPhone },
      returnUrl: returnUrl.toString(),
      webhookUrl,
    });
    const { error: attemptError } = await db.from('payment_attempts').insert({
      order_id: order.id,
      provider: session.provider,
      provider_reference: session.reference,
      method,
      amount: Number(order.total),
      currency: 'BIF',
      status: 'pending',
      checkout_url: session.checkoutUrl,
    });
    if (attemptError) throw attemptError;
    const { data: updatedOrder, error: orderError } = await db.from('orders')
      .update({ payment_provider: session.provider, payment_reference: session.reference, payment_checkout_url: session.checkoutUrl, payment_expires_at: session.expiresAt, payment_method: method })
      .eq('id', order.id)
      .eq('customer_id', user.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();
    if (orderError) throw orderError;
    if (!updatedOrder) return c.json({ error: 'This order is no longer awaiting payment' }, 409);
    return c.json(session, 201);
  } catch (error) {
    console.error('Payment initialization failed', error);
    return c.json({ error: error instanceof Error ? error.message : "Unable to initialize payment" }, 503);
  }
}

app.post("/make-server-4880c4b3", initializePayment);
app.post("/make-server-4880c4b3/payments/initialize", initializePayment);

async function sendOrderTickets(c: Context) {
  try {
    const authorization = c.req.header('Authorization');
    if (!authorization) return c.json({ error: 'Sign in is required' }, 401);
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authorization } },
    });
    const accessToken = authorization.replace(/^Bearer\s+/i, '');
    const { data: { user }, error: authError } = await userClient.auth.getUser(accessToken);
    if (authError || !user) return c.json({ error: 'Your session is invalid or expired' }, 401);

    const { orderId } = await c.req.json() as { orderId?: string };
    if (!orderId) return c.json({ error: 'orderId is required' }, 400);

    const db = admin();
    const { data: order, error: orderError } = await db.from('orders')
      .select('id, customer_id, organizer_id, event_id, status, holder_name, holder_email')
      .eq('id', orderId)
      .single();
    if (orderError || !order || order.status !== 'confirmed') return c.json({ error: 'Confirmed sale not found' }, 404);

    const [ordersPermission, eventsPermission] = await Promise.all([
      userClient.rpc('has_organizer_permission', { target_organizer_id: order.organizer_id, permission_key: 'orders' }),
      userClient.rpc('has_organizer_permission', { target_organizer_id: order.organizer_id, permission_key: 'events' }),
    ]);
    const { data: agentSale } = await db.from('agent_sales').select('id').eq('order_id', orderId).eq('agent_user_id', user.id).maybeSingle();
    const canSend = order.customer_id === user.id || Boolean(agentSale) || Boolean(ordersPermission.data) || Boolean(eventsPermission.data);
    if (!canSend) return c.json({ error: 'You do not have permission to send these tickets' }, 403);

    const delivery = await sendIssuedOrderEmails(db, orderId);
    return c.json(delivery);
  } catch (error) {
    console.error('Ticket email delivery failed', error);
    return c.json({ error: error instanceof Error ? error.message : 'Unable to send ticket email' }, 500);
  }
}

app.post("/make-server-4880c4b3/tickets/send-order", sendOrderTickets);

app.post("/make-server-4880c4b3/payments/demo/complete", async (c) => {
  try {
    if ((Deno.env.get('PAYMENT_PROVIDER') || '').trim().toLowerCase() !== 'demo') return c.json({ error: 'Demo payments are not enabled' }, 404);
    const authorization = c.req.header('Authorization');
    if (!authorization) return c.json({ error: 'Sign in is required' }, 401);
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authorization } },
    });
    const accessToken = authorization.replace(/^Bearer\s+/i, '');
    const { data: { user }, error: authError } = await userClient.auth.getUser(accessToken);
    if (authError || !user) return c.json({ error: 'Your session is invalid or expired' }, 401);
    const { orderId } = await c.req.json() as { orderId?: string };
    if (!orderId) return c.json({ error: 'orderId is required' }, 400);
    const db = admin();
    const { data: order } = await db.from('orders').select('id, customer_id, status').eq('id', orderId).maybeSingle();
    if (!order || order.customer_id !== user.id || order.status !== 'pending') return c.json({ error: 'Pending order not found' }, 404);
    const { data: tickets, error } = await db.rpc('confirm_paid_ticket_order', { p_order_id: orderId, p_payment_reference: `demo-${orderId}`, p_provider: 'demo' });
    if (error) throw error;
    const delivery = await sendIssuedOrderEmails(db, orderId);
    return c.json({ provider: 'demo', status: 'succeeded', tickets: tickets ?? [], emailSent: delivery.failedCount === 0, emailDelivery: delivery });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unable to complete demo payment' }, 400);
  }
});

app.post("/make-server-4880c4b3/payments/webhook", async (c) => {
  try {
    const adapter = createPaymentAdapter();
    const webhook = await adapter.verifyWebhook(c.req.raw);
    console.log('Verified payment webhook', { provider: webhook.provider, reference: webhook.reference, status: webhook.status });
    if (webhook.orderId && webhook.status !== 'succeeded') {
      const db = admin();
      const attemptStatus = webhook.status === 'cancelled' ? 'cancelled' : webhook.status === 'failed' ? 'failed' : 'pending';
      await db.from('payment_attempts').update({ status: attemptStatus, provider_reference: webhook.reference })
        .eq('order_id', webhook.orderId).eq('provider', webhook.provider);
    }
    if (webhook.status === 'succeeded') {
      if (!webhook.orderId || webhook.amount === undefined || !webhook.currency) throw new Error('Verified payment is missing order, amount, or currency details');
      const db = admin();
      const { data: order, error: orderError } = await db.from('orders')
        .select('id, status, total, payment_provider, payment_method')
        .eq('id', webhook.orderId)
        .maybeSingle();
      if (orderError || !order) throw new Error('Payment order not found');
      if (order.payment_provider !== webhook.provider) throw new Error('Payment provider does not match the order');
      if (Math.abs(Number(order.total) - webhook.amount) >= 0.01 || webhook.currency.toUpperCase() !== 'BIF') {
        throw new Error('Verified payment amount or currency does not match the order');
      }
      const { data: attempts, error: attemptError } = await db.from('payment_attempts')
        .select('provider_reference')
        .eq('order_id', webhook.orderId)
        .eq('provider', webhook.provider);
      if (attemptError || !attempts?.some(attempt => attempt.provider_reference === webhook.reference || webhook.reference === order.id)) {
        throw new Error('Payment reference does not match an initialized attempt');
      }
      const wasPending = order.status === 'pending';
      if (!wasPending && order.status !== 'confirmed') throw new Error('Order is not eligible for payment confirmation');
      const { error } = await db.rpc('confirm_paid_ticket_order', { p_order_id: webhook.orderId, p_payment_reference: webhook.reference, p_provider: webhook.provider });
      if (error) throw error;
      await db.from('orders').update({ payment_method: order.payment_method || 'card' }).eq('id', webhook.orderId);
      await db.from('payment_attempts').update({ status: 'succeeded', provider_reference: webhook.reference })
        .eq('order_id', webhook.orderId).eq('provider', webhook.provider);
      if (wasPending) {
        const emailDelivery = await sendIssuedOrderEmails(db, webhook.orderId);
        console.log('Payment confirmed', { orderId: webhook.orderId, ...emailDelivery });
      }
    }
    return c.body('<?xml version="1.0" encoding="utf-8"?><API3G><Response>OK</Response></API3G>', 200, { 'Content-Type': 'application/xml; charset=utf-8' });
  } catch (error) {
    return c.body('<?xml version="1.0" encoding="utf-8"?><API3G><Response>ERROR</Response></API3G>', 401, { 'Content-Type': 'application/xml; charset=utf-8' });
  }
});

Deno.serve((request) => {
  const url = new URL(request.url);
  const functionPrefix = '/server';
  if (url.pathname === functionPrefix || url.pathname.startsWith(`${functionPrefix}/`)) {
    url.pathname = url.pathname.slice(functionPrefix.length) || '/';
  }
  return app.fetch(new Request(url, request));
});