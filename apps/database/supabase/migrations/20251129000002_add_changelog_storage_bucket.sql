-- Create public storage bucket for changelog media (images and videos)
-- This bucket is public for read access, but only root workspace members can upload

-- Create the changelog bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
SELECT
    'changelog',
    'changelog',
    true,  -- Public bucket for read access
    52428800,  -- 50MB limit
    ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'video/mp4', 'video/webm']
WHERE
    NOT EXISTS (
        SELECT 1 FROM storage.buckets WHERE name = 'changelog'
    );

-- POLICY: Anyone can view changelog media (public bucket)
CREATE POLICY "Anyone can view changelog media"
ON storage.objects FOR SELECT
USING (bucket_id = 'changelog');

-- POLICY: Root workspace members can upload changelog media
CREATE POLICY "Root workspace members can upload changelog media"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'changelog' AND
    auth.role() = 'authenticated' AND
    EXISTS (
        SELECT 1 FROM "public"."workspace_members" wm
        WHERE wm.ws_id = '00000000-0000-0000-0000-000000000000'
        AND wm.user_id = auth.uid()
    )
);

-- POLICY: Root workspace members can update changelog media
CREATE POLICY "Root workspace members can update changelog media"
ON storage.objects FOR UPDATE
USING (
    bucket_id = 'changelog' AND
    auth.role() = 'authenticated' AND
    EXISTS (
        SELECT 1 FROM "public"."workspace_members" wm
        WHERE wm.ws_id = '00000000-0000-0000-0000-000000000000'
        AND wm.user_id = auth.uid()
    )
);

-- POLICY: Root workspace members can delete changelog media
CREATE POLICY "Root workspace members can delete changelog media"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'changelog' AND
    auth.role() = 'authenticated' AND
    EXISTS (
        SELECT 1 FROM "public"."workspace_members" wm
        WHERE wm.ws_id = '00000000-0000-0000-0000-000000000000'
        AND wm.user_id = auth.uid()
    )
);
