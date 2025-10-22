-- Extend task_projects table with project management fields
-- This migration adds collaboration support (Yjs), priority, lead, dates, and health status tracking
-- Note: description remains as text (same as tasks table) - TipTap handles conversion

-- Add Yjs collaboration state column
ALTER TABLE "public"."task_projects"
  ADD COLUMN IF NOT EXISTS "description_yjs_state" bytea;

-- Add priority field using existing task_priority enum
ALTER TABLE "public"."task_projects"
  ADD COLUMN IF NOT EXISTS "priority" "public"."task_priority";

-- Add project lead field
ALTER TABLE "public"."task_projects"
  ADD COLUMN IF NOT EXISTS "lead_id" uuid;

-- Add foreign key to users table (for easy querying via Supabase relations)
ALTER TABLE "public"."task_projects"
  DROP CONSTRAINT IF EXISTS "task_projects_lead_id_fkey";

ALTER TABLE "public"."task_projects"
  ADD CONSTRAINT "task_projects_lead_id_fkey"
  FOREIGN KEY ("lead_id")
  REFERENCES "public"."users"("id")
  ON DELETE SET NULL;

-- Add composite foreign key to ensure lead is a workspace member
-- Note: This works together with the users FK - both constraints are enforced
-- workspace_members already has UNIQUE INDEX on (ws_id, user_id) as PRIMARY KEY
ALTER TABLE "public"."task_projects"
  DROP CONSTRAINT IF EXISTS "task_projects_lead_workspace_member_fkey";

ALTER TABLE "public"."task_projects"
  ADD CONSTRAINT "task_projects_lead_workspace_member_fkey"
  FOREIGN KEY ("ws_id", "lead_id")
  REFERENCES "public"."workspace_members"("ws_id", "user_id")
  ON DELETE SET NULL;

-- Add start and end date fields
ALTER TABLE "public"."task_projects"
  ADD COLUMN IF NOT EXISTS "start_date" timestamp with time zone;

ALTER TABLE "public"."task_projects"
  ADD COLUMN IF NOT EXISTS "end_date" timestamp with time zone;

-- Add CHECK constraint to ensure start_date is not after end_date
ALTER TABLE "public"."task_projects"
  ADD CONSTRAINT "chk_task_projects_start_le_end"
  CHECK (start_date IS NULL OR end_date IS NULL OR start_date <= end_date);

-- Add health status field
ALTER TABLE "public"."task_projects"
  ADD COLUMN IF NOT EXISTS "health_status" text;

-- Drop any existing inline check constraint on health_status (if present)
ALTER TABLE "public"."task_projects"
  DROP CONSTRAINT IF EXISTS "task_projects_health_status_check";

-- Add named constraint for health status
ALTER TABLE "public"."task_projects"
  ADD CONSTRAINT "chk_task_projects_health_status"
  CHECK ("health_status" IN ('on_track', 'at_risk', 'off_track'));

-- Update existing status constraint to include new statuses
ALTER TABLE "public"."task_projects"
  DROP CONSTRAINT IF EXISTS "task_projects_status_check";

ALTER TABLE "public"."task_projects"
  ADD CONSTRAINT "task_projects_status_check"
  CHECK ("status" IN ('backlog', 'planned', 'in_progress', 'in_review', 'in_testing', 'completed', 'cancelled', 'active', 'on_hold'));

-- Create index for lead_id for faster lookups
CREATE INDEX IF NOT EXISTS "idx_task_projects_lead_id"
  ON "public"."task_projects" USING btree ("lead_id");

-- Create index for date range queries
CREATE INDEX IF NOT EXISTS "idx_task_projects_dates"
  ON "public"."task_projects" USING btree ("start_date", "end_date");

-- Create index for priority filtering
CREATE INDEX IF NOT EXISTS "idx_task_projects_priority"
  ON "public"."task_projects" USING btree ("priority");

-- Create index for health status filtering
CREATE INDEX IF NOT EXISTS "idx_task_projects_health_status"
  ON "public"."task_projects" USING btree ("health_status");

-- Add comment explaining the schema changes
COMMENT ON COLUMN "public"."task_projects"."description" IS
  'Rich text description stored as text (TipTap handles JSONContent conversion)';

COMMENT ON COLUMN "public"."task_projects"."description_yjs_state" IS
  'Yjs CRDT state for real-time collaborative editing';

COMMENT ON COLUMN "public"."task_projects"."priority" IS
  'Project priority: critical, high, normal, or low';

COMMENT ON COLUMN "public"."task_projects"."lead_id" IS
  'User ID of the project lead (single person responsible)';

COMMENT ON COLUMN "public"."task_projects"."health_status" IS
  'Project health indicator: on_track, at_risk, or off_track';
