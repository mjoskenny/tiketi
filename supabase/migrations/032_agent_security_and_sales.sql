-- Tiketi agent system and authorization hardening.
-- Extends the existing account, organizer, order, payment, ticket, and notification model.

-- A profile's authorization role is assigned during account provisioning; it is not
-- editable through ordinary profile updates.
CREATE OR REPLACE FUNCTION public.protect_profile_authorization()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND (NEW.role IS DISTINCT FROM OLD.role)
     AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Profile role cannot be changed from the client';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_authorization_on_update ON public.profiles;
CREATE TRIGGER protect_profile_authorization_on_update
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_authorization();

-- Replace the original broad self-service policy with explicit row ownership.
DROP POLICY IF EXISTS "profiles_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles
FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles
FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_delete_own" ON public.profiles
FOR DELETE USING (auth.uid() = id);

-- Public profile media remains readable, but private profile fields remain protected.
DROP POLICY IF EXISTS "profiles_public_read" ON public.profiles;
DROP POLICY IF EXISTS "profiles_public_media_read" ON public.profiles;
CREATE POLICY "profiles_public_media_read" ON public.profiles
FOR SELECT USING (true);

-- Team rows are structurally immutable to members. Owners and authorized team
-- managers can edit managed fields; invitees can only accept their own invite.
CREATE OR REPLACE FUNCTION public.protect_organizer_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE is_owner BOOLEAN;
BEGIN
  IF auth.role() = 'service_role' THEN RETURN NEW; END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.organizers
    WHERE id = OLD.organizer_id AND user_id = auth.uid()
  ) INTO is_owner;

  IF NEW.organizer_id IS DISTINCT FROM OLD.organizer_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Membership owner and organizer cannot change';
  END IF;

  IF NOT is_owner AND OLD.status = 'pending' AND NEW.status = 'active'
     AND auth.uid() = OLD.user_id
     AND NEW.role_id IS NOT DISTINCT FROM OLD.role_id THEN
    RETURN NEW;
  END IF;

  IF NOT is_owner AND NOT public.has_organizer_permission(OLD.organizer_id, 'members')
     AND NOT public.has_organizer_permission(OLD.organizer_id, 'roles') THEN
    RAISE EXCEPTION 'You do not have permission to modify this membership';
  END IF;

  IF NOT is_owner AND NEW.role_id IS DISTINCT FROM OLD.role_id
     AND NOT public.has_organizer_permission(OLD.organizer_id, 'roles') THEN
    RAISE EXCEPTION 'You do not have permission to change team roles';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_organizer_membership_on_update ON public.organizer_members;
CREATE TRIGGER protect_organizer_membership_on_update
BEFORE UPDATE ON public.organizer_members
FOR EACH ROW EXECUTE FUNCTION public.protect_organizer_membership();

-- Agent-specific relationships. The user remains a normal Tiketi account.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS agent_assignment_id UUID;

CREATE TABLE IF NOT EXISTS public.agent_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id UUID NOT NULL REFERENCES public.organizers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL REFERENCES public.profiles(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'cancelled')),
  message TEXT,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  declined_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS agent_invitations_one_pending
  ON public.agent_invitations(organizer_id, user_id) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS public.agent_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id UUID NOT NULL REFERENCES public.organizers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  organizer_member_id UUID NOT NULL REFERENCES public.organizer_members(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  ticket_tier_ids UUID[] NOT NULL DEFAULT '{}',
  allow_all_ticket_types BOOLEAN NOT NULL DEFAULT FALSE,
  commission_rate NUMERIC(5,2) NOT NULL CHECK (commission_rate >= 0 AND commission_rate <= 100),
  ticket_limit INTEGER CHECK (ticket_limit IS NULL OR ticket_limit >= 0),
  sales_limit INTEGER CHECK (sales_limit IS NULL OR sales_limit >= 0),
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'paused', 'expired', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at IS NULL OR ends_at > starts_at),
  UNIQUE (user_id, organizer_id, event_id)
);
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_agent_assignment_fk;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_agent_assignment_fk FOREIGN KEY (agent_assignment_id) REFERENCES public.agent_assignments(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.agent_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE RESTRICT,
  assignment_id UUID NOT NULL REFERENCES public.agent_assignments(id) ON DELETE RESTRICT,
  agent_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  organizer_id UUID NOT NULL REFERENCES public.organizers(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  payment_mode TEXT NOT NULL CHECK (payment_mode IN ('digital', 'cash')),
  status TEXT NOT NULL DEFAULT 'awaiting_payment' CHECK (status IN ('awaiting_payment', 'paid', 'cancelled', 'refunded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL UNIQUE REFERENCES public.agent_sales(id) ON DELETE RESTRICT,
  assignment_id UUID NOT NULL REFERENCES public.agent_assignments(id) ON DELETE RESTRICT,
  agent_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  organizer_id UUID NOT NULL REFERENCES public.organizers(id) ON DELETE RESTRICT,
  rate NUMERIC(5,2) NOT NULL CHECK (rate >= 0 AND rate <= 100),
  amount INTEGER NOT NULL CHECK (amount >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'available', 'paid', 'reversed')),
  available_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.commission_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  organizer_id UUID REFERENCES public.organizers(id) ON DELETE RESTRICT,
  commission_id UUID REFERENCES public.commissions(id) ON DELETE RESTRICT,
  withdrawal_id UUID,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('commission', 'reversal', 'withdrawal')),
  amount INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.agent_withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  amount INTEGER NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL,
  payment_reference TEXT,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'processing', 'paid', 'rejected')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);
ALTER TABLE public.commission_ledger
  DROP CONSTRAINT IF EXISTS commission_ledger_withdrawal_fk;
ALTER TABLE public.commission_ledger
  ADD CONSTRAINT commission_ledger_withdrawal_fk FOREIGN KEY (withdrawal_id) REFERENCES public.agent_withdrawals(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS agent_assignments_user_status_idx ON public.agent_assignments(user_id, status);
CREATE INDEX IF NOT EXISTS agent_sales_agent_idx ON public.agent_sales(agent_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_invitations_user_status_idx ON public.agent_invitations(user_id, status);

ALTER TABLE public.agent_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_withdrawals ENABLE ROW LEVEL SECURITY;

-- Invitations are visible to the recipient or organizer owner, but only the
-- recipient can accept/decline through the controlled functions below.
DROP POLICY IF EXISTS "agent_invites_recipient_read" ON public.agent_invitations;
DROP POLICY IF EXISTS "agent_invites_owner_read" ON public.agent_invitations;
DROP POLICY IF EXISTS "agent_invites_owner_manage" ON public.agent_invitations;
CREATE POLICY "agent_invites_recipient_read" ON public.agent_invitations FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "agent_invites_owner_read" ON public.agent_invitations FOR SELECT USING (EXISTS (SELECT 1 FROM public.organizers o WHERE o.id = organizer_id AND o.user_id = auth.uid()));
CREATE POLICY "agent_invites_owner_manage" ON public.agent_invitations FOR ALL USING (EXISTS (SELECT 1 FROM public.organizers o WHERE o.id = organizer_id AND o.user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.organizers o WHERE o.id = organizer_id AND o.user_id = auth.uid()));

DROP POLICY IF EXISTS "agent_assignments_agent_read" ON public.agent_assignments;
DROP POLICY IF EXISTS "agent_assignments_owner_manage" ON public.agent_assignments;
CREATE POLICY "agent_assignments_agent_read" ON public.agent_assignments FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "agent_assignments_owner_manage" ON public.agent_assignments FOR ALL USING (EXISTS (SELECT 1 FROM public.organizers o WHERE o.id = organizer_id AND o.user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.organizers o WHERE o.id = organizer_id AND o.user_id = auth.uid()));
DROP POLICY IF EXISTS "agent_sales_agent_read" ON public.agent_sales;
DROP POLICY IF EXISTS "agent_sales_owner_read" ON public.agent_sales;
CREATE POLICY "agent_sales_agent_read" ON public.agent_sales FOR SELECT USING (agent_user_id = auth.uid());
CREATE POLICY "agent_sales_owner_read" ON public.agent_sales FOR SELECT USING (EXISTS (SELECT 1 FROM public.organizers o WHERE o.id = organizer_id AND o.user_id = auth.uid()));
DROP POLICY IF EXISTS "commissions_agent_read" ON public.commissions;
DROP POLICY IF EXISTS "commissions_owner_read" ON public.commissions;
CREATE POLICY "commissions_agent_read" ON public.commissions FOR SELECT USING (agent_user_id = auth.uid());
CREATE POLICY "commissions_owner_read" ON public.commissions FOR SELECT USING (EXISTS (SELECT 1 FROM public.organizers o WHERE o.id = organizer_id AND o.user_id = auth.uid()));
DROP POLICY IF EXISTS "ledger_agent_read" ON public.commission_ledger;
CREATE POLICY "ledger_agent_read" ON public.commission_ledger FOR SELECT USING (agent_user_id = auth.uid());
DROP POLICY IF EXISTS "withdrawals_agent_read_insert" ON public.agent_withdrawals;
DROP POLICY IF EXISTS "withdrawals_agent_request" ON public.agent_withdrawals;
CREATE POLICY "withdrawals_agent_read_insert" ON public.agent_withdrawals FOR SELECT USING (agent_user_id = auth.uid());
CREATE POLICY "withdrawals_agent_request" ON public.agent_withdrawals FOR INSERT WITH CHECK (agent_user_id = auth.uid() AND status = 'requested');

-- Resolve a real existing profile by email inside the database. The client never
-- supplies a target auth/profile ID.
CREATE OR REPLACE FUNCTION public.invite_agent_by_email(
  p_organizer_id UUID, p_email TEXT, p_event_id UUID, p_ticket_tier_ids UUID[],
  p_commission_rate NUMERIC, p_ticket_limit INTEGER, p_sales_limit INTEGER, p_message TEXT DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_user UUID; member_row public.organizer_members%ROWTYPE; invitation_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.organizers WHERE id = p_organizer_id AND user_id = auth.uid()) THEN RAISE EXCEPTION 'Organizer owner access required'; END IF;
  SELECT id INTO target_user FROM public.profiles WHERE lower(email) = lower(trim(p_email)) LIMIT 1;
  IF target_user IS NULL THEN RAISE EXCEPTION 'This email must belong to an existing Tiketi account'; END IF;
  SELECT * INTO member_row FROM public.organizer_members WHERE organizer_id = p_organizer_id AND user_id = target_user;
  IF member_row.id IS NULL THEN
    INSERT INTO public.organizer_members (organizer_id, user_id, status) VALUES (p_organizer_id, target_user, 'pending') RETURNING * INTO member_row;
  END IF;
  IF member_row.status NOT IN ('pending', 'active') THEN RAISE EXCEPTION 'This team member is inactive'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.events WHERE id = p_event_id AND organizer_id = p_organizer_id) THEN RAISE EXCEPTION 'Event does not belong to this organizer'; END IF;
  IF p_commission_rate < 0 OR p_commission_rate > 100 THEN RAISE EXCEPTION 'Invalid commission rate'; END IF;
  INSERT INTO public.agent_invitations (organizer_id, user_id, invited_by, message)
  VALUES (p_organizer_id, target_user, auth.uid(), p_message)
  RETURNING id INTO invitation_id;
  INSERT INTO public.agent_assignments (organizer_id, user_id, organizer_member_id, event_id, ticket_tier_ids, allow_all_ticket_types, commission_rate, ticket_limit, sales_limit, status)
  VALUES (p_organizer_id, target_user, member_row.id, p_event_id, COALESCE(p_ticket_tier_ids, '{}'), COALESCE(cardinality(p_ticket_tier_ids), 0) = 0, p_commission_rate, p_ticket_limit, p_sales_limit, 'pending');
  INSERT INTO public.notifications (user_id, organizer_id, type, title, body)
  SELECT target_user, p_organizer_id, 'team', 'Agent invitation received', 'You have been invited to sell tickets for ' || o.name || '.'
  FROM public.organizers o WHERE o.id = p_organizer_id;
  RETURN invitation_id;
END;
$$;
REVOKE ALL ON FUNCTION public.invite_agent_by_email(UUID, TEXT, UUID, UUID[], NUMERIC, INTEGER, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invite_agent_by_email(UUID, TEXT, UUID, UUID[], NUMERIC, INTEGER, INTEGER, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.respond_to_agent_invitation(p_invitation_id UUID, p_accept BOOLEAN)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE invitation_row public.agent_invitations%ROWTYPE;
BEGIN
  SELECT * INTO invitation_row FROM public.agent_invitations WHERE id = p_invitation_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND OR invitation_row.status <> 'pending' OR invitation_row.expires_at <= NOW() THEN RAISE EXCEPTION 'Invitation is no longer available'; END IF;
  IF p_accept THEN
    UPDATE public.organizer_members SET status = 'active' WHERE organizer_id = invitation_row.organizer_id AND user_id = auth.uid() AND status = 'pending';
    UPDATE public.agent_invitations SET status = 'accepted', accepted_at = NOW() WHERE id = p_invitation_id AND status = 'pending';
    UPDATE public.agent_assignments SET status = 'active', updated_at = NOW() WHERE organizer_id = invitation_row.organizer_id AND user_id = auth.uid() AND status = 'pending';
  ELSE
    UPDATE public.agent_invitations SET status = 'declined', declined_at = NOW() WHERE id = p_invitation_id AND status = 'pending';
    UPDATE public.agent_assignments SET status = 'revoked', updated_at = NOW() WHERE organizer_id = invitation_row.organizer_id AND user_id = auth.uid() AND status = 'pending';
  END IF;
  RETURN invitation_row.organizer_id;
END;
$$;
REVOKE ALL ON FUNCTION public.respond_to_agent_invitation(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_to_agent_invitation(UUID, BOOLEAN) TO authenticated;

-- Atomic agent sale creation. It creates only a pending order; payment confirmation
-- remains the existing trusted payment/service-role operation.
CREATE OR REPLACE FUNCTION public.create_agent_sale(
  p_assignment_id UUID, p_ticket_tier_id UUID, p_quantity INTEGER,
  p_holder_name TEXT, p_holder_email TEXT, p_holder_phone TEXT, p_payment_mode TEXT
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.agent_assignments%ROWTYPE; tier_row public.ticket_tiers%ROWTYPE; order_id UUID; sold_count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'You must be signed in'; END IF;
  SELECT * INTO a FROM public.agent_assignments WHERE id = p_assignment_id AND user_id = auth.uid() AND status = 'active' FOR UPDATE;
  IF NOT FOUND OR a.starts_at > NOW() OR (a.ends_at IS NOT NULL AND a.ends_at <= NOW()) THEN RAISE EXCEPTION 'Agent assignment is not active'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organizer_members WHERE id = a.organizer_member_id AND user_id = auth.uid() AND organizer_id = a.organizer_id AND status = 'active') THEN RAISE EXCEPTION 'Active organizer membership required'; END IF;
  SELECT * INTO tier_row FROM public.ticket_tiers WHERE id = p_ticket_tier_id AND event_id = a.event_id FOR UPDATE;
  IF NOT FOUND OR (NOT a.allow_all_ticket_types AND NOT (p_ticket_tier_id = ANY(a.ticket_tier_ids))) THEN RAISE EXCEPTION 'Ticket type is not assigned'; END IF;
  IF p_quantity <= 0 OR tier_row.sold + p_quantity > tier_row.quantity THEN RAISE EXCEPTION 'Ticket inventory limit exceeded'; END IF;
  SELECT COALESCE(SUM(s.quantity), 0) INTO sold_count FROM public.agent_sales s WHERE s.assignment_id = a.id AND s.status IN ('awaiting_payment', 'paid');
  IF a.ticket_limit IS NOT NULL AND sold_count + p_quantity > a.ticket_limit THEN RAISE EXCEPTION 'Agent ticket limit exceeded'; END IF;
  IF a.sales_limit IS NOT NULL AND sold_count + p_quantity > a.sales_limit THEN RAISE EXCEPTION 'Agent sales limit exceeded'; END IF;
  IF p_payment_mode NOT IN ('digital', 'cash') THEN RAISE EXCEPTION 'Invalid payment mode'; END IF;
  INSERT INTO public.orders (customer_id, event_id, organizer_id, agent_assignment_id, status, subtotal, service_fee, total, payment_method, holder_name, holder_email, holder_phone)
  VALUES (auth.uid(), a.event_id, a.organizer_id, a.id, 'pending', tier_row.price * p_quantity, ROUND(tier_row.price * p_quantity * 0.05), tier_row.price * p_quantity + ROUND(tier_row.price * p_quantity * 0.05), NULL, p_holder_name, p_holder_email, p_holder_phone)
  RETURNING id INTO order_id;
  INSERT INTO public.order_items (order_id, ticket_tier_id, quantity, unit_price, total_price) VALUES (order_id, tier_row.id, p_quantity, tier_row.price, tier_row.price * p_quantity);
  INSERT INTO public.agent_sales (order_id, assignment_id, agent_user_id, organizer_id, quantity, payment_mode)
  VALUES (order_id, a.id, auth.uid(), a.organizer_id, p_quantity, p_payment_mode);
  RETURN order_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_agent_sale(UUID, UUID, INTEGER, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_agent_sale(UUID, UUID, INTEGER, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- Payment confirmation remains the only point that creates tickets. This trigger
-- records one commission using the assignment rate captured at sale time.
CREATE OR REPLACE FUNCTION public.record_agent_sale_after_payment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE sale_row public.agent_sales%ROWTYPE; assignment_row public.agent_assignments%ROWTYPE; commission_amount INTEGER;
BEGIN
  IF NEW.status = 'confirmed' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.agent_assignment_id IS NOT NULL THEN
    SELECT * INTO sale_row FROM public.agent_sales WHERE order_id = NEW.id FOR UPDATE;
    IF FOUND AND sale_row.status <> 'paid' THEN
      UPDATE public.agent_sales SET status = 'paid', paid_at = NOW() WHERE id = sale_row.id;
      SELECT * INTO assignment_row FROM public.agent_assignments WHERE id = sale_row.assignment_id;
      commission_amount := ROUND(NEW.subtotal * assignment_row.commission_rate / 100);
      INSERT INTO public.commissions (sale_id, assignment_id, agent_user_id, organizer_id, rate, amount)
      VALUES (sale_row.id, assignment_row.id, sale_row.agent_user_id, sale_row.organizer_id, assignment_row.commission_rate, commission_amount)
      ON CONFLICT (sale_id) DO NOTHING;
      INSERT INTO public.commission_ledger (agent_user_id, organizer_id, commission_id, entry_type, amount)
      SELECT sale_row.agent_user_id, sale_row.organizer_id, c.id, 'commission', c.amount FROM public.commissions c WHERE c.sale_id = sale_row.id
      ON CONFLICT DO NOTHING;
      INSERT INTO public.notifications (user_id, organizer_id, type, title, body)
      VALUES (sale_row.agent_user_id, sale_row.organizer_id, 'payment', 'Agent sale completed', 'Your agent sale has been paid and your commission is pending.');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS record_agent_sale_after_payment_on_order ON public.orders;
CREATE TRIGGER record_agent_sale_after_payment_on_order
AFTER UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.record_agent_sale_after_payment();

-- Make the new order column available to existing agent-aware readers.
CREATE INDEX IF NOT EXISTS orders_agent_assignment_idx ON public.orders(agent_assignment_id) WHERE agent_assignment_id IS NOT NULL;
