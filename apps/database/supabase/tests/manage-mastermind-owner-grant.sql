-- Owner bootstrap 20261030120000: all fixtures roll back.
begin;
select plan(18);
select set_config('request.jwt.claims', '{}', true);

savepoint no_root;
delete from public.workspaces where id = '00000000-0000-0000-0000-000000000000';
select lives_ok('select private.grant_mastermind_root_creator()', 'missing root is a no-op');
select is((select count(*) from private.mastermind_access_audit), 0::bigint, 'missing root writes no audit');
rollback to no_root;

-- Model incomplete legacy bootstrap; this constraint change rolls back with fixtures.
alter table public.workspaces alter column creator_id drop not null;
delete from public.workspaces where id = '00000000-0000-0000-0000-000000000000';
insert into public.workspaces (id, name, personal, creator_id)
values ('00000000-0000-0000-0000-000000000000', 'Owner fixture', false, null)
on conflict (id) do update set creator_id = null;
select lives_ok('select private.grant_mastermind_root_creator()', 'null creator is a no-op');
select is((select count(*) from private.mastermind_access_audit), 0::bigint, 'null creator writes no audit');

-- A public profile without an auth account models incomplete bootstrap data.
insert into public.users (id, display_name)
values ('4d420000-0000-4000-8000-000000000001', 'Missing auth fixture');
update public.workspaces set creator_id = '4d420000-0000-4000-8000-000000000001'
where id = '00000000-0000-0000-0000-000000000000';
insert into public.workspace_members (ws_id, user_id, type)
values ('00000000-0000-0000-0000-000000000000', '4d420000-0000-4000-8000-000000000001', 'MEMBER')
on conflict (ws_id, user_id) do update set type = 'MEMBER';
select lives_ok('select private.grant_mastermind_root_creator()', 'creator missing from auth is a no-op');
select is((select count(*) from private.mastermind_access_audit), 0::bigint, 'missing auth writes no audit');

insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values ('4d420000-0000-4000-8000-000000000002', 'owner-bootstrap@example.com', now(), '{}', '{}');
update public.workspaces set creator_id = '4d420000-0000-4000-8000-000000000002'
where id = '00000000-0000-0000-0000-000000000000';
delete from public.workspace_members where ws_id = '00000000-0000-0000-0000-000000000000'
and user_id = '4d420000-0000-4000-8000-000000000002';
select lives_ok('select private.grant_mastermind_root_creator()', 'non-member creator is a no-op');
select is((select count(*) from private.mastermind_access_audit), 0::bigint, 'non-member writes no audit');
insert into public.workspace_members (ws_id, user_id, type)
values ('00000000-0000-0000-0000-000000000000', '4d420000-0000-4000-8000-000000000002', 'GUEST');
select lives_ok('select private.grant_mastermind_root_creator()', 'guest creator is a no-op');
select is((select count(*) from private.mastermind_access_role), 0::bigint, 'skips create no dedicated role');

insert into public.workspace_roles (id, ws_id, name)
values ('4d420000-0000-4000-8000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'Mastermind');
delete from public.workspace_members where ws_id = '00000000-0000-0000-0000-000000000000'
and user_id = '4d420000-0000-4000-8000-000000000002';
insert into public.workspace_members (ws_id, user_id, type)
values ('00000000-0000-0000-0000-000000000000', '4d420000-0000-4000-8000-000000000002', 'MEMBER');
select lives_ok('select private.grant_mastermind_root_creator()', 'post-seed grant succeeds via audited helper');
select lives_ok('select private.grant_mastermind_root_creator()', 'rerun succeeds');
select is((select count(*) from private.mastermind_access_role), 1::bigint, 'rerun keeps one recorded role');
select isnt((select role_id from private.mastermind_access_role), '4d420000-0000-4000-8000-0000000000b1'::uuid, 'pre-seeded namesake is not adopted');
select is((select array_agg(changed order by id) from private.mastermind_access_audit), array[true, false], 'helper audits initial change and idempotent rerun');
select is((select count(*) from public.workspace_role_members where role_id = (select role_id from private.mastermind_access_role)), 1::bigint, 'exactly one grantee');
select ok(public.has_workspace_permission('00000000-0000-0000-0000-000000000000', '4d420000-0000-4000-8000-000000000002', 'manage_mastermind'), 'only root creator receives permission');
select ok(not has_function_privilege('anon', 'private.grant_mastermind_root_creator()', 'execute')
and not has_function_privilege('authenticated', 'private.grant_mastermind_root_creator()', 'execute')
and not has_function_privilege('service_role', 'private.grant_mastermind_root_creator()', 'execute'), 'bootstrap helper is unavailable to API roles');
select * from finish();
rollback;
