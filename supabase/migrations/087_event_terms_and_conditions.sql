ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS terms_and_conditions TEXT;
