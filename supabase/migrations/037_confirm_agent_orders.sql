-- Organizer-only confirmation for cash orders created by an assigned agent.
-- The existing order confirmation trigger remains responsible for ticket creation,
-- commission creation, and the agent sale status transition.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_provider TEXT,
  ADD COLUMN IF NOT EXISTS payment_reference TEXT;

CREATE OR REPLACE FUNCTION public.confirm_agent_cash_sale(p_order_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  order_row public.orders%ROWTYPE;
BEGIN
  SELECT * INTO order_row
  FROM public.orders
  WHERE id = p_order_id
    AND agent_assignment_id IS NOT NULL
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Agent order not found'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organizers
    WHERE id = order_row.organizer_id AND user_id = auth.uid()
  ) THEN RAISE EXCEPTION 'Organizer owner access required'; END IF;
  IF order_row.status <> 'pending' THEN RAISE EXCEPTION 'Only pending agent orders can be confirmed'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.agent_sales
    WHERE order_id = order_row.id AND payment_mode = 'cash' AND status = 'awaiting_payment'
  ) THEN RAISE EXCEPTION 'This order is not an awaiting cash agent sale'; END IF;

  UPDATE public.orders
  SET status = 'confirmed', payment_method = 'cash', payment_provider = 'agent_cash'
  WHERE id = order_row.id;

  RETURN order_row.id;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_agent_cash_sale(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_agent_cash_sale(UUID) TO authenticated;
