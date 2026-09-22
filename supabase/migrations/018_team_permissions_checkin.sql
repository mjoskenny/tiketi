DROP POLICY IF EXISTS "customers_team_read" ON public.customers;
CREATE POLICY "customers_team_read" ON public.customers
FOR SELECT USING (public.has_organizer_permission(organizer_id, 'customers'));

DROP POLICY IF EXISTS "customers_team_manage" ON public.customers;
CREATE POLICY "customers_team_manage" ON public.customers
FOR ALL USING (public.has_organizer_permission(organizer_id, 'customers'))
WITH CHECK (public.has_organizer_permission(organizer_id, 'customers'));

DROP POLICY IF EXISTS "transactions_team_read" ON public.transactions;
CREATE POLICY "transactions_team_read" ON public.transactions
FOR SELECT USING (public.has_organizer_permission(organizer_id, 'transactions'));

DROP POLICY IF EXISTS "transactions_team_manage" ON public.transactions;
CREATE POLICY "transactions_team_manage" ON public.transactions
FOR ALL USING (public.has_organizer_permission(organizer_id, 'transactions'))
WITH CHECK (public.has_organizer_permission(organizer_id, 'transactions'));

DROP POLICY IF EXISTS "organizer_followers_team_read" ON public.organizer_followers;
CREATE POLICY "organizer_followers_team_read" ON public.organizer_followers
FOR SELECT USING (public.has_organizer_permission(organizer_id, 'followers'));

DROP POLICY IF EXISTS "organizer_followers_team_manage" ON public.organizer_followers;
CREATE POLICY "organizer_followers_team_manage" ON public.organizer_followers
FOR DELETE USING (public.has_organizer_permission(organizer_id, 'followers'));

DROP POLICY IF EXISTS "tickets_team_read" ON public.tickets;
CREATE POLICY "tickets_team_read" ON public.tickets
FOR SELECT USING (
  EXISTS (
    SELECT 1
    FROM public.events
    WHERE events.id = tickets.event_id
      AND public.has_organizer_permission(events.organizer_id, 'checkin')
  )
);
