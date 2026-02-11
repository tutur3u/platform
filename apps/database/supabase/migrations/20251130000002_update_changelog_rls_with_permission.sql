-- Update changelog RLS policies to use manage_changelog permission
-- This replaces simple root workspace membership checks with permission-based access

-- Drop existing admin policies
DROP POLICY IF EXISTS "Root workspace members can view all changelogs" ON "public"."changelog_entries";
DROP POLICY IF EXISTS "Root workspace members can create changelogs" ON "public"."changelog_entries";
DROP POLICY IF EXISTS "Root workspace members can update changelogs" ON "public"."changelog_entries";
DROP POLICY IF EXISTS "Root workspace members can delete changelogs" ON "public"."changelog_entries";

-- Create new permission-based policies using the existing has_workspace_permission function

-- Admin: Users with manage_changelog permission can view all changelogs (including drafts)
CREATE POLICY "Users with manage_changelog permission can view all changelogs" ON "public"."changelog_entries"
    FOR SELECT USING (
        public.has_workspace_permission(
            '00000000-0000-0000-0000-000000000000'::uuid,
            auth.uid(),
            'manage_changelog'
        )
    );

-- Admin: Users with manage_changelog permission can create changelogs
CREATE POLICY "Users with manage_changelog permission can create changelogs" ON "public"."changelog_entries"
    FOR INSERT WITH CHECK (
        public.has_workspace_permission(
            '00000000-0000-0000-0000-000000000000'::uuid,
            auth.uid(),
            'manage_changelog'
        )
    );

-- Admin: Users with manage_changelog permission can update changelogs
CREATE POLICY "Users with manage_changelog permission can update changelogs" ON "public"."changelog_entries"
    FOR UPDATE USING (
        public.has_workspace_permission(
            '00000000-0000-0000-0000-000000000000'::uuid,
            auth.uid(),
            'manage_changelog'
        )
    );

-- Admin: Users with manage_changelog permission can delete changelogs
CREATE POLICY "Users with manage_changelog permission can delete changelogs" ON "public"."changelog_entries"
    FOR DELETE USING (
        public.has_workspace_permission(
            '00000000-0000-0000-0000-000000000000'::uuid,
            auth.uid(),
            'manage_changelog'
        )
    );
