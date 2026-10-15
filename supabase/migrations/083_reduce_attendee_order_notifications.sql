-- Ticket creation is the attendee-facing confirmation signal. Do not also
-- create a redundant "Payment confirmed" notification for the same order.
DELETE FROM public.notifications
WHERE recipient_scope = 'attendee'
  AND title = 'Payment confirmed';

CREATE OR REPLACE FUNCTION public.notify_attendee_order_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Keep meaningful refund updates, but let notify_attendee_ticket_created()
  -- be the single source of confirmation notifications.
  IF NEW.customer_id IS NOT NULL
    AND TG_OP = 'UPDATE'
    AND OLD.status IS DISTINCT FROM NEW.status
    AND NEW.status = 'refunded' THEN
    INSERT INTO public.notifications (
      user_id, organizer_id, type, title, body, event_id, recipient_scope
    )
    VALUES (
      NEW.customer_id,
      NEW.organizer_id,
      'payment',
      'Payment refunded',
      'Your payment was refunded.',
      NEW.event_id,
      'attendee'
    )
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;