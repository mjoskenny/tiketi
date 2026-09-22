ALTER TABLE public.organizers
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified', 'pending', 'verified')),
  ADD COLUMN IF NOT EXISTS verification_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_note TEXT;

UPDATE public.organizers
SET verification_status = CASE WHEN verified THEN 'verified' ELSE 'unverified' END
WHERE verification_status = 'unverified';