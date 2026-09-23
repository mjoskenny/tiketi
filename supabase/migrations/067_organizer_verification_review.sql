-- Organizer verification is a controlled workflow: organizers submit a
-- request, and only a platform administrator can approve or decline it.
-- Keeping these transitions in RPCs prevents an organizer from self-verifying
-- through a direct table update.

ALTER TABLE public.organizers
  ADD COLUMN IF NOT EXISTS verification_reviewed_by UUID
    REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.guard_organizer_verification_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.verified
      OR NEW.verification_status <> 'unverified'
      OR NEW.verification_requested_at IS NOT NULL
      OR NEW.verification_reviewed_at IS NOT NULL
      OR NEW.verification_reviewed_by IS NOT NULL
      OR NEW.verification_note IS NOT NULL
    THEN
      RAISE EXCEPTION 'Organizer verification must begin as unverified';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.verified IS DISTINCT FROM OLD.verified
    OR NEW.verification_status IS DISTINCT FROM OLD.verification_status
    OR NEW.verification_requested_at IS DISTINCT FROM OLD.verification_requested_at
    OR NEW.verification_reviewed_at IS DISTINCT FROM OLD.verification_reviewed_at
    OR NEW.verification_reviewed_by IS DISTINCT FROM OLD.verification_reviewed_by
    OR NEW.verification_note IS DISTINCT FROM OLD.verification_note
  THEN
    IF current_setting('app.organizer_verification_change', TRUE) IS DISTINCT FROM 'allowed' THEN
      RAISE EXCEPTION 'Organizer verification must be changed through the verification workflow';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_organizer_verification_fields_on_update ON public.organizers;
CREATE TRIGGER guard_organizer_verification_fields_on_update
BEFORE INSERT OR UPDATE ON public.organizers
FOR EACH ROW
EXECUTE FUNCTION public.guard_organizer_verification_fields();

CREATE OR REPLACE FUNCTION public.request_organizer_verification(
  p_organizer_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  organizer_row public.organizers%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in';
  END IF;

  SELECT * INTO organizer_row
  FROM public.organizers
  WHERE id = p_organizer_id
    AND user_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only the organizer owner can request verification';
  END IF;
  IF organizer_row.verification_status = 'pending' THEN
    RAISE EXCEPTION 'Your verification request is already awaiting review';
  END IF;
  IF organizer_row.verification_status = 'verified' OR organizer_row.verified THEN
    RAISE EXCEPTION 'Your organizer profile is already verified';
  END IF;

  PERFORM set_config('app.organizer_verification_change', 'allowed', TRUE);
  UPDATE public.organizers
  SET verified = FALSE,
      verification_status = 'pending',
      verification_requested_at = NOW(),
      verification_reviewed_at = NULL,
      verification_reviewed_by = NULL,
      verification_note = NULL
  WHERE id = organizer_row.id;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_organizer_verification(
  p_organizer_id UUID,
  p_decision TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  organizer_row public.organizers%ROWTYPE;
  normalized_note TEXT;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Platform administrator access is required';
  END IF;
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Choose approved or rejected';
  END IF;

  SELECT * INTO organizer_row
  FROM public.organizers
  WHERE id = p_organizer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organizer not found';
  END IF;
  IF organizer_row.verification_status <> 'pending' THEN
    RAISE EXCEPTION 'This verification request is no longer awaiting review';
  END IF;

  normalized_note := NULLIF(BTRIM(COALESCE(p_note, '')), '');
  IF p_decision = 'rejected' AND normalized_note IS NULL THEN
    normalized_note := 'Your verification request was not approved. Please update your organizer profile and submit a new request.';
  END IF;

  PERFORM set_config('app.organizer_verification_change', 'allowed', TRUE);
  UPDATE public.organizers
  SET verified = p_decision = 'approved',
      verification_status = CASE WHEN p_decision = 'approved' THEN 'verified' ELSE 'unverified' END,
      verification_reviewed_at = NOW(),
      verification_reviewed_by = auth.uid(),
      verification_note = normalized_note
  WHERE id = organizer_row.id;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_organizer_verification_fields() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_organizer_verification(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_organizer_verification(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.review_organizer_verification(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_organizer_verification(UUID, TEXT, TEXT) TO authenticated;
