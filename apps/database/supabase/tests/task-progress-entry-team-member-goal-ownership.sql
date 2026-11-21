begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(31);

-- Leaderboard creator (a), two members (b, d) and a non-member (c).
insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
  ('7a5d0000-0000-4000-8000-00000000000a', 'progress-owner-a@example.test', now(), '{}', '{}'),
  ('7a5d0000-0000-4000-8000-00000000000b', 'progress-member-b@example.test', now(), '{}', '{}'),
  ('7a5d0000-0000-4000-8000-00000000000c', 'progress-outsider-c@example.test', now(), '{}', '{}'),
  ('7a5d0000-0000-4000-8000-00000000000d', 'progress-member-d@example.test', now(), '{}', '{}');
insert into public.workspaces (id, name, personal, creator_id) values
  ('7a5d0000-0000-4000-8000-0000000000a1', 'Progress ownership', false,
   '7a5d0000-0000-4000-8000-00000000000a');
insert into public.workspace_members (ws_id, user_id, type) values
  ('7a5d0000-0000-4000-8000-0000000000a1', '7a5d0000-0000-4000-8000-00000000000a', 'MEMBER'),
  ('7a5d0000-0000-4000-8000-0000000000a1', '7a5d0000-0000-4000-8000-00000000000b', 'MEMBER'),
  ('7a5d0000-0000-4000-8000-0000000000a1', '7a5d0000-0000-4000-8000-00000000000d', 'MEMBER')
on conflict do nothing;

insert into public.task_progress_metrics (id, ws_id, name, unit_label, created_by) values
  ('7a5d0000-0000-4000-8000-0000000000b1', '7a5d0000-0000-4000-8000-0000000000a1',
   'Ownership metric', 'tasks', '7a5d0000-0000-4000-8000-00000000000a');
insert into public.task_progress_entries (id, ws_id, metric_id, value, created_by) values
  ('7a5d0000-0000-4000-8000-0000000000e1', '7a5d0000-0000-4000-8000-0000000000a1',
   '7a5d0000-0000-4000-8000-0000000000b1', 3, '7a5d0000-0000-4000-8000-00000000000b');
insert into public.task_leaderboards (id, ws_id, metric_id, name, period_start, created_by) values
  ('7a5d0000-0000-4000-8000-0000000000d1', '7a5d0000-0000-4000-8000-0000000000a1',
   '7a5d0000-0000-4000-8000-0000000000b1', 'Ownership board', current_date,
   '7a5d0000-0000-4000-8000-00000000000a');
insert into public.task_leaderboard_teams (id, leaderboard_id, name, created_by) values
  ('7a5d0000-0000-4000-8000-0000000000f1', '7a5d0000-0000-4000-8000-0000000000d1',
   'Team B', '7a5d0000-0000-4000-8000-00000000000b');
insert into public.task_leaderboard_members (id, leaderboard_id, user_id, joined_by) values
  ('7a5d0000-0000-4000-8000-0000000000f2', '7a5d0000-0000-4000-8000-0000000000d1',
   '7a5d0000-0000-4000-8000-00000000000b', '7a5d0000-0000-4000-8000-00000000000b'),
  ('7a5d0000-0000-4000-8000-0000000000f3', '7a5d0000-0000-4000-8000-0000000000d1',
   '7a5d0000-0000-4000-8000-00000000000d', '7a5d0000-0000-4000-8000-00000000000d');
insert into public.task_progress_goals (id, ws_id, owner_id, metric_id, name, target_value, period_start, visibility) values
  ('7a5d0000-0000-4000-8000-0000000000c1', '7a5d0000-0000-4000-8000-0000000000a1',
   '7a5d0000-0000-4000-8000-00000000000b', '7a5d0000-0000-4000-8000-0000000000b1',
   'Private goal', 10, current_date, 'private'),
  ('7a5d0000-0000-4000-8000-0000000000c2', '7a5d0000-0000-4000-8000-0000000000a1',
   '7a5d0000-0000-4000-8000-00000000000b', '7a5d0000-0000-4000-8000-0000000000b1',
   'Shared goal', 10, current_date, 'workspace');
insert into public.task_progress_user_stats (ws_id, user_id, xp) values
  ('7a5d0000-0000-4000-8000-0000000000a1', '7a5d0000-0000-4000-8000-00000000000b', 10);

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

-- Progress entries change only by their creator.
select is(pg_temp.as_user('7a5d0000-0000-4000-8000-00000000000d',
  $$with u as (update public.task_progress_entries set value = 99 where id = '7a5d0000-0000-4000-8000-0000000000e1' returning 1) select count(*)::text from u$$),
  '0', 'members cannot update another member''s entry');
select is(pg_temp.as_user('7a5d0000-0000-4000-8000-00000000000d',
  $$with d as (delete from public.task_progress_entries where id = '7a5d0000-0000-4000-8000-0000000000e1' returning 1) select count(*)::text from d$$),
  '0', 'members cannot delete another member''s entry');
select is(pg_temp.as_user('7a5d0000-0000-4000-8000-00000000000d',
  $$insert into public.task_progress_entries (ws_id, metric_id, value, created_by) values ('7a5d0000-0000-4000-8000-0000000000a1', '7a5d0000-0000-4000-8000-0000000000b1', 1, '7a5d0000-0000-4000-8000-00000000000b')$$),
  '42501', 'members cannot insert an entry credited to someone else');
select is(pg_temp.as_user('7a5d0000-0000-4000-8000-00000000000d',
  $$insert into public.task_progress_entries (ws_id, metric_id, value, created_by) values ('7a5d0000-0000-4000-8000-0000000000a1', '7a5d0000-0000-4000-8000-0000000000b1', 1, '7a5d0000-0000-4000-8000-00000000000d')$$),
  'ok', 'members record their own entries');
select is(pg_temp.as_user('7a5d0000-0000-4000-8000-00000000000b',
  $$with u as (update public.task_progress_entries set value = 4 where id = '7a5d0000-0000-4000-8000-0000000000e1' returning 1) select count(*)::text from u$$),
  '1', 'creators update their entries');
select is(pg_temp.as_user('7a5d0000-0000-4000-8000-00000000000b',
  $$with u as (update public.task_progress_entries set created_by = '7a5d0000-0000-4000-8000-00000000000d' where id = '7a5d0000-0000-4000-8000-0000000000e1' returning 1) select count(*)::text from u$$),
  '42501', 'creators cannot hand an entry to another member');
select is(pg_temp.as_user('7a5d0000-0000-4000-8000-00000000000b',
  $$with d as (delete from public.task_progress_entries where id = '7a5d0000-0000-4000-8000-0000000000e1' returning 1) select count(*)::text from d$$),
  '1', 'creators delete their entries');

-- Teams are removed by their creator or the leaderboard creator; edits go
-- through the Tasks service.
select is(pg_temp.as_user('7a5d0000-0000-4000-8000-00000000000d',
  $$with u as (update public.task_leaderboard_teams set name = 'Taken' where id = '7a5d0000-0000-4000-8000-0000000000f1' returning 1) select count(*)::text from u$$),
  '42501', 'members cannot rename another member''s team');
select is(pg_temp.as_user('7a5d0000-0000-4000-8000-00000000000d',
  $$with d as (delete from public.task_leaderboard_teams where id = '7a5d0000-0000-4000-8000-0000000000f1' returning 1) select count(*)::text from d$$),
  '0', 'members cannot delete another member''s team');
select is(pg_temp.as_user('7a5d0000-0000-4000-8000-00000000000d',
  $$insert into public.task_leaderboard_teams (leaderboard_id, name, created_by) values ('7a5d0000-0000-4000-8000-0000000000d1', 'Forged team', '7a5d0000-0000-4000-8000-00000000000b')$$),
  '42501', 'members cannot create a team credited to someone else');
select is(pg_temp.as_user('7a5d0000-0000-4000-8000-00000000000d',
  $$insert into public.task_leaderboard_teams (leaderboard_id, name, created_by) values ('7a5d0000-0000-4000-8000-0000000000d1', 'Team D', '7a5d0000-0000-4000-8000-00000000000d')$$),
  'ok', 'members create their own teams');
select is(pg_temp.as_user('7a5d0000-0000-4000-8000-00000000000b',
  $$with u as (update public.task_leaderboard_teams set name = 'Team B renamed' where id = '7a5d0000-0000-4000-8000-0000000000f1' returning 1) select count(*)::text from u$$),
  '42501', 'team edits go through the Tasks service');
select is(pg_temp.as_user('7a5d0000-0000-4000-8000-00000000000a',
  $$update public.task_leaderboard_teams set created_by = '7a5d0000-0000-4000-8000-00000000000d' where id = '7a5d0000-0000-4000-8000-0000000000f1'$$),
  '42501', 'leaderboard creators cannot hand a team to another member');
select is(pg_temp.as_user('7a5d0000-0000-4000-8000-00000000000a',
  $$with d as (delete from public.task_leaderboard_teams where id = '7a5d0000-0000-4000-8000-0000000000f1' returning 1) select count(*)::text from d$$),
  '1', 'leaderboard creators delete any team on their leaderboard');

-- Memberships are added and removed by the member or the leaderboard
-- creator; edits go through the Tasks service.
select is(pg_temp.as_user('7a5d0000-0000-4000-8000-00000000000d',
  $$with u as (update public.task_leaderboard_members set status = 'left' where id = '7a5d0000-0000-4000-8000-0000000000f2' returning 1) select count(*)::text from u$$),
  '42501', 'members cannot change another member''s membership');
select is(pg_temp.as_user('7a5d0000-0000-4000-8000-00000000000d',
  $$with d as (delete from public.task_leaderboard_members where id = '7a5d0000-0000-4000-8000-0000000000f2' returning 1) select count(*)::text from d$$),
  '0', 'members cannot remove another member');
select is(pg_temp.as_user('7a5d0000-0000-4000-8000-00000000000d',
  $$insert into public.task_leaderboard_members (leaderboard_id, user_id, joined_by) values ('7a5d0000-0000-4000-8000-0000000000d1', '7a5d0000-0000-4000-8000-00000000000a', '7a5d0000-0000-4000-8000-00000000000d')$$),
  '42501', 'members cannot add someone else to a leaderboard they do not own');
select is(pg_temp.as_user('7a5d0000-0000-4000-8000-00000000000b',
  $$update public.task_leaderboard_members set joined_by = '7a5d0000-0000-4000-8000-00000000000d' where id = '7a5d0000-0000-4000-8000-0000000000f2'$$),
  '42501', 'members cannot rewrite who added them');
select is(pg_temp.as_user('7a5d0000-0000-4000-8000-00000000000b',
  $$update public.task_leaderboard_members set user_id = '7a5d0000-0000-4000-8000-00000000000d' where id = '7a5d0000-0000-4000-8000-0000000000f2'$$),
  '42501', 'members cannot hand their membership to another member');
select is(pg_temp.as_user('7a5d0000-0000-4000-8000-00000000000b',
  $$with d as (delete from public.task_leaderboard_members where id = '7a5d0000-0000-4000-8000-0000000000f2' returning 1) select count(*)::text from d$$),
  '1', 'members leave a leaderboard themselves');
select is(pg_temp.as_user('7a5d0000-0000-4000-8000-00000000000a',
  $$insert into public.task_leaderboard_members (leaderboard_id, user_id, joined_by) values ('7a5d0000-0000-4000-8000-0000000000d1', '7a5d0000-0000-4000-8000-00000000000c', '7a5d0000-0000-4000-8000-00000000000a')$$),
  '42501', 'leaderboard creators cannot add a non-member of the workspace');
select is(pg_temp.as_user('7a5d0000-0000-4000-8000-00000000000a',
  $$with d as (delete from public.task_leaderboard_members where id = '7a5d0000-0000-4000-8000-0000000000f3' returning 1) select count(*)::text from d$$),
  '1', 'leaderboard creators remove members');
select is(pg_temp.as_user('7a5d0000-0000-4000-8000-00000000000d',
  $$insert into public.task_leaderboard_members (leaderboard_id, user_id, joined_by) values ('7a5d0000-0000-4000-8000-0000000000d1', '7a5d0000-0000-4000-8000-00000000000d', '7a5d0000-0000-4000-8000-00000000000d')$$),
  'ok', 'members join a leaderboard themselves');

-- Private goals are visible only to their owner.
select is(pg_temp.as_user('7a5d0000-0000-4000-8000-00000000000d',
  $$select string_agg(name, ',' order by name) from public.task_progress_goals where owner_id = '7a5d0000-0000-4000-8000-00000000000b'$$),
  'Shared goal', 'members see another member''s workspace goals but not private ones');
select is(pg_temp.as_user('7a5d0000-0000-4000-8000-00000000000b',
  $$select count(*)::text from public.task_progress_goals where owner_id = '7a5d0000-0000-4000-8000-00000000000b'$$),
  '2', 'owners see their private goals');

select is(pg_temp.as_user('7a5d0000-0000-4000-8000-00000000000c',
  $$select (select count(*) from public.task_progress_goals where ws_id = '7a5d0000-0000-4000-8000-0000000000a1')
         + (select count(*) from public.task_leaderboard_members where leaderboard_id = '7a5d0000-0000-4000-8000-0000000000d1')
         + (select count(*) from public.task_leaderboard_teams where leaderboard_id = '7a5d0000-0000-4000-8000-0000000000d1')$$),
  '0', 'non-members read no goals, teams or memberships');

-- XP, levels and achievement unlocks are written by the Tasks service only.
select is(pg_temp.as_user('7a5d0000-0000-4000-8000-00000000000b',
  $$update public.task_progress_user_stats set xp = 1000000 where user_id = '7a5d0000-0000-4000-8000-00000000000b'$$),
  '42501', 'users cannot raise their own XP');
select is(pg_temp.as_user('7a5d0000-0000-4000-8000-00000000000b',
  $$insert into public.task_progress_user_achievements (ws_id, user_id, achievement_code) values ('7a5d0000-0000-4000-8000-0000000000a1', '7a5d0000-0000-4000-8000-00000000000b', 'self-awarded')$$),
  '42501', 'users cannot unlock achievements for themselves');
select is(pg_temp.as_user('7a5d0000-0000-4000-8000-00000000000b',
  $$select xp::text from public.task_progress_user_stats where user_id = '7a5d0000-0000-4000-8000-00000000000b'$$),
  '10', 'users still read their XP');
select is(
  (select count(*)::integer
   from unnest(array['task_progress_achievements', 'task_progress_user_achievements', 'task_progress_user_stats']) as t(table_name)
   cross join unnest(array['anon', 'authenticated']) as r(role_name)
   cross join unnest(array['insert', 'update', 'delete']) as p(privilege_name)
   where has_table_privilege(r.role_name, format('public.%I', t.table_name), p.privilege_name)),
  0,
  'clients hold no write privilege on gamification tables'
);
select ok(
  has_table_privilege('service_role', 'public.task_progress_user_stats', 'update')
  and has_table_privilege('service_role', 'public.task_progress_user_achievements', 'insert'),
  'the service role keeps gamification writes'
);

select * from finish();
rollback;
