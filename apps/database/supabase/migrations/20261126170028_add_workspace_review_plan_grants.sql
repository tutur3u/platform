create table private.workspace_review_plan_grants (
  id uuid primary key,
  ws_id uuid not null,
  tier public.workspace_product_tier not null check (tier in ('PLUS', 'PRO')),
  created_at timestamptz not null default statement_timestamp(),
  created_by uuid not null,
  reason text not null check (char_length(btrim(reason)) between 1 and 500),
  expires_at timestamptz not null check (expires_at > created_at),
  revoked_at timestamptz,
  revoked_by uuid,
  check ((revoked_at is null) = (revoked_by is null))
);

alter table private.workspace_review_plan_grants enable row level security;
revoke all on private.workspace_review_plan_grants from public, anon, authenticated, service_role;
grant select on private.workspace_review_plan_grants to service_role;

create index workspace_review_plan_grants_active_by_workspace
  on private.workspace_review_plan_grants (ws_id, expires_at)
  where revoked_at is null;

-- tuturuuu: no-grant (internal)
create function private.can_manage_workspace_review_plan_grants(p_actor_id uuid)
returns boolean
language sql
stable
set search_path = pg_catalog, pg_temp
as $$
  select public.is_org_member(
    p_actor_id, '00000000-0000-0000-0000-000000000000'::uuid
  ) and public.has_workspace_permission(
    '00000000-0000-0000-0000-000000000000'::uuid, p_actor_id, 'admin'
  );
$$;

revoke all on function private.can_manage_workspace_review_plan_grants(uuid)
  from public, anon, authenticated, service_role;

create function public.create_workspace_review_plan_grant(
  p_actor_id uuid,
  p_ws_id uuid,
  p_grant_id uuid,
  p_tier public.workspace_product_tier,
  p_reason text,
  p_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_grant_id uuid;
begin
  if private.can_manage_workspace_review_plan_grants(p_actor_id) is distinct from true then
    raise exception 'Root administrator required' using errcode = '42501';
  end if;

  insert into private.workspace_review_plan_grants
    (id, ws_id, tier, created_by, reason, expires_at)
  select p_grant_id, workspace.id, p_tier, p_actor_id, btrim(p_reason), p_expires_at
  from public.workspaces workspace
  where workspace.id = p_ws_id and workspace.deleted is distinct from true
  on conflict (id) do nothing
  returning id into v_grant_id;

  if v_grant_id is null then
    select grant_row.id into v_grant_id
    from private.workspace_review_plan_grants grant_row
    where grant_row.id = p_grant_id and grant_row.ws_id = p_ws_id
      and grant_row.tier = p_tier and grant_row.created_by = p_actor_id
      and grant_row.reason = btrim(p_reason) and grant_row.expires_at = p_expires_at
      and grant_row.revoked_at is null and grant_row.expires_at > statement_timestamp();
  end if;

  if v_grant_id is null then
    raise exception 'Workspace unavailable' using errcode = '22023';
  end if;

  return v_grant_id;
end;
$$;

create function public.revoke_workspace_review_plan_grant(
  p_actor_id uuid,
  p_ws_id uuid,
  p_grant_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if private.can_manage_workspace_review_plan_grants(p_actor_id) is distinct from true then
    raise exception 'Root administrator required' using errcode = '42501';
  end if;

  update private.workspace_review_plan_grants
  set revoked_at = statement_timestamp(), revoked_by = p_actor_id
  where id = p_grant_id and ws_id = p_ws_id and revoked_at is null;

  return found;
end;
$$;

revoke all on function public.create_workspace_review_plan_grant(uuid, uuid, uuid, public.workspace_product_tier, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.revoke_workspace_review_plan_grant(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.create_workspace_review_plan_grant(uuid, uuid, uuid, public.workspace_product_tier, text, timestamptz)
  to service_role;
grant execute on function public.revoke_workspace_review_plan_grant(uuid, uuid, uuid)
  to service_role;

create or replace function public._resolve_workspace_tier(p_ws_id uuid)
returns public.workspace_product_tier
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select greatest(
    'FREE'::public.workspace_product_tier,
    (
      select product.tier
      from public.workspace_subscriptions subscription
      join private.workspace_subscription_products product on product.id = subscription.product_id
      where subscription.ws_id = p_ws_id and subscription.status = 'active'
      order by subscription.created_at desc
      limit 1
    ),
    (
      select grant_row.tier
      from private.workspace_review_plan_grants grant_row
      where grant_row.ws_id = p_ws_id
        and grant_row.revoked_at is null
        and grant_row.expires_at > statement_timestamp()
      order by grant_row.tier desc
      limit 1
    )
  );
$$;

revoke all on function public._resolve_workspace_tier(uuid) from public, anon, authenticated;
grant execute on function public._resolve_workspace_tier(uuid) to service_role;
