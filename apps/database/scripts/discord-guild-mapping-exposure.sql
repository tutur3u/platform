-- READ ONLY: pre-merge gate for 20261027150500_scope_discord_guild_member_access.
-- Run it BEFORE the PR merges, on staging and on production: staging applies
-- the migration on merge, so a post-merge run is too late. Use psql as the
-- migration role, not the Supabase SQL editor, which shows only the last result:
--   psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
--     -f apps/database/scripts/discord-guild-mapping-exposure.sql
-- The whole run is one read-only transaction that is rolled back, so it is
-- safe on production. It returns counts and guild ids only, never Discord or
-- platform user ids. Send every result set from both environments to Security
-- and Mastermind. Triage: apps/docs/platform/ai/omni-channel-chat-sdk.mdx.
begin read only;

-- 1. GATE: duplicate (discord_guild_id, discord_user_id) mappings. If either
-- environment returns above 0, STOP: do not merge until Mastermind approves a
-- remap or purge. The migration would skip its unique index, and duplicates
-- also break the runtime's maybeSingle lookup.
select count(*) as duplicate_discord_identity_groups,
  coalesce(sum(mappings - 1), 0) as excess_duplicate_mappings
from (
  select count(*) as mappings
  from public.discord_guild_members
  group by discord_guild_id, discord_user_id
  having count(*) > 1
) duplicates;

-- 2. Totals outside the bound workspace and without any integration.
select count(*) filter (where di.ws_id is not null and wm.user_id is null)
    as mappings_outside_bound_workspace,
  count(*) filter (where di.ws_id is null) as orphaned_mappings,
  count(distinct dgm.discord_guild_id) filter (where di.ws_id is null)
    as orphaned_guilds
from public.discord_guild_members dgm
left join public.discord_integrations di
  on di.discord_guild_id = dgm.discord_guild_id
left join public.workspace_members wm
  on wm.ws_id = di.ws_id and wm.user_id = dgm.platform_user_id;

-- 3. Dangerous-shape gate, per guild. Any nonzero orphaned,
-- outside_bound_workspace, mapped_non_member_type, maps_to_admin_or_creator,
-- multi-id or duplicate count goes to Security and Mastermind before merge.
-- Orphans are tolerated by the NOT VALID guild FK until an approved cleanup;
-- non-MEMBER targets keep resolving for service_role until remapped or purged.
-- A forged legacy mapping usually targets a real MEMBER of the bound workspace,
-- so the membership check alone does not find it; review creator/admin targets,
-- multi-id users, duplicates and creation bursts.
-- maps_to_admin_or_creator uses has_workspace_permission(..., 'admin'), which is
-- true for the creator, role admins and every MEMBER when the default grants it.
with mapping as (
  select dgm.discord_guild_id,
    dgm.discord_user_id,
    dgm.platform_user_id,
    di.ws_id,
    wm.type as member_type,
    w.creator_id
  from public.discord_guild_members dgm
  left join public.discord_integrations di
    on di.discord_guild_id = dgm.discord_guild_id
  left join public.workspace_members wm
    on wm.ws_id = di.ws_id and wm.user_id = dgm.platform_user_id
  left join public.workspaces w on w.id = di.ws_id
),
multi_id_users as (
  select discord_guild_id, count(*) as platform_users_with_multiple_discord_ids
  from (
    select discord_guild_id, platform_user_id
    from public.discord_guild_members
    group by discord_guild_id, platform_user_id
    having count(distinct discord_user_id) > 1
  ) users
  group by discord_guild_id
),
duplicate_ids as (
  select discord_guild_id, count(*) as discord_ids_with_multiple_mappings
  from (
    select discord_guild_id, discord_user_id
    from public.discord_guild_members
    group by discord_guild_id, discord_user_id
    having count(*) > 1
  ) ids
  group by discord_guild_id
)
select m.discord_guild_id,
  bool_or(m.ws_id is not null) as has_integration,
  count(*) as total_mappings,
  coalesce(max(u.platform_users_with_multiple_discord_ids), 0)
    as platform_users_with_multiple_discord_ids,
  coalesce(max(d.discord_ids_with_multiple_mappings), 0)
    as discord_ids_with_multiple_mappings,
  count(*) filter (where m.platform_user_id = m.creator_id) as maps_to_creator,
  count(*) filter (
    where m.ws_id is not null
      and public.has_workspace_permission(m.ws_id, m.platform_user_id, 'admin')
  ) as maps_to_admin_or_creator,
  count(*) filter (where m.ws_id is not null and m.member_type is null)
    as outside_bound_workspace,
  count(*) filter (where m.member_type is distinct from 'MEMBER'
    and m.member_type is not null) as mapped_non_member_type,
  count(*) filter (where m.ws_id is null) as orphaned
from mapping m
left join multi_id_users u on u.discord_guild_id = m.discord_guild_id
left join duplicate_ids d on d.discord_guild_id = m.discord_guild_id
group by m.discord_guild_id
order by total_mappings desc, m.discord_guild_id;

-- 4. Per-guild creation buckets since the table was introduced (2025-09-13).
-- A burst of new mappings in one guild is the first place to look for forgery.
select dgm.discord_guild_id,
  date_trunc('month', dgm.created_at)::date as created_month,
  count(*) as mappings
from public.discord_guild_members dgm
where dgm.created_at >= '2025-09-13'
group by dgm.discord_guild_id, created_month
order by dgm.discord_guild_id, created_month;

rollback;
