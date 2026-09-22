DROP POLICY IF EXISTS "organizer_followers_manage_own" ON public.organizer_followers;
CREATE POLICY "organizer_followers_manage_own" ON public.organizer_followers
FOR INSERT WITH CHECK (
  auth.uid() = user_id
  AND NOT EXISTS (
    SELECT 1 FROM public.organizers
    WHERE organizers.id = organizer_followers.organizer_id
      AND organizers.user_id = auth.uid()
  )
);