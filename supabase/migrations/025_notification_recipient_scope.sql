ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS recipient_scope TEXT NOT NULL DEFAULT 'attendee';

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_recipient_scope_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_recipient_scope_check
  CHECK (recipient_scope IN ('attendee', 'organizer'));

UPDATE public.notifications
SET recipient_scope = 'organizer'
WHERE recipient_scope = 'attendee'
  AND title IN ('New order received', 'Order update', 'Event update', 'Transaction update', 'New follower', 'Event ticket tier sold out');

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
  WHERE recipients.user_id IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_organizer_order_audience()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.notify_organizer_audience(NEW.organizer_id, 'orders', 'payment', 'Order update', 'An order was created or updated for your organization.', NEW.event_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_organizer_order_audience_on_order ON public.orders;
CREATE TRIGGER notify_organizer_order_audience_on_order
AFTER INSERT OR UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.notify_organizer_order_audience();

CREATE OR REPLACE FUNCTION public.notify_organizer_event_audience()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status OR OLD.title IS DISTINCT FROM NEW.title OR OLD.date IS DISTINCT FROM NEW.date OR OLD.venue IS DISTINCT FROM NEW.venue THEN
    PERFORM public.notify_organizer_audience(NEW.organizer_id, 'events', 'event', 'Event update', NEW.title || ' has an event update.', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_organizer_event_audience_on_event ON public.events;
CREATE TRIGGER notify_organizer_event_audience_on_event
AFTER INSERT OR UPDATE OF status, title, date, venue ON public.events
FOR EACH ROW EXECUTE FUNCTION public.notify_organizer_event_audience();

CREATE OR REPLACE FUNCTION public.notify_organizer_transaction_audience()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.notify_organizer_audience(NEW.organizer_id, 'transactions', 'payment', 'Transaction update', 'A transaction for your organization was updated.', NULL);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_organizer_transaction_audience_on_transaction ON public.transactions;
CREATE TRIGGER notify_organizer_transaction_audience_on_transaction
AFTER INSERT OR UPDATE OF status ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.notify_organizer_transaction_audience();

CREATE OR REPLACE FUNCTION public.notify_organizer_follower_audience()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.notify_organizer_audience(NEW.organizer_id, 'followers', 'follower', 'New follower', 'Someone started following your organizer profile.', NULL);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_organizer_follower_audience_on_create ON public.organizer_followers;
CREATE TRIGGER notify_organizer_follower_audience_on_create
AFTER INSERT ON public.organizer_followers
FOR EACH ROW EXECUTE FUNCTION public.notify_organizer_follower_audience();
