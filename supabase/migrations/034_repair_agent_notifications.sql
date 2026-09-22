-- Repair agent invitation notifications created before their recipient scope
-- was explicit. This is safe to run repeatedly.
UPDATE public.notifications
SET recipient_scope = 'attendee'
WHERE type = 'team'
  AND title = 'Agent invitation received'
  AND user_id IS NOT NULL
  AND recipient_scope IS DISTINCT FROM 'attendee';
