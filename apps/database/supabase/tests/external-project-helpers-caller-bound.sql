begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values ('71190000-0000-4000-8000-000000000001', 'external-owner@example.com', now(), '{}', '{}'),
('71190000-0000-4000-8000-000000000002', 'external-other@example.com', now(), '{}', '{}');
insert into public.users(id) values ('71190000-0000-4000-8000-000000000001'), ('71190000-0000-4000-8000-000000000002') on conflict do nothing;
insert into public.workspaces(id, name, creator_id, personal)
values ('71190000-0000-4000-8000-000000000003', 'External scope', '71190000-0000-4000-8000-000000000001', false);
insert into public.workspaces(id, name, creator_id, personal)
values ('00000000-0000-0000-0000-000000000000', 'Root scope', '71190000-0000-4000-8000-000000000001', false)
on conflict (id) do nothing;
-- A temporary root-creator fixture exercises the positive root shortcut.
update public.workspaces set creator_id = '71190000-0000-4000-8000-000000000001'
where id = '00000000-0000-0000-0000-000000000000';
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"71190000-0000-4000-8000-000000000002"}';
select is(public.can_manage_workspace_external_projects('71190000-0000-4000-8000-000000000003','71190000-0000-4000-8000-000000000001'), false, 'management cannot impersonate owner');
select is(public.can_publish_workspace_external_projects('71190000-0000-4000-8000-000000000003','71190000-0000-4000-8000-000000000001'), false, 'publishing cannot impersonate owner');
select is(public.is_root_external_project_admin('71190000-0000-4000-8000-000000000001'), false, 'root helper cannot impersonate owner');
set local request.jwt.claims = '{"role":"authenticated","sub":"71190000-0000-4000-8000-000000000001"}';
select ok(public.can_manage_workspace_external_projects('71190000-0000-4000-8000-000000000003',auth.uid()), 'owner management works');
select ok(public.can_publish_workspace_external_projects('71190000-0000-4000-8000-000000000003',auth.uid()), 'nested publishing to management works');
select ok(public.is_root_external_project_admin(auth.uid()), 'root creator works');
reset role;
set local request.jwt.claims = '{"role":"anon"}';
select is(public.can_manage_workspace_external_projects('71190000-0000-4000-8000-000000000003','71190000-0000-4000-8000-000000000001'), false, 'anon cannot evaluate can_manage_workspace_external_projects');
select is(public.can_publish_workspace_external_projects('71190000-0000-4000-8000-000000000003','71190000-0000-4000-8000-000000000001'), false, 'anon cannot evaluate can_publish_workspace_external_projects');
select is(public.is_root_external_project_admin('71190000-0000-4000-8000-000000000001'), false, 'anon cannot evaluate is_root_external_project_admin');
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select is(public.can_manage_workspace_external_projects('71190000-0000-4000-8000-000000000003','71190000-0000-4000-8000-000000000001'), true, 'service role can evaluate can_manage_workspace_external_projects');
select is(public.can_publish_workspace_external_projects('71190000-0000-4000-8000-000000000003','71190000-0000-4000-8000-000000000001'), true, 'service role can evaluate can_publish_workspace_external_projects');
select is(public.is_root_external_project_admin('71190000-0000-4000-8000-000000000001'), true, 'service role can evaluate is_root_external_project_admin');
reset role;
select * from finish();
rollback;
