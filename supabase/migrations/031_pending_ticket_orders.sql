ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS holder_name TEXT,
  ADD COLUMN IF NOT EXISTS holder_email TEXT,
  ADD COLUMN IF NOT EXISTS holder_phone TEXT;

CREATE OR REPLACE FUNCTION public.create_pending_ticket_order(
  p_event_id UUID,
  p_organizer_id UUID,
  p_quantities JSONB,
  p_holder_name TEXT,
  p_holder_email TEXT,
  p_holder_phone TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  created_order_id UUID;
  tier_record RECORD;
  requested_quantity INTEGER;
  subtotal_value INTEGER := 0;
  fee_value INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'You must be signed in to purchase tickets'; END IF;
  IF NOT EXISTS (SELECT 1 FROM events WHERE id = p_event_id AND organizer_id = p_organizer_id AND status = 'published') THEN
    RAISE EXCEPTION 'This event is not available for purchase';
  END IF;

  FOR tier_record IN
    SELECT id, price, quantity, sold, group_size, expires_at
    FROM ticket_tiers
    WHERE event_id = p_event_id AND p_quantities ? id::text
    FOR UPDATE
  LOOP
    requested_quantity := GREATEST(0, (p_quantities ->> tier_record.id::text)::INTEGER);
    IF requested_quantity = 0 THEN CONTINUE; END IF;
    IF tier_record.expires_at IS NOT NULL AND tier_record.expires_at < CURRENT_DATE THEN RAISE EXCEPTION 'Ticket tier has expired'; END IF;
    IF tier_record.sold + requested_quantity * GREATEST(1, tier_record.group_size) > tier_record.quantity THEN
      RAISE EXCEPTION 'Not enough tickets available';
    END IF;
    subtotal_value := subtotal_value + requested_quantity * tier_record.price;
  END LOOP;

  IF subtotal_value = 0 THEN RAISE EXCEPTION 'Select at least one ticket'; END IF;
  fee_value := ROUND(subtotal_value * 0.05);

  INSERT INTO orders (customer_id, event_id, organizer_id, status, subtotal, service_fee, total, payment_method, holder_name, holder_email, holder_phone)
  VALUES (auth.uid(), p_event_id, p_organizer_id, 'pending', subtotal_value, fee_value, subtotal_value + fee_value, NULL, p_holder_name, p_holder_email, p_holder_phone)
  RETURNING id INTO created_order_id;

  FOR tier_record IN
    SELECT id, price, group_size
    FROM ticket_tiers
    WHERE event_id = p_event_id AND p_quantities ? id::text
  LOOP
    requested_quantity := GREATEST(0, (p_quantities ->> tier_record.id::text)::INTEGER);
    IF requested_quantity > 0 THEN
      INSERT INTO order_items (order_id, ticket_tier_id, quantity, unit_price, total_price)
      VALUES (created_order_id, tier_record.id, requested_quantity * GREATEST(1, tier_record.group_size), tier_record.price, requested_quantity * tier_record.price);
    END IF;
  END LOOP;
  RETURN created_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_pending_ticket_order(UUID, UUID, JSONB, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_pending_ticket_order(UUID, UUID, JSONB, TEXT, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.confirm_paid_ticket_order(p_order_id UUID, p_payment_reference TEXT, p_provider TEXT)
RETURNS TABLE (ticket_id UUID, qr_code TEXT, holder_name TEXT, holder_email TEXT, event_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE order_record RECORD; item_record RECORD;
BEGIN
  SELECT * INTO order_record FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF order_record.status = 'confirmed' THEN
    RETURN QUERY SELECT t.id, t.qr_code, t.holder_name, t.holder_email, t.event_id FROM tickets t WHERE t.order_id = p_order_id;
    RETURN;
  END IF;
  IF order_record.status <> 'pending' THEN RAISE EXCEPTION 'Order cannot be confirmed'; END IF;

  UPDATE orders SET status = 'confirmed', payment_provider = p_provider, payment_reference = p_payment_reference, payment_method = 'card' WHERE id = p_order_id;
  FOR item_record IN SELECT oi.*, tt.quantity AS capacity, tt.sold, tt.group_size FROM order_items oi JOIN ticket_tiers tt ON tt.id = oi.ticket_tier_id WHERE oi.order_id = p_order_id FOR UPDATE OF tt LOOP
    IF item_record.sold + item_record.quantity > item_record.capacity THEN RAISE EXCEPTION 'Tickets are no longer available'; END IF;
    RETURN QUERY
    INSERT INTO tickets (order_id, ticket_tier_id, event_id, holder_name, holder_email, holder_phone, status)
    SELECT p_order_id, item_record.ticket_tier_id, order_record.event_id, order_record.holder_name, order_record.holder_email, order_record.holder_phone, 'valid'
    FROM generate_series(1, item_record.quantity)
    RETURNING tickets.id, tickets.qr_code, tickets.holder_name, tickets.holder_email, tickets.event_id;
    UPDATE ticket_tiers SET sold = sold + item_record.quantity WHERE id = item_record.ticket_tier_id;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_paid_ticket_order(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_paid_ticket_order(UUID, TEXT, TEXT) TO service_role;
