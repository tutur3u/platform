-- ===================================================================
-- Task Project Update Comments - CASCADE deletes, triggers, and indexes
-- ===================================================================
-- This migration enhances task_project_update_comments with:
-- 1. CASCADE delete behavior to prevent orphaned comments
-- 2. Auto-updating updated_at trigger
-- 3. Performance indexes for queries

-- Drop existing foreign key constraints to recreate with CASCADE
ALTER TABLE "public"."task_project_update_comments"
  DROP CONSTRAINT IF EXISTS "task_project_update_comments_parent_id_fkey";

ALTER TABLE "public"."task_project_update_comments"
  DROP CONSTRAINT IF EXISTS "task_project_update_comments_update_id_fkey";

-- Recreate foreign keys with ON DELETE CASCADE
ALTER TABLE "public"."task_project_update_comments"
  ADD CONSTRAINT "task_project_update_comments_parent_id_fkey"
  FOREIGN KEY ("parent_id")
  REFERENCES "public"."task_project_update_comments"("id")
  ON DELETE CASCADE;

ALTER TABLE "public"."task_project_update_comments"
  ADD CONSTRAINT "task_project_update_comments_update_id_fkey"
  FOREIGN KEY ("update_id")
  REFERENCES "public"."task_project_updates"("id")
  ON DELETE CASCADE;

-- Create trigger function to auto-update updated_at
CREATE OR REPLACE FUNCTION "public"."update_task_project_update_comments_updated_at"()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-updating updated_at on UPDATE
DROP TRIGGER IF EXISTS "set_task_project_update_comments_updated_at"
  ON "public"."task_project_update_comments";

CREATE TRIGGER "set_task_project_update_comments_updated_at"
  BEFORE UPDATE ON "public"."task_project_update_comments"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."update_task_project_update_comments_updated_at"();

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS "idx_task_project_update_comments_update_created"
  ON "public"."task_project_update_comments" USING btree ("update_id", "created_at");

CREATE INDEX IF NOT EXISTS "idx_task_project_update_comments_parent_id"
  ON "public"."task_project_update_comments" USING btree ("parent_id");

COMMENT ON TRIGGER "set_task_project_update_comments_updated_at"
  ON "public"."task_project_update_comments" IS
  'Automatically updates updated_at timestamp when comment is modified';
