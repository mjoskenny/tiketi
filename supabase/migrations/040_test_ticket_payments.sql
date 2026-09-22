-- Test payment path for development. No external provider or Edge Function is used.
-- It confirms only an order owned by the current customer or agent.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_provider TEXT,
  ADD COLUMN IF NOT EXISTS payment_reference TEXT;

CREATE OR REPLACE FUNCTION public.complete_test_ticket_order(
  p_order_id UUID,
  p_payment_method TEXT DEFAULT 'card'
)
RETURNS TABLE (
  ticket_id UUID,
  qr_code TEXT,
  holder_name TEXT,
  holder_email TEXT,
  event_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  order_record RECORD;
  item_record RECORD;
  normalized_method TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'You must be signed in'; END IF;
  IF p_payment_method NOT IN ('mobile_money', 'card', 'bank') THEN
    RAISE EXCEPTION 'Unsupported test payment method';
  END IF;

  SELECT o.* INTO order_record
  FROM public.orders o
  WHERE o.id = p_order_id
    AND (
      o.customer_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.agent_sales s
        WHERE s.order_id = o.id AND s.agent_user_id = auth.uid()
      )
    )
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF order_record.status = 'confirmed' THEN
    RETURN QUERY
    SELECT t.id, t.qr_code, t.holder_name, t.holder_email, t.event_id
    FROM public.tickets t WHERE t.order_id = p_order_id;
    RETURN;
  END IF;
  IF order_record.status <> 'pending' THEN RAISE EXCEPTION 'Order cannot be completed'; END IF;

  normalized_method := CASE WHEN p_payment_method = 'mobile_money' THEN 'mobile_money' ELSE 'card' END;
  UPDATE public.orders
  SET status = 'confirmed',
      payment_provider = 'test',
      payment_reference = 'test-' || p_order_id::TEXT,
      payment_method = normalized_method
  WHERE id = p_order_id;

  FOR item_record IN
    SELECT oi.*, tt.quantity AS capacity, tt.sold
    FROM public.order_items oi
    JOIN public.ticket_tiers tt ON tt.id = oi.ticket_tier_id
    WHERE oi.order_id = p_order_id
    FOR UPDATE OF tt
  LOOP
    IF item_record.sold + item_record.quantity > item_record.capacity THEN
      RAISE EXCEPTION 'Tickets are no longer available';
    END IF;

    RETURN QUERY
    INSERT INTO public.tickets (
      order_id, ticket_tier_id, event_id,
      holder_name, holder_email, holder_phone, status
    )
    SELECT p_order_id, item_record.ticket_tier_id, order_record.event_id,
      order_record.holder_name, order_record.holder_email, order_record.holder_phone, 'valid'
    FROM generate_series(1, item_record.quantity)
    RETURNING tickets.id, tickets.qr_code, tickets.holder_name, tickets.holder_email, tickets.event_id;

    UPDATE public.ticket_tiers
    SET sold = sold + item_record.quantity
    WHERE id = item_record.ticket_tier_id;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_test_ticket_order(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_test_ticket_order(UUID, TEXT) TO authenticated;
