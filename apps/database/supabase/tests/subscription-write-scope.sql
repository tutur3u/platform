begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(30);

-- Fixtures: a creator-owned workspace with an admin member (admin role) and a
-- billing role that already holds manage_subscription.
insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('5ab00000-0000-4000-8000-000000000001', 'sws-creator@example.com', now(), '{}'::jsonb, '{}'::jsonb),
  ('5ab00000-0000-4000-8000-000000000002', 'sws-admin@example.com', now(), '{}'::jsonb, '{}'::jsonb),
  ('5ab00000-0000-4000-8000-000000000003', 'sws-member@example.com', now(), '{}'::jsonb, '{}'::jsonb);

insert into public.users (id)
values
  ('5ab00000-0000-4000-8000-000000000001'),
  ('5ab00000-0000-4000-8000-000000000002'),
  ('5ab00000-0000-4000-8000-000000000003')
on conflict (id) do nothing;

insert into public.workspaces (id, name, personal, creator_id)
values (
  '5ab00000-0000-4000-8000-0000000000a1',
  'Subscription write scope',
  false,
  '5ab00000-0000-4000-8000-000000000001'
);

insert into public.workspace_members (ws_id, user_id, type)
values
  ('5ab00000-0000-4000-8000-0000000000a1', '5ab00000-0000-4000-8000-000000000001', 'MEMBER'),
  ('5ab00000-0000-4000-8000-0000000000a1', '5ab00000-0000-4000-8000-000000000002', 'MEMBER'),
  ('5ab00000-0000-4000-8000-0000000000a1', '5ab00000-0000-4000-8000-000000000003', 'MEMBER')
on conflict (ws_id, user_id) do nothing;

insert into public.workspace_roles (id, ws_id, name)
values
  ('5ab00000-0000-4000-8000-0000000000b1', '5ab00000-0000-4000-8000-0000000000a1', 'Admins'),
  ('5ab00000-0000-4000-8000-0000000000b2', '5ab00000-0000-4000-8000-0000000000a1', 'Billing'),
  ('5ab00000-0000-4000-8000-0000000000b3', '5ab00000-0000-4000-8000-0000000000a1', 'Staff');

insert into public.workspace_role_permissions (ws_id, role_id, permission, enabled)
values
  ('5ab00000-0000-4000-8000-0000000000a1', '5ab00000-0000-4000-8000-0000000000b1', 'admin', true),
  ('5ab00000-0000-4000-8000-0000000000a1', '5ab00000-0000-4000-8000-0000000000b2', 'manage_subscription', true),
  ('5ab00000-0000-4000-8000-0000000000a1', '5ab00000-0000-4000-8000-0000000000b3', 'manage_subscription', false);

insert into public.workspace_role_members (role_id, user_id)
values ('5ab00000-0000-4000-8000-0000000000b1', '5ab00000-0000-4000-8000-000000000002');

-- Billing rows as the platform would write them.
insert into public.workspace_subscriptions (
  ws_id, status, polar_subscription_id, product_id, seat_count
)
select
  '5ab00000-0000-4000-8000-0000000000a1',
  'active',
  'sub-write-scope-fixture',
  p.id,
  null
from private.workspace_subscription_products p
order by p.price nulls last
limit 1;

insert into public.workspace_orders (ws_id, polar_order_id, status, total_amount)
values (
  '5ab00000-0000-4000-8000-0000000000a1',
  'order-write-scope-fixture',
  'paid',
  0
);

-- Runs one statement as the user under RLS; returns its scalar result,
-- 'ok', or the SQLSTATE it raised.
create function pg_temp.as_user(p_user uuid, p_sql text) returns text language plpgsql as $$
declare r text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    if p_sql ~* '^\s*select' then execute p_sql into r; else execute p_sql; end if;
    r := coalesce(r, 'ok');
  exception when others then r := sqlstate;
  end;
  execute 'reset role';
  return r;
end $$;

create function pg_temp.as_service(p_sql text) returns text language plpgsql as $$
declare r text;
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  begin
    if p_sql ~* '^\s*select' then execute p_sql into r; else execute p_sql; end if;
    r := coalesce(r, 'ok');
  exception when others then r := sqlstate;
  end;
  execute 'reset role';
  return r;
end $$;

-- Catalog: no write grants or write policies for API roles.
select ok(
  not exists (
    select 1
    from (values ('insert'), ('update'), ('delete'), ('truncate')) as p(priv)
    cross join (values ('anon'), ('authenticated')) as r(role_name)
    cross join (values ('public.workspace_subscriptions'), ('public.workspace_orders')) as t(tbl)
    where has_table_privilege(r.role_name, t.tbl, p.priv)
  ),
  'anon and authenticated have no write grants on billing tables'
);

select ok(
  has_table_privilege('authenticated', 'public.workspace_subscriptions', 'select')
    and has_table_privilege('authenticated', 'public.workspace_orders', 'select'),
  'authenticated keeps SELECT on billing tables'
);

select is(
  (
    select count(*)::int
    from pg_policies
    where schemaname = 'public'
      and tablename in ('workspace_subscriptions', 'workspace_orders')
      and permissive = 'PERMISSIVE'
      and cmd <> 'SELECT'
  ),
  0,
  'billing tables have no permissive write policies'
);

select ok(
  (select count(*) from public.workspace_subscriptions where polar_subscription_id = 'sub-write-scope-fixture') = 1,
  'subscription fixture exists'
);

-- Creator: reads, cannot write.
select is(
  pg_temp.as_user('5ab00000-0000-4000-8000-000000000001',
    $$select count(*)::text from public.workspace_subscriptions where ws_id = '5ab00000-0000-4000-8000-0000000000a1'$$),
  '1',
  'creator can read the workspace subscription'
);

select is(
  pg_temp.as_user('5ab00000-0000-4000-8000-000000000001',
    $$select count(*)::text from public.workspace_orders where ws_id = '5ab00000-0000-4000-8000-0000000000a1'$$),
  '1',
  'creator can read the workspace order'
);

select is(
  pg_temp.as_user('5ab00000-0000-4000-8000-000000000001', $$
    insert into public.workspace_subscriptions (ws_id, status, polar_subscription_id, product_id, seat_count)
    select ws_id, 'active', 'sub-forged', product_id, 100000
    from public.workspace_subscriptions where polar_subscription_id = 'sub-write-scope-fixture'
  $$),
  '42501',
  'creator cannot insert a subscription'
);

select is(
  pg_temp.as_user('5ab00000-0000-4000-8000-000000000001', $$
    update public.workspace_subscriptions set seat_count = 100000, status = 'active'
    where ws_id = '5ab00000-0000-4000-8000-0000000000a1'
  $$),
  '42501',
  'creator cannot update a subscription'
);

select is(
  pg_temp.as_user('5ab00000-0000-4000-8000-000000000001', $$
    delete from public.workspace_subscriptions where ws_id = '5ab00000-0000-4000-8000-0000000000a1'
  $$),
  '42501',
  'creator cannot delete a subscription'
);

select is(
  pg_temp.as_user('5ab00000-0000-4000-8000-000000000001', $$
    insert into public.workspace_orders (ws_id, polar_order_id, status, total_amount)
    values ('5ab00000-0000-4000-8000-0000000000a1', 'order-forged', 'paid', 1)
  $$),
  '42501',
  'creator cannot insert an order'
);

select is(
  pg_temp.as_user('5ab00000-0000-4000-8000-000000000001', $$
    update public.workspace_orders set polar_order_id = 'order-other'
    where ws_id = '5ab00000-0000-4000-8000-0000000000a1'
  $$),
  '42501',
  'creator cannot update an order'
);

select is(
  pg_temp.as_user('5ab00000-0000-4000-8000-000000000001', $$
    delete from public.workspace_orders where ws_id = '5ab00000-0000-4000-8000-0000000000a1'
  $$),
  '42501',
  'creator cannot delete an order'
);

-- Admin member: cannot write billing rows either.
select is(
  pg_temp.as_user('5ab00000-0000-4000-8000-000000000002', $$
    update public.workspace_subscriptions set seat_count = 100000
    where ws_id = '5ab00000-0000-4000-8000-0000000000a1'
  $$),
  '42501',
  'admin cannot update a subscription'
);

select is(
  pg_temp.as_user('5ab00000-0000-4000-8000-000000000002', $$
    insert into public.workspace_orders (ws_id, polar_order_id, status, total_amount)
    values ('5ab00000-0000-4000-8000-0000000000a1', 'order-forged-admin', 'paid', 1)
  $$),
  '42501',
  'admin cannot insert an order'
);

-- Service role keeps full write access.
select is(
  pg_temp.as_service($$
    update public.workspace_subscriptions set cancel_at_period_end = true
    where polar_subscription_id = 'sub-write-scope-fixture'
  $$),
  'ok',
  'service role can update a subscription'
);

select is(
  pg_temp.as_service($$
    insert into public.workspace_orders (ws_id, polar_order_id, status, total_amount)
    values ('5ab00000-0000-4000-8000-0000000000a1', 'order-service', 'paid', 1)
  $$),
  'ok',
  'service role can insert an order'
);

select is(
  pg_temp.as_service($$
    delete from public.workspace_orders where polar_order_id = 'order-service'
  $$),
  'ok',
  'service role can delete an order'
);

select is(
  (select seat_count from public.workspace_subscriptions where polar_subscription_id = 'sub-write-scope-fixture'),
  null,
  'subscription seat count is unchanged by API users'
);

-- Admin cannot grant manage_subscription through roles or defaults.
select ok(
  not public.has_workspace_permission(
    '5ab00000-0000-4000-8000-0000000000a1',
    '5ab00000-0000-4000-8000-000000000002',
    'manage_subscription'
  ),
  'admin does not hold manage_subscription'
);

select is(
  pg_temp.as_user('5ab00000-0000-4000-8000-000000000002', $$
    insert into public.workspace_role_permissions (ws_id, role_id, permission, enabled)
    values ('5ab00000-0000-4000-8000-0000000000a1', '5ab00000-0000-4000-8000-0000000000b1', 'manage_subscription', true)
  $$),
  '42501',
  'admin cannot add manage_subscription to a role'
);

select is(
  pg_temp.as_user('5ab00000-0000-4000-8000-000000000002', $$
    update public.workspace_role_permissions set enabled = true
    where role_id = '5ab00000-0000-4000-8000-0000000000b3' and permission = 'manage_subscription'
  $$),
  '42501',
  'admin cannot enable a disabled manage_subscription role grant'
);

select is(
  pg_temp.as_user('5ab00000-0000-4000-8000-000000000002', $$
    insert into public.workspace_default_permissions (ws_id, permission, member_type, enabled)
    values ('5ab00000-0000-4000-8000-0000000000a1', 'manage_subscription', 'MEMBER', true)
    on conflict (ws_id, permission, member_type) do update set enabled = true
  $$),
  '42501',
  'admin cannot make manage_subscription a default permission'
);

select is(
  pg_temp.as_user('5ab00000-0000-4000-8000-000000000002', $$
    insert into public.workspace_role_members (role_id, user_id)
    values ('5ab00000-0000-4000-8000-0000000000b2', '5ab00000-0000-4000-8000-000000000002')
  $$),
  '42501',
  'admin cannot join a role that holds manage_subscription'
);

select ok(
  not public.has_workspace_permission(
    '5ab00000-0000-4000-8000-0000000000a1',
    '5ab00000-0000-4000-8000-000000000002',
    'manage_subscription'
  ),
  'admin still does not hold manage_subscription'
);

-- Ordinary role management by the admin keeps working.
select is(
  pg_temp.as_user('5ab00000-0000-4000-8000-000000000002', $$
    insert into public.workspace_role_permissions (ws_id, role_id, permission, enabled)
    values ('5ab00000-0000-4000-8000-0000000000a1', '5ab00000-0000-4000-8000-0000000000b3', 'manage_users', true)
  $$),
  'ok',
  'admin can grant other permissions'
);

select is(
  pg_temp.as_user('5ab00000-0000-4000-8000-000000000002', $$
    insert into public.workspace_role_members (role_id, user_id)
    values ('5ab00000-0000-4000-8000-0000000000b3', '5ab00000-0000-4000-8000-000000000003')
  $$),
  'ok',
  'admin can add members to a role without manage_subscription'
);

select is(
  pg_temp.as_user('5ab00000-0000-4000-8000-000000000002', $$
    update public.workspace_role_permissions set enabled = false
    where role_id = '5ab00000-0000-4000-8000-0000000000b2' and permission = 'manage_subscription'
  $$),
  'ok',
  'admin can revoke manage_subscription from a role'
);

-- The creator and the service role can still grant it.
select is(
  pg_temp.as_user('5ab00000-0000-4000-8000-000000000001', $$
    update public.workspace_role_permissions set enabled = true
    where role_id = '5ab00000-0000-4000-8000-0000000000b2' and permission = 'manage_subscription'
  $$),
  'ok',
  'creator can grant manage_subscription on a role'
);

select is(
  pg_temp.as_user('5ab00000-0000-4000-8000-000000000001', $$
    insert into public.workspace_role_members (role_id, user_id)
    values ('5ab00000-0000-4000-8000-0000000000b2', '5ab00000-0000-4000-8000-000000000003')
  $$),
  'ok',
  'creator can add members to a role with manage_subscription'
);

select is(
  pg_temp.as_service($$
    update public.workspace_role_permissions set enabled = true
    where role_id = '5ab00000-0000-4000-8000-0000000000b3' and permission = 'manage_subscription'
  $$),
  'ok',
  'service role can grant manage_subscription on a role'
);

select * from finish();

rollback;
