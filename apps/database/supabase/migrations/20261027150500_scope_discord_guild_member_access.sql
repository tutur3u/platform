begin;

-- Mapping reads keep the bound-workspace scope. Writes additionally require
-- manage_workspace_integrations in that workspace: the platform flag alone let
-- any MEMBER map a coworker, including an admin, to an arbitrary Discord id and
-- impersonate them through the bot and the AI agent runtime. The integration
-- subqueries run under that table's own policy, so the flag is still required.
drop policy "Allow users who have access to workspace"
on public.discord_guild_members;

create policy "discord_guild_members_select_workspace_member"
on public.discord_guild_members
as permissive
for select
to authenticated
using (
  exists (
    select 1
    from public.discord_integrations di
    join public.workspace_members actor on actor.ws_id = di.ws_id
    where di.discord_guild_id = discord_guild_members.discord_guild_id
      and actor.user_id = (select auth.uid())
  )
);

create policy "discord_guild_members_insert_integration_manager"
on public.discord_guild_members
as permissive
for insert
to authenticated
with check (
  exists (
    select 1
    from public.discord_integrations di
    join public.workspace_members actor on actor.ws_id = di.ws_id
    join public.workspace_members mapped on mapped.ws_id = di.ws_id
    where di.discord_guild_id = discord_guild_members.discord_guild_id
      and actor.user_id = (select auth.uid())
      and mapped.user_id = discord_guild_members.platform_user_id
      and public.has_workspace_permission(
        di.ws_id, (select auth.uid()), 'manage_workspace_integrations'
      ) is true
  )
);

create policy "discord_guild_members_update_integration_manager"
on public.discord_guild_members
as permissive
for update
to authenticated
using (
  exists (
    select 1
    from public.discord_integrations di
    join public.workspace_members actor on actor.ws_id = di.ws_id
    where di.discord_guild_id = discord_guild_members.discord_guild_id
      and actor.user_id = (select auth.uid())
      and public.has_workspace_permission(
        di.ws_id, (select auth.uid()), 'manage_workspace_integrations'
      ) is true
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
      and public.has_workspace_permission(
        di.ws_id, (select auth.uid()), 'manage_workspace_integrations'
      ) is true
  )
);

create policy "discord_guild_members_delete_integration_manager"
on public.discord_guild_members
as permissive
for delete
to authenticated
using (
  exists (
    select 1
    from public.discord_integrations di
    join public.workspace_members actor on actor.ws_id = di.ws_id
    where di.discord_guild_id = discord_guild_members.discord_guild_id
      and actor.user_id = (select auth.uid())
      and public.has_workspace_permission(
        di.ws_id, (select auth.uid()), 'manage_workspace_integrations'
      ) is true
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

-- A guild/workspace binding and its creator are fixed for the row's lifetime,
-- for every role. Rebinding means disconnecting and connecting again.
-- Accepted trade-off: this also rejects the workspaces.id and users.id
-- ON UPDATE CASCADE paths into this table. Neither id is ever renumbered.
create function public.guard_discord_integration_binding()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.discord_guild_id is distinct from old.discord_guild_id
    or new.ws_id is distinct from old.ws_id
    or new.creator_id is distinct from old.creator_id then
    raise exception 'Discord integration guild, workspace and creator are immutable'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_discord_integration_binding()
from public, anon, authenticated;

create trigger guard_discord_integration_binding
before update of discord_guild_id, ws_id, creator_id
on public.discord_integrations
for each row execute function public.guard_discord_integration_binding();

-- Disconnecting a guild removes its mappings in the same transaction, so a
-- later connect from another workspace never inherits them. This runs for
-- direct deletes and for the workspace ON DELETE CASCADE. RLS cannot do this
-- from the route: once the integration row is gone, the mapping policies match
-- nothing. It covers future disconnects only; mappings already left behind by
-- earlier disconnects are a separate, approved data cleanup.
create function public.delete_discord_guild_members_on_disconnect()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.discord_guild_members
  where discord_guild_id = old.discord_guild_id;
  return old;
end;
$$;

revoke all on function public.delete_discord_guild_members_on_disconnect()
from public, anon, authenticated;

create trigger delete_discord_guild_members_on_disconnect
after delete on public.discord_integrations
for each row execute function public.delete_discord_guild_members_on_disconnect();

-- One mapping per Discord user per guild; the runtime resolves it with
-- maybeSingle. Existing duplicates must not fail this migration, so the index
-- is created only when none exist. Otherwise the apply logs a NOTICE and the
-- index waits for a Mastermind-approved remap or purge, after which the
-- operator runs this function again. The SHARE lock keeps new duplicates out
-- between the check and the build.
create function public.ensure_discord_guild_member_identity_index()
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  lock table public.discord_guild_members in share mode;

  if exists (
    select 1
    from public.discord_guild_members
    group by discord_guild_id, discord_user_id
    having count(*) > 1
  ) then
    raise notice 'Skipped discord_guild_members_guild_discord_user_key: duplicate (discord_guild_id, discord_user_id) mappings exist. Run apps/database/scripts/discord-guild-mapping-exposure.sql and route the remap or purge to Mastermind.';
    return false;
  end if;

  create unique index if not exists discord_guild_members_guild_discord_user_key
  on public.discord_guild_members (discord_guild_id, discord_user_id);
  return true;
end;
$$;

revoke all on function public.ensure_discord_guild_member_identity_index()
from public, anon, authenticated, service_role;

select public.ensure_discord_guild_member_identity_index();

commit;
