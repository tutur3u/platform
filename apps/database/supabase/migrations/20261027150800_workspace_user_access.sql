set lock_timeout = '5s';

drop policy "Enable all access for workspace members" on public.workspace_users;
drop policy "Allow access for workspace users" on public.user_group_attendance;
drop policy "Allow full CRUD for workspace members via indicator" on public.user_indicators;

create function private.workspace_user_permission_workspaces(p_permissions text[])
returns uuid[] language sql stable security definer
set search_path = pg_catalog, pg_temp
as $$
  select coalesce(array_agg(member.ws_id), '{}'::uuid[])
  from public.workspace_members member
  where member.user_id = (select auth.uid()) and member.type = 'MEMBER'
    and exists (
      select 1 from unnest(p_permissions) permission
      where public.has_workspace_permission(member.ws_id, (select auth.uid()), permission)
    );
$$;
revoke all on function private.workspace_user_permission_workspaces(text[]) from public, anon, authenticated;
grant execute on function private.workspace_user_permission_workspaces(text[]) to authenticated, service_role;

create policy workspace_users_read on public.workspace_users for select to authenticated
using (ws_id = any ((select private.workspace_user_permission_workspaces(array['view_users_public_info', 'view_users_private_info']))::uuid[]));
create policy workspace_users_create on public.workspace_users for insert to authenticated
with check (ws_id = any ((select private.workspace_user_permission_workspaces(array['create_users']))::uuid[]));
create policy workspace_users_update on public.workspace_users for update to authenticated
using (ws_id = any ((select private.workspace_user_permission_workspaces(array['update_users']))::uuid[]))
with check (ws_id = any ((select private.workspace_user_permission_workspaces(array['update_users']))::uuid[]));
create policy workspace_users_delete on public.workspace_users for delete to authenticated
using (ws_id = any ((select private.workspace_user_permission_workspaces(array['delete_users']))::uuid[]));

revoke select, truncate, references, trigger on public.workspace_users from public, anon, authenticated;
do $$
declare columns_sql text;
begin
  select string_agg(format('%I', attname), ', ' order by attnum) into columns_sql
  from pg_attribute where attrelid = 'public.workspace_users'::regclass and attnum > 0 and not attisdropped;
  execute format('revoke select (%s) on public.workspace_users from public, anon, authenticated', columns_sql);
end $$;
grant select (id, ws_id) on public.workspace_users to authenticated;
alter view public.workspace_users_with_groups set (security_invoker = true);
revoke all on public.workspace_users_with_groups, public.group_with_attendance, public.group_user_with_attendance, public.group_users_with_post_checks, public.distinct_invoice_creators, public.distinct_transaction_creators from public, anon, authenticated;

create function private.workspace_user_attendance_scope(p_user_id uuid, p_group_id uuid)
returns uuid language sql stable security definer
set search_path = pg_catalog, pg_temp
as $$
  select u.ws_id
  from public.workspace_users u
  join public.workspace_user_groups g on g.ws_id = u.ws_id
  join public.workspace_members member on member.ws_id = u.ws_id
    and member.user_id = (select auth.uid()) and member.type = 'MEMBER'
  where u.id = p_user_id and g.id = p_group_id;
$$;
revoke all on function private.workspace_user_attendance_scope(uuid, uuid) from public, anon, authenticated;
grant execute on function private.workspace_user_attendance_scope(uuid, uuid) to authenticated, service_role;

create function private.workspace_user_score_scope(p_user_id uuid, p_indicator_id uuid)
returns uuid language sql stable security definer
set search_path = pg_catalog, pg_temp
as $$
  select u.ws_id
  from public.workspace_users u
  join public.user_group_metrics metric on metric.ws_id = u.ws_id
  join public.workspace_members member on member.ws_id = u.ws_id
    and member.user_id = (select auth.uid()) and member.type = 'MEMBER'
  where u.id = p_user_id and metric.id = p_indicator_id;
$$;
revoke all on function private.workspace_user_score_scope(uuid, uuid) from public, anon, authenticated;
grant execute on function private.workspace_user_score_scope(uuid, uuid) to authenticated, service_role;

revoke truncate, references, trigger on public.user_group_attendance, public.user_indicators from public, anon, authenticated;

create policy attendance_select on public.user_group_attendance for select to authenticated
using (private.workspace_user_attendance_scope(user_id, group_id) = any ((select private.workspace_user_permission_workspaces(array['check_user_attendance']))::uuid[]));

create policy scores_select on public.user_indicators for select to authenticated
using (private.workspace_user_score_scope(user_id, indicator_id) = any ((select private.workspace_user_permission_workspaces(array['view_user_groups_scores']))::uuid[]));

create policy attendance_insert on public.user_group_attendance for insert to authenticated
with check (private.workspace_user_attendance_scope(user_id, group_id) = any ((select private.workspace_user_permission_workspaces(array['check_user_attendance']))::uuid[]));

create policy scores_insert on public.user_indicators for insert to authenticated
with check (private.workspace_user_score_scope(user_id, indicator_id) = any ((select private.workspace_user_permission_workspaces(array['create_user_groups_scores']))::uuid[]));

create policy attendance_update on public.user_group_attendance for update to authenticated
using (private.workspace_user_attendance_scope(user_id, group_id) = any ((select private.workspace_user_permission_workspaces(array['check_user_attendance']))::uuid[]))
with check (private.workspace_user_attendance_scope(user_id, group_id) = any ((select private.workspace_user_permission_workspaces(array['check_user_attendance']))::uuid[]));

create policy scores_update on public.user_indicators for update to authenticated
using (private.workspace_user_score_scope(user_id, indicator_id) = any ((select private.workspace_user_permission_workspaces(array['update_user_groups_scores']))::uuid[]))
with check (private.workspace_user_score_scope(user_id, indicator_id) = any ((select private.workspace_user_permission_workspaces(array['update_user_groups_scores']))::uuid[]));

create policy attendance_delete on public.user_group_attendance for delete to authenticated
using (private.workspace_user_attendance_scope(user_id, group_id) = any ((select private.workspace_user_permission_workspaces(array['check_user_attendance']))::uuid[]));

create policy scores_delete on public.user_indicators for delete to authenticated
using (private.workspace_user_score_scope(user_id, indicator_id) = any ((select private.workspace_user_permission_workspaces(array['delete_user_groups_scores']))::uuid[]));

CREATE OR REPLACE FUNCTION public.authorize_workspace_user_audit_access(p_ws_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  request_role text := auth.role();
  request_user_id uuid := auth.uid();
begin
  if request_role = 'service_role' then
    return;
  end if;

  if request_user_id is null then
    raise exception 'workspace_user_audit_auth_required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.workspace_members workspace_member
    where workspace_member.ws_id = p_ws_id
      and workspace_member.user_id = request_user_id
  ) then
    raise exception 'workspace_user_audit_permission_denied' using errcode = '42501';
  end if;

  if not public.has_workspace_permission(
    p_ws_id,
    request_user_id,
    'manage_workspace_audit_logs'
  ) or not public.has_workspace_permission(
    p_ws_id, request_user_id, 'view_users_private_info'
  ) then
    raise exception 'workspace_user_audit_permission_denied' using errcode = '42501';
  end if;
end;
$function$;


alter function public.authorize_workspace_user_audit_access(uuid) set search_path = pg_catalog, pg_temp;

revoke all on function get_featured_group_counts(uuid,uuid[],uuid[],text,text,text) from public, anon, authenticated;
revoke all on function get_workspace_users(uuid,uuid[],uuid[],text,boolean,text,text) from public, anon, authenticated;
revoke all on function get_workspace_users_count(uuid) from public, anon, authenticated;
revoke all on function is_user_guest(uuid) from public, anon, authenticated;
