create or replace function public.can_create_workspace(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select (
    exists (
      select 1
      from public.platform_user_roles pur
      where pur.user_id = p_user_id
        and pur.allow_workspace_creation = true
    )
  ) or (
    not exists (
      select 1
      from public.workspaces w
      where w.creator_id = p_user_id
        and w.personal = true
        and w.deleted = false
    )
  );
$function$;