-- Notification deduplication must never abort ticket purchases.
-- Remove legacy event-target uniqueness that can collide across notification
-- triggers. Notification rows are informational and may safely repeat.
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_event_target_key;

DROP INDEX IF EXISTS public.notifications_event_target_key;
