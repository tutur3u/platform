revoke all on function public.get_user_workspace_subscription_info(uuid) from public, anon, authenticated;
grant execute on function public.get_user_workspace_subscription_info(uuid) to service_role;
