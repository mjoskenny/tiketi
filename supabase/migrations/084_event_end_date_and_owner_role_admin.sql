ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS end_date DATE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'events_end_date_not_before_start_date'
      AND conrelid = 'public.events'::regclass
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_end_date_not_before_start_date
      CHECK (end_date IS NULL OR end_date >= date);
  END IF;
END;
$$;

-- Keep multi-day events valid through their configured final date.
CREATE OR REPLACE FUNCTION public.check_in_ticket(p_qr_code TEXT)
RETURNS TABLE (
  ticket_id UUID,
  event_id UUID,
  event_title TEXT,
  holder_name TEXT,
  ticket_name TEXT,
  ticket_status TEXT,
  checked_in_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ticket_row RECORD;
  checked_row RECORD;
  event_ends_at TIMESTAMP;
BEGIN
  SELECT tickets.id, tickets.event_id, tickets.holder_name, tickets.status, tickets.checked_in_at,
    events.organizer_id, events.title AS event_title, events.status AS event_status,
    events.date AS event_date, events.end_date AS event_end_date,
    events.time AS event_time, events.end_time AS event_end_time,
    ticket_tiers.name AS ticket_name
  INTO ticket_row
  FROM public.tickets
  LEFT JOIN public.events ON events.id = tickets.event_id
  LEFT JOIN public.ticket_tiers ON ticket_tiers.id = tickets.ticket_tier_id
  WHERE tickets.qr_code = p_qr_code
  FOR UPDATE OF tickets;

  IF NOT FOUND OR ticket_row.organizer_id IS NULL
    OR NOT public.has_organizer_permission(ticket_row.organizer_id, 'checkin') THEN
    RETURN;
  END IF;

  IF ticket_row.status IN ('cancelled', 'used') THEN
    RETURN QUERY SELECT ticket_row.id, ticket_row.event_id, ticket_row.event_title,
      ticket_row.holder_name, ticket_row.ticket_name, ticket_row.status, ticket_row.checked_in_at;
    RETURN;
  END IF;

  event_ends_at := COALESCE(ticket_row.event_end_date, ticket_row.event_date)
    + COALESCE(
      ticket_row.event_end_time,
      CASE WHEN ticket_row.event_end_date IS NOT NULL THEN TIME '23:59:59' ELSE ticket_row.event_time END,
      TIME '23:59:59'
    );

  IF ticket_row.event_status IS DISTINCT FROM 'published' OR event_ends_at < NOW() THEN
    RETURN QUERY SELECT ticket_row.id, ticket_row.event_id, ticket_row.event_title,
      ticket_row.holder_name, ticket_row.ticket_name, 'cancelled'::TEXT, ticket_row.checked_in_at;
    RETURN;
  END IF;

  UPDATE public.tickets
  SET status = 'used', checked_in_at = NOW()
  WHERE id = ticket_row.id
  RETURNING checked_in_at INTO checked_row;

  RETURN QUERY SELECT ticket_row.id, ticket_row.event_id, ticket_row.event_title,
    ticket_row.holder_name, ticket_row.ticket_name, 'valid'::TEXT, checked_row.checked_in_at;
END;
$$;

REVOKE ALL ON FUNCTION public.check_in_ticket(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_in_ticket(TEXT) TO authenticated;

-- Organizer role creation and changes are reserved for the organization owner.
-- Team members may still read roles so owners can assign them to members.
DROP POLICY IF EXISTS "roles_team_manage" ON public.organizer_roles;
DROP POLICY IF EXISTS "roles_organizer" ON public.organizer_roles;
CREATE POLICY "roles_organizer" ON public.organizer_roles
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organizers
    WHERE organizers.id = organizer_roles.organizer_id
      AND organizers.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.organizers
    WHERE organizers.id = organizer_roles.organizer_id
      AND organizers.user_id = auth.uid()
  ));
