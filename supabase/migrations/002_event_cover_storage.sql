-- Public event cover images with organizer-scoped uploads.
INSERT INTO storage.buckets (id, name, public)
VALUES ('event-covers', 'event-covers', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Public can view event covers" ON storage.objects;
DROP POLICY IF EXISTS "Organizers can upload event covers" ON storage.objects;
DROP POLICY IF EXISTS "Organizers can delete event covers" ON storage.objects;

CREATE POLICY "Public can view event covers"
ON storage.objects FOR SELECT
USING (bucket_id = 'event-covers');

CREATE POLICY "Organizers can upload event covers"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'event-covers'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.organizers WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Organizers can delete event covers"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'event-covers'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.organizers WHERE user_id = auth.uid()
  )
);