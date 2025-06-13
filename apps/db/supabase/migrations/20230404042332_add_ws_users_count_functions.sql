-- Create a function to calculate count of all users in a specific workspace
CREATE OR REPLACE FUNCTION public.get_workspace_users_count(ws_id uuid) RETURNS numeric AS $$
SELECT COUNT(*)
FROM public.workspace_users
WHERE ws_id = $1 $$ LANGUAGE SQL;
-- -- Create a function to calculate count of all roles in a specific workspace
CREATE OR REPLACE FUNCTION public.get_workspace_user_roles_count(ws_id uuid) RETURNS numeric AS $$
SELECT COUNT(*)
FROM public.workspace_user_roles
WHERE ws_id = $1 $$ LANGUAGE SQL;