import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.tsx";
import { createPaymentAdapter, type CreatePaymentInput } from "./payments.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
const app = new Hono();

const admin = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

function pdfAttachment(title: string, qrCode: string, holderName: string) {
  const text = `Tiketi ticket\nEvent: ${title}\nHolder: ${holderName}\nQR: ${qrCode}`;
  const stream = `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n4 0 obj<</Length ${text.length + 45}>>stream\nBT /F1 18 Tf 72 720 Td (${text.replace(/[()\\]/g, '\\$&').replace(/\n/g, ') Tj 0 -24 Td (')}) Tj ET\nendstream\nendobj\n5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF`;
  return btoa(stream);
}

async function sendConfirmationEmail(to: string, title: string, qrCode: string, holderName: string): Promise<{ sent: boolean; reason?: string }> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('EMAIL_FROM');
  if (!apiKey || !from) return { sent: false, reason: 'Email delivery is not configured' };
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject: `Your Tiketi ticket for ${title}`, html: `<p>Hello ${holderName || 'there'},</p><p>Your payment was confirmed. Your ticket PDF is attached.</p><p>Ticket QR code: <strong>${qrCode}</strong></p>`, attachments: [{ filename: 'tiketi-ticket.pdf', content: pdfAttachment(title, qrCode, holderName) }] }),
  });
  if (!response.ok) return { sent: false, reason: `Email provider returned HTTP ${response.status}` };
  return { sent: true };
}

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
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
    return c.json({ configured: true, provider: adapter.name });
  } catch (error) {
    return c.json({ configured: false, error: error instanceof Error ? error.message : "Payment provider unavailable" }, 503);
  }
});

async function initializePayment(c: Parameters<typeof app.post>[1]) {
  try {
    const input = await c.req.json() as CreatePaymentInput;
    if (!input.orderId || !input.amount || !input.currency || !input.method || !input.customer?.email) {
      return c.json({ error: "orderId, amount, currency, method, and customer.email are required" }, 400);
    }

    const webhookUrl = Deno.env.get('PAYMENT_WEBHOOK_URL') || input.webhookUrl;
    const adapter = createPaymentAdapter();
    const session = await adapter.createPayment({ ...input, webhookUrl });
    const { error: orderError } = await admin().from('orders').update({ payment_provider: session.provider, payment_reference: session.reference, payment_checkout_url: session.checkoutUrl, payment_expires_at: session.expiresAt, payment_method: input.method === 'mobile_money' ? 'mobile_money' : 'card' }).eq('id', input.orderId).eq('status', 'pending');
    if (orderError) throw orderError;
    return c.json(session, 201);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Unable to initialize payment" }, 503);
  }
}

app.post("/make-server-4880c4b3", initializePayment);
app.post("/make-server-4880c4b3/payments/initialize", initializePayment);

app.post("/make-server-4880c4b3/payments/demo/complete", async (c) => {
  try {
    if ((Deno.env.get('PAYMENT_PROVIDER') || '').trim().toLowerCase() !== 'demo') return c.json({ error: 'Demo payments are not enabled' }, 404);
    const { orderId } = await c.req.json() as { orderId?: string };
    if (!orderId) return c.json({ error: 'orderId is required' }, 400);
    const db = admin();
    const { data: tickets, error } = await db.rpc('confirm_paid_ticket_order', { p_order_id: orderId, p_payment_reference: `demo-${orderId}`, p_provider: 'demo' });
    if (error) throw error;
    return c.json({ provider: 'demo', status: 'succeeded', tickets: tickets ?? [], emailSent: false });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Unable to complete demo payment' }, 400);
  }
});

app.post("/make-server-4880c4b3/payments/webhook", async (c) => {
  try {
    const adapter = createPaymentAdapter();
    const webhook = await adapter.verifyWebhook(c.req.raw);
    console.log('Verified payment webhook', { provider: webhook.provider, reference: webhook.reference, status: webhook.status });
    if (webhook.status === 'succeeded' && webhook.orderId) {
      const db = admin();
      const { data: tickets, error } = await db.rpc('confirm_paid_ticket_order', { p_order_id: webhook.orderId, p_payment_reference: webhook.reference, p_provider: webhook.provider });
      if (error) throw error;
      const firstTicket = tickets?.[0];
      let emailSent = false;
      if (firstTicket?.holder_email) {
        const { data: event } = await db.from('events').select('title').eq('id', firstTicket.event_id).maybeSingle();
        try {
          const emailResult = await sendConfirmationEmail(firstTicket.holder_email, event?.title ?? 'your event', firstTicket.qr_code, firstTicket.holder_name ?? 'there');
          emailSent = emailResult.sent;
          if (!emailResult.sent) console.warn('Ticket email was not sent', { orderId: webhook.orderId, reason: emailResult.reason });
        } catch (emailError) {
          console.error('Ticket email delivery failed after payment confirmation', { orderId: webhook.orderId, error: emailError });
        }
      }
      console.log('Payment confirmed', { orderId: webhook.orderId, emailSent });
    }
    return c.body('<?xml version="1.0" encoding="utf-8"?><API3G><Response>OK</Response></API3G>', 200, { 'Content-Type': 'application/xml; charset=utf-8' });
  } catch (error) {
    return c.body('<?xml version="1.0" encoding="utf-8"?><API3G><Response>ERROR</Response></API3G>', 401, { 'Content-Type': 'application/xml; charset=utf-8' });
  }
});

Deno.serve(app.fetch);