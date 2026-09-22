-- A confirmation can fire more than one notification path for the same
-- attendee/event/type. Duplicate notifications must not abort the purchase.
CREATE OR REPLACE FUNCTION public.notify_attendee_order_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.customer_id IS NOT NULL
    AND TG_OP = 'UPDATE'
    AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.notifications (
      user_id, organizer_id, type, title, body, event_id, recipient_scope
    )
    VALUES (
      NEW.customer_id,
      NEW.organizer_id,
      CASE WHEN NEW.status IN ('confirmed', 'refunded') THEN 'payment' ELSE 'ticket' END,
      CASE
        WHEN NEW.status = 'confirmed' THEN 'Payment confirmed'
        WHEN NEW.status = 'refunded' THEN 'Payment refunded'
        ELSE 'Order updated'
      END,
      CASE
        WHEN NEW.status = 'confirmed' THEN 'Your payment was confirmed.'
        WHEN NEW.status = 'refunded' THEN 'Your payment was refunded.'
        ELSE 'Your ticket order status changed to ' || NEW.status || '.'
      END,
      NEW.event_id,
      'attendee'
    )
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;