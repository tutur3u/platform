-- Add is_visible_in_calendar column to workspace_habits table
-- This allows users to toggle habit visibility in the calendar sidebar per-workspace

ALTER TABLE workspace_habits
ADD COLUMN IF NOT EXISTS is_visible_in_calendar BOOLEAN DEFAULT true;

-- Add comment for documentation
COMMENT ON COLUMN workspace_habits.is_visible_in_calendar IS 'Whether the habit is visible in the calendar sidebar. Defaults to true.';
