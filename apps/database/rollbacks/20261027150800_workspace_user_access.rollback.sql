-- Rollback for 20261027150800_workspace_user_access.sql.
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
grant select, truncate, references, trigger on public.workspace_users to anon, authenticated;
grant truncate, references, trigger on public.user_group_attendance, public.user_indicators to anon, authenticated;
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

revoke all on function get_featured_group_counts(uuid,uuid[],uuid[],text,text,text) from public, anon, authenticated;
grant EXECUTE on function get_featured_group_counts(uuid,uuid[],uuid[],text,text,text) to PUBLIC;
grant EXECUTE on function get_featured_group_counts(uuid,uuid[],uuid[],text,text,text) to "anon";
grant EXECUTE on function get_featured_group_counts(uuid,uuid[],uuid[],text,text,text) to "authenticated";
revoke all on function get_workspace_users(uuid,uuid[],uuid[],text,boolean,text,text) from public, anon, authenticated;
grant EXECUTE on function get_workspace_users(uuid,uuid[],uuid[],text,boolean,text,text) to PUBLIC;
grant EXECUTE on function get_workspace_users(uuid,uuid[],uuid[],text,boolean,text,text) to "anon";
grant EXECUTE on function get_workspace_users(uuid,uuid[],uuid[],text,boolean,text,text) to "authenticated";
revoke all on function get_workspace_users_count(uuid) from public, anon, authenticated;
grant EXECUTE on function get_workspace_users_count(uuid) to PUBLIC;
grant EXECUTE on function get_workspace_users_count(uuid) to "anon";
grant EXECUTE on function get_workspace_users_count(uuid) to "authenticated";
revoke all on function is_user_guest(uuid) from public, anon, authenticated;
grant EXECUTE on function is_user_guest(uuid) to PUBLIC;
grant EXECUTE on function is_user_guest(uuid) to "anon";
grant EXECUTE on function is_user_guest(uuid) to "authenticated";
revoke all on table public.distinct_invoice_creators from public, anon, authenticated;
grant INSERT on table public.distinct_invoice_creators to "anon";
grant SELECT on table public.distinct_invoice_creators to "anon";
grant UPDATE on table public.distinct_invoice_creators to "anon";
grant DELETE on table public.distinct_invoice_creators to "anon";
grant TRUNCATE on table public.distinct_invoice_creators to "anon";
grant REFERENCES on table public.distinct_invoice_creators to "anon";
grant TRIGGER on table public.distinct_invoice_creators to "anon";
grant MAINTAIN on table public.distinct_invoice_creators to "anon";
grant INSERT on table public.distinct_invoice_creators to "authenticated";
grant SELECT on table public.distinct_invoice_creators to "authenticated";
grant UPDATE on table public.distinct_invoice_creators to "authenticated";
grant DELETE on table public.distinct_invoice_creators to "authenticated";
grant TRUNCATE on table public.distinct_invoice_creators to "authenticated";
grant REFERENCES on table public.distinct_invoice_creators to "authenticated";
grant TRIGGER on table public.distinct_invoice_creators to "authenticated";
grant MAINTAIN on table public.distinct_invoice_creators to "authenticated";
revoke all on table public.distinct_transaction_creators from public, anon, authenticated;
grant INSERT on table public.distinct_transaction_creators to "anon";
grant SELECT on table public.distinct_transaction_creators to "anon";
grant UPDATE on table public.distinct_transaction_creators to "anon";
grant DELETE on table public.distinct_transaction_creators to "anon";
grant TRUNCATE on table public.distinct_transaction_creators to "anon";
grant REFERENCES on table public.distinct_transaction_creators to "anon";
grant TRIGGER on table public.distinct_transaction_creators to "anon";
grant MAINTAIN on table public.distinct_transaction_creators to "anon";
grant INSERT on table public.distinct_transaction_creators to "authenticated";
grant SELECT on table public.distinct_transaction_creators to "authenticated";
grant UPDATE on table public.distinct_transaction_creators to "authenticated";
grant DELETE on table public.distinct_transaction_creators to "authenticated";
grant TRUNCATE on table public.distinct_transaction_creators to "authenticated";
grant REFERENCES on table public.distinct_transaction_creators to "authenticated";
grant TRIGGER on table public.distinct_transaction_creators to "authenticated";
grant MAINTAIN on table public.distinct_transaction_creators to "authenticated";
revoke all on table public.group_user_with_attendance from public, anon, authenticated;
grant INSERT on table public.group_user_with_attendance to "anon";
grant SELECT on table public.group_user_with_attendance to "anon";
grant UPDATE on table public.group_user_with_attendance to "anon";
grant DELETE on table public.group_user_with_attendance to "anon";
grant TRUNCATE on table public.group_user_with_attendance to "anon";
grant REFERENCES on table public.group_user_with_attendance to "anon";
grant TRIGGER on table public.group_user_with_attendance to "anon";
grant MAINTAIN on table public.group_user_with_attendance to "anon";
grant INSERT on table public.group_user_with_attendance to "authenticated";
grant SELECT on table public.group_user_with_attendance to "authenticated";
grant UPDATE on table public.group_user_with_attendance to "authenticated";
grant DELETE on table public.group_user_with_attendance to "authenticated";
grant TRUNCATE on table public.group_user_with_attendance to "authenticated";
grant REFERENCES on table public.group_user_with_attendance to "authenticated";
grant TRIGGER on table public.group_user_with_attendance to "authenticated";
grant MAINTAIN on table public.group_user_with_attendance to "authenticated";
revoke all on table public.group_users_with_post_checks from public, anon, authenticated;
grant INSERT on table public.group_users_with_post_checks to "anon";
grant SELECT on table public.group_users_with_post_checks to "anon";
grant UPDATE on table public.group_users_with_post_checks to "anon";
grant DELETE on table public.group_users_with_post_checks to "anon";
grant TRUNCATE on table public.group_users_with_post_checks to "anon";
grant REFERENCES on table public.group_users_with_post_checks to "anon";
grant TRIGGER on table public.group_users_with_post_checks to "anon";
grant MAINTAIN on table public.group_users_with_post_checks to "anon";
grant INSERT on table public.group_users_with_post_checks to "authenticated";
grant SELECT on table public.group_users_with_post_checks to "authenticated";
grant UPDATE on table public.group_users_with_post_checks to "authenticated";
grant DELETE on table public.group_users_with_post_checks to "authenticated";
grant TRUNCATE on table public.group_users_with_post_checks to "authenticated";
grant REFERENCES on table public.group_users_with_post_checks to "authenticated";
grant TRIGGER on table public.group_users_with_post_checks to "authenticated";
grant MAINTAIN on table public.group_users_with_post_checks to "authenticated";
revoke all on table public.group_with_attendance from public, anon, authenticated;
grant INSERT on table public.group_with_attendance to "anon";
grant SELECT on table public.group_with_attendance to "anon";
grant UPDATE on table public.group_with_attendance to "anon";
grant DELETE on table public.group_with_attendance to "anon";
grant TRUNCATE on table public.group_with_attendance to "anon";
grant REFERENCES on table public.group_with_attendance to "anon";
grant TRIGGER on table public.group_with_attendance to "anon";
grant MAINTAIN on table public.group_with_attendance to "anon";
grant INSERT on table public.group_with_attendance to "authenticated";
grant SELECT on table public.group_with_attendance to "authenticated";
grant UPDATE on table public.group_with_attendance to "authenticated";
grant DELETE on table public.group_with_attendance to "authenticated";
grant TRUNCATE on table public.group_with_attendance to "authenticated";
grant REFERENCES on table public.group_with_attendance to "authenticated";
grant TRIGGER on table public.group_with_attendance to "authenticated";
grant MAINTAIN on table public.group_with_attendance to "authenticated";
revoke all on table public.workspace_users_with_groups from public, anon, authenticated;
grant INSERT on table public.workspace_users_with_groups to "anon";
grant SELECT on table public.workspace_users_with_groups to "anon";
grant UPDATE on table public.workspace_users_with_groups to "anon";
grant DELETE on table public.workspace_users_with_groups to "anon";
grant TRUNCATE on table public.workspace_users_with_groups to "anon";
grant REFERENCES on table public.workspace_users_with_groups to "anon";
grant TRIGGER on table public.workspace_users_with_groups to "anon";
grant MAINTAIN on table public.workspace_users_with_groups to "anon";
grant INSERT on table public.workspace_users_with_groups to "authenticated";
grant SELECT on table public.workspace_users_with_groups to "authenticated";
grant UPDATE on table public.workspace_users_with_groups to "authenticated";
grant DELETE on table public.workspace_users_with_groups to "authenticated";
grant TRUNCATE on table public.workspace_users_with_groups to "authenticated";
grant REFERENCES on table public.workspace_users_with_groups to "authenticated";
grant TRIGGER on table public.workspace_users_with_groups to "authenticated";
grant MAINTAIN on table public.workspace_users_with_groups to "authenticated";
