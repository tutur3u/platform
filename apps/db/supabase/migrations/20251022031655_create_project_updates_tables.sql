-- Create project updates tables for feed-style project communication
-- This includes updates, reactions, comments, and attachments

-- ============================================================================
-- task_project_updates: Main updates feed table
-- ============================================================================
CREATE TABLE "public"."task_project_updates" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "project_id" uuid NOT NULL REFERENCES "public"."task_projects"("id") ON DELETE CASCADE,
  "creator_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE CASCADE,
  "content" text NOT NULL, -- Rich text content (TipTap handles conversion)
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone -- Soft delete for audit trail
);

-- Enable RLS
ALTER TABLE "public"."task_project_updates" ENABLE ROW LEVEL SECURITY;

-- Indexes for performance
CREATE INDEX "idx_task_project_updates_project_id"
  ON "public"."task_project_updates" USING btree ("project_id");

CREATE INDEX "idx_task_project_updates_creator_id"
  ON "public"."task_project_updates" USING btree ("creator_id");

CREATE INDEX "idx_task_project_updates_created_at"
  ON "public"."task_project_updates" USING btree ("created_at" DESC);

CREATE INDEX "idx_task_project_updates_deleted_at"
  ON "public"."task_project_updates" USING btree ("deleted_at")
  WHERE "deleted_at" IS NULL;

CREATE INDEX "idx_task_project_updates_project_created"
  ON "public"."task_project_updates" USING btree ("project_id", "created_at" DESC);

-- ============================================================================
-- task_project_update_reactions: Emoji reactions on updates
-- ============================================================================
CREATE TABLE "public"."task_project_update_reactions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "update_id" uuid NOT NULL REFERENCES "public"."task_project_updates"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE CASCADE,
  "emoji" text NOT NULL, -- Emoji character or shortcode (e.g., =M or :thumbsup:)
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  -- Ensure one user can only have one reaction of a specific emoji per update
  UNIQUE ("update_id", "user_id", "emoji")
);

-- Enable RLS
ALTER TABLE "public"."task_project_update_reactions" ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX "idx_task_project_update_reactions_update_id"
  ON "public"."task_project_update_reactions" USING btree ("update_id");

CREATE INDEX "idx_task_project_update_reactions_user_id"
  ON "public"."task_project_update_reactions" USING btree ("user_id");

-- ============================================================================
-- task_project_update_comments: Threaded comments on updates
-- ============================================================================
CREATE TABLE "public"."task_project_update_comments" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "update_id" uuid NOT NULL REFERENCES "public"."task_project_updates"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE CASCADE,
  "content" text NOT NULL, -- Rich text content (TipTap handles conversion)
  "parent_id" uuid REFERENCES "public"."task_project_update_comments"("id") ON DELETE CASCADE, -- For threaded replies
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone -- Soft delete
);

-- Enable RLS
ALTER TABLE "public"."task_project_update_comments" ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX "idx_task_project_update_comments_update_id"
  ON "public"."task_project_update_comments" USING btree ("update_id");

CREATE INDEX "idx_task_project_update_comments_user_id"
  ON "public"."task_project_update_comments" USING btree ("user_id");

CREATE INDEX "idx_task_project_update_comments_parent_id"
  ON "public"."task_project_update_comments" USING btree ("parent_id");

CREATE INDEX "idx_task_project_update_comments_created_at"
  ON "public"."task_project_update_comments" USING btree ("created_at" ASC);

CREATE INDEX "idx_task_project_update_comments_deleted_at"
  ON "public"."task_project_update_comments" USING btree ("deleted_at")
  WHERE "deleted_at" IS NULL;

-- ============================================================================
-- task_project_update_attachments: File attachments for updates
-- ============================================================================
CREATE TABLE "public"."task_project_update_attachments" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "update_id" uuid NOT NULL REFERENCES "public"."task_project_updates"("id") ON DELETE CASCADE,
  "file_name" text NOT NULL, -- Original file name
  "file_path" text NOT NULL, -- Path in Supabase storage
  "file_size" bigint NOT NULL, -- File size in bytes
  "mime_type" text NOT NULL, -- MIME type (e.g., image/png, application/pdf)
  "uploaded_by" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone DEFAULT NULL -- Soft delete for audit trail
);

-- Enable RLS
ALTER TABLE "public"."task_project_update_attachments" ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX "idx_task_project_update_attachments_update_id"
  ON "public"."task_project_update_attachments" USING btree ("update_id");

CREATE INDEX "idx_task_project_update_attachments_uploaded_by"
  ON "public"."task_project_update_attachments" USING btree ("uploaded_by");

-- Sparse index for non-deleted attachments (for efficient queries on active attachments)
CREATE INDEX "idx_task_project_update_attachments_deleted_at"
  ON "public"."task_project_update_attachments" USING btree ("deleted_at")
  WHERE "deleted_at" IS NULL;

-- ============================================================================
-- Comments and documentation
-- ============================================================================
COMMENT ON TABLE "public"."task_project_updates" IS
  'Project updates feed - timeline of project progress and communication';

COMMENT ON COLUMN "public"."task_project_updates"."content" IS
  'Rich text content stored as text (TipTap handles conversion)';

COMMENT ON TABLE "public"."task_project_update_reactions" IS
  'Emoji reactions on project updates (likes, hearts, etc.)';

COMMENT ON TABLE "public"."task_project_update_comments" IS
  'Comments on project updates with optional threading support';

COMMENT ON COLUMN "public"."task_project_update_comments"."parent_id" IS
  'Parent comment ID for threaded replies (NULL for top-level comments)';

COMMENT ON TABLE "public"."task_project_update_attachments" IS
  'File attachments for project updates (images, documents, etc.)';

COMMENT ON COLUMN "public"."task_project_update_attachments"."file_path" IS
  'Storage path in Supabase storage bucket (workspaces/{ws_id}/project-updates/{file})';

-- ============================================================================
-- Triggers for updated_at timestamps
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to updates table
CREATE TRIGGER update_task_project_updates_updated_at
  BEFORE UPDATE ON "public"."task_project_updates"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Note: Trigger for task_project_update_comments is created in migration
-- 20251022031800_improve_task_project_update_comments.sql with CASCADE behavior
