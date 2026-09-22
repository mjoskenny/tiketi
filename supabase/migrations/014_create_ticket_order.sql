CREATE OR REPLACE FUNCTION public.create_ticket_order(
  p_event_id UUID,
  p_organizer_id UUID,
  p_quantities JSONB,
  p_subtotal INTEGER,
  p_service_fee INTEGER,
  p_total INTEGER,
  p_payment_method TEXT,
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
  payment_value TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to purchase tickets';
  END IF;

  IF p_payment_method = 'mobilemoney' THEN
    payment_value := 'mobile_money';
  ELSIF p_payment_method = 'card' THEN
    payment_value := 'card';
  ELSE
    payment_value := 'cash';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM events
    WHERE id = p_event_id
      AND organizer_id = p_organizer_id
      AND status = 'published'
  ) THEN
    RAISE EXCEPTION 'This event is not available for purchase';
  END IF;

  INSERT INTO orders (customer_id, event_id, organizer_id, status, subtotal, service_fee, total, payment_method)
  VALUES (auth.uid(), p_event_id, p_organizer_id, 'confirmed', p_subtotal, p_service_fee, p_total, payment_value)
  RETURNING id INTO created_order_id;

  FOR tier_record IN
    SELECT tiers.id, tiers.price, tiers.quantity, tiers.sold
    FROM ticket_tiers AS tiers
    WHERE tiers.event_id = p_event_id
      AND p_quantities ? tiers.id::text
    FOR UPDATE
  LOOP
    requested_quantity := GREATEST(0, (p_quantities ->> tier_record.id::text)::INTEGER);
    IF requested_quantity = 0 THEN CONTINUE; END IF;
    IF tier_record.sold + requested_quantity > tier_record.quantity THEN
      RAISE EXCEPTION 'Not enough tickets available for tier %', tier_record.id;
    END IF;

    INSERT INTO order_items (order_id, ticket_tier_id, quantity, unit_price, total_price)
    VALUES (created_order_id, tier_record.id, requested_quantity, tier_record.price, requested_quantity * tier_record.price);

    INSERT INTO tickets (order_id, ticket_tier_id, event_id, holder_name, holder_email, holder_phone, status)
    SELECT created_order_id, tier_record.id, p_event_id, p_holder_name, p_holder_email, p_holder_phone, 'valid'
    FROM generate_series(1, requested_quantity);

    UPDATE ticket_tiers
    SET sold = sold + requested_quantity
    WHERE id = tier_record.id;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM order_items AS created_items WHERE created_items.order_id = created_order_id) THEN
    RAISE EXCEPTION 'Select at least one ticket';
  END IF;

  RETURN created_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_ticket_order(UUID, UUID, JSONB, INTEGER, INTEGER, INTEGER, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_ticket_order(UUID, UUID, JSONB, INTEGER, INTEGER, INTEGER, TEXT, TEXT, TEXT, TEXT) TO authenticated;