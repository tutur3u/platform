UPDATE storage.buckets
SET 
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/*', 'video/*']
WHERE id = 'support_inquiries';