-- One persisted, administrator-managed configuration record for platform-wide
-- checkout behavior and public support details.
CREATE TABLE IF NOT EXISTS public.platform_settings (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  platform_name TEXT NOT NULL DEFAULT 'Tiketi' CHECK (char_length(trim(platform_name)) > 0),
  support_email TEXT NOT NULL DEFAULT 'hello@tiketi.events' CHECK (position('@' IN support_email) > 1),
  checkout_notice TEXT,
  service_fee_percent NUMERIC(5,2) NOT NULL DEFAULT 5.00 CHECK (service_fee_percent >= 0 AND service_fee_percent <= 100),
  ticket_sales_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  mobile_money_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  card_payments_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  CHECK (mobile_money_enabled OR card_payments_enabled)
);

INSERT INTO public.platform_settings (id)
VALUES (TRUE)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_admins_manage_platform_settings" ON public.platform_settings;
CREATE POLICY "platform_admins_manage_platform_settings" ON public.platform_settings
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

CREATE OR REPLACE FUNCTION public.set_platform_settings_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS platform_settings_updated_at ON public.platform_settings;
CREATE TRIGGER platform_settings_updated_at
  BEFORE UPDATE ON public.platform_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_platform_settings_updated_at();

-- Checkout clients only need this non-sensitive subset. The checkout RPC below
-- independently enforces it, so client data cannot bypass these controls.
CREATE OR REPLACE FUNCTION public.get_public_platform_checkout_settings()
RETURNS TABLE (
  platform_name TEXT,
  support_email TEXT,
  checkout_notice TEXT,
  service_fee_percent NUMERIC,
  ticket_sales_enabled BOOLEAN,
  mobile_money_enabled BOOLEAN,
  card_payments_enabled BOOLEAN
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
    settings.card_payments_enabled
  FROM public.platform_settings AS settings
  WHERE settings.id = TRUE;
$$;

REVOKE ALL ON FUNCTION public.get_public_platform_checkout_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_platform_checkout_settings() TO anon, authenticated;

-- Enforce the ticket-sales switch and configured fee when customer orders are
-- created. The fee is never accepted from the browser.
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
    subtotal := subtotal + requested * tier_row.price;
  END LOOP;

  IF subtotal = 0 THEN RAISE EXCEPTION 'Select at least one ticket'; END IF;
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

REVOKE ALL ON FUNCTION public.create_pending_ticket_order(UUID, UUID, JSONB, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_pending_ticket_order(UUID, UUID, JSONB, TEXT, TEXT, TEXT, JSONB) TO authenticated;

-- Block disabled payment channels before the test payment adapter confirms an
-- order. Live payment webhooks should enforce the same provider routing rule.
CREATE OR REPLACE FUNCTION public.complete_test_ticket_order(p_order_id UUID, p_payment_method TEXT DEFAULT 'card')
RETURNS TABLE (ticket_id UUID, qr_code TEXT, holder_name TEXT, holder_email TEXT, event_id UUID, ticket_tier_id UUID, created_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  order_row RECORD;
  item_row RECORD;
  holder_row RECORD;
  settings_row public.platform_settings%ROWTYPE;
  index_value INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'You must be signed in'; END IF;
  IF p_payment_method NOT IN ('mobile_money', 'card', 'bank') THEN RAISE EXCEPTION 'Unsupported test payment method'; END IF;

  SELECT * INTO settings_row FROM public.platform_settings WHERE id = TRUE;
  IF p_payment_method = 'mobile_money' AND NOT settings_row.mobile_money_enabled THEN RAISE EXCEPTION 'Mobile Money payments are currently unavailable'; END IF;
  IF p_payment_method IN ('card', 'bank') AND NOT settings_row.card_payments_enabled THEN RAISE EXCEPTION 'Card payments are currently unavailable'; END IF;

  SELECT o.* INTO order_row
  FROM public.orders o
  WHERE o.id = p_order_id
    AND (o.customer_id = auth.uid() OR EXISTS (SELECT 1 FROM public.agent_sales s WHERE s.order_id = o.id AND s.agent_user_id = auth.uid()))
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF order_row.status = 'confirmed' THEN
    RETURN QUERY SELECT t.id, t.qr_code, t.holder_name, t.holder_email, t.event_id, t.ticket_tier_id, t.created_at FROM public.tickets t WHERE t.order_id = p_order_id;
    RETURN;
  END IF;
  IF order_row.status <> 'pending' THEN RAISE EXCEPTION 'Order cannot be completed'; END IF;

  UPDATE public.orders
  SET status = 'confirmed', payment_provider = 'test', payment_reference = 'test-' || p_order_id::TEXT,
      payment_method = CASE WHEN p_payment_method = 'mobile_money' THEN 'mobile_money' ELSE 'card' END
  WHERE id = p_order_id;

  FOR item_row IN
    SELECT oi.*, tt.quantity AS capacity, tt.sold
    FROM public.order_items oi
    JOIN public.ticket_tiers tt ON tt.id = oi.ticket_tier_id
    WHERE oi.order_id = p_order_id
    FOR UPDATE OF tt
  LOOP
    IF item_row.sold + item_row.quantity > item_row.capacity THEN RAISE EXCEPTION 'Tickets are no longer available'; END IF;
    index_value := 0;
    FOR holder_row IN
      SELECT value
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(item_row.holder_details) = 'array' THEN item_row.holder_details ELSE '[]'::jsonb END)
      LIMIT item_row.quantity
    LOOP
      RETURN QUERY INSERT INTO public.tickets (order_id, ticket_tier_id, event_id, holder_name, holder_email, holder_phone, status)
      VALUES (p_order_id, item_row.ticket_tier_id, order_row.event_id, COALESCE(holder_row.value ->> 'name', order_row.holder_name), order_row.holder_email, order_row.holder_phone, 'valid')
      RETURNING tickets.id, tickets.qr_code, tickets.holder_name, tickets.holder_email, tickets.event_id, tickets.ticket_tier_id, tickets.created_at;
      index_value := index_value + 1;
    END LOOP;
    WHILE index_value < item_row.quantity LOOP
      RETURN QUERY INSERT INTO public.tickets (order_id, ticket_tier_id, event_id, holder_name, holder_email, holder_phone, status)
      VALUES (p_order_id, item_row.ticket_tier_id, order_row.event_id, order_row.holder_name, order_row.holder_email, order_row.holder_phone, 'valid')
      RETURNING tickets.id, tickets.qr_code, tickets.holder_name, tickets.holder_email, tickets.event_id, tickets.ticket_tier_id, tickets.created_at;
      index_value := index_value + 1;
    END LOOP;
    UPDATE public.ticket_tiers SET sold = sold + item_row.quantity WHERE id = item_row.ticket_tier_id;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_test_ticket_order(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_test_ticket_order(UUID, TEXT) TO authenticated;
