begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(43);

create function pg_temp.lms_publication_id(n integer) returns uuid
language sql immutable as $$
  select ('c1960000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;

create function pg_temp.lms_publication_actor(n integer) returns text
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', pg_temp.lms_publication_id(n), 'role', 'authenticated', 'aal', 'aal2')::text, true)
$$;

select set_config('request.jwt.claims', '{}', true);
insert into auth.users (id, raw_app_meta_data)
select pg_temp.lms_publication_id(n), '{}' from generate_series(1, 3) as n;
insert into public.users (id)
select pg_temp.lms_publication_id(n) from generate_series(1, 3) as n
on conflict do nothing;

insert into public.workspaces (id, name, creator_id, personal)
values (pg_temp.lms_publication_id(10), 'Publication fixture', pg_temp.lms_publication_id(1), false);
insert into public.workspace_members (ws_id, user_id, type)
select pg_temp.lms_publication_id(10), pg_temp.lms_publication_id(n), 'MEMBER'
from generate_series(1, 3) as n on conflict do nothing;

insert into public.workspace_users (id, ws_id, display_name) values
  (pg_temp.lms_publication_id(11), pg_temp.lms_publication_id(10), 'Owner contact'),
  (pg_temp.lms_publication_id(12), pg_temp.lms_publication_id(10), 'Default member contact'),
  (pg_temp.lms_publication_id(13), pg_temp.lms_publication_id(10), 'Delegated manager contact');
insert into public.workspace_user_linked_users (ws_id, platform_user_id, virtual_user_id)
select pg_temp.lms_publication_id(10), pg_temp.lms_publication_id(n), pg_temp.lms_publication_id(n + 10)
from generate_series(1, 3) as n
on conflict (platform_user_id, ws_id) do nothing;
insert into public.workspace_user_groups (id, ws_id, name, is_course_published) values
  (pg_temp.lms_publication_id(20), pg_temp.lms_publication_id(10), 'Existing draft', false),
  (pg_temp.lms_publication_id(29), pg_temp.lms_publication_id(10), 'Contacts draft', false);

insert into public.workspace_user_groups_users (group_id, user_id, role)
values (pg_temp.lms_publication_id(20), pg_temp.lms_publication_id(13), 'STUDENT');
insert into public.changelog_entries (id, title, slug, content, category, creator_id, is_published, published_at)
values
  (pg_temp.lms_publication_id(40), 'Public changelog fixture', 'lms-publication-visible',
    '{"type":"doc"}', 'feature', pg_temp.lms_publication_id(1), true, now()),
  (pg_temp.lms_publication_id(41), 'Draft changelog fixture', 'lms-publication-draft',
    '{"type":"doc"}', 'feature', pg_temp.lms_publication_id(1), false, null);

-- PUBLIC-role policies such as the changelog read evaluate this function, so
-- it stays executable by PUBLIC and each API role.
select ok(
  has_function_privilege('anon', 'public.has_workspace_permission(uuid,uuid,text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.has_workspace_permission(uuid,uuid,text)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.has_workspace_permission(uuid,uuid,text)', 'EXECUTE'),
  'workspace permission evaluation stays executable by every policy role');

set local role anon;
select results_eq($$select id from public.changelog_entries
  where slug in ('lms-publication-visible', 'lms-publication-draft')$$,
  $$select 'c1960000-0000-4000-8000-000000000040'::uuid$$,
  'signed-out changelog evaluation still returns only published entries');
reset role;

-- Default members hold the ordinary admin grant in this fixture. Role writes
-- are server-side only, so the fixture owner records the creator's delegation.
insert into public.workspace_default_permissions (ws_id, member_type, permission, enabled)
values (pg_temp.lms_publication_id(10), 'MEMBER', 'admin', true)
on conflict (ws_id, permission, member_type) do update set enabled = true;
insert into public.workspace_roles (id, ws_id, name) values
  (pg_temp.lms_publication_id(30), pg_temp.lms_publication_id(10), 'Course managers'),
  (pg_temp.lms_publication_id(31), pg_temp.lms_publication_id(10), 'Ordinary staff');
insert into public.workspace_role_permissions (role_id, ws_id, permission, enabled) values
  (pg_temp.lms_publication_id(30), pg_temp.lms_publication_id(10), 'manage_courses', true);
insert into public.workspace_role_members (role_id, user_id) values
  (pg_temp.lms_publication_id(30), pg_temp.lms_publication_id(3)),
  (pg_temp.lms_publication_id(31), pg_temp.lms_publication_id(2));

set local role authenticated;
select pg_temp.lms_publication_actor(2);
select is(public.has_workspace_permission(pg_temp.lms_publication_id(10), auth.uid(), 'update_user_groups'),
  true, 'the untouched default member still has the ordinary group administration grant');
select is(public.has_workspace_permission(pg_temp.lms_publication_id(10), auth.uid(), 'manage_courses'),
  false, 'default admin does not grant course management');
select is((select count(*) from public.workspace_user_groups_users
  where group_id = pg_temp.lms_publication_id(20)), 1::bigint,
  'the default member retains the existing enrollment read');
select throws_ok($$insert into public.workspace_user_groups_users (group_id, user_id, role)
  values (pg_temp.lms_publication_id(20), pg_temp.lms_publication_id(12), 'STUDENT')$$,
  '42501', null, 'the default member cannot add an enrollment directly');
select throws_ok($$insert into public.workspace_user_groups_users (group_id, user_id, role)
  select pg_temp.lms_publication_id(20), linked.virtual_user_id, 'TEACHER'
  from public.workspace_user_linked_users as linked
  where linked.platform_user_id = auth.uid() and linked.ws_id = pg_temp.lms_publication_id(10)$$,
  '42501', null, 'the default member cannot enroll their own contact as a teacher');
select results_eq($$with changed as (
  update public.workspace_user_groups_users set role = 'TEACHER'
  where group_id = pg_temp.lms_publication_id(20) returning user_id
) select count(*) from changed$$, $$select 0::bigint$$,
  'the default member cannot change an enrollment directly');
select results_eq($$with removed as (
  delete from public.workspace_user_groups_users
  where group_id = pg_temp.lms_publication_id(20) returning user_id
) select count(*) from removed$$, $$select 0::bigint$$,
  'the default member cannot remove an enrollment directly');
select throws_ok($$insert into public.workspace_user_groups (id, ws_id, name, is_course_published)
  values (pg_temp.lms_publication_id(21), pg_temp.lms_publication_id(10), 'Unauthorized published course', true)$$,
  '42501', 'new row violates row-level security policy "Course creators insert workspace groups" for table "workspace_user_groups"',
  'the default member cannot publish on insert');
select results_eq($$with changed as (
  update public.workspace_user_groups set is_course_published = true
  where id = pg_temp.lms_publication_id(20) returning id
) select count(*) from changed$$, $$select 0::bigint$$,
  'the default member cannot publish an existing course');
select results_eq($$with removed as (
  delete from public.workspace_user_groups where id = pg_temp.lms_publication_id(20) returning id
) select count(*) from removed$$, $$select 0::bigint$$,
  'the default member cannot cascade-delete a course');
select throws_ok($$insert into public.workspace_user_groups (id, ws_id, name, creator_id)
  values (pg_temp.lms_publication_id(26), pg_temp.lms_publication_id(10), 'Spoofed creator', pg_temp.lms_publication_id(1))$$,
  '42501', null, 'the default member cannot nominate a manager as the creator');
select throws_ok($$insert into public.workspace_role_permissions (role_id, ws_id, permission, enabled)
  values (pg_temp.lms_publication_id(31), pg_temp.lms_publication_id(10), 'manage_courses', true)$$,
  '42501', null, 'the default member cannot grant course permission to their own role');
select throws_ok($$insert into public.workspace_role_members (role_id, user_id)
  values (pg_temp.lms_publication_id(30), pg_temp.lms_publication_id(2))$$,
  '42501', null, 'the default member cannot add themselves to a manager role');
select throws_ok($$insert into public.workspace_default_permissions (ws_id, member_type, permission, enabled)
  values (pg_temp.lms_publication_id(10), 'MEMBER', 'manage_courses', true)$$,
  '42501', null, 'course management cannot be assigned as a default');

reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select ok(
  private.update_workspace_role_guarded(pg_temp.lms_publication_id(10), pg_temp.lms_publication_id(31),
    pg_temp.lms_publication_id(2), 'workspace', '[{"id":"manage_courses","enabled":true}]'::jsonb) = 'updated'
  and not exists (
    select 1 from public.workspace_role_permissions
    where role_id = pg_temp.lms_publication_id(31) and permission::text = 'manage_courses'
  ),
  'the guarded role editor drops a course grant from a non-creator');
select ok(
  private.update_workspace_default_permissions_guarded(pg_temp.lms_publication_id(10), pg_temp.lms_publication_id(1),
    'workspace', 'MEMBER', '[{"id":"manage_courses","enabled":true}]'::jsonb) = 'updated'
  and not exists (
    select 1 from public.workspace_default_permissions
    where ws_id = pg_temp.lms_publication_id(10) and permission::text = 'manage_courses'
  ),
  'the guarded default editor never assigns course management, even for the creator');
select lives_ok($$insert into public.workspace_user_groups (id, ws_id, name, creator_id)
  values (pg_temp.lms_publication_id(22), pg_temp.lms_publication_id(10), 'Allowed draft', pg_temp.lms_publication_id(2))$$,
  'an attributed service write preserves draft creation');
insert into public.workspace_user_groups (id, ws_id, name, creator_id)
values (pg_temp.lms_publication_id(23), pg_temp.lms_publication_id(10), 'Trusted draft', pg_temp.lms_publication_id(2));
select is((select count(*) from public.workspace_user_groups_users
  where group_id = pg_temp.lms_publication_id(23)), 0::bigint,
  'a trusted insert still cannot grant teacher membership to a default member');
select is((select count(*) from public.workspace_user_groups_users
  where group_id = pg_temp.lms_publication_id(22)), 0::bigint,
  'an approved draft does not grant its default member creator a teacher role');

select lives_ok($$insert into public.workspace_user_groups (id, ws_id, name, is_course_published, creator_id)
  values (pg_temp.lms_publication_id(27), pg_temp.lms_publication_id(10), 'Published by owner', true, pg_temp.lms_publication_id(1))$$,
  'the trusted Teach write supports publication by its verified workspace owner');
select results_eq($$with changed as (
  update public.workspace_user_groups set is_course_published = true
  where id = pg_temp.lms_publication_id(20) returning id
) select count(*) from changed$$, $$select 1::bigint$$, 'the trusted Teach write can publish an existing draft');

reset role;
set local role authenticated;
select pg_temp.lms_publication_actor(3);
select is(public.has_workspace_permission(pg_temp.lms_publication_id(10), auth.uid(), 'manage_courses'),
  true, 'an explicit owner-delegated role grants course management');
select lives_ok($$insert into public.workspace_user_groups_users (group_id, user_id, role)
  values (pg_temp.lms_publication_id(20), pg_temp.lms_publication_id(12), 'STUDENT')$$,
  'a delegated manager can add an enrollment directly');
select results_eq($$with changed as (
  update public.workspace_user_groups_users set role = 'TEACHER'
  where group_id = pg_temp.lms_publication_id(20) and user_id = pg_temp.lms_publication_id(12)
  returning role
) select role from changed$$, $$select 'TEACHER'::text$$,
  'a delegated manager can change an enrollment directly');
select results_eq($$with removed as (
  delete from public.workspace_user_groups_users
  where group_id = pg_temp.lms_publication_id(20) and user_id = pg_temp.lms_publication_id(12)
  returning user_id
) select user_id from removed$$, $$select pg_temp.lms_publication_id(12)$$,
  'a delegated manager can remove an enrollment directly');

reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select lives_ok($$insert into public.workspace_user_groups (id, ws_id, name, is_course_published, creator_id)
  values (pg_temp.lms_publication_id(28), pg_temp.lms_publication_id(10), 'Published by delegate', true, pg_temp.lms_publication_id(3))$$,
  'the trusted Teach write supports publication by its verified delegated manager');

reset role;
select is((select membership.role from public.workspace_user_groups_users as membership
  join public.workspace_user_linked_users as linked on linked.virtual_user_id = membership.user_id
  where membership.group_id = pg_temp.lms_publication_id(27)
    and linked.ws_id = pg_temp.lms_publication_id(10) and linked.platform_user_id = pg_temp.lms_publication_id(1)),
  'TEACHER', 'the owner retains the same-workspace creator teacher assignment');
select is((select membership.role from public.workspace_user_groups_users as membership
  join public.workspace_user_linked_users as linked on linked.virtual_user_id = membership.user_id
  where membership.group_id = pg_temp.lms_publication_id(28)
    and linked.ws_id = pg_temp.lms_publication_id(10) and linked.platform_user_id = pg_temp.lms_publication_id(3)),
  'TEACHER', 'an explicitly delegated manager retains the creator teacher assignment');
select ok(not exists (
  select 1 from (values ('anon'), ('authenticated'), ('service_role')) as callers(role_name)
  where has_function_privilege(role_name, 'public.handle_workspace_user_group_creator_assignment()', 'execute')
), 'API roles cannot invoke the creator trigger routine');

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select throws_ok($$select private.admin_update_workspace_user_group_with_audit_actor(
  pg_temp.lms_publication_id(10), pg_temp.lms_publication_id(29), '{"is_course_published":true}', pg_temp.lms_publication_id(2))$$,
  '42501', null, 'the Contacts writer denies publication for a default member');
select lives_ok($$select private.admin_update_workspace_user_group_with_audit_actor(
  pg_temp.lms_publication_id(10), pg_temp.lms_publication_id(29), '{"name":"Contacts draft renamed","is_course_published":false}', pg_temp.lms_publication_id(2))$$,
  'the Contacts writer preserves other edits and a repeated publication value');
select lives_ok($$select private.admin_update_workspace_user_group_with_audit_actor(
  pg_temp.lms_publication_id(10), pg_temp.lms_publication_id(29), '{"is_course_published":true}', pg_temp.lms_publication_id(3))$$,
  'the Contacts writer allows a verified delegated manager to publish');
select throws_ok($$select private.admin_update_workspace_user_group_with_audit_actor(
  pg_temp.lms_publication_id(10), pg_temp.lms_publication_id(29), '{"archived":true}', pg_temp.lms_publication_id(2))$$,
  '42501', null, 'the Contacts writer also protects the visibility of a published class');
select throws_ok($$select private.admin_delete_workspace_user_group_with_audit_actor(
  pg_temp.lms_publication_id(10), pg_temp.lms_publication_id(29), pg_temp.lms_publication_id(2))$$,
  '42501', null, 'the Contacts writer denies deletion of a published class by a default member');
select lives_ok($$select private.admin_delete_workspace_user_group_with_audit_actor(
  pg_temp.lms_publication_id(10), pg_temp.lms_publication_id(23), pg_temp.lms_publication_id(2))$$,
  'the existing Contacts draft deletion flow remains available');
select throws_ok($$select private.admin_upsert_workspace_user_group_members_with_audit_actor(
  pg_temp.lms_publication_id(10), pg_temp.lms_publication_id(29),
  array[pg_temp.lms_publication_id(12)], 'TEACHER', pg_temp.lms_publication_id(2))$$,
  '42501', null, 'the shared enrollment RPC denies a default member a teacher self-grant');
select throws_ok($$select private.admin_upsert_workspace_user_group_members_with_audit_actor(
  pg_temp.lms_publication_id(10), pg_temp.lms_publication_id(29),
  array[pg_temp.lms_publication_id(12)], 'TEACHER', null)$$,
  '42501', null, 'the shared enrollment RPC requires an attributed actor');
select lives_ok($$select private.admin_upsert_workspace_user_group_members_with_audit_actor(
  pg_temp.lms_publication_id(10), pg_temp.lms_publication_id(29),
  array[pg_temp.lms_publication_id(12)], 'STUDENT', pg_temp.lms_publication_id(3))$$,
  'a verified delegated manager can enroll a learner through the shared RPC');
select throws_ok($$select private.admin_delete_workspace_user_group_member_with_audit_actor(
  pg_temp.lms_publication_id(10), pg_temp.lms_publication_id(29),
  pg_temp.lms_publication_id(12), pg_temp.lms_publication_id(2))$$,
  '42501', null, 'the shared enrollment RPC denies removal by a default member');
select lives_ok($$select private.admin_delete_workspace_user_group_member_with_audit_actor(
  pg_temp.lms_publication_id(10), pg_temp.lms_publication_id(29),
  pg_temp.lms_publication_id(12), pg_temp.lms_publication_id(3))$$,
  'a verified delegated manager can remove an enrollment through the shared RPC');

select private.admin_upsert_workspace_user_group_members_with_audit_actor(
  pg_temp.lms_publication_id(10), pg_temp.lms_publication_id(22),
  array[pg_temp.lms_publication_id(12)], 'STUDENT', pg_temp.lms_publication_id(3));
select throws_ok($$select private.admin_delete_workspace_user_group_with_audit_actor(
  pg_temp.lms_publication_id(10), pg_temp.lms_publication_id(22), pg_temp.lms_publication_id(2))$$,
  '42501', null, 'Contacts cannot bypass enrollment permissions through a draft class cascade');

select * from finish();
rollback;
