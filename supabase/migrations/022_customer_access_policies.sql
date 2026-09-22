DROP POLICY IF EXISTS "customers_team_read" ON public.customers;
CREATE POLICY "customers_team_read" ON public.customers
FOR SELECT USING (public.has_organizer_permission(organizer_id, 'customers'));

DROP POLICY IF EXISTS "customers_team_manage" ON public.customers;
CREATE POLICY "customers_team_manage" ON public.customers
FOR ALL USING (public.has_organizer_permission(organizer_id, 'customers'))
WITH CHECK (public.has_organizer_permission(organizer_id, 'customers'));
