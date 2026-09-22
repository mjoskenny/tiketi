-- Enforce user-scoped notifications so every account only receives rows targeted to that user.
-- This prevents organizers from receiving member/agent/attendee-only items and prevents members
-- from receiving organization-wide notifications meant for someone else.
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_recipient_scope_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_recipient_scope_check
  CHECK (recipient_scope IN ('attendee', 'organizer', 'member', 'agent'));

CREATE OR REPLACE FUNCTION public.notify_user_scope_audience(
  p_user_id UUID,
  p_notification_type TEXT,
  p_notification_title TEXT,
  p_notification_body TEXT,
  p_event_id UUID DEFAULT NULL,
  p_recipient_scope TEXT DEFAULT 'attendee'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, organizer_id, type, title, body, event_id, recipient_scope)
  VALUES (p_user_id, NULL, p_notification_type, p_notification_title, p_notification_body, p_event_id, p_recipient_scope)
  ON CONFLICT DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_organizer_audience(
  target_organizer_id UUID,
  permission_key TEXT,
  notification_type TEXT,
  notification_title TEXT,
  notification_body TEXT,
  target_event_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, organizer_id, type, title, body, event_id, recipient_scope)
  SELECT recipients.user_id, target_organizer_id, notification_type, notification_title, notification_body, target_event_id, 'organizer'
  FROM (
    SELECT organizers.user_id
    FROM public.organizers
    WHERE organizers.id = target_organizer_id
    UNION
    SELECT members.user_id
    FROM public.organizer_members AS members
    JOIN public.organizer_roles AS roles ON roles.id = members.role_id
    WHERE members.organizer_id = target_organizer_id
      AND members.status = 'active'
      AND (COALESCE((roles.permissions ->> 'all')::BOOLEAN, FALSE)
        OR COALESCE((roles.permissions ->> permission_key)::BOOLEAN, FALSE))
  ) AS recipients
  WHERE recipients.user_id IS NOT NULL
  ON CONFLICT DO NOTHING;
END;
$$;

-- Keep personal notifications personal.
CREATE OR REPLACE FUNCTION public.notify_member_invite_target()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.notifications (user_id, organizer_id, type, title, body, recipient_scope)
    VALUES (NEW.user_id, NEW.organizer_id, 'team', 'Team invitation sent', 'You have been invited to join an organizer team.', 'member')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_agent_invite_target()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.notifications (user_id, organizer_id, type, title, body, recipient_scope)
    VALUES (NEW.user_id, NEW.organizer_id, 'team', 'Agent invitation received', 'You have been invited to sell tickets for this event.', 'agent')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- Normalize any stale rows created before the scope fix so each user only sees its intended audience.
UPDATE public.notifications
SET recipient_scope = 'attendee'
WHERE user_id IS NOT NULL
  AND recipient_scope IS NULL;

UPDATE public.notifications
SET recipient_scope = 'organizer'
WHERE recipient_scope = 'attendee'
  AND organizer_id IS NOT NULL
  AND title IN (
    'New order received',
    'Order update',
    'Event update',
    'Transaction update',
    'New follower',
    'Event ticket tier sold out',
    'Team invitation sent',
    'Team invitation accepted'
  );

UPDATE public.notifications
SET recipient_scope = 'member'
WHERE recipient_scope = 'attendee'
  AND title IN ('Team invitation sent', 'Team invitation accepted');

UPDATE public.notifications
SET recipient_scope = 'agent'
WHERE recipient_scope = 'attendee'
  AND title = 'Agent invitation received';

CREATE OR REPLACE VIEW public.user_notification_scope AS
SELECT n.id, n.user_id, n.organizer_id, n.type, n.title, n.body, n.event_id, n.ticket_id, n.read_at, n.created_at, n.recipient_scope
FROM public.notifications n
WHERE n.user_id = auth.uid()
   OR (n.recipient_scope = 'organizer' AND n.organizer_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.organizers o WHERE o.id = n.organizer_id AND o.user_id = auth.uid()
      ));
