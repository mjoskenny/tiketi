CREATE OR REPLACE FUNCTION public.is_organizer_member(target_organizer_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organizer_members
    WHERE organizer_id = target_organizer_id
      AND user_id = auth.uid()
      AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.has_organizer_permission(target_organizer_id UUID, permission_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organizers
    WHERE id = target_organizer_id
      AND user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1
    FROM public.organizer_members AS members
    LEFT JOIN public.organizer_roles AS roles ON roles.id = members.role_id
    WHERE members.organizer_id = target_organizer_id
      AND members.user_id = auth.uid()
      AND members.status = 'active'
      AND (
        COALESCE((roles.permissions ->> 'all')::BOOLEAN, FALSE)
        OR COALESCE((roles.permissions ->> permission_key)::BOOLEAN, FALSE)
      )
  );
$$;

DROP POLICY IF EXISTS "members_self_read" ON public.organizer_members;
CREATE POLICY "members_self_read" ON public.organizer_members
FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "members_self_accept" ON public.organizer_members;
CREATE POLICY "members_self_accept" ON public.organizer_members
FOR UPDATE USING (auth.uid() = user_id AND status = 'pending')
WITH CHECK (auth.uid() = user_id AND status = 'active');

DROP POLICY IF EXISTS "members_team_read" ON public.organizer_members;
CREATE POLICY "members_team_read" ON public.organizer_members
FOR SELECT USING (public.is_organizer_member(organizer_id));

DROP POLICY IF EXISTS "roles_team_read" ON public.organizer_roles;
CREATE POLICY "roles_team_read" ON public.organizer_roles
FOR SELECT USING (public.is_organizer_member(organizer_id));

DROP POLICY IF EXISTS "events_team_read" ON public.events;
CREATE POLICY "events_team_read" ON public.events
FOR SELECT USING (public.is_organizer_member(organizer_id));

DROP POLICY IF EXISTS "events_team_manage" ON public.events;
CREATE POLICY "events_team_manage" ON public.events
FOR ALL USING (public.has_organizer_permission(organizer_id, 'events'))
WITH CHECK (public.has_organizer_permission(organizer_id, 'events'));

DROP POLICY IF EXISTS "ticket_tiers_team_read" ON public.ticket_tiers;
CREATE POLICY "ticket_tiers_team_read" ON public.ticket_tiers
FOR SELECT USING (EXISTS (SELECT 1 FROM public.events WHERE events.id = ticket_tiers.event_id AND public.is_organizer_member(events.organizer_id)));

DROP POLICY IF EXISTS "ticket_tiers_team_manage" ON public.ticket_tiers;
CREATE POLICY "ticket_tiers_team_manage" ON public.ticket_tiers
FOR ALL USING (EXISTS (SELECT 1 FROM public.events WHERE events.id = ticket_tiers.event_id AND public.has_organizer_permission(events.organizer_id, 'events')))
WITH CHECK (EXISTS (SELECT 1 FROM public.events WHERE events.id = ticket_tiers.event_id AND public.has_organizer_permission(events.organizer_id, 'events')));

DROP POLICY IF EXISTS "tickets_team_read" ON public.tickets;
CREATE POLICY "tickets_team_read" ON public.tickets
FOR SELECT USING (EXISTS (SELECT 1 FROM public.events WHERE events.id = tickets.event_id AND public.has_organizer_permission(events.organizer_id, 'checkin')));

DROP POLICY IF EXISTS "members_team_manage" ON public.organizer_members;
CREATE POLICY "members_team_manage" ON public.organizer_members
FOR ALL USING (public.has_organizer_permission(organizer_id, 'members'))
WITH CHECK (public.has_organizer_permission(organizer_id, 'members'));

DROP POLICY IF EXISTS "roles_team_manage" ON public.organizer_roles;
CREATE POLICY "roles_team_manage" ON public.organizer_roles
FOR ALL USING (public.has_organizer_permission(organizer_id, 'roles'))
WITH CHECK (public.has_organizer_permission(organizer_id, 'roles'));

DROP POLICY IF EXISTS "customers_team_read" ON public.customers;
CREATE POLICY "customers_team_read" ON public.customers
FOR SELECT USING (public.has_organizer_permission(organizer_id, 'customers'));

DROP POLICY IF EXISTS "customers_team_manage" ON public.customers;
CREATE POLICY "customers_team_manage" ON public.customers
FOR ALL USING (public.has_organizer_permission(organizer_id, 'customers'))
WITH CHECK (public.has_organizer_permission(organizer_id, 'customers'));

DROP POLICY IF EXISTS "orders_team_read" ON public.orders;
CREATE POLICY "orders_team_read" ON public.orders
FOR SELECT USING (public.is_organizer_member(organizer_id));

DROP POLICY IF EXISTS "transactions_team_read" ON public.transactions;
CREATE POLICY "transactions_team_read" ON public.transactions
FOR SELECT USING (public.has_organizer_permission(organizer_id, 'transactions'));

DROP POLICY IF EXISTS "transactions_team_manage" ON public.transactions;
CREATE POLICY "transactions_team_manage" ON public.transactions
FOR ALL USING (public.has_organizer_permission(organizer_id, 'transactions'))
WITH CHECK (public.has_organizer_permission(organizer_id, 'transactions'));

DROP POLICY IF EXISTS "subscriptions_team_read" ON public.subscriptions;
CREATE POLICY "subscriptions_team_read" ON public.subscriptions
FOR SELECT USING (public.is_organizer_member(organizer_id));

DROP POLICY IF EXISTS "organizer_followers_team_manage" ON public.organizer_followers;
CREATE POLICY "organizer_followers_team_manage" ON public.organizer_followers
FOR DELETE USING (public.has_organizer_permission(organizer_id, 'followers'));

DROP POLICY IF EXISTS "organizer_followers_team_read" ON public.organizer_followers;
CREATE POLICY "organizer_followers_team_read" ON public.organizer_followers
FOR SELECT USING (public.has_organizer_permission(organizer_id, 'followers'));

-- Organizer notifications are addressed through organizer_id, so user_id may be NULL.
ALTER TABLE public.notifications
  ALTER COLUMN user_id DROP NOT NULL;

-- Ensure `organizer_id` exists on notifications before creating policies that reference it
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS organizer_id UUID REFERENCES public.organizers(id) ON DELETE CASCADE;

DROP POLICY IF EXISTS "notifications_own" ON public.notifications;
CREATE POLICY "notifications_own" ON public.notifications
FOR SELECT USING (
  auth.uid() = user_id
  OR EXISTS (SELECT 1 FROM public.organizers WHERE organizers.id = notifications.organizer_id AND organizers.user_id = auth.uid())
  OR public.is_organizer_member(organizer_id)
);

DROP POLICY IF EXISTS "notifications_mark_own" ON public.notifications;
CREATE POLICY "notifications_mark_own" ON public.notifications
FOR UPDATE USING (
  auth.uid() = user_id
  OR EXISTS (SELECT 1 FROM public.organizers WHERE organizers.id = notifications.organizer_id AND organizers.user_id = auth.uid())
  OR public.is_organizer_member(organizer_id)
) WITH CHECK (
  auth.uid() = user_id
  OR EXISTS (SELECT 1 FROM public.organizers WHERE organizers.id = notifications.organizer_id AND organizers.user_id = auth.uid())
  OR public.is_organizer_member(organizer_id)
);
 
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('ticket', 'event', 'payment', 'promotion', 'team', 'follower'));

CREATE OR REPLACE FUNCTION public.notify_organizer_follower()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications (user_id, organizer_id, type, title, body)
  VALUES (NULL, NEW.organizer_id, 'follower', 'New follower', 'Someone started following your organizer profile.');
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS notify_organizer_follower_on_create ON public.organizer_followers;
CREATE TRIGGER notify_organizer_follower_on_create
AFTER INSERT ON public.organizer_followers
FOR EACH ROW EXECUTE FUNCTION public.notify_organizer_follower();

CREATE OR REPLACE FUNCTION public.notify_organizer_member_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.notifications (user_id, organizer_id, type, title, body)
    VALUES (NULL, NEW.organizer_id, 'team', 'Team invitation sent', 'A new team member invitation is waiting for acceptance.');
  ELSIF OLD.status = 'pending' AND NEW.status = 'active' THEN
    INSERT INTO public.notifications (user_id, organizer_id, type, title, body)
    VALUES (NULL, NEW.organizer_id, 'team', 'Team invitation accepted', 'A team member accepted the organizer invitation.');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS notify_organizer_member_change ON public.organizer_members;
CREATE TRIGGER notify_organizer_member_change
AFTER INSERT OR UPDATE OF status ON public.organizer_members
FOR EACH ROW EXECUTE FUNCTION public.notify_organizer_member_change();

CREATE OR REPLACE FUNCTION public.notify_organizer_sold_out()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE event_organizer UUID;
DECLARE event_title TEXT;
BEGIN
  IF NEW.quantity > 0 AND NEW.sold >= NEW.quantity AND (TG_OP = 'INSERT' OR OLD.sold < OLD.quantity) THEN
    SELECT events.organizer_id, events.title INTO event_organizer, event_title
    FROM public.events WHERE events.id = NEW.event_id;
    INSERT INTO public.notifications (user_id, organizer_id, type, title, body, event_id)
    VALUES (NULL, event_organizer, 'event', 'Event ticket tier sold out', COALESCE(event_title, 'Your event') || ' has a sold-out ticket tier.', NEW.event_id);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS notify_organizer_sold_out_on_tier ON public.ticket_tiers;
CREATE TRIGGER notify_organizer_sold_out_on_tier
AFTER INSERT OR UPDATE OF sold, quantity ON public.ticket_tiers
FOR EACH ROW EXECUTE FUNCTION public.notify_organizer_sold_out();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'organizer_members') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.organizer_members;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'ticket_tiers') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_tiers;
  END IF;
END
$$;
