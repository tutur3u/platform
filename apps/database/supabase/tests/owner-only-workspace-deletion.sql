begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(25);

create function pg_temp.workspace_deletion_id(n integer) returns uuid
language sql as $$
  select ('d1000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
$$;

select set_config('request.jwt.claims', '{}', true);
insert into auth.users(id) values
  (pg_temp.workspace_deletion_id(1)),
  (pg_temp.workspace_deletion_id(2));
insert into public.users(id) values
  (pg_temp.workspace_deletion_id(1)),
  (pg_temp.workspace_deletion_id(2))
on conflict do nothing;
insert into public.workspaces(id, name, creator_id, personal) values
  (pg_temp.workspace_deletion_id(10), 'Deletion fixture', pg_temp.workspace_deletion_id(1), false),
  (pg_temp.workspace_deletion_id(11), 'Other workspace', pg_temp.workspace_deletion_id(1), false),
  (pg_temp.workspace_deletion_id(12), 'Protected workspace', pg_temp.workspace_deletion_id(1), false),
  (pg_temp.workspace_deletion_id(13), 'Paid workspace', pg_temp.workspace_deletion_id(1), false),
  (pg_temp.workspace_deletion_id(14), 'Fixed free workspace', pg_temp.workspace_deletion_id(1), false),
  (pg_temp.workspace_deletion_id(15), 'Workspace plan unknown', pg_temp.workspace_deletion_id(1), false),
  (pg_temp.workspace_deletion_id(16), 'Paid add-on workspace', pg_temp.workspace_deletion_id(1), false);
insert into public.workspace_secrets(ws_id, name, value) values
  (pg_temp.workspace_deletion_id(12), 'PREVENT_WORKSPACE_DELETION', 'true');
insert into private.workspace_subscription_products (id, pricing_model, price, tier) values
  (pg_temp.workspace_deletion_id(30), 'free', null, 'FREE'),
  (pg_temp.workspace_deletion_id(31), 'fixed', 0, 'FREE'),
  (pg_temp.workspace_deletion_id(32), 'fixed', 1000, 'PRO');
insert into public.workspace_subscriptions (ws_id, status, polar_subscription_id, product_id) values
  (pg_temp.workspace_deletion_id(10), 'active', 'workspace-deletion-free', pg_temp.workspace_deletion_id(30)),
  (pg_temp.workspace_deletion_id(13), 'active', 'workspace-deletion-paid', pg_temp.workspace_deletion_id(32)),
  (pg_temp.workspace_deletion_id(14), 'active', 'workspace-deletion-fixed-free', pg_temp.workspace_deletion_id(31)),
  (pg_temp.workspace_deletion_id(15), 'active', 'workspace-deletion-unknown', null),
  (pg_temp.workspace_deletion_id(14), 'canceled', 'workspace-deletion-canceled', pg_temp.workspace_deletion_id(32));
insert into private.workspace_domain_addons
  (ws_id, polar_subscription_id, polar_product_id, quantity, status)
values
  (pg_temp.workspace_deletion_id(14), 'workspace-deletion-canceled-addon', 'domain', 1, 'canceled'),
  (pg_temp.workspace_deletion_id(16), 'workspace-deletion-active-addon', 'domain', 1, 'active');
insert into public.workspace_documents(id, ws_id, name) values
  (pg_temp.workspace_deletion_id(20), pg_temp.workspace_deletion_id(10), 'Cascade document');
insert into public.workspace_members(ws_id, user_id) values
  (pg_temp.workspace_deletion_id(10), pg_temp.workspace_deletion_id(2));
insert into public.workspace_default_permissions(ws_id, permission) values
  (pg_temp.workspace_deletion_id(10), 'manage_workspace_settings');

select ok(not has_table_privilege('authenticated', 'public.workspaces', 'DELETE'),
  'authenticated sessions have no direct workspace deletion privilege');
select ok(not has_function_privilege('authenticated',
  'public.delete_owned_workspace(uuid,uuid,text)', 'EXECUTE'),
  'authenticated sessions cannot supply an actor to the service function');
select ok(not has_function_privilege('anon',
  'public.delete_owned_workspace(uuid,uuid,text)', 'EXECUTE'),
  'anonymous sessions cannot invoke the service function');
select ok(not has_table_privilege('authenticated', 'private.workspace_deletion_audit', 'SELECT'),
  'audit receipts stay private');

select ok(not has_function_privilege('authenticated',
  'private.workspace_has_blocking_subscription(uuid)', 'EXECUTE'),
  'authenticated sessions cannot look up another workspace billing state');

set local role service_role;
select is(private.workspace_has_blocking_subscription(pg_temp.workspace_deletion_id(10)),
  false, 'the status check allows a provisioned free Polar plan');
select is(private.workspace_has_blocking_subscription(pg_temp.workspace_deletion_id(13)),
  true, 'the status check blocks a paid plan');
select is(private.workspace_has_blocking_subscription(pg_temp.workspace_deletion_id(14)),
  false, 'the status check allows fixed zero-cost plans and canceled paid plans');
select is(private.workspace_has_blocking_subscription(pg_temp.workspace_deletion_id(15)),
  true, 'the status check fails closed when a subscription has no known product');
select is(private.workspace_has_blocking_subscription(pg_temp.workspace_deletion_id(16)),
  true, 'the status check blocks an active paid domain add-on');
select is(public.delete_owned_workspace(pg_temp.workspace_deletion_id(10), pg_temp.workspace_deletion_id(2), 'Deletion fixture'),
  'forbidden', 'a settings manager cannot delete a workspace they do not own');
select is(public.delete_owned_workspace(pg_temp.workspace_deletion_id(10), pg_temp.workspace_deletion_id(1), 'deletion fixture'),
  'confirmation_mismatch', 'confirmation must match the current workspace name');
select is(public.delete_owned_workspace('00000000-0000-0000-0000-000000000000', pg_temp.workspace_deletion_id(1), 'Tuturuuu'),
  'forbidden', 'the platform workspace is blocked');
select is((
  select public.delete_owned_workspace(id, creator_id, name) from public.workspaces
  where personal and creator_id = pg_temp.workspace_deletion_id(1)
), 'forbidden', 'the personal workspace is blocked');
select is(public.delete_owned_workspace(pg_temp.workspace_deletion_id(12), pg_temp.workspace_deletion_id(1), 'Protected workspace'),
  'forbidden', 'the deletion-protection flag blocks the owner');
select is(public.delete_owned_workspace(pg_temp.workspace_deletion_id(13), pg_temp.workspace_deletion_id(1), 'Paid workspace'),
  'subscription_active', 'active paid billing blocks deletion');
select is(public.delete_owned_workspace(pg_temp.workspace_deletion_id(15), pg_temp.workspace_deletion_id(1), 'Workspace plan unknown'),
  'subscription_active', 'an unresolved plan blocks deletion');
select is(public.delete_owned_workspace(pg_temp.workspace_deletion_id(16), pg_temp.workspace_deletion_id(1), 'Paid add-on workspace'),
  'subscription_active', 'an active paid domain add-on blocks deletion');
select is(public.delete_owned_workspace(pg_temp.workspace_deletion_id(14), pg_temp.workspace_deletion_id(1), 'Fixed free workspace'),
  'deleted', 'a fixed zero-cost plan does not block deletion');
select is(public.delete_owned_workspace(pg_temp.workspace_deletion_id(10), pg_temp.workspace_deletion_id(1), ' Deletion fixture '),
  'deleted', 'the owner can delete a confirmed workspace on a free plan');
select is(public.delete_owned_workspace(pg_temp.workspace_deletion_id(10), pg_temp.workspace_deletion_id(1), 'Deletion fixture'),
  'not_found', 'a repeated request does not write another receipt');
reset role;

select is((select count(*) from public.workspaces where id = pg_temp.workspace_deletion_id(10)),
  0::bigint, 'the workspace is permanently removed');
select is((select count(*) from public.workspace_documents where id = pg_temp.workspace_deletion_id(20)),
  0::bigint, 'workspace content follows its cascade');
select is((select count(*) from private.workspace_deletion_audit where ws_id = pg_temp.workspace_deletion_id(10)
  and actor_id = pg_temp.workspace_deletion_id(1)), 1::bigint, 'exactly one durable owner receipt survives');
select is((select count(*) from public.workspaces where id in (
  pg_temp.workspace_deletion_id(11), pg_temp.workspace_deletion_id(12), pg_temp.workspace_deletion_id(13), pg_temp.workspace_deletion_id(15), pg_temp.workspace_deletion_id(16)
)), 5::bigint, 'unrelated and blocked workspaces survive');

select * from finish();
rollback;
