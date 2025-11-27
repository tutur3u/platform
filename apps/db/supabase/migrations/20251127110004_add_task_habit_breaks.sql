-- Migration: Add Universal Break Settings
-- Description: Adds break settings to workspace_settings table as a universal/workspace-level feature
-- Break durations are constrained to multiples of 5 minutes for flexibility

-- ============================================================================
-- WORKSPACE_SETTINGS TABLE
-- ============================================================================

-- Add universal break settings to workspace_settings table
ALTER TABLE "public"."workspace_settings" 
ADD COLUMN IF NOT EXISTS "break_enabled" BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS "break_duration_minutes" INTEGER DEFAULT 15,
ADD COLUMN IF NOT EXISTS "break_interval_minutes" INTEGER DEFAULT 90;

-- Add constraint for 5-minute multiples on break duration (minimum 5 minutes)
ALTER TABLE "public"."workspace_settings"
ADD CONSTRAINT workspace_settings_break_duration_check 
CHECK (break_duration_minutes IS NULL OR (break_duration_minutes >= 5 AND break_duration_minutes % 5 = 0));

-- Add constraint for 5-minute multiples on break interval (minimum 15 minutes)
ALTER TABLE "public"."workspace_settings"
ADD CONSTRAINT workspace_settings_break_interval_check 
CHECK (break_interval_minutes IS NULL OR (break_interval_minutes >= 15 AND break_interval_minutes % 5 = 0));

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN workspace_settings.break_enabled IS 'Whether automatic breaks are enabled for this workspace';
COMMENT ON COLUMN workspace_settings.break_duration_minutes IS 'Duration of each break in minutes (must be multiple of 5, minimum 5)';
COMMENT ON COLUMN workspace_settings.break_interval_minutes IS 'Time between breaks in minutes - i.e., work duration before a break (must be multiple of 5, minimum 15)';
