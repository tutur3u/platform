-- Run ONLY on a parent-admitted disposable database with current migrations.
-- No grants, schema changes, shared/production writes or real user actions.
\set ON_ERROR_STOP on
begin;
-- Each assertion raises on false/NULL; no helper function or grant is installed.

set local search_path = public, extensions;

do $assert$
declare check_result text;
begin
  select 'ASSERT 1: ' || (has_table_privilege('authenticated', 'public.user_workspace_configs', 'select'))::text || ' ' || 'authenticated can read own preference through RLS' into check_result;
  if check_result is null or check_result !~ '^ASSERT [0-9]+: true( |$)' then
    raise exception 'Hidden workspace verification failed: %', check_result;
  end if;
  raise notice '%', check_result;
end;
$assert$;
do $assert$
declare check_result text;
begin
  select 'ASSERT 2: ' || (has_table_privilege('authenticated', 'public.user_workspace_configs', 'insert,update,delete'))::text || ' ' || 'existing mutation privileges are present without expansion' into check_result;
  if check_result is null or check_result !~ '^ASSERT [0-9]+: true( |$)' then
    raise exception 'Hidden workspace verification failed: %', check_result;
  end if;
  raise notice '%', check_result;
end;
$assert$;
do $assert$
declare check_result text;
begin
  select 'ASSERT 3: ' || ((select relrowsecurity from pg_class where oid='public.user_workspace_configs'::regclass))::text || ' ' || 'RLS enabled' into check_result;
  if check_result is null or check_result !~ '^ASSERT [0-9]+: true( |$)' then
    raise exception 'Hidden workspace verification failed: %', check_result;
  end if;
  raise notice '%', check_result;
end;
$assert$;
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
 ('00000000-0000-4000-8000-000000009910','00000000-0000-4000-8000-000000009901','MEMBER'),
 ('00000000-0000-4000-8000-000000009910','00000000-0000-4000-8000-000000009902','MEMBER'),
 ('00000000-0000-4000-8000-000000009910','00000000-0000-4000-8000-000000009903','MEMBER')
on conflict(ws_id,user_id) do update set type=excluded.type;
insert into public.workspace_roles(id,ws_id,name) values
 ('00000000-0000-4000-8000-000000009920','00000000-0000-4000-8000-000000009910','Synthetic workspace admin');
insert into public.workspace_role_permissions(ws_id,role_id,permission,enabled) values
 ('00000000-0000-4000-8000-000000009910','00000000-0000-4000-8000-000000009920','manage_workspace_roles',true);
insert into public.workspace_role_members(role_id,user_id) values
 ('00000000-0000-4000-8000-000000009920','00000000-0000-4000-8000-000000009903');
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub','00000000-0000-4000-8000-000000009901','role','authenticated')::text,true);
select 'actor=' || auth.uid()::text || ', mfa-satisfied=' || public.account_required_mfa_satisfied()::text || ', canonical-member=' || exists(select 1 from public.workspace_members where ws_id='00000000-0000-4000-8000-000000009910' and user_id=auth.uid())::text;
insert into public.user_workspace_configs(user_id,ws_id,id,value) values ('00000000-0000-4000-8000-000000009901','00000000-0000-4000-8000-000000009910','HIDDEN_WORKSPACE','true');
do $assert$
declare check_result text;
begin
  select 'ASSERT 4: true ' || 'A can hide privately' into check_result;
  if check_result is null or check_result !~ '^ASSERT [0-9]+: true( |$)' then
    raise exception 'Hidden workspace verification failed: %', check_result;
  end if;
  raise notice '%', check_result;
end;
$assert$;
do $assert$
declare check_result text;
begin
  select 'ASSERT 5: ' || (((select count(*)::int from public.user_workspace_configs where id='HIDDEN_WORKSPACE')) = 1)::text || ' ' || 'A sees own Hidden preference' into check_result;
  if check_result is null or check_result !~ '^ASSERT [0-9]+: true( |$)' then
    raise exception 'Hidden workspace verification failed: %', check_result;
  end if;
  raise notice '%', check_result;
end;
$assert$;
select set_config('request.jwt.claims',jsonb_build_object('sub','00000000-0000-4000-8000-000000009902','role','authenticated')::text,true);
select 'actor=' || auth.uid()::text || ', mfa-satisfied=' || public.account_required_mfa_satisfied()::text || ', canonical-member=' || exists(select 1 from public.workspace_members where ws_id='00000000-0000-4000-8000-000000009910' and user_id=auth.uid())::text;
do $assert$
declare check_result text;
begin
  select 'ASSERT 6: ' || (((select count(*)::int from public.user_workspace_configs where id='HIDDEN_WORKSPACE')) = 0)::text || ' ' || 'ordinary member B cannot see A preference' into check_result;
  if check_result is null or check_result !~ '^ASSERT [0-9]+: true( |$)' then
    raise exception 'Hidden workspace verification failed: %', check_result;
  end if;
  raise notice '%', check_result;
end;
$assert$;
do $assert$
declare check_result text;
begin
  with changed as (update public.user_workspace_configs set value='false' where user_id='00000000-0000-4000-8000-000000009901' and id='HIDDEN_WORKSPACE' returning 1) select 'ASSERT 7: ' || ((select count(*)::int from changed) = 0)::text || ' ' || 'ordinary member B cannot modify A preference' into check_result;
  if check_result is null or check_result !~ '^ASSERT [0-9]+: true( |$)' then
    raise exception 'Hidden workspace verification failed: %', check_result;
  end if;
  raise notice '%', check_result;
end;
$assert$;
insert into public.user_workspace_configs(user_id,ws_id,id,value) values ('00000000-0000-4000-8000-000000009902','00000000-0000-4000-8000-000000009910','HIDDEN_WORKSPACE','true');
do $assert$
declare check_result text;
begin
  select 'ASSERT 8: true ' || 'B can independently hide same workspace' into check_result;
  if check_result is null or check_result !~ '^ASSERT [0-9]+: true( |$)' then
    raise exception 'Hidden workspace verification failed: %', check_result;
  end if;
  raise notice '%', check_result;
end;
$assert$;
select set_config('request.jwt.claims',jsonb_build_object('sub','00000000-0000-4000-8000-000000009903','role','authenticated')::text,true);
select 'actor=' || auth.uid()::text || ', mfa-satisfied=' || public.account_required_mfa_satisfied()::text || ', canonical-member=' || exists(select 1 from public.workspace_members where ws_id='00000000-0000-4000-8000-000000009910' and user_id=auth.uid())::text;
do $assert$
declare check_result text;
begin
  select 'ASSERT 9: ' || (public.has_workspace_permission('00000000-0000-4000-8000-000000009910','00000000-0000-4000-8000-000000009903','manage_workspace_roles'))::text || ' ' || 'admin fixture actually has workspace administration permission' into check_result;
  if check_result is null or check_result !~ '^ASSERT [0-9]+: true( |$)' then
    raise exception 'Hidden workspace verification failed: %', check_result;
  end if;
  raise notice '%', check_result;
end;
$assert$;
do $assert$
declare check_result text;
begin
  select 'ASSERT 10: ' || (((select count(*)::int from public.user_workspace_configs where id='HIDDEN_WORKSPACE')) = 0)::text || ' ' || 'workspace admin cannot see A or B preferences' into check_result;
  if check_result is null or check_result !~ '^ASSERT [0-9]+: true( |$)' then
    raise exception 'Hidden workspace verification failed: %', check_result;
  end if;
  raise notice '%', check_result;
end;
$assert$;
do $assert$
declare check_result text;
begin
  with changed as (delete from public.user_workspace_configs where id='HIDDEN_WORKSPACE' returning 1) select 'ASSERT 11: ' || ((select count(*)::int from changed) = 0)::text || ' ' || 'workspace admin cannot restore A or B preferences' into check_result;
  if check_result is null or check_result !~ '^ASSERT [0-9]+: true( |$)' then
    raise exception 'Hidden workspace verification failed: %', check_result;
  end if;
  raise notice '%', check_result;
end;
$assert$;
do $$ begin begin insert into public.user_workspace_configs(user_id,ws_id,id,value) values ('00000000-0000-4000-8000-000000009901','00000000-0000-4000-8000-000000009910','HIDDEN_WORKSPACE','false') on conflict(user_id,ws_id,id) do update set value=excluded.value; exception when insufficient_privilege then return; end; raise exception 'Expected owner spoof denial'; end $$;
do $assert$
declare check_result text;
begin
  select 'ASSERT 12: true workspace admin cannot spoof preference owner' into check_result;
  if check_result is null or check_result !~ '^ASSERT [0-9]+: true( |$)' then
    raise exception 'Hidden workspace verification failed: %', check_result;
  end if;
  raise notice '%', check_result;
end;
$assert$;
select set_config('request.jwt.claims',jsonb_build_object('sub','00000000-0000-4000-8000-000000009901','role','authenticated')::text,true);
select 'actor=' || auth.uid()::text || ', mfa-satisfied=' || public.account_required_mfa_satisfied()::text || ', canonical-member=' || exists(select 1 from public.workspace_members where ws_id='00000000-0000-4000-8000-000000009910' and user_id=auth.uid())::text;
delete from public.user_workspace_configs where id='HIDDEN_WORKSPACE';
do $assert$
declare check_result text;
begin
  select 'ASSERT 13: ' || (not exists(select 1 from public.user_workspace_configs where user_id=auth.uid() and ws_id='00000000-0000-4000-8000-000000009910' and id='HIDDEN_WORKSPACE'))::text || ' A can restore own preference' into check_result;
  if check_result is null or check_result !~ '^ASSERT [0-9]+: true( |$)' then
    raise exception 'Hidden workspace verification failed: %', check_result;
  end if;
  raise notice '%', check_result;
end;
$assert$;
reset role;
do $assert$
declare check_result text;
begin
  select 'ASSERT 14: ' || (((select count(*)::int from public.user_workspace_configs where id='HIDDEN_WORKSPACE' and user_id='00000000-0000-4000-8000-000000009902')) = 1)::text || ' ' || 'A restore preserves B preference' into check_result;
  if check_result is null or check_result !~ '^ASSERT [0-9]+: true( |$)' then
    raise exception 'Hidden workspace verification failed: %', check_result;
  end if;
  raise notice '%', check_result;
end;
$assert$;
do $assert$
declare check_result text;
begin
  select 'ASSERT 15: ' || (((select count(*)::int from public.workspace_members where ws_id='00000000-0000-4000-8000-000000009910')) = 3)::text || ' ' || 'hide and restore preserve all memberships' into check_result;
  if check_result is null or check_result !~ '^ASSERT [0-9]+: true( |$)' then
    raise exception 'Hidden workspace verification failed: %', check_result;
  end if;
  raise notice '%', check_result;
end;
$assert$;
rollback;
