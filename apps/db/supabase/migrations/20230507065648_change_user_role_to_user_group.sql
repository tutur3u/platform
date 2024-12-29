-- Rename public.workspace_user_roles to public.workspace_user_groups
ALTER TABLE public.workspace_user_roles
    RENAME TO workspace_user_groups;
-- Rename public.workspace_user_roles_users to public.workspace_user_groups_users
ALTER TABLE public.workspace_user_roles_users
    RENAME TO workspace_user_groups_users;
-- Rename public.workspace_user_groups_users.role_id to public.workspace_user_groups_users.group_id
ALTER TABLE public.workspace_user_groups_users
    RENAME COLUMN role_id TO group_id;
-- Drop public.get_workspace_user_roles_count function
DROP FUNCTION public.get_workspace_user_roles_count(ws_id uuid);
-- Create a function to calculate count of all groups in a specific workspace
CREATE OR REPLACE FUNCTION public.get_workspace_user_groups_count(ws_id uuid) RETURNS numeric AS $$
SELECT COUNT(*)
FROM public.workspace_user_groups
WHERE ws_id = $1 $$ LANGUAGE SQL;