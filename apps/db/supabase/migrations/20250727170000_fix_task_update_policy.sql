-- Fix RLS policy for task updates to allow moving tasks between lists
-- The current policy prevents updates when changing list_id because it checks the current list_id
-- We need to allow updates when the user has access to both the old and new list

-- Drop the existing policy
DROP POLICY IF EXISTS "Enable all access for tasks in accessible task list" ON "public"."tasks";

-- Create a new policy that allows updates when the user has access to both old and new lists
CREATE POLICY "Enable all access for tasks in accessible task list" ON "public"."tasks" 
AS PERMISSIVE 
FOR ALL 
TO authenticated 
USING (
  (list_id IS NULL) OR 
  (EXISTS (SELECT 1 FROM task_lists tl WHERE tl.id = tasks.list_id))
)
WITH CHECK (
  (list_id IS NULL) OR 
  (EXISTS (SELECT 1 FROM task_lists tl WHERE tl.id = tasks.list_id))
);

 