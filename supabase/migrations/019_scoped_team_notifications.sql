DROP POLICY IF EXISTS "notifications_own" ON public.notifications;
CREATE POLICY "notifications_own" ON public.notifications
FOR SELECT USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.organizers
    WHERE organizers.id = notifications.organizer_id
      AND organizers.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "notifications_mark_own" ON public.notifications;
CREATE POLICY "notifications_mark_own" ON public.notifications
FOR UPDATE USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.organizers
    WHERE organizers.id = notifications.organizer_id
      AND organizers.user_id = auth.uid()
  )
) WITH CHECK (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.organizers
    WHERE organizers.id = notifications.organizer_id
      AND organizers.user_id = auth.uid()
  )
);

CREATE OR REPLACE FUNCTION public.notify_organizer_member_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.notifications (user_id, organizer_id, type, title, body)
    VALUES (NEW.user_id, NEW.organizer_id, 'team', 'Team invitation sent', 'You have been invited to join an organizer team.');
  ELSIF OLD.status = 'pending' AND NEW.status = 'active' THEN
    INSERT INTO public.notifications (user_id, organizer_id, type, title, body)
    VALUES (NEW.user_id, NEW.organizer_id, 'team', 'Team invitation accepted', 'Your organizer team access is now active.');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_organizer_order()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE owner_id UUID;
BEGIN
  IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status THEN
    SELECT user_id INTO owner_id FROM public.organizers WHERE id = NEW.organizer_id;
    INSERT INTO public.notifications (user_id, organizer_id, type, title, body, event_id)
    VALUES (owner_id, NEW.organizer_id, 'payment', 'New order received', 'A new order was placed for your event.', NEW.event_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_organizer_follower()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE owner_id UUID;
BEGIN
  SELECT user_id INTO owner_id FROM public.organizers WHERE id = NEW.organizer_id;
  INSERT INTO public.notifications (user_id, organizer_id, type, title, body)
  VALUES (owner_id, NEW.organizer_id, 'follower', 'New follower', 'Someone started following your organizer profile.');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_organizer_sold_out()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE event_organizer UUID;
DECLARE event_title TEXT;
DECLARE owner_id UUID;
BEGIN
  IF NEW.quantity > 0 AND NEW.sold >= NEW.quantity AND (TG_OP = 'INSERT' OR OLD.sold < OLD.quantity) THEN
    SELECT events.organizer_id, events.title INTO event_organizer, event_title
    FROM public.events WHERE events.id = NEW.event_id;
    SELECT user_id INTO owner_id FROM public.organizers WHERE id = event_organizer;
    INSERT INTO public.notifications (user_id, organizer_id, type, title, body, event_id)
    VALUES (owner_id, event_organizer, 'event', 'Event ticket tier sold out', COALESCE(event_title, 'Your event') || ' has a sold-out ticket tier.', NEW.event_id);
  END IF;
  RETURN NEW;
END;
$$;
