-- Rename the persisted platform brand and its database default.
ALTER TABLE public.platform_settings
  ALTER COLUMN platform_name SET DEFAULT 'QPassa';

UPDATE public.platform_settings
SET platform_name = 'QPassa'
WHERE id = TRUE
  AND LOWER(TRIM(platform_name)) IN ('tiketi', 'tike');

ALTER TABLE public.platform_settings
  ALTER COLUMN support_email SET DEFAULT 'hello@qpassa.events';

UPDATE public.platform_settings
SET support_email = 'hello@qpassa.events'
WHERE id = TRUE
  AND support_email = 'hello@tiketi.events';