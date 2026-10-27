-- Restores the prior policies. Apply only under an explicitly approved rollback.
-- No table grants change in either direction.
begin;

alter policy "Allow users who have access to workspace"
on public.discord_guild_members
to authenticated
using (
  exists (
    select 1 from public.discord_integrations di
    join public.workspace_members wm on wm.ws_id = di.ws_id
    where wm.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.discord_integrations di
    join public.workspace_members wm on wm.ws_id = di.ws_id
    where wm.user_id = (select auth.uid())
  )
);

drop trigger guard_discord_integration_binding on public.discord_integrations;
drop function public.guard_discord_integration_binding();

drop policy "discord_integrations_select_flagged_member"
on public.discord_integrations;
drop policy "discord_integrations_insert_flagged_manager"
on public.discord_integrations;
drop policy "discord_integrations_update_flagged_manager"
on public.discord_integrations;
drop policy "discord_integrations_delete_flagged_manager"
on public.discord_integrations;

-- Exact prior definition: 20250913163742 as wrapped by 20260701070408.
create policy "Allow users who have sufficient platform role"
on public.discord_integrations
as permissive
for all
to authenticated
using (
  exists (
    select 1 from public.platform_user_roles pur
    where pur.user_id = (select auth.uid())
      and pur.allow_discord_integrations = true
  )
)
with check (
  exists (
    select 1 from public.platform_user_roles pur
    where pur.user_id = (select auth.uid())
      and pur.allow_discord_integrations = true
  )
);

commit;
