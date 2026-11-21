begin;
select plan(42);
select set_config('request.jwt.claims', '{}', true);

insert into auth.users (id, email, role, raw_app_meta_data, raw_user_meta_data)
values
  ('af100000-0000-4000-8000-000000000001', 'role-manager@fixture.test', 'authenticated', '{}', '{}'),
  ('af100000-0000-4000-8000-000000000002', 'role-disabled@fixture.test', 'authenticated', '{}', '{}'),
  ('af100000-0000-4000-8000-000000000003', 'role-member@fixture.test', 'authenticated', '{}', '{}'),
  ('af100000-0000-4000-8000-000000000004', 'role-target@fixture.test', 'authenticated', '{}', '{}');

update public.platform_user_roles
set enabled = user_id = 'af100000-0000-4000-8000-000000000001', allow_role_management = true
where user_id in ('af100000-0000-4000-8000-000000000001', 'af100000-0000-4000-8000-000000000002');
insert into public.platform_email_roles (email, enabled)
values ('role-reservation@fixture.test', true);

select ok(not pg_catalog.has_table_privilege('anon', target, 'INSERT, UPDATE, DELETE'),
  'anon has no write privileges on ' || target)
from unnest(array['public.platform_user_roles', 'public.platform_email_roles']) target;

create function pg_temp.check_platform_role_write_privileges(description text)
returns setof text language sql
as $$
  select throws_ok(statement, '42501', null, description || ' cannot ' || operation)
  from (values
    ('insert user roles', $query$insert into public.platform_user_roles(user_id) values ('af100000-0000-4000-8000-000000000006')$query$),
    ('update user roles', $query$update public.platform_user_roles set enabled = true where user_id = 'af100000-0000-4000-8000-000000000003'$query$),
    ('delete user roles', $query$delete from public.platform_user_roles where user_id = 'af100000-0000-4000-8000-000000000003'$query$),
    ('insert email roles', $query$insert into public.platform_email_roles(email) values ('new-reservation@fixture.test')$query$),
    ('update email roles', $query$update public.platform_email_roles set enabled = false where email = 'role-reservation@fixture.test'$query$),
    ('delete email roles', $query$delete from public.platform_email_roles where email = 'role-reservation@fixture.test'$query$)
  ) checks(operation, statement);
$$;

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"af100000-0000-4000-8000-000000000001"}', true);
select ok(public.is_nova_role_manager(), 'enabled manager qualifies');
select is((select count(*) from public.platform_user_roles where user_id = 'af100000-0000-4000-8000-000000000003'), 1::bigint, 'manager can read other user roles');
select is((select count(*) from public.platform_email_roles where email = 'role-reservation@fixture.test'), 1::bigint, 'manager can read pending grants');
select * from pg_temp.check_platform_role_write_privileges('enabled manager');

select set_config('request.jwt.claims', '{"role":"authenticated","sub":"af100000-0000-4000-8000-000000000002"}', true);
select ok(not public.is_nova_role_manager(), 'disabled manager does not qualify');
select is((select count(*) from public.platform_user_roles where user_id = auth.uid()), 1::bigint, 'disabled manager retains their own role read');
select is((select count(*) from public.platform_email_roles where email = 'role-reservation@fixture.test'), 0::bigint, 'disabled manager cannot read pending grants');
select * from pg_temp.check_platform_role_write_privileges('disabled manager');

select set_config('request.jwt.claims', '{"role":"authenticated","sub":"af100000-0000-4000-8000-000000000003"}', true);
select is((select count(*) from public.platform_user_roles), 1::bigint, 'ordinary user can read only their own role');
select * from pg_temp.check_platform_role_write_privileges('ordinary user');
reset role;

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select throws_ok(
  $$update public.platform_user_roles set enabled = true where user_id = 'af100000-0000-4000-8000-000000000004'$$,
  '42501', 'Enabled platform role manager required', 'server writes require an actor');
select throws_ok(
  $$insert into public.platform_email_roles(email, enabled) values ('role-no-actor@fixture.test', true)$$,
  '42501', 'Enabled platform role manager required', 'pending grant writes require an actor');
select set_config('request.headers', '{"x-ttr-audit-actor-id":"af100000-0000-4000-8000-000000000002"}', true);
select throws_ok(
  $$update public.platform_user_roles set enabled = true where user_id = 'af100000-0000-4000-8000-000000000004'$$,
  '42501', 'Enabled platform role manager required', 'server actor must still be enabled');
select throws_ok(
  $$insert into public.platform_email_roles(email, enabled) values ('role-disabled-actor@fixture.test', true)$$,
  '42501', 'Enabled platform role manager required', 'pending grant actor must still be enabled');

select set_config('request.headers', '{"x-ttr-audit-actor-id":"af100000-0000-4000-8000-000000000001"}', true);
select throws_ok(
  $$update public.platform_user_roles set allow_workspace_creation = true where user_id = 'af100000-0000-4000-8000-000000000001'$$,
  '42501', 'Cannot change your own platform roles', 'server actor cannot edit their own flags');
select lives_ok(
  $$update public.platform_user_roles set enabled = true where user_id = 'af100000-0000-4000-8000-000000000004'$$,
  'enabled server actor can edit another user');
select lives_ok(
  $$insert into public.platform_email_roles(email, enabled) values ('role-signup@fixture.test', true)$$,
  'enabled server actor can reserve a grant for signup');
select throws_ok(
  $$insert into public.platform_email_roles(email, enabled) values ('role-manager@fixture.test', false)$$,
  '42501', null, 'email redirect cannot modify the actor’s own user role');
reset role;
select set_config('request.jwt.claims', '{}', true);
select set_config('request.headers', '', true);

insert into auth.users (id, email, role, raw_app_meta_data, raw_user_meta_data)
values ('af100000-0000-4000-8000-000000000005', 'role-signup@fixture.test', 'authenticated', '{}', '{}');
select ok(
  (select enabled from public.platform_user_roles where user_id = 'af100000-0000-4000-8000-000000000005'),
  'Auth signup can use a reserved grant');
select is((select count(*) from public.platform_email_roles where email = 'role-signup@fixture.test'),
  0::bigint, 'Auth signup consumes the reserved grant');

update public.platform_user_roles set allow_role_management = false
where user_id <> 'af100000-0000-4000-8000-000000000001' and enabled and allow_role_management;

select throws_ok(
  $$update public.platform_user_roles set enabled = false where user_id = 'af100000-0000-4000-8000-000000000001'$$,
  'PT409', 'Cannot remove the last enabled platform role manager', 'last manager cannot be disabled');
select throws_ok(
  $$update public.platform_user_roles set allow_role_management = false where user_id = 'af100000-0000-4000-8000-000000000001'$$,
  'PT409', 'Cannot remove the last enabled platform role manager', 'last manager cannot lose role management');
select throws_ok(
  $$delete from public.platform_user_roles where user_id = 'af100000-0000-4000-8000-000000000001'$$,
  'PT409', 'Cannot remove the last enabled platform role manager', 'last manager cannot be deleted');

select ok(
  (select enabled and allow_role_management from public.platform_user_roles
    where user_id = 'af100000-0000-4000-8000-000000000001'),
  'rejected changes preserve the last enabled manager');

update public.platform_user_roles set allow_role_management = true
where user_id = 'af100000-0000-4000-8000-000000000004';
select throws_ok(
  $$update public.platform_user_roles set enabled = false where enabled and allow_role_management$$,
  'PT409', 'Cannot remove the last enabled platform role manager', 'one statement cannot remove both managers');

select * from finish();
rollback;
