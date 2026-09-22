CREATE OR REPLACE FUNCTION public.notify_organizer_audience(
  target_organizer_id UUID,
  permission_key TEXT,
  notification_type TEXT,
  notification_title TEXT,
  notification_body TEXT,
  target_event_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, organizer_id, type, title, body, event_id, recipient_scope)
  SELECT recipients.user_id, target_organizer_id, notification_type, notification_title, notification_body, target_event_id, 'organizer'
  FROM (
    SELECT organizers.user_id
    FROM public.organizers
    WHERE organizers.id = target_organizer_id
    UNION
    SELECT members.user_id
    FROM public.organizer_members AS members
    JOIN public.organizer_roles AS roles ON roles.id = members.role_id
    WHERE members.organizer_id = target_organizer_id
      AND members.status = 'active'
      AND (COALESCE((roles.permissions ->> 'all')::BOOLEAN, FALSE)
        OR COALESCE((roles.permissions ->> permission_key)::BOOLEAN, FALSE))
  ) AS recipients
  WHERE recipients.user_id IS NOT NULL
  ON CONFLICT DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_attendee_order_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    )
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
