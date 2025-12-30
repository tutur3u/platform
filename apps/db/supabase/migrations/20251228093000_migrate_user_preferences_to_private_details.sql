-- Migrate user preferences from public.users to public.user_private_details
-- This migration:
-- 1. Adds task_auto_assign_to_self and fade_completed_tasks to user_private_details
-- 2. Migrates existing data from users table
-- 3. Drops the column from users table

-- Step 1: Add new columns to user_private_details
ALTER TABLE "public"."user_private_details"
  ADD COLUMN IF NOT EXISTS "task_auto_assign_to_self" boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS "fade_completed_tasks" boolean DEFAULT false;

COMMENT ON COLUMN "public"."user_private_details"."task_auto_assign_to_self"
  IS 'When true, automatically assigns user to tasks they create if no other assignees are selected';

COMMENT ON COLUMN "public"."user_private_details"."fade_completed_tasks"
  IS 'When true, completed task items in the editor will have reduced opacity';

-- Step 2: Migrate existing data from users to user_private_details
UPDATE "public"."user_private_details" upd
SET "task_auto_assign_to_self" = u."task_auto_assign_to_self"
FROM "public"."users" u
WHERE upd.user_id = u.id
  AND u."task_auto_assign_to_self" IS NOT NULL;

-- Step 3: Drop the column from users table
ALTER TABLE "public"."users"
  DROP COLUMN IF EXISTS "task_auto_assign_to_self";
