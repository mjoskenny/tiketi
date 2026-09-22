-- Public organizer cards and profiles need to read identity and media fields.
DROP POLICY IF EXISTS "profiles_public_read" ON public.profiles;
CREATE POLICY "profiles_public_read"
ON public.profiles FOR SELECT
USING (true);