-- READ ONLY: rollout gate for 20261027150500_scope_discord_guild_member_access.
-- Run as the migration role on staging, then production, BEFORE promotion. It
-- changes no data and returns counts and guild ids only, never Discord or
-- platform user ids. Triage: apps/docs/platform/ai/omni-channel-chat-sdk.mdx.
begin read only;

-- 1. GATE: duplicate (discord_guild_id, discord_user_id) mappings. Above 0, the
-- migration skips its unique index; route the remap or purge to Mastermind
-- before apply. These also break the runtime's maybeSingle lookup.
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

-- 3. Per-guild triage. A forged legacy mapping usually targets a real MEMBER of
-- the bound workspace, so the membership check alone does not find it; review
-- creator/admin targets, multi-id users, duplicates and creation bursts.
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
