-- Create a function to count the number of workspaces created by a user
CREATE OR REPLACE FUNCTION public.get_created_workspace_count(user_id uuid) RETURNS numeric AS $$
SELECT COUNT(*)
FROM public.workspaces
WHERE creator_id = $1 AND deleted = false
$$ LANGUAGE SQL;

-- Create a function to count the number of workspaces a user has joined (via workspace_members)
CREATE OR REPLACE FUNCTION public.get_joined_workspace_count(user_id uuid) RETURNS numeric AS $$
SELECT COUNT(*)
FROM public.workspace_members
WHERE user_id = $1
$$ LANGUAGE SQL;

create or replace function public.can_create_workspace(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select (
    exists (
      select 1 from public.workspaces w
      where w.creator_id = p_user_id
    )
  ) OR (
    exists (
      select 1 from public.platform_user_roles pur
      where pur.user_id = p_user_id
        and pur.allow_workspace_creation = true
    )
  ) OR get_joined_workspace_count(p_user_id) = 0;
$function$;