-- Keep profile and cover media in separate profile columns.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS profile_image TEXT;

UPDATE public.profiles
SET profile_image = avatar_url
WHERE profile_image IS NULL AND avatar_url IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_profile_image_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.profile_image = COALESCE(NEW.profile_image, NEW.avatar_url);
    NEW.avatar_url = COALESCE(NEW.profile_image, NEW.avatar_url);
  ELSIF NEW.profile_image IS DISTINCT FROM OLD.profile_image THEN
    NEW.avatar_url = NEW.profile_image;
  ELSIF NEW.avatar_url IS DISTINCT FROM OLD.avatar_url THEN
    NEW.profile_image = NEW.avatar_url;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_profile_image_columns ON public.profiles;
CREATE TRIGGER sync_profile_image_columns
BEFORE INSERT OR UPDATE OF profile_image, avatar_url ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_image_columns();