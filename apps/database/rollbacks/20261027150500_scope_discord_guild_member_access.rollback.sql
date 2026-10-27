-- Restores the prior policies. Apply only under an explicitly approved rollback.
-- No table grants change in either direction.
begin;

-- Dropped first so no rollback step can cascade-delete more mappings. Mappings
-- already deleted by disconnects or workspace deletions cannot be restored.
drop trigger delete_discord_guild_members_on_disconnect
on public.discord_integrations;
drop function public.delete_discord_guild_members_on_disconnect();

-- The index exists only when the migration found no duplicate mappings.
drop index if exists public.discord_guild_members_guild_discord_user_key;
drop function if exists public.ensure_discord_guild_member_identity_index();

drop policy "discord_guild_members_select_workspace_member"
on public.discord_guild_members;
drop policy "discord_guild_members_insert_integration_manager"
on public.discord_guild_members;
drop policy "discord_guild_members_update_integration_manager"
on public.discord_guild_members;
drop policy "discord_guild_members_delete_integration_manager"
on public.discord_guild_members;

-- Exact prior definition: 20250913163742 as wrapped by 20260701070408.
create policy "Allow users who have access to workspace"
on public.discord_guild_members
as permissive
for all
to authenticated
using (
  exists (
    select 1 from public.discord_integrations di, public.workspace_members wm
    where wm.ws_id = di.ws_id and wm.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.discord_integrations di, public.workspace_members wm
    where wm.ws_id = di.ws_id and wm.user_id = (select auth.uid())
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
