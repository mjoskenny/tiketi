-- Replace only names that match the legacy generated pattern with the saved
-- profile name. This leaves intentionally customized organizer names alone.
UPDATE public.organizers AS organizer
SET name = profile.full_name
FROM public.profiles AS profile
WHERE organizer.user_id = profile.id
  AND NULLIF(BTRIM(profile.full_name), '') IS NOT NULL
  AND organizer.name = profile.full_name || '''s Events';
