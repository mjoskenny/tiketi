-- Harden public profile reads by removing unrestricted access to the full
-- profiles table and exposing only a safe public subset through a dedicated
-- view. This prevents accidental email/phone/role exposure on public pages.
DROP POLICY IF EXISTS "profiles_public_media_read" ON public.profiles;
DROP POLICY IF EXISTS "profiles_public_read" ON public.profiles;
DROP POLICY IF EXISTS "profiles_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete_own" ON public.profiles;

CREATE POLICY "profiles_self_or_admin_select"
ON public.profiles
FOR SELECT
USING (auth.uid() = id OR public.is_platform_admin());

CREATE OR REPLACE VIEW public.public_profiles AS
SELECT
  id,
  full_name,
  username,
  profile_image,
  avatar_url,
  cover_image,
  created_at
FROM public.profiles;

ALTER VIEW public.public_profiles SET (security_barrier = true);

GRANT SELECT ON public.public_profiles TO anon, authenticated;

-- Keep the private profile table inaccessible to unauthenticated users and to
-- unrelated authenticated users, while still allowing owners and admins to read
-- their own rows.
CREATE POLICY "profiles_own_select"
ON public.profiles
FOR SELECT
USING (auth.uid() = id OR public.is_platform_admin());

CREATE POLICY "profiles_self_or_admin_update"
ON public.profiles
FOR UPDATE
USING (auth.uid() = id OR public.is_platform_admin())
WITH CHECK (auth.uid() = id OR public.is_platform_admin());

CREATE POLICY "profiles_self_or_admin_insert"
ON public.profiles
FOR INSERT
WITH CHECK (auth.uid() = id OR public.is_platform_admin());

CREATE POLICY "profiles_self_or_admin_delete"
ON public.profiles
FOR DELETE
USING (auth.uid() = id OR public.is_platform_admin());
