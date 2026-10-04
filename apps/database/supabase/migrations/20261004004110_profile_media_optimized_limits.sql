-- Only server-optimized WebP files may enter public identity buckets.
-- Existing objects remain readable. Restrictive raw-write policies still apply.
UPDATE storage.buckets SET file_size_limit=1000000,
  allowed_mime_types=ARRAY['image/webp'] WHERE id='avatars';
UPDATE storage.buckets SET file_size_limit=2000000,
  allowed_mime_types=ARRAY['image/webp'] WHERE id='banners';
