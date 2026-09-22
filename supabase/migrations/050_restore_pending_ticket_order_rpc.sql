-- Restore the checkout RPC with the exact named parameters used by the client.
-- This is idempotent and also repairs databases where migration 031 was missed.
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
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to purchase tickets';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.events
    WHERE id = p_event_id AND organizer_id = p_organizer_id AND status = 'published'
  ) THEN
    RAISE EXCEPTION 'This event is not available for purchase';
  END IF;

  FOR tier_record IN
    SELECT id, price, quantity, sold, group_size, expires_at
    FROM public.ticket_tiers
    WHERE event_id = p_event_id AND p_quantities ? id::text
    FOR UPDATE
  LOOP
    requested_quantity := GREATEST(0, (p_quantities ->> tier_record.id::text)::INTEGER);
    IF requested_quantity = 0 THEN CONTINUE; END IF;
    IF tier_record.expires_at IS NOT NULL AND tier_record.expires_at < CURRENT_DATE THEN
      RAISE EXCEPTION 'Ticket tier has expired';
    END IF;
    IF tier_record.sold + requested_quantity * GREATEST(1, tier_record.group_size) > tier_record.quantity THEN
      RAISE EXCEPTION 'Not enough tickets available';
    END IF;
    subtotal_value := subtotal_value + requested_quantity * tier_record.price;
  END LOOP;

  IF subtotal_value = 0 THEN RAISE EXCEPTION 'Select at least one ticket'; END IF;
  fee_value := ROUND(subtotal_value * 0.05);

  INSERT INTO public.orders (
    customer_id, event_id, organizer_id, status, subtotal, service_fee, total,
    payment_method, holder_name, holder_email, holder_phone
  )
  VALUES (
    auth.uid(), p_event_id, p_organizer_id, 'pending', subtotal_value, fee_value,
    subtotal_value + fee_value, NULL, p_holder_name, p_holder_email, p_holder_phone
  )
  RETURNING id INTO created_order_id;

  FOR tier_record IN
    SELECT id, price, group_size
    FROM public.ticket_tiers
    WHERE event_id = p_event_id AND p_quantities ? id::text
  LOOP
    requested_quantity := GREATEST(0, (p_quantities ->> tier_record.id::text)::INTEGER);
    IF requested_quantity > 0 THEN
      INSERT INTO public.order_items (order_id, ticket_tier_id, quantity, unit_price, total_price)
      VALUES (
        created_order_id,
        tier_record.id,
        requested_quantity * GREATEST(1, tier_record.group_size),
        tier_record.price,
        requested_quantity * tier_record.price
      );
    END IF;
  END LOOP;

  RETURN created_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_pending_ticket_order(UUID, UUID, JSONB, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_pending_ticket_order(UUID, UUID, JSONB, TEXT, TEXT, TEXT) TO authenticated;
