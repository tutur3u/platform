-- Changelog entries table for platform-wide changelog
-- This migration creates the changelog_entries table for the global changelog feature

-- Create changelog_entries table
CREATE TABLE "public"."changelog_entries" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "title" text NOT NULL,
    "slug" text NOT NULL,
    "content" jsonb NOT NULL,
    "summary" text,
    "category" text NOT NULL,
    "version" text,
    "cover_image_url" text,
    "is_published" boolean DEFAULT false,
    "published_at" timestamp with time zone,
    "creator_id" uuid NOT NULL DEFAULT auth.uid(),
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now()
);

-- Enable RLS on changelog_entries table
ALTER TABLE "public"."changelog_entries" ENABLE ROW LEVEL SECURITY;

-- Add primary key
ALTER TABLE "public"."changelog_entries" ADD CONSTRAINT "changelog_entries_pkey" PRIMARY KEY ("id");

-- Add unique constraint on slug
ALTER TABLE "public"."changelog_entries" ADD CONSTRAINT "changelog_entries_slug_key" UNIQUE ("slug");

-- Add foreign key constraint
ALTER TABLE "public"."changelog_entries"
    ADD CONSTRAINT "changelog_entries_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;

-- Add check constraints
ALTER TABLE "public"."changelog_entries" ADD CONSTRAINT "changelog_entries_category_check"
    CHECK (category IN ('feature', 'improvement', 'bugfix', 'breaking', 'security', 'performance'));

ALTER TABLE "public"."changelog_entries" ADD CONSTRAINT "changelog_entries_content_valid"
    CHECK (
        content IS NOT NULL
        AND content ? 'type'
        AND (content->>'type') = 'doc'
    );

-- Create indexes for better performance
CREATE INDEX "idx_changelog_entries_published_at" ON "public"."changelog_entries"("published_at" DESC) WHERE is_published = true;
CREATE INDEX "idx_changelog_entries_category" ON "public"."changelog_entries"("category");
CREATE INDEX "idx_changelog_entries_slug" ON "public"."changelog_entries"("slug");
CREATE INDEX "idx_changelog_entries_creator_id" ON "public"."changelog_entries"("creator_id");
CREATE INDEX "idx_changelog_entries_created_at" ON "public"."changelog_entries"("created_at" DESC);

-- Create RLS policies for changelog_entries

-- Public: Anyone can view published changelogs (no auth required)
CREATE POLICY "Anyone can view published changelogs" ON "public"."changelog_entries"
    FOR SELECT USING (is_published = true AND published_at IS NOT NULL);

-- Admin: Root workspace members can view all changelogs (including drafts)
CREATE POLICY "Root workspace members can view all changelogs" ON "public"."changelog_entries"
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM "public"."workspace_members" wm
            WHERE wm.ws_id = '00000000-0000-0000-0000-000000000000'
            AND wm.user_id = auth.uid()
        )
    );

-- Admin: Root workspace members can create changelogs
CREATE POLICY "Root workspace members can create changelogs" ON "public"."changelog_entries"
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM "public"."workspace_members" wm
            WHERE wm.ws_id = '00000000-0000-0000-0000-000000000000'
            AND wm.user_id = auth.uid()
        )
    );

-- Admin: Root workspace members can update changelogs
CREATE POLICY "Root workspace members can update changelogs" ON "public"."changelog_entries"
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM "public"."workspace_members" wm
            WHERE wm.ws_id = '00000000-0000-0000-0000-000000000000'
            AND wm.user_id = auth.uid()
        )
    );

-- Admin: Root workspace members can delete changelogs
CREATE POLICY "Root workspace members can delete changelogs" ON "public"."changelog_entries"
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM "public"."workspace_members" wm
            WHERE wm.ws_id = '00000000-0000-0000-0000-000000000000'
            AND wm.user_id = auth.uid()
        )
    );

-- Grant necessary permissions
GRANT SELECT ON "public"."changelog_entries" TO "anon";
GRANT ALL ON "public"."changelog_entries" TO "authenticated";

-- Create updated_at trigger using the existing update_updated_at_column function
CREATE TRIGGER "changelog_entries_updated_at"
    BEFORE UPDATE ON "public"."changelog_entries"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
