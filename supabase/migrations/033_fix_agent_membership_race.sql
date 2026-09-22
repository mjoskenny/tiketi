-- Make agent invitations safe when the person is already a team member,
-- and when two invite requests arrive at the same time.
CREATE OR REPLACE FUNCTION public.invite_agent_by_email(
  p_organizer_id UUID, p_email TEXT, p_event_id UUID, p_ticket_tier_ids UUID[],
  p_commission_rate NUMERIC, p_ticket_limit INTEGER, p_sales_limit INTEGER, p_message TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user UUID;
  member_row public.organizer_members%ROWTYPE;
  invitation_id UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.organizers
    WHERE id = p_organizer_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Organizer owner access required';
  END IF;

  SELECT id INTO target_user
  FROM public.profiles
  WHERE lower(email) = lower(trim(p_email))
  LIMIT 1;

  IF target_user IS NULL THEN
    RAISE EXCEPTION 'This email must belong to an existing Tiketi account';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.events
    WHERE id = p_event_id AND organizer_id = p_organizer_id
  ) THEN
    RAISE EXCEPTION 'Event does not belong to this organizer';
  END IF;

  IF p_commission_rate IS NULL OR p_commission_rate < 0 OR p_commission_rate > 100 THEN
    RAISE EXCEPTION 'Invalid commission rate';
  END IF;

  -- An existing team member is reused. The unique constraint remains the
  -- authoritative protection against duplicate organizer/user relationships.
  INSERT INTO public.organizer_members (organizer_id, user_id, status)
  VALUES (p_organizer_id, target_user, 'pending')
  ON CONFLICT (organizer_id, user_id) DO NOTHING;

  SELECT * INTO member_row
  FROM public.organizer_members
  WHERE organizer_id = p_organizer_id AND user_id = target_user;

  IF member_row.status NOT IN ('pending', 'active') THEN
    RAISE EXCEPTION 'This team member is inactive';
  END IF;

  INSERT INTO public.agent_invitations (organizer_id, user_id, invited_by, message)
  VALUES (p_organizer_id, target_user, auth.uid(), p_message)
  ON CONFLICT (organizer_id, user_id) WHERE status = 'pending' DO NOTHING
  RETURNING id INTO invitation_id;

  IF invitation_id IS NULL THEN
    SELECT id INTO invitation_id
    FROM public.agent_invitations
    WHERE organizer_id = p_organizer_id
      AND user_id = target_user
      AND status = 'pending'
    LIMIT 1;
  END IF;

  INSERT INTO public.agent_assignments (
    organizer_id, user_id, organizer_member_id, event_id, ticket_tier_ids,
    allow_all_ticket_types, commission_rate, ticket_limit, sales_limit, status
  )
  VALUES (
    p_organizer_id, target_user, member_row.id, p_event_id,
    COALESCE(p_ticket_tier_ids, '{}'),
    COALESCE(cardinality(p_ticket_tier_ids), 0) = 0,
    p_commission_rate, p_ticket_limit, p_sales_limit, 'pending'
  )
  ON CONFLICT (user_id, organizer_id, event_id) DO UPDATE SET
    ticket_tier_ids = EXCLUDED.ticket_tier_ids,
    allow_all_ticket_types = EXCLUDED.allow_all_ticket_types,
    commission_rate = EXCLUDED.commission_rate,
    ticket_limit = EXCLUDED.ticket_limit,
    sales_limit = EXCLUDED.sales_limit,
    updated_at = NOW();

  INSERT INTO public.notifications (user_id, organizer_id, type, title, body, recipient_scope)
  SELECT target_user, p_organizer_id, 'team', 'Agent invitation received',
    'You have been invited to sell tickets for ' || o.name || '.', 'attendee'
  FROM public.organizers o
  WHERE o.id = p_organizer_id;

  RETURN invitation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.invite_agent_by_email(UUID, TEXT, UUID, UUID[], NUMERIC, INTEGER, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invite_agent_by_email(UUID, TEXT, UUID, UUID[], NUMERIC, INTEGER, INTEGER, TEXT) TO authenticated;
