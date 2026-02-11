-- Drop the old SELECT policy
DROP POLICY IF EXISTS "Allow creators to view images from their time tracking request folder" ON storage.objects;

-- Create new SELECT policy allowing both creators and users with manage_time_tracking_requests permission
CREATE POLICY "Allow creators and managers to view images from their time tracking request folder"
ON storage.objects FOR SELECT -- This policy only applies to file downloads/views
USING (
    -- 1. Target the correct bucket
    bucket_id = 'time_tracking_requests' AND

    -- 2. Check for authentication
    auth.role() = 'authenticated' AND

    -- 3. Allow access if user is either the creator OR has manage_time_tracking_requests permission
    (
        -- Creator access: Match the authenticated user's ID with the request's creator ID
        auth.uid() = (
            SELECT ttr.user_id
            FROM public.time_tracking_requests as ttr
            WHERE ttr.id = ((storage.foldername(name))[1])::uuid
        )
        OR
        -- Manager access: User has the manage_time_tracking_requests permission for the workspace
        has_workspace_permission(
            (
                SELECT ttr.workspace_id
                FROM public.time_tracking_requests as ttr
                WHERE ttr.id = ((storage.foldername(name))[1])::uuid
            ),
            auth.uid(),
            'manage_time_tracking_requests'::text
        )
    )
);
