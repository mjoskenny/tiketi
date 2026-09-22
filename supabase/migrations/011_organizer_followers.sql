CREATE TABLE IF NOT EXISTS public.organizer_followers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id UUID NOT NULL REFERENCES public.organizers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organizer_id, user_id)
);

ALTER TABLE public.organizer_followers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "organizer_followers_read" ON public.organizer_followers;
CREATE POLICY "organizer_followers_read" ON public.organizer_followers
FOR SELECT USING (auth.uid() = user_id OR organizer_id IN (SELECT id FROM public.organizers WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "organizer_followers_manage_own" ON public.organizer_followers;
CREATE POLICY "organizer_followers_manage_own" ON public.organizer_followers
FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "organizer_followers_delete_own" ON public.organizer_followers;
CREATE POLICY "organizer_followers_delete_own" ON public.organizer_followers
FOR DELETE USING (auth.uid() = user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'organizer_followers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.organizer_followers;
  END IF;
END
$$;