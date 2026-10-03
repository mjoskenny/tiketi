-- Safe, auditable admin moderation actions. Financial/auth records are not
-- directly editable from the browser; transitions are restricted to this API.
CREATE OR REPLACE FUNCTION public.admin_set_event_status(
  p_event_id UUID,
  p_status TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  event_row public.events%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Platform administrator access is required';
  END IF;
  IF p_status NOT IN ('draft', 'published', 'cancelled', 'completed') THEN
    RAISE EXCEPTION 'Invalid event status';
  END IF;

  SELECT * INTO event_row
  FROM public.events
  WHERE id = p_event_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Event not found'; END IF;

  UPDATE public.events SET status = p_status WHERE id = event_row.id;
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_review_ticket_refund(
  p_request_id UUID,
  p_status TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  request_row public.refund_requests%ROWTYPE;
  normalized_note TEXT := NULLIF(BTRIM(COALESCE(p_note, '')), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Platform administrator access is required';
  END IF;
  IF p_status NOT IN ('approved', 'rejected', 'processed') THEN
    RAISE EXCEPTION 'Choose approved, rejected, or processed';
  END IF;

  SELECT * INTO request_row
  FROM public.refund_requests
  WHERE id = p_request_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Refund request not found'; END IF;

  IF request_row.status = 'pending' AND p_status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Review the request before marking a refund processed';
  END IF;
  IF request_row.status = 'approved' AND p_status <> 'processed' THEN
    RAISE EXCEPTION 'An approved refund can only be marked processed';
  END IF;
  IF request_row.status NOT IN ('pending', 'approved') THEN
    RAISE EXCEPTION 'This refund request has already been finalized';
  END IF;
  IF p_status IN ('rejected', 'processed') AND normalized_note IS NULL THEN
    RAISE EXCEPTION 'Add a note explaining the refund decision or payment reference';
  END IF;

  UPDATE public.refund_requests
  SET status = p_status,
      organizer_note = normalized_note,
      reviewed_by = auth.uid(),
      reviewed_at = NOW(),
      updated_at = NOW()
  WHERE id = request_row.id;

  INSERT INTO public.notifications (user_id, type, title, body, ticket_id)
  VALUES (
    request_row.customer_id,
    'payment',
    CASE WHEN p_status = 'approved' THEN 'Refund request approved'
         WHEN p_status = 'processed' THEN 'Refund processed'
         ELSE 'Refund request declined' END,
    CASE WHEN p_status = 'approved' THEN 'Your refund request was approved and is awaiting payment processing.'
         WHEN p_status = 'processed' THEN 'Your refund has been processed. ' || normalized_note
         ELSE normalized_note END,
    request_row.ticket_id
  );
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_event_status(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_event_status(UUID, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_review_ticket_refund(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_review_ticket_refund(UUID, TEXT, TEXT) TO authenticated;
