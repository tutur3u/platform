-- Run ONLY on a parent-admitted disposable database with current migrations.
-- Board-share-only guest preference proof; no grants or schema changes.
-- Includes controlled synthetic lifecycle setup and server-owner cleanup.
-- Claim verified only with the exact applied fixture hash and admitted run report.
\set ON_ERROR_STOP on
begin;
-- Each assertion raises on false/NULL; no helper function or grant is installed.

set local search_path = public, extensions;

do $assert$
declare check_result text;
begin
  select 'ASSERT 1: ' || (has_table_privilege('authenticated', 'public.user_configs', 'select'))::text || ' ' || 'authenticated can read own preference through RLS' into check_result;
  if check_result is null or check_result !~ '^ASSERT [0-9]+: true( |$)' then
    raise exception 'Hidden workspace verification failed: %', check_result;
  end if;
  raise notice '%', check_result;
end;
$assert$;
do $assert$
declare check_result text;
begin
  select 'ASSERT 2: ' || (has_table_privilege('authenticated', 'public.user_configs', 'insert,update,delete'))::text || ' ' || 'existing mutation privileges are present without expansion' into check_result;
  if check_result is null or check_result !~ '^ASSERT [0-9]+: true( |$)' then
    raise exception 'Hidden workspace verification failed: %', check_result;
  end if;
  raise notice '%', check_result;
end;
$assert$;
do $assert$
declare check_result text;
begin
  select 'ASSERT 3: ' || ((select relrowsecurity from pg_class where oid='public.user_configs'::regclass))::text || ' ' || 'RLS enabled' into check_result;
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
do $event_snapshot$
declare item record; total bigint; counts jsonb := '{}'::jsonb;
begin
  for item in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p') and c.relname ~ '(audit|activity|notification)'
  loop
    execute format('select count(*) from public.%I',item.relname) into total;
    counts := counts || jsonb_build_object(item.relname,total);
  end loop;
  perform set_config('hidden_fixture.events_before',counts::text,true);
end $event_snapshot$;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub','00000000-0000-4000-8000-000000009901','role','authenticated')::text,true);
select 'actor=' || auth.uid()::text || ', mfa-satisfied=' || public.account_required_mfa_satisfied()::text || ', canonical-member=' || exists(select 1 from public.workspace_members where ws_id='00000000-0000-4000-8000-000000009910' and user_id=auth.uid())::text;
insert into public.user_configs(user_id,id,value) values ('00000000-0000-4000-8000-000000009901','HIDDEN_WORKSPACE:00000000-0000-4000-8000-000000009910','true');
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
  select 'ASSERT 5: ' || (((select count(*)::int from public.user_configs where id='HIDDEN_WORKSPACE:00000000-0000-4000-8000-000000009910')) = 1)::text || ' ' || 'board-share guest A sees own Hidden preference' into check_result;
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
  select 'ASSERT 6: ' || (((select count(*)::int from public.user_configs where id='HIDDEN_WORKSPACE:00000000-0000-4000-8000-000000009910')) = 0)::text || ' ' || 'board-share guest B cannot see A preference' into check_result;
  if check_result is null or check_result !~ '^ASSERT [0-9]+: true( |$)' then
    raise exception 'Hidden workspace verification failed: %', check_result;
  end if;
  raise notice '%', check_result;
end;
$assert$;
do $assert$
declare check_result text;
begin
  with changed as (update public.user_configs set value='false' where user_id='00000000-0000-4000-8000-000000009901' and id='HIDDEN_WORKSPACE:00000000-0000-4000-8000-000000009910' returning 1) select 'ASSERT 7: ' || ((select count(*)::int from changed) = 0)::text || ' ' || 'board-share guest B cannot modify A preference' into check_result;
  if check_result is null or check_result !~ '^ASSERT [0-9]+: true( |$)' then
    raise exception 'Hidden workspace verification failed: %', check_result;
  end if;
  raise notice '%', check_result;
end;
$assert$;
insert into public.user_configs(user_id,id,value) values ('00000000-0000-4000-8000-000000009902','HIDDEN_WORKSPACE:00000000-0000-4000-8000-000000009910','true');
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
  select 'ASSERT 10: ' || (((select count(*)::int from public.user_configs where id='HIDDEN_WORKSPACE:00000000-0000-4000-8000-000000009910')) = 0)::text || ' ' || 'workspace admin cannot see A or B preferences' into check_result;
  if check_result is null or check_result !~ '^ASSERT [0-9]+: true( |$)' then
    raise exception 'Hidden workspace verification failed: %', check_result;
  end if;
  raise notice '%', check_result;
end;
$assert$;
do $assert$
declare check_result text;
begin
  with changed as (delete from public.user_configs where id='HIDDEN_WORKSPACE:00000000-0000-4000-8000-000000009910' returning 1) select 'ASSERT 11: ' || ((select count(*)::int from changed) = 0)::text || ' ' || 'workspace admin cannot restore A or B preferences' into check_result;
  if check_result is null or check_result !~ '^ASSERT [0-9]+: true( |$)' then
    raise exception 'Hidden workspace verification failed: %', check_result;
  end if;
  raise notice '%', check_result;
end;
$assert$;
do $$ begin begin insert into public.user_configs(user_id,id,value) values ('00000000-0000-4000-8000-000000009901','HIDDEN_WORKSPACE:00000000-0000-4000-8000-000000009910','false') on conflict(user_id,id) do update set value=excluded.value; exception when insufficient_privilege then return; end; raise exception 'Expected owner spoof denial'; end $$;
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
delete from public.user_configs where id='HIDDEN_WORKSPACE:00000000-0000-4000-8000-000000009910';
do $assert$
declare check_result text;
begin
  select 'ASSERT 13: true ' || 'A can restore own preference' into check_result;
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
  select 'ASSERT 14: ' || (((select count(*)::int from public.user_configs where id='HIDDEN_WORKSPACE:00000000-0000-4000-8000-000000009910' and user_id='00000000-0000-4000-8000-000000009902')) = 1)::text || ' ' || 'A restore preserves B preference' into check_result;
  if check_result is null or check_result !~ '^ASSERT [0-9]+: true( |$)' then
    raise exception 'Hidden workspace verification failed: %', check_result;
  end if;
  raise notice '%', check_result;
end;
$assert$;
do $assert$
declare check_result text;
begin
  select 'ASSERT 15: ' || (((select count(*)::int from public.workspace_members where ws_id='00000000-0000-4000-8000-000000009910')) = 1)::text || ' ' || 'hide and restore preserve all memberships' into check_result;
  if check_result is null or check_result !~ '^ASSERT [0-9]+: true( |$)' then
    raise exception 'Hidden workspace verification failed: %', check_result;
  end if;
  raise notice '%', check_result;
end;
$assert$;
do $assert$
declare check_result text;
begin
  select 'ASSERT 16: ' || ((select count(*) from public.workspace_members where ws_id='00000000-0000-4000-8000-000000009910' and user_id in ('00000000-0000-4000-8000-000000009901','00000000-0000-4000-8000-000000009902')) = 0)::text || ' guests have no workspace membership' into check_result;
  if check_result is null or check_result !~ '^ASSERT [0-9]+: true( |$)' then
    raise exception 'Hidden workspace verification failed: %', check_result;
  end if;
  raise notice '%', check_result;
end;
$assert$;
do $assert$
declare check_result text;
begin
  select 'ASSERT 17: ' || ((select count(*) from public.task_board_shares where board_id='00000000-0000-4000-8000-000000009930') = 2)::text || ' canonical board shares preserved' into check_result;
  if check_result is null or check_result !~ '^ASSERT [0-9]+: true( |$)' then
    raise exception 'Hidden workspace verification failed: %', check_result;
  end if;
  raise notice '%', check_result;
end;
$assert$;
do $event_snapshot$
declare item record; total bigint; counts jsonb := '{}'::jsonb;
begin
  for item in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p') and c.relname ~ '(audit|activity|notification)'
  loop
    execute format('select count(*) from public.%I',item.relname) into total;
    counts := counts || jsonb_build_object(item.relname,total);
  end loop;
  perform set_config('hidden_fixture.events_after',counts::text,true);
end $event_snapshot$;
select 'HIDDEN_EVENT_COUNTS: ' || jsonb_build_object(
  'before',current_setting('hidden_fixture.events_before')::jsonb,
  'after',current_setting('hidden_fixture.events_after')::jsonb,
  'unchanged',current_setting('hidden_fixture.events_before')::jsonb=current_setting('hidden_fixture.events_after')::jsonb
)::text;

-- Fixture lifecycle: a board-share guest becomes a member. These controlled
-- membership setup operations are outside the Hidden mutations being verified.
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub','00000000-0000-4000-8000-000000009901','role','authenticated')::text,true);
insert into public.user_configs(user_id,id,value) values ('00000000-0000-4000-8000-000000009901','HIDDEN_WORKSPACE:00000000-0000-4000-8000-000000009910','true');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub','00000000-0000-4000-8000-000000009903','role','authenticated')::text,true);
insert into public.workspace_members(ws_id,user_id,type) values ('00000000-0000-4000-8000-000000009910','00000000-0000-4000-8000-000000009901','MEMBER');
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub','00000000-0000-4000-8000-000000009901','role','authenticated')::text,true);
do $assert$
declare check_result text;
begin
  select 'ASSERT 18: ' || public.account_required_mfa_satisfied()::text || ' member transition uses genuine actor with satisfied MFA' into check_result;
  if check_result is null or check_result !~ '^ASSERT [0-9]+: true( |$)' then
    raise exception 'Hidden workspace verification failed: %', check_result;
  end if;
  raise notice '%', check_result;
end;
$assert$;
insert into public.user_workspace_configs(user_id,ws_id,id,value) values ('00000000-0000-4000-8000-000000009901','00000000-0000-4000-8000-000000009910','HIDDEN_WORKSPACE','true');
delete from public.user_configs where user_id=auth.uid() and id='HIDDEN_WORKSPACE:00000000-0000-4000-8000-000000009910';
delete from public.user_workspace_configs where user_id=auth.uid() and ws_id='00000000-0000-4000-8000-000000009910' and id='HIDDEN_WORKSPACE';
do $assert$
declare check_result text;
begin
  select 'ASSERT 19: ' || ((select count(*) from public.user_configs where id='HIDDEN_WORKSPACE:00000000-0000-4000-8000-000000009910') + (select count(*) from public.user_workspace_configs where ws_id='00000000-0000-4000-8000-000000009910' and id='HIDDEN_WORKSPACE') = 0)::text || ' guest-to-member restore removes both own preferences through owner RLS' into check_result;
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
  select 'ASSERT 20: ' || ((select count(*) from public.workspace_members where ws_id='00000000-0000-4000-8000-000000009910') = 2 and (select count(*) from public.user_configs where user_id='00000000-0000-4000-8000-000000009902' and id='HIDDEN_WORKSPACE:00000000-0000-4000-8000-000000009910') = 1)::text || ' restore preserves memberships and other guest preference' into check_result;
  if check_result is null or check_result !~ '^ASSERT [0-9]+: true( |$)' then
    raise exception 'Hidden workspace verification failed: %', check_result;
  end if;
  raise notice '%', check_result;
end;
$assert$;

-- The member hides, then loses membership through fixture admin setup while the
-- live board share remains. Direct owner RLS cannot remove the stale member row.
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub','00000000-0000-4000-8000-000000009901','role','authenticated')::text,true);
insert into public.user_workspace_configs(user_id,ws_id,id,value) values ('00000000-0000-4000-8000-000000009901','00000000-0000-4000-8000-000000009910','HIDDEN_WORKSPACE','true');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub','00000000-0000-4000-8000-000000009903','role','authenticated')::text,true);
delete from public.workspace_members where ws_id='00000000-0000-4000-8000-000000009910' and user_id='00000000-0000-4000-8000-000000009901';
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub','00000000-0000-4000-8000-000000009901','role','authenticated')::text,true);
insert into public.user_configs(user_id,id,value) values ('00000000-0000-4000-8000-000000009901','HIDDEN_WORKSPACE:00000000-0000-4000-8000-000000009910','true');
with removed as (delete from public.user_workspace_configs where user_id=auth.uid() and ws_id='00000000-0000-4000-8000-000000009910' and id='HIDDEN_WORKSPACE' returning 1)
do $assert$
declare check_result text;
begin
  select 'ASSERT 21: ' || ((select count(*) from removed) = 0)::text || ' genuine guest RLS cannot remove stale membership preference' into check_result;
  if check_result is null or check_result !~ '^ASSERT [0-9]+: true( |$)' then
    raise exception 'Hidden workspace verification failed: %', check_result;
  end if;
  raise notice '%', check_result;
end;
$assert$;
reset role;
set local role service_role;
select set_config('request.jwt.claims',jsonb_build_object('sub','00000000-0000-4000-8000-000000009901','role','service_role')::text,true);
do $assert$
declare check_result text;
begin
  select 'ASSERT 22: ' || (exists(select 1 from public.task_board_shares s join public.workspace_boards b on b.id=s.board_id where s.shared_with_user_id=auth.uid() and s.permission in ('view','edit') and b.ws_id='00000000-0000-4000-8000-000000009910' and b.deleted_at is null) and not exists(select 1 from public.workspace_members where ws_id='00000000-0000-4000-8000-000000009910' and user_id=auth.uid()))::text || ' server actor has current live board share without membership' into check_result;
  if check_result is null or check_result !~ '^ASSERT [0-9]+: true( |$)' then
    raise exception 'Hidden workspace verification failed: %', check_result;
  end if;
  raise notice '%', check_result;
end;
$assert$;
-- Same exact actor/workspace/key filtering as the authorized API cleanup.
delete from public.user_configs where user_id=auth.uid() and id='HIDDEN_WORKSPACE:00000000-0000-4000-8000-000000009910';
delete from public.user_workspace_configs where user_id=auth.uid() and ws_id='00000000-0000-4000-8000-000000009910' and id='HIDDEN_WORKSPACE';
do $assert$
declare check_result text;
begin
  select 'ASSERT 23: ' || ((select count(*) from public.user_configs where user_id=auth.uid() and id='HIDDEN_WORKSPACE:00000000-0000-4000-8000-000000009910') + (select count(*) from public.user_workspace_configs where user_id=auth.uid() and ws_id='00000000-0000-4000-8000-000000009910' and id='HIDDEN_WORKSPACE') = 0)::text || ' member-to-board-guest restore leaves owner GET empty in admin-backed session' into check_result;
  if check_result is null or check_result !~ '^ASSERT [0-9]+: true( |$)' then
    raise exception 'Hidden workspace verification failed: %', check_result;
  end if;
  raise notice '%', check_result;
end;
$assert$;
do $assert$
declare check_result text;
begin
  select 'ASSERT 24: ' || ((select count(*) from public.workspace_members where ws_id='00000000-0000-4000-8000-000000009910') = 1 and (select count(*) from public.user_configs where user_id='00000000-0000-4000-8000-000000009902' and id='HIDDEN_WORKSPACE:00000000-0000-4000-8000-000000009910') = 1)::text || ' narrow server cleanup preserves membership count and other owner' into check_result;
  if check_result is null or check_result !~ '^ASSERT [0-9]+: true( |$)' then
    raise exception 'Hidden workspace verification failed: %', check_result;
  end if;
  raise notice '%', check_result;
end;
$assert$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub','00000000-0000-4000-8000-000000009903','role','authenticated')::text,true);
insert into public.workspace_members(ws_id,user_id,type) values ('00000000-0000-4000-8000-000000009910','00000000-0000-4000-8000-000000009901','MEMBER');
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub','00000000-0000-4000-8000-000000009901','role','authenticated')::text,true);
do $assert$
declare check_result text;
begin
  select 'ASSERT 25: ' || ((select count(*) from public.user_configs where id='HIDDEN_WORKSPACE:00000000-0000-4000-8000-000000009910') + (select count(*) from public.user_workspace_configs where ws_id='00000000-0000-4000-8000-000000009910' and id='HIDDEN_WORKSPACE') = 0)::text || ' restored owner remains visible after membership returns' into check_result;
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
  select 'ASSERT 26: ' || ((select count(*) from public.task_board_shares where board_id='00000000-0000-4000-8000-000000009930') = 2)::text || ' restore transitions preserve canonical board shares' into check_result;
  if check_result is null or check_result !~ '^ASSERT [0-9]+: true( |$)' then
    raise exception 'Hidden workspace verification failed: %', check_result;
  end if;
  raise notice '%', check_result;
end;
$assert$;
select 'STORAGE_METADATA: ' || jsonb_build_object(
  'tables', (select jsonb_agg(jsonb_build_object('name', relname, 'replicaIdentity', relreplident)) from pg_class where oid in ('public.user_configs'::regclass, 'public.user_workspace_configs'::regclass)),
  'publications', (select coalesce(jsonb_agg(jsonb_build_object('publication', pubname, 'table', tablename)), '[]'::jsonb) from pg_publication_tables where schemaname='public' and tablename in ('user_configs','user_workspace_configs')),
  'triggers', (select coalesce(jsonb_agg(jsonb_build_object('table', tgrelid::regclass::text, 'trigger', tgname, 'function', tgfoid::regprocedure::text)), '[]'::jsonb) from pg_trigger where tgrelid in ('public.user_configs'::regclass,'public.user_workspace_configs'::regclass) and not tgisinternal)
)::text;
rollback;
