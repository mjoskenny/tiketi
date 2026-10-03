-- Admin event operations use controlled RPCs. Destructive deletion is omitted
-- because events own ticket/order history; cancellation is the supported archive.
CREATE OR REPLACE FUNCTION public.admin_create_event(
  p_organizer_id UUID,
  p_title TEXT,
  p_description TEXT,
  p_category TEXT,
  p_date DATE,
  p_time TIME,
  p_end_time TIME,
  p_venue TEXT,
  p_city TEXT,
  p_capacity INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  created_event_id UUID;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Platform administrator access is required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organizers WHERE id = p_organizer_id) THEN
    RAISE EXCEPTION 'Select an existing organizer';
  END IF;
  IF NULLIF(BTRIM(COALESCE(p_title, '')), '') IS NULL THEN RAISE EXCEPTION 'Event title is required'; END IF;
  IF NULLIF(BTRIM(COALESCE(p_venue, '')), '') IS NULL THEN RAISE EXCEPTION 'Venue is required'; END IF;
  IF p_date IS NULL OR p_time IS NULL THEN RAISE EXCEPTION 'Event date and time are required'; END IF;
  IF p_end_time IS NOT NULL AND p_end_time <= p_time THEN RAISE EXCEPTION 'Event end time must be later than start time'; END IF;
  IF p_capacity IS NULL OR p_capacity < 1 THEN RAISE EXCEPTION 'Capacity must be a positive whole number'; END IF;

  INSERT INTO public.events (
    organizer_id, title, description, category, date, time, end_time,
    venue, city, capacity, status, is_featured
  ) VALUES (
    p_organizer_id, BTRIM(p_title), NULLIF(BTRIM(COALESCE(p_description, '')), ''),
    COALESCE(NULLIF(BTRIM(COALESCE(p_category, '')), ''), 'Other'), p_date, p_time, p_end_time,
    BTRIM(p_venue), COALESCE(NULLIF(BTRIM(COALESCE(p_city, '')), ''), 'Bujumbura'),
    p_capacity, 'draft', FALSE
  ) RETURNING id INTO created_event_id;

  RETURN created_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_event_details(
  p_event_id UUID,
  p_organizer_id UUID,
  p_title TEXT,
  p_description TEXT,
  p_category TEXT,
  p_date DATE,
  p_time TIME,
  p_end_time TIME,
  p_venue TEXT,
  p_city TEXT,
  p_capacity INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  event_row public.events%ROWTYPE;
  already_sold INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Platform administrator access is required';
  END IF;
  SELECT * INTO event_row FROM public.events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Event not found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organizers WHERE id = p_organizer_id) THEN RAISE EXCEPTION 'Select an existing organizer'; END IF;
  IF NULLIF(BTRIM(COALESCE(p_title, '')), '') IS NULL THEN RAISE EXCEPTION 'Event title is required'; END IF;
  IF NULLIF(BTRIM(COALESCE(p_venue, '')), '') IS NULL THEN RAISE EXCEPTION 'Venue is required'; END IF;
  IF p_date IS NULL OR p_time IS NULL THEN RAISE EXCEPTION 'Event date and time are required'; END IF;
  IF p_end_time IS NOT NULL AND p_end_time <= p_time THEN RAISE EXCEPTION 'Event end time must be later than start time'; END IF;
  IF p_capacity IS NULL OR p_capacity < 1 THEN RAISE EXCEPTION 'Capacity must be a positive whole number'; END IF;

  SELECT COALESCE(SUM(sold), 0)::INTEGER INTO already_sold
  FROM public.ticket_tiers WHERE event_id = p_event_id;
  IF p_capacity < already_sold THEN RAISE EXCEPTION 'Capacity cannot be lower than the % tickets already sold', already_sold; END IF;

  UPDATE public.events SET
    organizer_id = p_organizer_id,
    title = BTRIM(p_title),
    description = NULLIF(BTRIM(COALESCE(p_description, '')), ''),
    category = COALESCE(NULLIF(BTRIM(COALESCE(p_category, '')), ''), 'Other'),
    date = p_date,
    time = p_time,
    end_time = p_end_time,
    venue = BTRIM(p_venue),
    city = COALESCE(NULLIF(BTRIM(COALESCE(p_city, '')), ''), 'Bujumbura'),
    capacity = p_capacity,
    updated_at = NOW()
  WHERE id = p_event_id;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_event(UUID, TEXT, TEXT, TEXT, DATE, TIME, TIME, TEXT, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_create_event(UUID, TEXT, TEXT, TEXT, DATE, TIME, TIME, TEXT, TEXT, INTEGER) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_update_event_details(UUID, UUID, TEXT, TEXT, TEXT, DATE, TIME, TIME, TEXT, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_event_details(UUID, UUID, TEXT, TEXT, TEXT, DATE, TIME, TIME, TEXT, TEXT, INTEGER) TO authenticated;
