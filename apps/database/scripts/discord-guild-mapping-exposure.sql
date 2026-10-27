-- READ ONLY: rollout gate for 20261027150500_scope_discord_guild_member_access.
-- Run as the migration role after applying the PR; it changes no data and
-- returns counts and guild ids only, never Discord or platform user ids.
begin read only;

-- Mappings whose platform user is not a member of the guild's bound workspace.
select count(*) as mappings_outside_bound_workspace
from public.discord_guild_members dgm
join public.discord_integrations di on di.discord_guild_id = dgm.discord_guild_id
where not exists (
  select 1 from public.workspace_members wm
  where wm.ws_id = di.ws_id and wm.user_id = dgm.platform_user_id
);

-- Mappings for guilds that no integration binds to a workspace.
select count(*) as mappings_without_integration,
  count(distinct dgm.discord_guild_id) as unbound_guilds
from public.discord_guild_members dgm
where not exists (
  select 1 from public.discord_integrations di
  where di.discord_guild_id = dgm.discord_guild_id
);

-- Total mappings per guild, with the per-guild outside-workspace subset.
select dgm.discord_guild_id,
  di.ws_id is not null as has_integration,
  count(*) as total_mappings,
  count(*) filter (
    where di.ws_id is not null and not exists (
      select 1 from public.workspace_members wm
      where wm.ws_id = di.ws_id and wm.user_id = dgm.platform_user_id
    )
  ) as outside_bound_workspace
from public.discord_guild_members dgm
left join public.discord_integrations di on di.discord_guild_id = dgm.discord_guild_id
group by dgm.discord_guild_id, di.ws_id
order by total_mappings desc, dgm.discord_guild_id;

rollback;
