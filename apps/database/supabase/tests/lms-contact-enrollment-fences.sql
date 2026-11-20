begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(17);

create function pg_temp.contact_fence_id(n integer) returns uuid
language sql immutable as $$
  select ('c1970000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;

insert into auth.users (id)
select pg_temp.contact_fence_id(n) from generate_series(1, 3) as n;

insert into public.workspaces (id, name, creator_id, personal)
values (pg_temp.contact_fence_id(10), 'Contact fences fixture', pg_temp.contact_fence_id(1), false);

insert into public.workspace_members (ws_id, user_id)
select pg_temp.contact_fence_id(10), pg_temp.contact_fence_id(n)
from generate_series(2, 3) as n on conflict do nothing;

-- Default members hold the ordinary admin grant in this fixture.
insert into public.workspace_default_permissions (ws_id, member_type, permission, enabled)
values (pg_temp.contact_fence_id(10), 'MEMBER', 'admin', true)
on conflict (ws_id, permission, member_type) do update set enabled = true;

insert into public.workspace_users (id, ws_id, display_name)
select pg_temp.contact_fence_id(n), pg_temp.contact_fence_id(10), 'Contact ' || n
from generate_series(20, 24) as n;

insert into public.workspace_roles (id, ws_id, name)
values (pg_temp.contact_fence_id(30), pg_temp.contact_fence_id(10), 'Delegated course manager');
insert into public.workspace_role_permissions (role_id, ws_id, permission, enabled)
values (pg_temp.contact_fence_id(30), pg_temp.contact_fence_id(10), 'manage_courses', true);
insert into public.workspace_role_members (role_id, user_id)
values (pg_temp.contact_fence_id(30), pg_temp.contact_fence_id(3));

insert into public.workspace_user_groups (id, ws_id, name, is_guest, is_course_published) values
  (pg_temp.contact_fence_id(40), pg_temp.contact_fence_id(10), 'Class', false, true),
  (pg_temp.contact_fence_id(41), pg_temp.contact_fence_id(10), 'Legacy guest course', true, true),
  (pg_temp.contact_fence_id(42), pg_temp.contact_fence_id(10), 'Ordinary guest group', true, false),
  (pg_temp.contact_fence_id(43), pg_temp.contact_fence_id(10), 'Course draft', true, false);
insert into public.workspace_course_modules (id, group_id, name, sort_key)
values (pg_temp.contact_fence_id(50), pg_temp.contact_fence_id(43), 'Draft lesson', 1);

insert into public.workspace_user_groups_users (group_id, user_id, role) values
  (pg_temp.contact_fence_id(40), pg_temp.contact_fence_id(20), 'TEACHER'),
  (pg_temp.contact_fence_id(40), pg_temp.contact_fence_id(23), 'STUDENT'),
  (pg_temp.contact_fence_id(41), pg_temp.contact_fence_id(22), 'STUDENT'),
  (pg_temp.contact_fence_id(42), pg_temp.contact_fence_id(22), 'TEACHER');

select ok(
  has_function_privilege('authenticated', 'public.merge_workspace_users_phase2(uuid,uuid,uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.merge_workspace_users_phase2(uuid,uuid,uuid)', 'EXECUTE')
  and not has_function_privilege('service_role',
    'private.merge_workspace_users_for_actor(uuid,uuid,uuid,uuid)', 'EXECUTE'),
  'Contacts retains signed-in merge access and the atomic helper stays internal'
);

set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', pg_temp.contact_fence_id(2), 'role', 'authenticated', 'aal', 'aal2'
)::text, true);
select ok(
  public.has_workspace_permission(pg_temp.contact_fence_id(10), auth.uid(), 'delete_users')
  and public.has_workspace_permission(pg_temp.contact_fence_id(10), auth.uid(), 'update_users')
  and not public.has_workspace_permission(pg_temp.contact_fence_id(10), auth.uid(), 'manage_courses'),
  'the default member can manage contacts but has no course grant'
);
select is(public.merge_workspace_users(
  pg_temp.contact_fence_id(20), pg_temp.contact_fence_id(21), pg_temp.contact_fence_id(10)
)->>'error', 'Permission denied: manage_courses required', 'the atomic merge denies moving a teacher');
select throws_ok($$select public.merge_workspace_users_phase2(
  pg_temp.contact_fence_id(20), pg_temp.contact_fence_id(21), pg_temp.contact_fence_id(10)
)$$, '42501', 'Permission denied: manage_courses required', 'phase 2 also denies moving a teacher');
select is((select count(*) from public.workspace_user_groups_users
  where user_id = pg_temp.contact_fence_id(20) and role = 'TEACHER'),
  1::bigint, 'denied merges preserve teacher membership on the source');
select is((public.merge_workspace_users(
  pg_temp.contact_fence_id(23), pg_temp.contact_fence_id(24), pg_temp.contact_fence_id(10)
)->>'success')::boolean, true, 'existing contact merges preserve ordinary student memberships');

select set_config('request.jwt.claims', jsonb_build_object(
  'sub', pg_temp.contact_fence_id(3), 'role', 'authenticated', 'aal', 'aal2'
)::text, true);
select is((public.merge_workspace_users(
  pg_temp.contact_fence_id(20), pg_temp.contact_fence_id(21), pg_temp.contact_fence_id(10)
)->>'success')::boolean, true, 'a delegated course manager can merge a teacher contact');
select is((select count(*) from public.workspace_user_groups_users
  where user_id = pg_temp.contact_fence_id(21) and role = 'TEACHER'),
  1::bigint, 'an authorized merge preserves the teacher role');

reset role;
select ok(not has_function_privilege('authenticated',
  'private.admin_sync_guest_group_memberships(uuid,uuid,uuid,boolean)', 'EXECUTE'),
  'guest synchronization requires a verified service caller');

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select ok(private.admin_sync_guest_group_memberships(pg_temp.contact_fence_id(10),
  pg_temp.contact_fence_id(21), pg_temp.contact_fence_id(2), true),
  'ordinary contact managers retain guest group enrollment');
select results_eq($$select group_id from public.workspace_user_groups_users
  where user_id = pg_temp.contact_fence_id(21) and group_id <> pg_temp.contact_fence_id(40)$$,
  $$select pg_temp.contact_fence_id(42)$$, 'ordinary guest sync skips published and draft courses');
select ok(private.admin_sync_guest_group_memberships(pg_temp.contact_fence_id(10),
  pg_temp.contact_fence_id(21), pg_temp.contact_fence_id(2), false),
  'ordinary contact managers can remove ordinary guest membership');
select is((select count(*) from public.workspace_user_groups_users
  where user_id = pg_temp.contact_fence_id(21) and group_id <> pg_temp.contact_fence_id(40)),
  0::bigint, 'ordinary guest unenrollment still removes ordinary guest membership');

select ok(private.admin_sync_guest_group_memberships(pg_temp.contact_fence_id(10),
  pg_temp.contact_fence_id(22), pg_temp.contact_fence_id(2), false),
  'guest removal can run with a protected membership present');
select is((select count(*) from public.workspace_user_groups_users
  where user_id = pg_temp.contact_fence_id(22)), 2::bigint,
  'ordinary guest removal preserves both published course enrollment and teacher roles');
select ok(private.admin_sync_guest_group_memberships(pg_temp.contact_fence_id(10),
  pg_temp.contact_fence_id(22), pg_temp.contact_fence_id(3), false),
  'a course manager may remove eligible guest memberships');
select is((select count(*) from public.workspace_user_groups_users
  where user_id = pg_temp.contact_fence_id(22)), 0::bigint,
  'delegated removal includes protected guest groups');

select * from finish();
rollback;
