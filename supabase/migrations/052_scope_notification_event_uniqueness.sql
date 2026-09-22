-- Event notifications for different audiences must not collide.
-- The old index omitted recipient_scope, so attendee and organizer rows with
-- the same user/event/type could abort an order confirmation.
DROP INDEX IF EXISTS public.notifications_event_target_key;

DELETE FROM public.notifications older
USING public.notifications newer
WHERE older.ctid < newer.ctid
  AND older.user_id IS NOT DISTINCT FROM newer.user_id
  AND older.event_id IS NOT DISTINCT FROM newer.event_id
  AND older.type = newer.type
  AND older.recipient_scope IS NOT DISTINCT FROM newer.recipient_scope
  AND older.ticket_id IS NULL
  AND newer.ticket_id IS NULL;

CREATE UNIQUE INDEX notifications_event_target_key
  ON public.notifications (user_id, event_id, type, recipient_scope)
  WHERE ticket_id IS NULL AND event_id IS NOT NULL;

-- Migration 024 replaced this legacy trigger with the scoped audience trigger.
-- Drop it explicitly for databases that applied the migrations out of order.
DROP TRIGGER IF EXISTS notify_organizer_order_on_change ON public.orders;
