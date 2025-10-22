-- Extend task_projects table with project management fields
-- This migration adds collaboration support (Yjs), priority, lead, dates, and health status tracking
-- Note: description remains as text (same as tasks table) - TipTap handles conversion

-- Add Yjs collaboration state column
ALTER TABLE "public"."task_projects"
  ADD COLUMN IF NOT EXISTS "description_yjs_state" bytea;

-- Add priority field with constraint
ALTER TABLE "public"."task_projects"
  ADD COLUMN IF NOT EXISTS "priority" text
  CHECK ("priority" IN ('critical', 'high', 'normal', 'low'));

-- Add project lead field
ALTER TABLE "public"."task_projects"
  ADD COLUMN IF NOT EXISTS "lead_id" uuid
  REFERENCES "public"."users"("id") ON DELETE SET NULL;

-- Add start and end date fields
ALTER TABLE "public"."task_projects"
  ADD COLUMN IF NOT EXISTS "start_date" timestamp with time zone;

ALTER TABLE "public"."task_projects"
  ADD COLUMN IF NOT EXISTS "end_date" timestamp with time zone;

-- Add health status field with constraint
ALTER TABLE "public"."task_projects"
  ADD COLUMN IF NOT EXISTS "health_status" text
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
