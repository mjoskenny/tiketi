-- Allow event/order managers to record completed in-person ticket sales safely.
CREATE OR REPLACE FUNCTION public.record_organizer_ticket_sale(
  p_event_id UUID,
  p_ticket_tier_id UUID,
  p_quantity INTEGER,
  p_payment_method TEXT,
  p_holder_name TEXT,
  p_holder_email TEXT,
  p_amount INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  event_row public.events%ROWTYPE;
  tier_row public.ticket_tiers%ROWTYPE;
  buyer_user_id UUID;
  created_order_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in';
  END IF;

  SELECT * INTO event_row
  FROM public.events
  WHERE id = p_event_id
  FOR UPDATE;
  IF NOT FOUND OR NOT (
    public.has_organizer_permission(event_row.organizer_id, 'orders')
    OR public.has_organizer_permission(event_row.organizer_id, 'events')
  ) THEN
    RAISE EXCEPTION 'You do not have permission to record event sales';
  END IF;
  IF event_row.status <> 'published' THEN
    RAISE EXCEPTION 'Only published events can have ticket sales recorded';
  END IF;

  SELECT * INTO tier_row
  FROM public.ticket_tiers
  WHERE id = p_ticket_tier_id AND event_id = p_event_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket type not found for this event';
  END IF;
  IF p_quantity IS NULL OR p_quantity < 1 OR tier_row.sold + p_quantity > tier_row.quantity THEN
    RAISE EXCEPTION 'Ticket inventory limit exceeded';
  END IF;
  IF p_payment_method NOT IN ('cash', 'mobile_money', 'card') THEN
    RAISE EXCEPTION 'Choose a supported payment method';
  END IF;
  IF NULLIF(TRIM(p_holder_email), '') IS NULL OR POSITION('@' IN TRIM(p_holder_email)) < 2 THEN
    RAISE EXCEPTION 'A valid email address is required to deliver tickets';
  END IF;
  IF p_amount IS NULL OR p_amount <> tier_row.price * p_quantity THEN
    RAISE EXCEPTION 'The amount must match the selected ticket price and quantity';
  END IF;

  SELECT id INTO buyer_user_id
  FROM public.profiles
  WHERE LOWER(email) = LOWER(TRIM(p_holder_email))
  LIMIT 1;

  INSERT INTO public.orders (
    customer_id, event_id, organizer_id, status, subtotal, service_fee, total,
    payment_method, holder_name, holder_email
  ) VALUES (
    buyer_user_id, p_event_id, event_row.organizer_id, 'confirmed', p_amount, 0,
    p_amount, p_payment_method, NULLIF(TRIM(p_holder_name), ''), LOWER(TRIM(p_holder_email))
  ) RETURNING id INTO created_order_id;

  INSERT INTO public.order_items (order_id, ticket_tier_id, quantity, unit_price, total_price)
  VALUES (created_order_id, p_ticket_tier_id, p_quantity, tier_row.price, p_amount);

  INSERT INTO public.tickets (
    order_id, ticket_tier_id, event_id, holder_name, holder_email, status
  )
  SELECT created_order_id, p_ticket_tier_id, p_event_id,
    COALESCE(NULLIF(TRIM(p_holder_name), ''), TRIM(p_holder_email)),
    LOWER(TRIM(p_holder_email)), 'valid'
  FROM generate_series(1, p_quantity);

  UPDATE public.ticket_tiers
  SET sold = sold + p_quantity
  WHERE id = p_ticket_tier_id;

  RETURN created_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_organizer_ticket_sale(UUID, UUID, INTEGER, TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_organizer_ticket_sale(UUID, UUID, INTEGER, TEXT, TEXT, TEXT, INTEGER) TO authenticated;
