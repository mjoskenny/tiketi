-- Operational controls extend the checkout settings in 063.  These switches
-- have server-side enforcement so they remain effective outside the dashboard.
ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS maintenance_mode BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS maintenance_message TEXT,
  ADD COLUMN IF NOT EXISTS marketplace_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS max_tickets_per_order INTEGER NOT NULL DEFAULT 20
    CHECK (max_tickets_per_order BETWEEN 1 AND 100),
  ADD COLUMN IF NOT EXISTS require_verified_organizers_to_publish BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS refund_requests_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS checkin_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- This helper can be used inside RLS policies without exposing the settings
-- table itself to public users.
CREATE OR REPLACE FUNCTION public.is_marketplace_enabled()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT marketplace_enabled FROM public.platform_settings WHERE id = TRUE), TRUE);
$$;

REVOKE ALL ON FUNCTION public.is_marketplace_enabled() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_marketplace_enabled() TO anon, authenticated;

-- Hide published events from the public catalog when the marketplace is
-- paused, while organizer and platform-admin policies continue to work.
DROP POLICY IF EXISTS "events_public_read" ON public.events;
CREATE POLICY "events_public_read" ON public.events
  FOR SELECT USING (status = 'published' AND public.is_marketplace_enabled());

-- Prevent an unverified organizer from newly publishing when that policy is
-- turned on. Existing published events are not changed retroactively.
CREATE OR REPLACE FUNCTION public.enforce_platform_event_publication_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  settings_row public.platform_settings%ROWTYPE;
BEGIN
  IF NEW.status = 'published' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'published') THEN
    SELECT * INTO settings_row FROM public.platform_settings WHERE id = TRUE;
    IF COALESCE(settings_row.require_verified_organizers_to_publish, FALSE)
      AND NOT EXISTS (
        SELECT 1
        FROM public.organizers
        WHERE id = NEW.organizer_id
          AND (verified = TRUE OR verification_status = 'verified')
      ) THEN
      RAISE EXCEPTION 'Organizer verification is required before an event can be published';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_platform_event_publication_rules ON public.events;
CREATE TRIGGER enforce_platform_event_publication_rules
  BEFORE INSERT OR UPDATE OF status ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.enforce_platform_event_publication_rules();

-- The public settings RPC intentionally returns only operational values that
-- customer-facing clients need to honor.
DROP FUNCTION IF EXISTS public.get_public_platform_checkout_settings();
CREATE FUNCTION public.get_public_platform_checkout_settings()
RETURNS TABLE (
  platform_name TEXT,
  support_email TEXT,
  checkout_notice TEXT,
  service_fee_percent NUMERIC,
  ticket_sales_enabled BOOLEAN,
  mobile_money_enabled BOOLEAN,
  card_payments_enabled BOOLEAN,
  maintenance_mode BOOLEAN,
  maintenance_message TEXT,
  marketplace_enabled BOOLEAN,
  max_tickets_per_order INTEGER,
  refund_requests_enabled BOOLEAN,
  checkin_enabled BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    settings.platform_name,
    settings.support_email,
    settings.checkout_notice,
    settings.service_fee_percent,
    settings.ticket_sales_enabled,
    settings.mobile_money_enabled,
    settings.card_payments_enabled,
    settings.maintenance_mode,
    settings.maintenance_message,
    settings.marketplace_enabled,
    settings.max_tickets_per_order,
    settings.refund_requests_enabled,
    settings.checkin_enabled
  FROM public.platform_settings AS settings
  WHERE settings.id = TRUE;
$$;

REVOKE ALL ON FUNCTION public.get_public_platform_checkout_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_platform_checkout_settings() TO anon, authenticated;

-- Enforce the per-order ticket cap while the ticket tier rows are locked.
CREATE OR REPLACE FUNCTION public.create_pending_ticket_order(
  p_event_id UUID, p_organizer_id UUID, p_quantities JSONB,
  p_holder_name TEXT, p_holder_email TEXT, p_holder_phone TEXT,
  p_holder_details JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  order_id UUID;
  tier_row RECORD;
  settings_row public.platform_settings%ROWTYPE;
  requested INTEGER;
  requested_ticket_count INTEGER := 0;
  subtotal INTEGER := 0;
  fee INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'You must be signed in to purchase tickets'; END IF;

  SELECT * INTO settings_row FROM public.platform_settings WHERE id = TRUE;
  IF NOT FOUND OR NOT settings_row.ticket_sales_enabled THEN
    RAISE EXCEPTION '%', COALESCE(NULLIF(settings_row.checkout_notice, ''), 'Ticket sales are currently paused. Please try again later.');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.events
    WHERE id = p_event_id AND organizer_id = p_organizer_id AND status = 'published'
  ) THEN
    RAISE EXCEPTION 'This event is not available for purchase';
  END IF;

  FOR tier_row IN
    SELECT id, price, quantity, sold, group_size, expires_at
    FROM public.ticket_tiers
    WHERE event_id = p_event_id AND p_quantities ? id::text
    FOR UPDATE
  LOOP
    requested := GREATEST(0, (p_quantities ->> tier_row.id::text)::INTEGER);
    IF requested = 0 THEN CONTINUE; END IF;
    IF tier_row.expires_at IS NOT NULL AND tier_row.expires_at < CURRENT_DATE THEN RAISE EXCEPTION 'Ticket tier has expired'; END IF;
    IF tier_row.sold + requested * GREATEST(1, tier_row.group_size) > tier_row.quantity THEN RAISE EXCEPTION 'Not enough tickets available'; END IF;
    requested_ticket_count := requested_ticket_count + requested * GREATEST(1, tier_row.group_size);
    subtotal := subtotal + requested * tier_row.price;
  END LOOP;

  IF subtotal = 0 THEN RAISE EXCEPTION 'Select at least one ticket'; END IF;
  IF requested_ticket_count > settings_row.max_tickets_per_order THEN
    RAISE EXCEPTION 'A maximum of % tickets can be purchased in one order', settings_row.max_tickets_per_order;
  END IF;
  fee := ROUND(subtotal * (settings_row.service_fee_percent / 100.0));

  INSERT INTO public.orders (
    customer_id, event_id, organizer_id, status, subtotal, service_fee, total,
    payment_method, holder_name, holder_email, holder_phone
  )
  VALUES (
    auth.uid(), p_event_id, p_organizer_id, 'pending', subtotal, fee, subtotal + fee,
    NULL, p_holder_name, p_holder_email, p_holder_phone
  )
  RETURNING id INTO order_id;

  FOR tier_row IN
    SELECT id, price, group_size
    FROM public.ticket_tiers
    WHERE event_id = p_event_id AND p_quantities ? id::text
  LOOP
    requested := GREATEST(0, (p_quantities ->> tier_row.id::text)::INTEGER);
    IF requested > 0 THEN
      INSERT INTO public.order_items (order_id, ticket_tier_id, quantity, unit_price, total_price, holder_details)
      VALUES (
        order_id, tier_row.id, requested * GREATEST(1, tier_row.group_size), tier_row.price,
        requested * tier_row.price, COALESCE(p_holder_details -> tier_row.id::text, '[]'::jsonb)
      );
    END IF;
  END LOOP;

  RETURN order_id;
END;
$$;

-- Block new refund requests when refunds are paused; existing reviews remain
-- available so support and organizers can close outstanding requests.
CREATE OR REPLACE FUNCTION public.request_ticket_refund(p_ticket_id UUID, p_reason TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ticket_row public.tickets%ROWTYPE;
  order_row public.orders%ROWTYPE;
  request_id UUID;
  refunds_enabled BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'You must be signed in'; END IF;
  SELECT COALESCE(refund_requests_enabled, TRUE) INTO refunds_enabled FROM public.platform_settings WHERE id = TRUE;
  IF NOT COALESCE(refunds_enabled, TRUE) THEN RAISE EXCEPTION 'Refund requests are currently unavailable'; END IF;
  IF NULLIF(TRIM(p_reason), '') IS NULL THEN RAISE EXCEPTION 'A refund reason is required'; END IF;

  SELECT * INTO ticket_row FROM public.tickets WHERE id = p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ticket not found'; END IF;
  SELECT * INTO order_row FROM public.orders WHERE id = ticket_row.order_id;
  IF order_row.customer_id <> auth.uid() THEN RAISE EXCEPTION 'You do not own this ticket'; END IF;
  IF ticket_row.status <> 'valid' THEN RAISE EXCEPTION 'Only unused tickets can be refunded'; END IF;
  IF order_row.status <> 'confirmed' THEN RAISE EXCEPTION 'This order is not eligible for a refund request'; END IF;
  IF EXISTS (SELECT 1 FROM public.refund_requests WHERE ticket_id = p_ticket_id AND status IN ('pending', 'approved', 'processed')) THEN
    RAISE EXCEPTION 'A refund request already exists for this ticket';
  END IF;

  INSERT INTO public.refund_requests (order_id, ticket_id, event_id, customer_id, organizer_id, reason)
  VALUES (ticket_row.order_id, ticket_row.id, order_row.event_id, auth.uid(), order_row.organizer_id, TRIM(p_reason))
  RETURNING id INTO request_id;
  RETURN request_id;
END;
$$;

-- The check-in RPC is the only normal route that marks tickets as used, so a
-- single guard here cleanly pauses scanning without affecting ticket history.
CREATE OR REPLACE FUNCTION public.check_in_ticket(p_qr_code TEXT)
RETURNS TABLE (ticket_id UUID, event_id UUID, event_title TEXT, holder_name TEXT, ticket_name TEXT, ticket_status TEXT, checked_in_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  ticket_row RECORD;
  checked_row RECORD;
  scans_enabled BOOLEAN;
BEGIN
  SELECT COALESCE(checkin_enabled, TRUE) INTO scans_enabled FROM public.platform_settings WHERE id = TRUE;
  IF NOT COALESCE(scans_enabled, TRUE) THEN RAISE EXCEPTION 'Check-in is currently paused by the platform'; END IF;

  SELECT tickets.id, tickets.event_id, tickets.holder_name, tickets.status, tickets.checked_in_at,
    events.organizer_id, events.title AS event_title, events.status AS event_status,
    events.date AS event_date, events.time AS event_time, events.end_time AS event_end_time,
    ticket_tiers.name AS ticket_name
  INTO ticket_row
  FROM public.tickets
  LEFT JOIN public.events ON events.id = tickets.event_id
  LEFT JOIN public.ticket_tiers ON ticket_tiers.id = tickets.ticket_tier_id
  WHERE tickets.qr_code = p_qr_code
  FOR UPDATE OF tickets;

  IF NOT FOUND OR ticket_row.organizer_id IS NULL OR NOT public.has_organizer_permission(ticket_row.organizer_id, 'checkin') THEN RETURN; END IF;
  IF ticket_row.status IN ('cancelled', 'used') THEN
    RETURN QUERY SELECT ticket_row.id, ticket_row.event_id, ticket_row.event_title, ticket_row.holder_name, ticket_row.ticket_name, ticket_row.status, ticket_row.checked_in_at;
    RETURN;
  END IF;
  IF ticket_row.event_status IS DISTINCT FROM 'published'
    OR (ticket_row.event_date + COALESCE(ticket_row.event_end_time, ticket_row.event_time, '23:59:59')::time) < NOW() THEN
    RETURN QUERY SELECT ticket_row.id, ticket_row.event_id, ticket_row.event_title, ticket_row.holder_name, ticket_row.ticket_name, 'cancelled'::TEXT, ticket_row.checked_in_at;
    RETURN;
  END IF;

  UPDATE public.tickets SET status = 'used', checked_in_at = NOW() WHERE id = ticket_row.id RETURNING checked_in_at INTO checked_row;
  RETURN QUERY SELECT ticket_row.id, ticket_row.event_id, ticket_row.event_title, ticket_row.holder_name, ticket_row.ticket_name, 'valid'::TEXT, checked_row.checked_in_at;
END;
$$;
