CREATE OR REPLACE FUNCTION public.check_in_ticket(p_qr_code TEXT)
RETURNS TABLE (ticket_id UUID, event_id UUID, event_title TEXT, holder_name TEXT, ticket_name TEXT, ticket_status TEXT, checked_in_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE ticket_row RECORD; checked_row RECORD;
BEGIN
  SELECT tickets.id, tickets.event_id, tickets.holder_name, tickets.status, tickets.checked_in_at,
    events.organizer_id, events.title AS event_title, events.status AS event_status,
    events.date AS event_date, events.time AS event_time, events.end_time AS event_end_time,
    ticket_tiers.name AS ticket_name
  INTO ticket_row
  FROM public.tickets
  LEFT JOIN public.events ON events.id = tickets.event_id
  LEFT JOIN public.ticket_tiers ON ticket_tiers.id = tickets.ticket_tier_id
  WHERE tickets.qr_code = p_qr_code
  FOR UPDATE OF tickets;

  IF NOT FOUND OR ticket_row.organizer_id IS NULL OR NOT public.has_organizer_permission(ticket_row.organizer_id, 'checkin') THEN RETURN; END IF;
  IF ticket_row.status IN ('cancelled', 'used') THEN
    RETURN QUERY SELECT ticket_row.id, ticket_row.event_id, ticket_row.event_title, ticket_row.holder_name, ticket_row.ticket_name, ticket_row.status, ticket_row.checked_in_at;
    RETURN;
  END IF;
  IF ticket_row.event_status IS DISTINCT FROM 'published'
    OR (ticket_row.event_date + COALESCE(ticket_row.event_end_time, ticket_row.event_time, '23:59:59')::time) < NOW() THEN
    RETURN QUERY SELECT ticket_row.id, ticket_row.event_id, ticket_row.event_title, ticket_row.holder_name, ticket_row.ticket_name, 'cancelled'::TEXT, ticket_row.checked_in_at;
    RETURN;
  END IF;

  UPDATE public.tickets SET status = 'used', checked_in_at = NOW() WHERE id = ticket_row.id RETURNING checked_in_at INTO checked_row;
  RETURN QUERY SELECT ticket_row.id, ticket_row.event_id, ticket_row.event_title, ticket_row.holder_name, ticket_row.ticket_name, 'valid'::TEXT, checked_row.checked_in_at;
END;
$$;

REVOKE ALL ON FUNCTION public.check_in_ticket(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_in_ticket(TEXT) TO authenticated;
