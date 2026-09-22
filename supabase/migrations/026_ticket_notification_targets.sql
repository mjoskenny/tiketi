ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS ticket_id UUID REFERENCES public.tickets(id) ON DELETE CASCADE;

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_user_id_event_id_type_key;

DROP INDEX IF EXISTS notifications_user_id_event_id_type_key;

DELETE FROM public.notifications older
USING public.notifications newer
WHERE older.ctid < newer.ctid
  AND older.user_id IS NOT DISTINCT FROM newer.user_id
  AND older.event_id IS NOT DISTINCT FROM newer.event_id
  AND older.type = newer.type
  AND older.ticket_id IS NULL
  AND newer.ticket_id IS NULL;

INSERT INTO public.notifications (user_id, organizer_id, type, title, body, event_id, ticket_id, recipient_scope, created_at)
SELECT orders.customer_id, orders.organizer_id, 'ticket', 'Ticket confirmed', COALESCE(events.title, 'Your event') || ' ticket is confirmed and ready to view.', tickets.event_id, tickets.id, 'attendee', notifications.created_at
FROM public.notifications
JOIN public.orders ON orders.customer_id = notifications.user_id AND orders.event_id = notifications.event_id
JOIN public.tickets ON tickets.order_id = orders.id
JOIN public.events ON events.id = tickets.event_id
WHERE notifications.title = 'Tickets confirmed'
  AND notifications.ticket_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.notifications existing WHERE existing.ticket_id = tickets.id)
ON CONFLICT DO NOTHING;

DELETE FROM public.notifications
WHERE title = 'Tickets confirmed' AND ticket_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_ticket_target_key
  ON public.notifications (user_id, ticket_id, type)
  WHERE ticket_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_event_target_key
  ON public.notifications (user_id, event_id, type)
  WHERE ticket_id IS NULL AND event_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.notify_attendee_order_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.customer_id IS NOT NULL AND TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.notifications (user_id, organizer_id, type, title, body, event_id, recipient_scope)
    VALUES (
      NEW.customer_id,
      NEW.organizer_id,
      CASE WHEN NEW.status IN ('confirmed', 'refunded') THEN 'payment' ELSE 'ticket' END,
      CASE WHEN NEW.status = 'confirmed' THEN 'Payment confirmed' WHEN NEW.status = 'refunded' THEN 'Payment refunded' ELSE 'Order updated' END,
      CASE WHEN NEW.status = 'confirmed' THEN 'Your payment was confirmed.' WHEN NEW.status = 'refunded' THEN 'Your payment was refunded.' ELSE 'Your ticket order status changed to ' || NEW.status || '.' END,
      NEW.event_id,
      'attendee'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_attendee_order_update_on_order ON public.orders;
CREATE TRIGGER notify_attendee_order_update_on_order
AFTER UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.notify_attendee_order_update();

CREATE OR REPLACE FUNCTION public.notify_attendee_ticket_created()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  order_record RECORD;
BEGIN
  SELECT orders.customer_id, orders.organizer_id, events.title
  INTO order_record
  FROM public.orders
  JOIN public.events ON events.id = NEW.event_id
  WHERE orders.id = NEW.order_id;

  IF order_record.customer_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, organizer_id, type, title, body, event_id, ticket_id, recipient_scope)
    VALUES (
      order_record.customer_id,
      order_record.organizer_id,
      'ticket',
      'Ticket confirmed',
      COALESCE(order_record.title, 'Your event') || ' ticket is confirmed and ready to view.',
      NEW.event_id,
      NEW.id,
      'attendee'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_attendee_ticket_created_on_ticket ON public.tickets;
CREATE TRIGGER notify_attendee_ticket_created_on_ticket
AFTER INSERT ON public.tickets
FOR EACH ROW EXECUTE FUNCTION public.notify_attendee_ticket_created();
