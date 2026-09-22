-- Allow platform administrators to read the financial records used by the
-- internal reporting dashboard. The helper deliberately only checks the
-- caller's own profile, so it is safe to use inside RLS policies.
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;

DROP POLICY IF EXISTS "platform_admins_read_profiles" ON public.profiles;
CREATE POLICY "platform_admins_read_profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_platform_admin());

DROP POLICY IF EXISTS "platform_admins_read_organizers" ON public.organizers;
CREATE POLICY "platform_admins_read_organizers" ON public.organizers
  FOR SELECT TO authenticated
  USING (public.is_platform_admin());

DROP POLICY IF EXISTS "platform_admins_read_events" ON public.events;
CREATE POLICY "platform_admins_read_events" ON public.events
  FOR SELECT TO authenticated
  USING (public.is_platform_admin());

DROP POLICY IF EXISTS "platform_admins_read_orders" ON public.orders;
CREATE POLICY "platform_admins_read_orders" ON public.orders
  FOR SELECT TO authenticated
  USING (public.is_platform_admin());

DROP POLICY IF EXISTS "platform_admins_read_order_items" ON public.order_items;
CREATE POLICY "platform_admins_read_order_items" ON public.order_items
  FOR SELECT TO authenticated
  USING (public.is_platform_admin());

DROP POLICY IF EXISTS "platform_admins_read_ticket_tiers" ON public.ticket_tiers;
CREATE POLICY "platform_admins_read_ticket_tiers" ON public.ticket_tiers
  FOR SELECT TO authenticated
  USING (public.is_platform_admin());

DROP POLICY IF EXISTS "platform_admins_read_tickets" ON public.tickets;
CREATE POLICY "platform_admins_read_tickets" ON public.tickets
  FOR SELECT TO authenticated
  USING (public.is_platform_admin());

DROP POLICY IF EXISTS "platform_admins_read_transactions" ON public.transactions;
CREATE POLICY "platform_admins_read_transactions" ON public.transactions
  FOR SELECT TO authenticated
  USING (public.is_platform_admin());

DROP POLICY IF EXISTS "platform_admins_read_agent_sales" ON public.agent_sales;
CREATE POLICY "platform_admins_read_agent_sales" ON public.agent_sales
  FOR SELECT TO authenticated
  USING (public.is_platform_admin());

DROP POLICY IF EXISTS "platform_admins_read_commissions" ON public.commissions;
CREATE POLICY "platform_admins_read_commissions" ON public.commissions
  FOR SELECT TO authenticated
  USING (public.is_platform_admin());

DROP POLICY IF EXISTS "platform_admins_read_refund_requests" ON public.refund_requests;
CREATE POLICY "platform_admins_read_refund_requests" ON public.refund_requests
  FOR SELECT TO authenticated
  USING (public.is_platform_admin());
