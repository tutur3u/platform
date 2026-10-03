-- Public identity artwork is uploaded only through budgeted server-issued tickets.
-- Storage enforces MIME and byte ceilings, even if a client lies about file size.
UPDATE storage.buckets SET file_size_limit=2097152,
  allowed_mime_types=ARRAY['image/png','image/jpeg','image/webp','image/gif']
  WHERE id='avatars';
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  VALUES('banners','banners',true,5242880,ARRAY['image/png','image/jpeg','image/webp','image/gif'])
  ON CONFLICT(id) DO UPDATE SET public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

-- Restrictive policies compose with older broad permissive upload policies.
-- Service-role-issued signed tickets use Storage's privileged scoped upload path.
CREATE POLICY profile_media_require_budgeted_insert ON storage.objects AS RESTRICTIVE
  FOR INSERT TO anon,authenticated WITH CHECK(bucket_id NOT IN ('avatars','banners'));
CREATE POLICY profile_media_require_budgeted_update ON storage.objects AS RESTRICTIVE
  FOR UPDATE TO anon,authenticated USING(bucket_id NOT IN ('avatars','banners'))
  WITH CHECK(bucket_id NOT IN ('avatars','banners'));
