begin;

revoke all on function workspace_storage.object_access(
  text, text, workspace_storage.actor_access
) from public, anon;

-- tuturuuu: reviewed(function-grant): workspace_storage.object_access(text,text,workspace_storage.actor_access) review=https://github.com/tutur3u/platform/issues/7087
grant execute on function workspace_storage.object_access(
  text, text, workspace_storage.actor_access
) to authenticated, service_role;

commit;
