-- Add task_auto_assign_to_self preference to users table
-- This setting allows users to automatically assign themselves to tasks they create
-- when no other assignees are manually selected

ALTER TABLE "public"."users"
  ADD COLUMN IF NOT EXISTS "task_auto_assign_to_self" boolean DEFAULT false;

COMMENT ON COLUMN "public"."users"."task_auto_assign_to_self"
  IS 'When true, automatically assigns user to tasks they create if no other assignees are selected';
