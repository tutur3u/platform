-- Rollback for 20261027150800_workspace_user_access.sql.
-- Restores the previous policies and authenticated-only access the apps use:
-- SELECT on workspace_users, EXECUTE on the four helpers and SELECT on the six
-- views. anon/PUBLIC stay revoked, and TRUNCATE/REFERENCES/TRIGGER plus view
-- DML/MAINTAIN are not restored: no supported caller uses them and restoring
-- them re-opens cross-workspace reads. Exact previous ACL (approval required):
--   grant select, truncate, references, trigger on public.workspace_users
--     to anon, authenticated;
--   grant truncate, references, trigger on public.user_group_attendance,
--     public.user_indicators to anon, authenticated;
--   grant execute on function <signature> to public, anon, authenticated;
--     (get_featured_group_counts, get_workspace_users,
--     get_workspace_users_count, is_user_guest)
--   grant insert, select, update, delete, truncate, references, trigger,
--     maintain on table <view> to anon, authenticated;
--     (distinct_invoice_creators, distinct_transaction_creators,
--     group_user_with_attendance, group_users_with_post_checks,
--     group_with_attendance, workspace_users_with_groups)
-- workspace_users_with_groups intentionally stays security_invoker = true so
-- the restored policies, not the view owner, gate its rows.
-- Run inside the caller's transaction; this file does not open its own.
-- Not a migration: apply manually only with release-authority approval.
set lock_timeout = '5s';
drop policy workspace_users_read on public.workspace_users;
drop policy workspace_users_create on public.workspace_users;
drop policy workspace_users_update on public.workspace_users;
drop policy workspace_users_delete on public.workspace_users;
drop policy attendance_select on public.user_group_attendance;
drop policy scores_select on public.user_indicators;
drop policy attendance_insert on public.user_group_attendance;
drop policy scores_insert on public.user_indicators;
drop policy attendance_update on public.user_group_attendance;
drop policy scores_update on public.user_indicators;
drop policy attendance_delete on public.user_group_attendance;
drop policy scores_delete on public.user_indicators;
drop function private.workspace_user_attendance_scope(uuid, uuid);
drop function private.workspace_user_permission_workspaces(text[]);
drop function private.workspace_user_score_scope(uuid, uuid);
revoke select (id, ws_id) on public.workspace_users from authenticated;
grant select on public.workspace_users to authenticated;
revoke select, truncate, references, trigger on public.workspace_users from public, anon;
revoke truncate, references, trigger on public.user_group_attendance, public.user_indicators from public, anon;
create policy "Enable all access for workspace members" on public.workspace_users for all to authenticated
using (public.is_org_member((select auth.uid()), ws_id))
with check (public.is_org_member((select auth.uid()), ws_id));
create policy "Allow access for workspace users" on public.user_group_attendance for all to authenticated
using (exists (select 1 from public.workspace_users u where u.id = user_id) and exists (select 1 from public.workspace_user_groups g where g.id = group_id))
with check (exists (select 1 from public.workspace_users u where u.id = user_id) and exists (select 1 from public.workspace_user_groups g where g.id = group_id));
create policy "Allow full CRUD for workspace members via indicator" on public.user_indicators for all to authenticated
using (public.can_manage_indicator(indicator_id))
with check (public.can_manage_indicator(indicator_id));

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
  ) then
    raise exception 'workspace_user_audit_permission_denied' using errcode = '42501';
  end if;
end;
$function$;

do $$
declare
  v_target regprocedure;
begin
  foreach v_target in array array[
    'public.get_featured_group_counts(uuid,uuid[],uuid[],text,text,text)',
    'public.get_workspace_users(uuid,uuid[],uuid[],text,boolean,text,text)',
    'public.get_workspace_users_count(uuid)',
    'public.is_user_guest(uuid)'
  ]::regprocedure[]
  loop
    execute format('revoke all on function %s from public, anon', v_target);
    execute format('grant execute on function %s to authenticated', v_target);
  end loop;
end;
$$;
revoke all on public.workspace_users_with_groups, public.group_with_attendance, public.group_user_with_attendance, public.group_users_with_post_checks, public.distinct_invoice_creators, public.distinct_transaction_creators from public, anon, authenticated;
grant select on public.workspace_users_with_groups, public.group_with_attendance, public.group_user_with_attendance, public.group_users_with_post_checks, public.distinct_invoice_creators, public.distinct_transaction_creators to authenticated;
