revoke execute on function public.admin_create_workspace_user_with_audit_actor(uuid, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_create_workspace_user_with_audit_actor(uuid, jsonb, uuid)
  to service_role;

revoke execute on function public.admin_update_workspace_user_with_audit_actor(uuid, uuid, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_update_workspace_user_with_audit_actor(uuid, uuid, jsonb, uuid)
  to service_role;

revoke execute on function public.admin_delete_workspace_user_with_audit_actor(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_delete_workspace_user_with_audit_actor(uuid, uuid, uuid)
  to service_role;

revoke execute on function public.list_workspace_user_audit_records(uuid, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.list_workspace_user_audit_records(uuid, timestamptz, timestamptz)
  to service_role;

revoke execute on function public.backfill_workspace_user_status_changes(uuid, boolean, integer)
  from public, anon, authenticated;
grant execute on function public.backfill_workspace_user_status_changes(uuid, boolean, integer)
  to service_role;
