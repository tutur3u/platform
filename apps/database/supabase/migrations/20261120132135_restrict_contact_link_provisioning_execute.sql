-- tuturuuu: reviewed(alter-routine-review): contacts-consent-acl
alter function public.ensure_workspace_user_link(uuid, uuid)
  set search_path = pg_catalog, pg_temp;

revoke execute on function public.ensure_workspace_user_link(uuid, uuid)
  from public, anon;
-- tuturuuu: reviewed(function-grant): public.ensure_workspace_user_link(uuid,uuid) review=contacts-consent-acl
grant execute on function public.ensure_workspace_user_link(uuid, uuid)
  to authenticated, service_role;

revoke execute on function public.consolidate_workspace_user_links(uuid)
  from public, anon, authenticated;
grant execute on function public.consolidate_workspace_user_links(uuid)
  to service_role;
