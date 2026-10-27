-- Not a migration: release-authority approval only.
-- Restore authenticated EXECUTE only; service_role retains its existing grant.
-- Do not re-grant EXECUTE to anon or public.
grant execute on function public.get_user_workspace_subscription_info(uuid) to authenticated;
