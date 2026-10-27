begin;

alter policy "Allow users who have access to workspace"
on public.discord_guild_members
to authenticated
using (
  exists (
    select 1
    from public.discord_integrations di
    join public.workspace_members actor on actor.ws_id = di.ws_id
    where di.discord_guild_id = discord_guild_members.discord_guild_id
      and actor.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.discord_integrations di
    join public.workspace_members actor on actor.ws_id = di.ws_id
    join public.workspace_members mapped on mapped.ws_id = di.ws_id
    where di.discord_guild_id = discord_guild_members.discord_guild_id
      and actor.user_id = (select auth.uid())
      and mapped.user_id = discord_guild_members.platform_user_id
  )
);

-- The platform flag alone used to cover every integration row. Reads now also
-- require MEMBER access to the bound workspace, and writes require the same
-- manage_workspace_integrations permission that gates the integrations pages.
-- service_role (Discord bot, AI agent runtime) bypasses RLS and is unchanged.
drop policy "Allow users who have sufficient platform role"
on public.discord_integrations;

create policy "discord_integrations_select_flagged_member"
on public.discord_integrations
as permissive
for select
to authenticated
using (
  exists (
    select 1
    from public.platform_user_roles pur
    where pur.user_id = (select auth.uid())
      and pur.allow_discord_integrations = true
  )
  and public.is_org_member((select auth.uid()), ws_id)
);

create policy "discord_integrations_insert_flagged_manager"
on public.discord_integrations
as permissive
for insert
to authenticated
with check (
  creator_id = (select auth.uid())
  and exists (
    select 1
    from public.platform_user_roles pur
    where pur.user_id = (select auth.uid())
      and pur.allow_discord_integrations = true
  )
  and public.is_org_member((select auth.uid()), ws_id)
  and public.has_workspace_permission(
    ws_id, (select auth.uid()), 'manage_workspace_integrations'
  )
);

create policy "discord_integrations_update_flagged_manager"
on public.discord_integrations
as permissive
for update
to authenticated
using (
  exists (
    select 1
    from public.platform_user_roles pur
    where pur.user_id = (select auth.uid())
      and pur.allow_discord_integrations = true
  )
  and public.is_org_member((select auth.uid()), ws_id)
  and public.has_workspace_permission(
    ws_id, (select auth.uid()), 'manage_workspace_integrations'
  )
)
with check (
  exists (
    select 1
    from public.platform_user_roles pur
    where pur.user_id = (select auth.uid())
      and pur.allow_discord_integrations = true
  )
  and public.is_org_member((select auth.uid()), ws_id)
  and public.has_workspace_permission(
    ws_id, (select auth.uid()), 'manage_workspace_integrations'
  )
);

create policy "discord_integrations_delete_flagged_manager"
on public.discord_integrations
as permissive
for delete
to authenticated
using (
  exists (
    select 1
    from public.platform_user_roles pur
    where pur.user_id = (select auth.uid())
      and pur.allow_discord_integrations = true
  )
  and public.is_org_member((select auth.uid()), ws_id)
  and public.has_workspace_permission(
    ws_id, (select auth.uid()), 'manage_workspace_integrations'
  )
);

-- A guild/workspace binding is fixed for the row's lifetime, for every role.
-- Rebinding means disconnecting and connecting again. Workspace ids are never
-- renumbered, so the ws_id ON UPDATE CASCADE path fails closed here as well.
create function public.guard_discord_integration_binding()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.discord_guild_id is distinct from old.discord_guild_id
    or new.ws_id is distinct from old.ws_id then
    raise exception 'Discord integration guild and workspace are immutable'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_discord_integration_binding()
from public, anon, authenticated;

create trigger guard_discord_integration_binding
before update of discord_guild_id, ws_id on public.discord_integrations
for each row execute function public.guard_discord_integration_binding();

commit;
