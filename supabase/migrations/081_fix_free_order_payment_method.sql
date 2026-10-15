-- The orders.payment_method CHECK constraint intentionally excludes free.
-- Preserve NULL for free reservations and identify them via payment_provider.
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
  IF p_payment_method NOT IN ('mobile_money', 'card', 'bank', 'free') THEN RAISE EXCEPTION 'Unsupported test payment method'; END IF;

  IF p_payment_method <> 'free' THEN
    SELECT * INTO settings_row FROM public.platform_settings WHERE id = TRUE;
    IF p_payment_method = 'mobile_money' AND NOT settings_row.mobile_money_enabled THEN RAISE EXCEPTION 'Mobile Money payments are currently unavailable'; END IF;
    IF p_payment_method IN ('card', 'bank') AND NOT settings_row.card_payments_enabled THEN RAISE EXCEPTION 'Card payments are currently unavailable'; END IF;
  END IF;

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
  IF p_payment_method = 'free' AND order_row.total <> 0 THEN RAISE EXCEPTION 'Only zero-total orders can be completed as free'; END IF;

  UPDATE public.orders
  SET status = 'confirmed',
      payment_provider = CASE WHEN p_payment_method = 'free' THEN 'free' ELSE 'test' END,
      payment_reference = CASE WHEN p_payment_method = 'free' THEN 'free-' || p_order_id::TEXT ELSE 'test-' || p_order_id::TEXT END,
      payment_method = CASE
        WHEN p_payment_method = 'free' THEN NULL
        WHEN p_payment_method = 'mobile_money' THEN 'mobile_money'
        ELSE 'card'
      END
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