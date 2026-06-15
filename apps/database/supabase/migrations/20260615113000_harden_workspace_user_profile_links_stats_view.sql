-- Ensure direct PostgREST reads of the stats view execute with the caller's RLS
-- context instead of the migration owner. This preserves the route/API shape
-- while preventing cross-workspace profile-link code disclosure.
alter view public.workspace_user_profile_links_with_stats
set (security_invoker = true);

grant select on public.workspace_user_profile_links_with_stats to authenticated;
grant select on public.workspace_user_profile_links_with_stats to service_role;
