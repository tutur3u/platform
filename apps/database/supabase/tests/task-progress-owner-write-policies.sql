begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(24);

-- Owner (a), a second workspace member (b) and a non-member (c).
insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
  ('7a5c0000-0000-4000-8000-00000000000a', 'task-progress-owner@example.test', now(), '{}', '{}'),
  ('7a5c0000-0000-4000-8000-00000000000b', 'task-progress-member@example.test', now(), '{}', '{}'),
  ('7a5c0000-0000-4000-8000-00000000000c', 'task-progress-outsider@example.test', now(), '{}', '{}');

insert into public.workspaces (id, name, personal, creator_id) values
  ('7a5c0000-0000-4000-8000-0000000000a1', 'Task progress policies', false,
   '7a5c0000-0000-4000-8000-00000000000a');
insert into public.workspace_members (ws_id, user_id, type) values
  ('7a5c0000-0000-4000-8000-0000000000a1', '7a5c0000-0000-4000-8000-00000000000a', 'MEMBER'),
  ('7a5c0000-0000-4000-8000-0000000000a1', '7a5c0000-0000-4000-8000-00000000000b', 'MEMBER')
on conflict do nothing;

insert into public.task_progress_metrics (id, ws_id, name, unit_label, created_by) values
  ('7a5c0000-0000-4000-8000-0000000000b1', '7a5c0000-0000-4000-8000-0000000000a1',
   'Owner metric', 'tasks', '7a5c0000-0000-4000-8000-00000000000a'),
  ('7a5c0000-0000-4000-8000-0000000000b2', '7a5c0000-0000-4000-8000-0000000000a1',
   'Spare metric', 'tasks', '7a5c0000-0000-4000-8000-00000000000a');
insert into public.task_progress_goals (id, ws_id, owner_id, metric_id, name, target_value, period_start, visibility) values
  ('7a5c0000-0000-4000-8000-0000000000c1', '7a5c0000-0000-4000-8000-0000000000a1',
   '7a5c0000-0000-4000-8000-00000000000a', '7a5c0000-0000-4000-8000-0000000000b1',
   'Owner goal', 10, current_date, 'workspace');
insert into public.task_leaderboards (id, ws_id, metric_id, name, period_start, created_by) values
  ('7a5c0000-0000-4000-8000-0000000000d1', '7a5c0000-0000-4000-8000-0000000000a1',
   '7a5c0000-0000-4000-8000-0000000000b1', 'Owner leaderboard', current_date,
   '7a5c0000-0000-4000-8000-00000000000a');

-- Runs one statement as the user under RLS and returns its scalar result,
-- 'ok', or the SQLSTATE it raised.
create function pg_temp.as_user(p_user uuid, p_sql text) returns text
language plpgsql as $$
declare r text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    if p_sql ~* '^\s*(select|with)' then execute p_sql into r; else execute p_sql; end if;
    r := coalesce(r, 'ok');
  exception when others then r := sqlstate;
  end;
  execute 'reset role';
  return r;
end $$;

-- Other members keep read access.
select is(pg_temp.as_user('7a5c0000-0000-4000-8000-00000000000b',
  $$select count(*)::text from public.task_progress_metrics where ws_id = '7a5c0000-0000-4000-8000-0000000000a1'$$),
  '2', 'members read every workspace metric');
select is(pg_temp.as_user('7a5c0000-0000-4000-8000-00000000000b',
  $$select count(*)::text from public.task_progress_goals where id = '7a5c0000-0000-4000-8000-0000000000c1'$$),
  '1', 'members read another member''s goal');
select is(pg_temp.as_user('7a5c0000-0000-4000-8000-00000000000b',
  $$select count(*)::text from public.task_leaderboards where id = '7a5c0000-0000-4000-8000-0000000000d1'$$),
  '1', 'members read another member''s leaderboard');
select is(pg_temp.as_user('7a5c0000-0000-4000-8000-00000000000c',
  $$select count(*)::text from public.task_leaderboards where id = '7a5c0000-0000-4000-8000-0000000000d1'$$),
  '0', 'non-members read no leaderboard');

-- Another member cannot change, take over or remove the owner's rows.
select is(pg_temp.as_user('7a5c0000-0000-4000-8000-00000000000b',
  $$with u as (update public.task_progress_metrics set name = 'Taken' where id = '7a5c0000-0000-4000-8000-0000000000b1' returning 1) select count(*)::text from u$$),
  '0', 'members cannot update another member''s metric');
select is(pg_temp.as_user('7a5c0000-0000-4000-8000-00000000000b',
  $$with d as (delete from public.task_progress_metrics where id = '7a5c0000-0000-4000-8000-0000000000b2' returning 1) select count(*)::text from d$$),
  '0', 'members cannot delete another member''s metric');
select is(pg_temp.as_user('7a5c0000-0000-4000-8000-00000000000b',
  $$with u as (update public.task_progress_goals set owner_id = '7a5c0000-0000-4000-8000-00000000000b' where id = '7a5c0000-0000-4000-8000-0000000000c1' returning 1) select count(*)::text from u$$),
  '0', 'members cannot take over another member''s goal');
select is(pg_temp.as_user('7a5c0000-0000-4000-8000-00000000000b',
  $$with d as (delete from public.task_progress_goals where id = '7a5c0000-0000-4000-8000-0000000000c1' returning 1) select count(*)::text from d$$),
  '0', 'members cannot delete another member''s goal');
select is(pg_temp.as_user('7a5c0000-0000-4000-8000-00000000000b',
  $$with u as (update public.task_leaderboards set created_by = '7a5c0000-0000-4000-8000-00000000000b' where id = '7a5c0000-0000-4000-8000-0000000000d1' returning 1) select count(*)::text from u$$),
  '0', 'members cannot take over another member''s leaderboard');
select is(pg_temp.as_user('7a5c0000-0000-4000-8000-00000000000b',
  $$with d as (delete from public.task_leaderboards where id = '7a5c0000-0000-4000-8000-0000000000d1' returning 1) select count(*)::text from d$$),
  '0', 'members cannot delete another member''s leaderboard');

-- Inserts must name the actor as creator or owner.
select is(pg_temp.as_user('7a5c0000-0000-4000-8000-00000000000b',
  $$insert into public.task_progress_metrics (ws_id, name, unit_label, created_by) values ('7a5c0000-0000-4000-8000-0000000000a1', 'Forged metric', 'tasks', '7a5c0000-0000-4000-8000-00000000000a')$$),
  '42501', 'members cannot insert a metric credited to someone else');
select is(pg_temp.as_user('7a5c0000-0000-4000-8000-00000000000b',
  $$insert into public.task_progress_goals (ws_id, owner_id, metric_id, name, target_value, period_start) values ('7a5c0000-0000-4000-8000-0000000000a1', '7a5c0000-0000-4000-8000-00000000000a', '7a5c0000-0000-4000-8000-0000000000b1', 'Forged goal', 5, current_date)$$),
  '42501', 'members cannot insert a goal owned by someone else');
select is(pg_temp.as_user('7a5c0000-0000-4000-8000-00000000000b',
  $$insert into public.task_leaderboards (ws_id, metric_id, name, period_start, created_by) values ('7a5c0000-0000-4000-8000-0000000000a1', '7a5c0000-0000-4000-8000-0000000000b1', 'Forged leaderboard', current_date, '7a5c0000-0000-4000-8000-00000000000a')$$),
  '42501', 'members cannot insert a leaderboard credited to someone else');
select is(pg_temp.as_user('7a5c0000-0000-4000-8000-00000000000c',
  $$insert into public.task_progress_goals (ws_id, owner_id, metric_id, name, target_value, period_start) values ('7a5c0000-0000-4000-8000-0000000000a1', '7a5c0000-0000-4000-8000-00000000000c', '7a5c0000-0000-4000-8000-0000000000b1', 'Outsider goal', 5, current_date)$$),
  '42501', 'non-members cannot insert goals');
select is(pg_temp.as_user('7a5c0000-0000-4000-8000-00000000000b',
  $$insert into public.task_progress_goals (ws_id, owner_id, metric_id, name, target_value, period_start) values ('7a5c0000-0000-4000-8000-0000000000a1', '7a5c0000-0000-4000-8000-00000000000b', '7a5c0000-0000-4000-8000-0000000000b1', 'Own goal', 5, current_date)$$),
  'ok', 'members insert their own goals');

-- The owner keeps full control and cannot hand a row to someone else.
select is(pg_temp.as_user('7a5c0000-0000-4000-8000-00000000000a',
  $$with u as (update public.task_progress_metrics set name = 'Renamed metric' where id = '7a5c0000-0000-4000-8000-0000000000b1' returning 1) select count(*)::text from u$$),
  '1', 'creators update their metrics');
select is(pg_temp.as_user('7a5c0000-0000-4000-8000-00000000000a',
  $$with u as (update public.task_progress_goals set name = 'Renamed goal' where id = '7a5c0000-0000-4000-8000-0000000000c1' returning 1) select count(*)::text from u$$),
  '1', 'owners update their goals');
select is(pg_temp.as_user('7a5c0000-0000-4000-8000-00000000000a',
  $$with u as (update public.task_leaderboards set name = 'Renamed leaderboard' where id = '7a5c0000-0000-4000-8000-0000000000d1' returning 1) select count(*)::text from u$$),
  '1', 'creators update their leaderboards');
select is(pg_temp.as_user('7a5c0000-0000-4000-8000-00000000000a',
  $$update public.task_progress_goals set owner_id = '7a5c0000-0000-4000-8000-00000000000b' where id = '7a5c0000-0000-4000-8000-0000000000c1'$$),
  '42501', 'owners cannot reassign a goal to another member');
select is(pg_temp.as_user('7a5c0000-0000-4000-8000-00000000000a',
  $$update public.task_leaderboards set created_by = '7a5c0000-0000-4000-8000-00000000000b' where id = '7a5c0000-0000-4000-8000-0000000000d1'$$),
  '42501', 'creators cannot reassign a leaderboard to another member');
select is(pg_temp.as_user('7a5c0000-0000-4000-8000-00000000000a',
  $$with d as (delete from public.task_leaderboards where id = '7a5c0000-0000-4000-8000-0000000000d1' returning 1) select count(*)::text from d$$),
  '1', 'creators delete their leaderboards');
select is(pg_temp.as_user('7a5c0000-0000-4000-8000-00000000000a',
  $$with d as (delete from public.task_progress_goals where id = '7a5c0000-0000-4000-8000-0000000000c1' returning 1) select count(*)::text from d$$),
  '1', 'owners delete their goals');
select is(pg_temp.as_user('7a5c0000-0000-4000-8000-00000000000a',
  $$with d as (delete from public.task_progress_metrics where id = '7a5c0000-0000-4000-8000-0000000000b2' returning 1) select count(*)::text from d$$),
  '1', 'creators delete their metrics');

select is(
  (select count(*)::integer from pg_policies
   where schemaname = 'public'
     and tablename in ('task_progress_metrics', 'task_progress_goals', 'task_leaderboards')
     and cmd = 'ALL' and permissive = 'PERMISSIVE'),
  0,
  'no permissive catch-all write policy remains on these tables'
);

select * from finish();
rollback;
