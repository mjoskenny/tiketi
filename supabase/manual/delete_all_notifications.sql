-- MANUAL, DESTRUCTIVE OPERATION — do not add this file to Supabase migrations.
-- Confirm the selected project is nunysxvsgoxyxywjtbku before running.
-- This permanently deletes every attendee, organizer, team, and agent notification.

BEGIN;

SELECT COUNT(*) AS notifications_to_delete
FROM public.notifications;

DELETE FROM public.notifications;

COMMIT;
