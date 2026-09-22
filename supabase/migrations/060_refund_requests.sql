CREATE TABLE IF NOT EXISTS public.refund_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  organizer_id UUID NOT NULL REFERENCES public.organizers(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'processed')),
  organizer_note TEXT,
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS refund_requests_customer_idx ON public.refund_requests(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS refund_requests_organizer_idx ON public.refund_requests(organizer_id, created_at DESC);

ALTER TABLE public.refund_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "refund_requests_customer_read" ON public.refund_requests;
CREATE POLICY "refund_requests_customer_read" ON public.refund_requests
  FOR SELECT USING (customer_id = auth.uid());

DROP POLICY IF EXISTS "refund_requests_customer_create" ON public.refund_requests;
CREATE POLICY "refund_requests_customer_create" ON public.refund_requests
  FOR INSERT WITH CHECK (
    customer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id AND o.customer_id = auth.uid() AND o.organizer_id = refund_requests.organizer_id
    )
  );

DROP POLICY IF EXISTS "refund_requests_organizer_read" ON public.refund_requests;
CREATE POLICY "refund_requests_organizer_read" ON public.refund_requests
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.organizers o WHERE o.id = organizer_id AND o.user_id = auth.uid())
    OR public.has_organizer_permission(organizer_id, 'orders')
  );

DROP POLICY IF EXISTS "refund_requests_organizer_update" ON public.refund_requests;
CREATE POLICY "refund_requests_organizer_update" ON public.refund_requests
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.organizers o WHERE o.id = organizer_id AND o.user_id = auth.uid())
    OR public.has_organizer_permission(organizer_id, 'orders')
  ) WITH CHECK (status IN ('pending', 'approved', 'rejected', 'processed'));

CREATE OR REPLACE FUNCTION public.request_ticket_refund(p_ticket_id UUID, p_reason TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ticket_row public.tickets%ROWTYPE;
  order_row public.orders%ROWTYPE;
  request_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'You must be signed in'; END IF;
  IF NULLIF(TRIM(p_reason), '') IS NULL THEN RAISE EXCEPTION 'A refund reason is required'; END IF;

  SELECT * INTO ticket_row FROM public.tickets WHERE id = p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ticket not found'; END IF;
  SELECT * INTO order_row FROM public.orders WHERE id = ticket_row.order_id;
  IF order_row.customer_id <> auth.uid() THEN RAISE EXCEPTION 'You do not own this ticket'; END IF;
  IF ticket_row.status <> 'valid' THEN RAISE EXCEPTION 'Only unused tickets can be refunded'; END IF;
  IF order_row.status <> 'confirmed' THEN RAISE EXCEPTION 'This order is not eligible for a refund request'; END IF;

  IF EXISTS (SELECT 1 FROM public.refund_requests WHERE ticket_id = p_ticket_id AND status IN ('pending', 'approved', 'processed')) THEN
    RAISE EXCEPTION 'A refund request already exists for this ticket';
  END IF;

  INSERT INTO public.refund_requests (order_id, ticket_id, event_id, customer_id, organizer_id, reason)
  VALUES (ticket_row.order_id, ticket_row.id, order_row.event_id, auth.uid(), order_row.organizer_id, TRIM(p_reason))
  RETURNING id INTO request_id;
  RETURN request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.request_ticket_refund(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_ticket_refund(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_ticket_refund(p_request_id UUID, p_status TEXT, p_note TEXT DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  request_row public.refund_requests%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'You must be signed in'; END IF;
  IF p_status NOT IN ('approved', 'rejected') THEN RAISE EXCEPTION 'Invalid refund decision'; END IF;

  SELECT * INTO request_row FROM public.refund_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Refund request not found'; END IF;
  IF NOT public.has_organizer_permission(request_row.organizer_id, 'orders') THEN RAISE EXCEPTION 'Refund review permission required'; END IF;
  IF request_row.status <> 'pending' THEN RAISE EXCEPTION 'This refund request has already been reviewed'; END IF;

  UPDATE public.refund_requests
  SET status = p_status, organizer_note = NULLIF(TRIM(p_note), ''), reviewed_by = auth.uid(), reviewed_at = NOW()
  WHERE id = p_request_id;

  INSERT INTO public.notifications (user_id, type, title, body, ticket_id)
  VALUES (
    request_row.customer_id,
    'payment',
    CASE WHEN p_status = 'approved' THEN 'Refund request approved' ELSE 'Refund request declined' END,
    CASE WHEN p_status = 'approved' THEN 'The organizer approved your refund request. Tiketi support will complete the payment-provider step.' ELSE COALESCE(NULLIF(TRIM(p_note), ''), 'The organizer declined your refund request.') END,
    request_row.ticket_id
  ) ON CONFLICT DO NOTHING;
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.review_ticket_refund(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_ticket_refund(UUID, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_refund_request_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS refund_requests_updated_at ON public.refund_requests;
CREATE TRIGGER refund_requests_updated_at
BEFORE UPDATE ON public.refund_requests
FOR EACH ROW EXECUTE FUNCTION public.set_refund_request_updated_at();