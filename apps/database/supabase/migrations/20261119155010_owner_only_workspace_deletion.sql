begin;
set local lock_timeout = '5s';

drop policy if exists "Allow workspace settings managers to delete" on public.workspaces;
revoke delete on table public.workspaces from public, anon, authenticated;

-- Keep a deletion receipt after the workspace and its foreign-key children
-- are gone. The record retains identifiers, without workspace or user content.
create table private.workspace_deletion_audit (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null,
  actor_id uuid not null,
  deleted_at timestamptz not null default now()
);

create index workspace_deletion_audit_ws_id_deleted_at_idx
  on private.workspace_deletion_audit (ws_id, deleted_at desc);

alter table private.workspace_deletion_audit enable row level security;
revoke all on table private.workspace_deletion_audit from public, anon, authenticated, service_role;
grant select, insert on table private.workspace_deletion_audit to service_role;

-- Align with zero-cost products supported by subscription provisioning.
-- An active subscription with no recognized price remains a blocker.
create function private.workspace_has_blocking_subscription(p_ws_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, pg_temp
as $$
  select exists (
    select 1
    from public.workspace_subscriptions subscription
    left join private.workspace_subscription_products product
      on product.id = subscription.product_id
    where subscription.ws_id = p_ws_id
      and subscription.status is distinct from 'canceled'
      and not coalesce(
        product.pricing_model = 'free'
          or (product.pricing_model = 'fixed' and product.price = 0),
        false
      )
  ) or exists (
    select 1
    from private.workspace_domain_addons addon
    where addon.ws_id = p_ws_id
      and addon.status <> 'canceled'
  );
$$;

revoke all on function private.workspace_has_blocking_subscription(uuid)
  from public, anon, authenticated;
-- tuturuuu: reviewed(function-grant): private.workspace_has_blocking_subscription(uuid) exposes billing eligibility only to the server service role.
grant execute on function private.workspace_has_blocking_subscription(uuid)
  to service_role;

create function public.delete_owned_workspace(
  p_ws_id uuid,
  p_actor_id uuid,
  p_confirmation text
)
returns text
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  workspace public.workspaces%rowtype;
begin
  if p_ws_id = '00000000-0000-0000-0000-000000000000'::uuid
    or p_actor_id is null then
    return 'forbidden';
  end if;

  -- A rename or ownership transfer must finish before the checks can pass.
  -- The row lock also fences new rows with a workspace foreign key.
  select * into workspace from public.workspaces
  where id = p_ws_id for update;
  if not found then
    return 'not_found';
  end if;
  if workspace.creator_id is distinct from p_actor_id
    or workspace.personal is distinct from false then
    return 'forbidden';
  end if;
  if nullif(btrim(p_confirmation), '') is null
    or btrim(p_confirmation) is distinct from btrim(workspace.name) then
    return 'confirmation_mismatch';
  end if;

  perform 1 from public.workspace_secrets
  where ws_id = p_ws_id and name = 'PREVENT_WORKSPACE_DELETION'
  for update;
  if exists (
    select 1 from public.workspace_secrets
    where ws_id = p_ws_id and name = 'PREVENT_WORKSPACE_DELETION'
      and lower(btrim(value)) = 'true'
  ) then
    return 'forbidden';
  end if;

  -- Lock existing subscriptions so a concurrent status update cannot make
  -- a paid subscription active during deletion.
  perform 1 from public.workspace_subscriptions where ws_id = p_ws_id for update;
  perform 1 from private.workspace_domain_addons where ws_id = p_ws_id for update;
  perform 1
  from private.workspace_subscription_products product
  where product.id in (
    select subscription.product_id
    from public.workspace_subscriptions subscription
    where subscription.ws_id = p_ws_id
  )
  order by product.id
  for share;
  if private.workspace_has_blocking_subscription(p_ws_id) then
    return 'subscription_active';
  end if;

  delete from public.workspaces where id = p_ws_id;
  if not found then
    return 'not_found';
  end if;
  insert into private.workspace_deletion_audit (ws_id, actor_id)
  values (p_ws_id, p_actor_id);
  return 'deleted';
end;
$$;

revoke all on function public.delete_owned_workspace(uuid, uuid, text)
  from public, anon, authenticated;
-- tuturuuu: reviewed(function-grant): public.delete_owned_workspace(uuid,uuid,text) is restricted to the authenticated server adapter's service role.
grant execute on function public.delete_owned_workspace(uuid, uuid, text)
  to service_role;

notify pgrst, 'reload schema';
commit;
