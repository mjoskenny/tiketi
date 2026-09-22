DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'organizer_followers_profile_id_fkey'
  ) THEN
    ALTER TABLE public.organizer_followers
      ADD CONSTRAINT organizer_followers_profile_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END
$$;