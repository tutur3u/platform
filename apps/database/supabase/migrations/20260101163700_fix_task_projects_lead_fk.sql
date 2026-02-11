-- Fix: Replace composite FK with trigger to prevent ws_id from being set to NULL
-- Problem: The composite FK (ws_id, lead_id) -> workspace_members uses ON DELETE SET NULL,
-- which sets BOTH columns to NULL when a workspace member is deleted.
-- Since ws_id has a NOT NULL constraint, this causes an error.
-- Solution: Use a trigger that only clears lead_id when the workspace member is deleted.

-- Drop the problematic composite foreign key
ALTER TABLE "public"."task_projects"
  DROP CONSTRAINT IF EXISTS "task_projects_lead_workspace_member_fkey";

-- Create a function to clear lead_id when workspace member is deleted
CREATE OR REPLACE FUNCTION clear_task_projects_lead_on_member_delete()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE "public"."task_projects"
  SET "lead_id" = NULL
  WHERE "ws_id" = OLD.ws_id AND "lead_id" = OLD.user_id;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on workspace_members
DROP TRIGGER IF EXISTS trigger_clear_task_projects_lead ON "public"."workspace_members";

CREATE TRIGGER trigger_clear_task_projects_lead
  BEFORE DELETE ON "public"."workspace_members"
  FOR EACH ROW
  EXECUTE FUNCTION clear_task_projects_lead_on_member_delete();

-- Add a comment explaining the change
COMMENT ON FUNCTION clear_task_projects_lead_on_member_delete() IS
  'Clears the lead_id in task_projects when the corresponding workspace member is deleted. This replaces the previous composite FK with ON DELETE SET NULL which incorrectly set both ws_id and lead_id to NULL.';
