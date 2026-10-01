-- Run ONLY on a parent-admitted disposable database with current migrations.
-- Board-share-only guest preference proof; no grants or schema changes.
-- This fixture is prepared but must not be claimed verified until admitted execution.
begin;
set local search_path = public, extensions;

select 'ASSERT 1: ' || (has_table_privilege('authenticated', 'public.user_configs', 'select'))::text || ' ' || 'authenticated can read own preference through RLS';
select 'ASSERT 2: ' || (has_table_privilege('authenticated', 'public.user_configs', 'insert,update,delete'))::text || ' ' || 'existing mutation privileges are present without expansion';
select 'ASSERT 3: ' || ((select relrowsecurity from pg_class where oid='public.user_configs'::regclass))::text || ' ' || 'RLS enabled';
insert into auth.users(id,aud,role,email,raw_app_meta_data,created_at,updated_at) values
 ('00000000-0000-4000-8000-000000009901','authenticated','authenticated','hidden-a@example.invalid','{}',now(),now()),
 ('00000000-0000-4000-8000-000000009902','authenticated','authenticated','hidden-b@example.invalid','{}',now(),now()),
 ('00000000-0000-4000-8000-000000009903','authenticated','authenticated','hidden-admin@example.invalid','{}',now(),now());
insert into public.users(id) values
 ('00000000-0000-4000-8000-000000009901'),
 ('00000000-0000-4000-8000-000000009902'),
 ('00000000-0000-4000-8000-000000009903') on conflict(id) do nothing;
insert into public.workspaces(id,name,personal,creator_id) values
 ('00000000-0000-4000-8000-000000009910','Synthetic Hidden privacy fixture',false,'00000000-0000-4000-8000-000000009903');
insert into public.workspace_members(ws_id,user_id,type) values
 ('00000000-0000-4000-8000-000000009910','00000000-0000-4000-8000-000000009903','MEMBER')
on conflict(ws_id,user_id) do update set type=excluded.type;
insert into public.workspace_roles(id,ws_id,name) values
 ('00000000-0000-4000-8000-000000009920','00000000-0000-4000-8000-000000009910','Synthetic workspace admin');
insert into public.workspace_role_permissions(ws_id,role_id,permission,enabled) values
 ('00000000-0000-4000-8000-000000009910','00000000-0000-4000-8000-000000009920','manage_workspace_roles',true);
insert into public.workspace_role_members(role_id,user_id) values
 ('00000000-0000-4000-8000-000000009920','00000000-0000-4000-8000-000000009903');
insert into public.workspace_boards(id,ws_id,name) values
 ('00000000-0000-4000-8000-000000009930','00000000-0000-4000-8000-000000009910','Synthetic guest board');
insert into public.task_board_shares(board_id,shared_with_user_id,permission,shared_by_user_id) values
 ('00000000-0000-4000-8000-000000009930','00000000-0000-4000-8000-000000009901','view','00000000-0000-4000-8000-000000009903'),
 ('00000000-0000-4000-8000-000000009930','00000000-0000-4000-8000-000000009902','edit','00000000-0000-4000-8000-000000009903');
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub','00000000-0000-4000-8000-000000009901','role','authenticated')::text,true);
select 'actor=' || auth.uid()::text || ', mfa-satisfied=' || public.account_required_mfa_satisfied()::text || ', canonical-member=' || exists(select 1 from public.workspace_members where ws_id='00000000-0000-4000-8000-000000009910' and user_id=auth.uid())::text;
insert into public.user_configs(user_id,id,value) values ('00000000-0000-4000-8000-000000009901','HIDDEN_WORKSPACE:00000000-0000-4000-8000-000000009910','true');
select 'ASSERT 4: true ' || 'A can hide privately';
select 'ASSERT 5: ' || (((select count(*)::int from public.user_configs where id='HIDDEN_WORKSPACE:00000000-0000-4000-8000-000000009910')) = 1)::text || ' ' || 'board-share guest A sees own Hidden preference';
select set_config('request.jwt.claims',jsonb_build_object('sub','00000000-0000-4000-8000-000000009902','role','authenticated')::text,true);
select 'actor=' || auth.uid()::text || ', mfa-satisfied=' || public.account_required_mfa_satisfied()::text || ', canonical-member=' || exists(select 1 from public.workspace_members where ws_id='00000000-0000-4000-8000-000000009910' and user_id=auth.uid())::text;
select 'ASSERT 6: ' || (((select count(*)::int from public.user_configs where id='HIDDEN_WORKSPACE:00000000-0000-4000-8000-000000009910')) = 0)::text || ' ' || 'board-share guest B cannot see A preference';
with changed as (update public.user_configs set value='false' where user_id='00000000-0000-4000-8000-000000009901' and id='HIDDEN_WORKSPACE:00000000-0000-4000-8000-000000009910' returning 1) select 'ASSERT 7: ' || ((select count(*)::int from changed) = 0)::text || ' ' || 'board-share guest B cannot modify A preference';
insert into public.user_configs(user_id,id,value) values ('00000000-0000-4000-8000-000000009902','HIDDEN_WORKSPACE:00000000-0000-4000-8000-000000009910','true');
select 'ASSERT 8: true ' || 'B can independently hide same workspace';
select set_config('request.jwt.claims',jsonb_build_object('sub','00000000-0000-4000-8000-000000009903','role','authenticated')::text,true);
select 'actor=' || auth.uid()::text || ', mfa-satisfied=' || public.account_required_mfa_satisfied()::text || ', canonical-member=' || exists(select 1 from public.workspace_members where ws_id='00000000-0000-4000-8000-000000009910' and user_id=auth.uid())::text;
select 'ASSERT 9: ' || (public.has_workspace_permission('00000000-0000-4000-8000-000000009910','00000000-0000-4000-8000-000000009903','manage_workspace_roles'))::text || ' ' || 'admin fixture actually has workspace administration permission';
select 'ASSERT 10: ' || (((select count(*)::int from public.user_configs where id='HIDDEN_WORKSPACE:00000000-0000-4000-8000-000000009910')) = 0)::text || ' ' || 'workspace admin cannot see A or B preferences';
with changed as (delete from public.user_configs where id='HIDDEN_WORKSPACE:00000000-0000-4000-8000-000000009910' returning 1) select 'ASSERT 11: ' || ((select count(*)::int from changed) = 0)::text || ' ' || 'workspace admin cannot restore A or B preferences';
do $$ begin begin insert into public.user_configs(user_id,id,value) values ('00000000-0000-4000-8000-000000009901','HIDDEN_WORKSPACE:00000000-0000-4000-8000-000000009910','false') on conflict(user_id,id) do update set value=excluded.value; exception when insufficient_privilege then return; end; raise exception 'Expected owner spoof denial'; end $$;
select 'ASSERT 12: true workspace admin cannot spoof preference owner';
select set_config('request.jwt.claims',jsonb_build_object('sub','00000000-0000-4000-8000-000000009901','role','authenticated')::text,true);
select 'actor=' || auth.uid()::text || ', mfa-satisfied=' || public.account_required_mfa_satisfied()::text || ', canonical-member=' || exists(select 1 from public.workspace_members where ws_id='00000000-0000-4000-8000-000000009910' and user_id=auth.uid())::text;
delete from public.user_configs where id='HIDDEN_WORKSPACE:00000000-0000-4000-8000-000000009910';
select 'ASSERT 13: true ' || 'A can restore own preference';
reset role;
select 'ASSERT 14: ' || (((select count(*)::int from public.user_configs where id='HIDDEN_WORKSPACE:00000000-0000-4000-8000-000000009910' and user_id='00000000-0000-4000-8000-000000009902')) = 1)::text || ' ' || 'A restore preserves B preference';
select 'ASSERT 15: ' || (((select count(*)::int from public.workspace_members where ws_id='00000000-0000-4000-8000-000000009910')) = 1)::text || ' ' || 'hide and restore preserve all memberships';
select 'ASSERT 16: ' || ((select count(*) from public.workspace_members where ws_id='00000000-0000-4000-8000-000000009910' and user_id in ('00000000-0000-4000-8000-000000009901','00000000-0000-4000-8000-000000009902')) = 0)::text || ' guests have no workspace membership';
select 'ASSERT 17: ' || ((select count(*) from public.task_board_shares where board_id='00000000-0000-4000-8000-000000009930') = 2)::text || ' canonical board shares preserved';
select 'STORAGE_METADATA: ' || jsonb_build_object(
  'tables', (select jsonb_agg(jsonb_build_object('name', relname, 'replicaIdentity', relreplident)) from pg_class where oid in ('public.user_configs'::regclass, 'public.user_workspace_configs'::regclass)),
  'publications', (select coalesce(jsonb_agg(jsonb_build_object('publication', pubname, 'table', tablename)), '[]'::jsonb) from pg_publication_tables where schemaname='public' and tablename in ('user_configs','user_workspace_configs')),
  'triggers', (select coalesce(jsonb_agg(jsonb_build_object('table', tgrelid::regclass::text, 'trigger', tgname)), '[]'::jsonb) from pg_trigger where tgrelid in ('public.user_configs'::regclass,'public.user_workspace_configs'::regclass) and not tgisinternal)
)::text;
rollback;
