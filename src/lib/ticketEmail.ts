import { supabase } from './supabase'
import { projectId, publicAnonKey } from '../../utils/supabase/info'

export type TicketEmailResult = {
  sentCount: number
  total: number
  failedCount: number
  reason?: string
}

export async function sendOrderTicketEmails(orderId: string): Promise<TicketEmailResult> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) {
    return { sentCount: 0, total: 0, failedCount: 1, reason: 'Sign in again to send the tickets by email.' }
  }

  try {
    const response = await fetch(`https://${projectId}.supabase.co/functions/v1/server/make-server-4880c4b3/tickets/send-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: publicAnonKey,
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ orderId }),
    })
    const result = await response.json() as Partial<TicketEmailResult> & { error?: string }
    if (!response.ok) {
      return { sentCount: 0, total: Number(result.total) || 0, failedCount: Number(result.failedCount) || 1, reason: result.error || 'Ticket email delivery failed.' }
    }
    return {
      sentCount: Number(result.sentCount) || 0,
      total: Number(result.total) || 0,
      failedCount: Number(result.failedCount) || 0,
      reason: result.reason,
    }
  } catch {
    return { sentCount: 0, total: 0, failedCount: 1, reason: 'Could not reach the ticket email service.' }
  }
}
