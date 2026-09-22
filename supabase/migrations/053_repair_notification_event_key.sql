-- Repair older deployments where the event notification key still omitted
-- recipient_scope or was created as a named constraint.
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_event_target_key;

DROP INDEX IF EXISTS public.notifications_event_target_key;

DELETE FROM public.notifications older
USING public.notifications newer
WHERE older.ctid < newer.ctid
  AND older.user_id IS NOT DISTINCT FROM newer.user_id
  AND older.event_id IS NOT DISTINCT FROM newer.event_id
  AND older.type = newer.type
  AND COALESCE(older.recipient_scope, 'attendee') = COALESCE(newer.recipient_scope, 'attendee')
  AND older.ticket_id IS NULL
  AND newer.ticket_id IS NULL;

CREATE UNIQUE INDEX notifications_event_target_key
  ON public.notifications (
    user_id,
    event_id,
    type,
    COALESCE(recipient_scope, 'attendee')
  )
  WHERE ticket_id IS NULL AND event_id IS NOT NULL;

DROP TRIGGER IF EXISTS notify_organizer_order_on_change ON public.orders;
