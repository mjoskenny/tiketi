-- Public profile media with user-scoped uploads.
INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-media', 'profile-media', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Public can view profile media" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload profile media" ON storage.objects;
DROP POLICY IF EXISTS "Users can update profile media" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete profile media" ON storage.objects;

CREATE POLICY "Public can view profile media"
ON storage.objects FOR SELECT
USING (bucket_id = 'profile-media');

CREATE POLICY "Users can upload profile media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'profile-media' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can update profile media"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'profile-media' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'profile-media' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete profile media"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'profile-media' AND (storage.foldername(name))[1] = auth.uid()::text);