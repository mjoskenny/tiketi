ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS holder_details JSONB NOT NULL DEFAULT '[]'::jsonb;

DROP FUNCTION IF EXISTS public.create_pending_ticket_order(UUID, UUID, JSONB, TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.create_pending_ticket_order(
  p_event_id UUID, p_organizer_id UUID, p_quantities JSONB,
  p_holder_name TEXT, p_holder_email TEXT, p_holder_phone TEXT,
  p_holder_details JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE order_id UUID; tier_row RECORD; requested INTEGER; subtotal INTEGER := 0; fee INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'You must be signed in to purchase tickets'; END IF;
  IF NOT EXISTS (SELECT 1 FROM events WHERE id = p_event_id AND organizer_id = p_organizer_id AND status = 'published') THEN RAISE EXCEPTION 'This event is not available for purchase'; END IF;
  FOR tier_row IN SELECT id, price, quantity, sold, group_size, expires_at FROM ticket_tiers WHERE event_id = p_event_id AND p_quantities ? id::text FOR UPDATE LOOP
    requested := GREATEST(0, (p_quantities ->> tier_row.id::text)::INTEGER);
    IF requested = 0 THEN CONTINUE; END IF;
    IF tier_row.expires_at IS NOT NULL AND tier_row.expires_at < CURRENT_DATE THEN RAISE EXCEPTION 'Ticket tier has expired'; END IF;
    IF tier_row.sold + requested * GREATEST(1, tier_row.group_size) > tier_row.quantity THEN RAISE EXCEPTION 'Not enough tickets available'; END IF;
    subtotal := subtotal + requested * tier_row.price;
  END LOOP;
  IF subtotal = 0 THEN RAISE EXCEPTION 'Select at least one ticket'; END IF;
  fee := ROUND(subtotal * 0.05);
  INSERT INTO orders (customer_id, event_id, organizer_id, status, subtotal, service_fee, total, payment_method, holder_name, holder_email, holder_phone)
  VALUES (auth.uid(), p_event_id, p_organizer_id, 'pending', subtotal, fee, subtotal + fee, NULL, p_holder_name, p_holder_email, p_holder_phone) RETURNING id INTO order_id;
  FOR tier_row IN SELECT id, price, group_size FROM ticket_tiers WHERE event_id = p_event_id AND p_quantities ? id::text LOOP
    requested := GREATEST(0, (p_quantities ->> tier_row.id::text)::INTEGER);
    IF requested > 0 THEN
      INSERT INTO order_items (order_id, ticket_tier_id, quantity, unit_price, total_price, holder_details)
      VALUES (order_id, tier_row.id, requested * GREATEST(1, tier_row.group_size), tier_row.price, requested * tier_row.price, COALESCE(p_holder_details -> tier_row.id::text, '[]'::jsonb));
    END IF;
  END LOOP;
  RETURN order_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.create_pending_ticket_order(UUID, UUID, JSONB, TEXT, TEXT, TEXT, JSONB) TO authenticated;

DROP FUNCTION IF EXISTS public.complete_test_ticket_order(UUID, TEXT);
CREATE OR REPLACE FUNCTION public.complete_test_ticket_order(p_order_id UUID, p_payment_method TEXT DEFAULT 'card')
RETURNS TABLE (ticket_id UUID, qr_code TEXT, holder_name TEXT, holder_email TEXT, event_id UUID, ticket_tier_id UUID, created_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE order_row RECORD; item_row RECORD; holder_row RECORD; index_value INTEGER;
BEGIN
  SELECT o.* INTO order_row FROM orders o WHERE o.id = p_order_id AND (o.customer_id = auth.uid() OR EXISTS (SELECT 1 FROM agent_sales s WHERE s.order_id = o.id AND s.agent_user_id = auth.uid())) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF order_row.status = 'confirmed' THEN RETURN QUERY SELECT t.id, t.qr_code, t.holder_name, t.holder_email, t.event_id, t.ticket_tier_id, t.created_at FROM tickets t WHERE t.order_id = p_order_id; RETURN; END IF;
  IF order_row.status <> 'pending' THEN RAISE EXCEPTION 'Order cannot be completed'; END IF;
  UPDATE orders SET status = 'confirmed', payment_provider = 'test', payment_reference = 'test-' || p_order_id::TEXT, payment_method = CASE WHEN p_payment_method = 'mobile_money' THEN 'mobile_money' ELSE 'card' END WHERE id = p_order_id;
  FOR item_row IN SELECT oi.*, tt.quantity AS capacity, tt.sold FROM order_items oi JOIN ticket_tiers tt ON tt.id = oi.ticket_tier_id WHERE oi.order_id = p_order_id FOR UPDATE OF tt LOOP
    IF item_row.sold + item_row.quantity > item_row.capacity THEN RAISE EXCEPTION 'Tickets are no longer available'; END IF;
    index_value := 0;
    FOR holder_row IN SELECT value FROM jsonb_array_elements(item_row.holder_details) LOOP
      RETURN QUERY INSERT INTO tickets (order_id, ticket_tier_id, event_id, holder_name, holder_email, holder_phone, status)
      VALUES (p_order_id, item_row.ticket_tier_id, order_row.event_id, COALESCE(holder_row.value ->> 'name', order_row.holder_name), order_row.holder_email, order_row.holder_phone, 'valid')
      RETURNING tickets.id, tickets.qr_code, tickets.holder_name, tickets.holder_email, tickets.event_id, tickets.ticket_tier_id, tickets.created_at;
      index_value := index_value + 1;
    END LOOP;
    WHILE index_value < item_row.quantity LOOP
      RETURN QUERY INSERT INTO tickets (order_id, ticket_tier_id, event_id, holder_name, holder_email, holder_phone, status) VALUES (p_order_id, item_row.ticket_tier_id, order_row.event_id, order_row.holder_name, order_row.holder_email, order_row.holder_phone, 'valid') RETURNING tickets.id, tickets.qr_code, tickets.holder_name, tickets.holder_email, tickets.event_id, tickets.ticket_tier_id, tickets.created_at;
      index_value := index_value + 1;
    END LOOP;
    UPDATE ticket_tiers SET sold = sold + item_row.quantity WHERE id = item_row.ticket_tier_id;
  END LOOP;
END; $$;
GRANT EXECUTE ON FUNCTION public.complete_test_ticket_order(UUID, TEXT) TO authenticated;