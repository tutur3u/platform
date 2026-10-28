revoke all on function public.merge_workspace_users_batch_update(uuid, uuid, uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.merge_workspace_users_batch_update(uuid, uuid, uuid, text, text, integer) to service_role;
revoke all on function public.merge_workspace_users_table_batch(uuid, uuid, uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.merge_workspace_users_table_batch(uuid, uuid, uuid, text, text, integer) to service_role;
