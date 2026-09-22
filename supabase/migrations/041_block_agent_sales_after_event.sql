-- Prevent agent sales after the assigned event has ended.
CREATE OR REPLACE FUNCTION public.create_agent_sale(
  p_assignment_id UUID, p_ticket_tier_id UUID, p_quantity INTEGER,
  p_holder_name TEXT, p_holder_email TEXT, p_holder_phone TEXT, p_payment_mode TEXT
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a public.agent_assignments%ROWTYPE;
  tier_row public.ticket_tiers%ROWTYPE;
  event_row public.events%ROWTYPE;
  order_id UUID;
  sold_count INTEGER;
  buyer_user_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'You must be signed in'; END IF;
  SELECT * INTO a FROM public.agent_assignments WHERE id = p_assignment_id AND user_id = auth.uid() AND status = 'active' FOR UPDATE;
  IF NOT FOUND OR a.starts_at > NOW() OR (a.ends_at IS NOT NULL AND a.ends_at <= NOW()) THEN RAISE EXCEPTION 'Agent assignment is not active'; END IF;

  SELECT * INTO event_row FROM public.events WHERE id = a.event_id FOR SHARE;
  IF NOT FOUND OR event_row.status IN ('cancelled', 'completed') OR (event_row.date + COALESCE(event_row.time, '23:59:59')::time) < NOW() THEN
    RAISE EXCEPTION 'This event has ended and tickets can no longer be sold';
  END IF;

  SELECT * INTO tier_row FROM public.ticket_tiers WHERE id = p_ticket_tier_id AND event_id = a.event_id FOR UPDATE;
  IF NOT FOUND OR (NOT a.allow_all_ticket_types AND NOT (p_ticket_tier_id = ANY(a.ticket_tier_ids))) THEN RAISE EXCEPTION 'Ticket type is not assigned'; END IF;
  IF p_quantity <= 0 OR tier_row.sold + p_quantity > tier_row.quantity THEN RAISE EXCEPTION 'Ticket inventory limit exceeded'; END IF;
  SELECT COALESCE(SUM(s.quantity), 0) INTO sold_count FROM public.agent_sales s WHERE s.assignment_id = a.id AND s.status IN ('awaiting_payment', 'paid');
  IF a.ticket_limit IS NOT NULL AND sold_count + p_quantity > a.ticket_limit THEN RAISE EXCEPTION 'Agent ticket limit exceeded'; END IF;
  IF a.sales_limit IS NOT NULL AND sold_count + p_quantity > a.sales_limit THEN RAISE EXCEPTION 'Agent sales limit exceeded'; END IF;
  IF p_payment_mode NOT IN ('mobile_money', 'card', 'bank') THEN RAISE EXCEPTION 'Unsupported agent payment method'; END IF;

  SELECT id INTO buyer_user_id FROM public.profiles WHERE p_holder_email IS NOT NULL AND lower(email) = lower(trim(p_holder_email)) LIMIT 1;
  INSERT INTO public.orders (customer_id, event_id, organizer_id, agent_assignment_id, status, subtotal, service_fee, total, payment_method, holder_name, holder_email, holder_phone)
  VALUES (COALESCE(buyer_user_id, auth.uid()), a.event_id, a.organizer_id, a.id, 'pending', tier_row.price * p_quantity, ROUND(tier_row.price * p_quantity * 0.05), tier_row.price * p_quantity + ROUND(tier_row.price * p_quantity * 0.05), NULL, p_holder_name, p_holder_email, p_holder_phone)
  RETURNING id INTO order_id;
  INSERT INTO public.order_items (order_id, ticket_tier_id, quantity, unit_price, total_price) VALUES (order_id, tier_row.id, p_quantity, tier_row.price, tier_row.price * p_quantity);
  INSERT INTO public.agent_sales (order_id, assignment_id, agent_user_id, organizer_id, quantity, payment_mode) VALUES (order_id, a.id, auth.uid(), a.organizer_id, p_quantity, p_payment_mode);
  RETURN order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_agent_sale(UUID, UUID, INTEGER, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_agent_sale(UUID, UUID, INTEGER, TEXT, TEXT, TEXT, TEXT) TO authenticated;
