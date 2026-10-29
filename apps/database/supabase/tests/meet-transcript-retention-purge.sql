-- Contract for 20261029170000_meet_transcript_retention_purge.sql: service-role
-- only entry points, a closed-by-default fence, count-only dry runs, bounded
-- 365-day deletion that keeps newer data and everything outside the transcript
-- scope, and a static contract that ignores later M1-B columns.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(36);

insert into public.users(id) values ('00000000-0000-4000-8000-00000000e701');
insert into public.workspaces(id, name, personal, creator_id) values
  ('00000000-0000-4000-8000-00000000e711', 'Retention', false, '00000000-0000-4000-8000-00000000e701');
insert into public.workspace_meetings(id, ws_id, creator_id, name, time) values
  ('00000000-0000-4000-8000-00000000e721', '00000000-0000-4000-8000-00000000e711', '00000000-0000-4000-8000-00000000e701', 'Retention', now());
-- e731 ended 400 days ago (due); e732 ended 10 days ago (kept).
insert into public.meet_ai_sessions(id, meeting_id, user_id, created_at, ended_at, notes_status, notes) values
  ('00000000-0000-4000-8000-00000000e731', '00000000-0000-4000-8000-00000000e721', '00000000-0000-4000-8000-00000000e701',
    now() - interval '401 days', now() - interval '400 days', 'completed', '{"summary":"old"}'),
  ('00000000-0000-4000-8000-00000000e732', '00000000-0000-4000-8000-00000000e721', '00000000-0000-4000-8000-00000000e701',
    now() - interval '11 days', now() - interval '10 days', 'completed', '{"summary":"new"}');
insert into public.meet_ai_chunks(id, session_id, sequence, start_seconds, duration_seconds, status, transcript)
select gen_random_uuid(), '00000000-0000-4000-8000-00000000e731', n, n * 8, 8, 'completed', 'old ' || n
from generate_series(0, 2) n;
insert into public.meet_ai_chunks(id, session_id, sequence, start_seconds, duration_seconds, status, transcript)
select gen_random_uuid(), '00000000-0000-4000-8000-00000000e732', n, n * 8, 8, 'completed', 'new ' || n
from generate_series(0, 1) n;
insert into public.recording_sessions(id, user_id, meeting_id) values
  ('00000000-0000-4000-8000-00000000e741', '00000000-0000-4000-8000-00000000e701', '00000000-0000-4000-8000-00000000e721'),
  ('00000000-0000-4000-8000-00000000e742', '00000000-0000-4000-8000-00000000e701', '00000000-0000-4000-8000-00000000e721');
insert into public.audio_chunks(session_id, chunk_order, storage_path) values
  ('00000000-0000-4000-8000-00000000e741', 0, 'retention/old.webm');
insert into private.recording_transcripts(session_id, text, created_at) values
  ('00000000-0000-4000-8000-00000000e741', 'old recording', now() - interval '400 days'),
  ('00000000-0000-4000-8000-00000000e742', 'new recording', now() - interval '10 days');

create temporary table snapshot as select
  (select count(*) from public.meet_ai_chunks where session_id in ('00000000-0000-4000-8000-00000000e731', '00000000-0000-4000-8000-00000000e732')) as chunks,
  (select count(*) from public.meet_ai_sessions where notes is not null and meeting_id = '00000000-0000-4000-8000-00000000e721') as notes,
  (select count(*) from private.recording_transcripts where session_id in ('00000000-0000-4000-8000-00000000e741', '00000000-0000-4000-8000-00000000e742')) as transcripts;
create temporary view current_counts as select
  (select count(*) from public.meet_ai_chunks where session_id in ('00000000-0000-4000-8000-00000000e731', '00000000-0000-4000-8000-00000000e732')) as chunks,
  (select count(*) from public.meet_ai_sessions where notes is not null and meeting_id = '00000000-0000-4000-8000-00000000e721') as notes,
  (select count(*) from private.recording_transcripts where session_id in ('00000000-0000-4000-8000-00000000e741', '00000000-0000-4000-8000-00000000e742')) as transcripts;
create temporary table r (step text primary key, result jsonb);
grant insert, select on r to service_role;

-- Grants
select ok(
  not has_function_privilege('anon', 'private.start_meet_transcript_purge_run()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.start_meet_transcript_purge_run()', 'EXECUTE')
  and not has_function_privilege('anon', 'private.purge_meet_transcripts_batch(uuid, integer)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.purge_meet_transcripts_batch(uuid, integer)', 'EXECUTE')
  and not has_function_privilege('anon', 'private.finish_meet_transcript_purge_run(uuid, text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.finish_meet_transcript_purge_run(uuid, text)', 'EXECUTE'),
  'anon and authenticated cannot run the purge');
select ok(
  has_function_privilege('service_role', 'private.start_meet_transcript_purge_run()', 'EXECUTE')
  and has_function_privilege('service_role', 'private.purge_meet_transcripts_batch(uuid, integer)', 'EXECUTE')
  and has_function_privilege('service_role', 'private.finish_meet_transcript_purge_run(uuid, text)', 'EXECUTE'),
  'service_role runs the purge');
select ok(
  not exists (select 1 from information_schema.routine_privileges
    where routine_schema = 'private'
      and routine_name in ('start_meet_transcript_purge_run', 'purge_meet_transcripts_batch', 'finish_meet_transcript_purge_run')
      and grantee = 'PUBLIC'),
  'PUBLIC has no execute grant');
select ok(
  not has_table_privilege('service_role', 'private.meet_transcript_purge_control', 'SELECT')
  and not has_table_privilege('service_role', 'private.meet_transcript_purge_control', 'UPDATE')
  and not has_table_privilege('service_role', 'private.meet_transcript_purge_runs', 'UPDATE')
  and not has_table_privilege('authenticated', 'private.meet_transcript_purge_runs', 'SELECT')
  and not has_table_privilege('anon', 'private.meet_transcript_purge_control', 'SELECT'),
  'no API role can read or change the fence or the audit directly');
select ok((select prosecdef from pg_proc where oid = 'private.purge_meet_transcripts_batch(uuid, integer)'::regprocedure),
  'the batch function is security definer');

-- Fence defaults closed
select ok((select not fence_open and not delete_enabled from private.meet_transcript_purge_control),
  'the fence starts closed with deletion disabled');
select throws_ok($$update private.meet_transcript_purge_control set delete_enabled = true$$,
  '23514', null, 'deletion cannot be enabled behind a closed fence');

set local role service_role;
insert into r select 'fenced', private.start_meet_transcript_purge_run();
reset role;
select is((select result ->> 'mode' from r where step = 'fenced'), 'fenced', 'closed fence starts no work');
select is((select status from private.meet_transcript_purge_runs where id = (select (result ->> 'run_id')::uuid from r where step = 'fenced')),
  'skipped', 'closed fence records a terminal skipped run');
select ok((select row(c.*) = row(s.*) from current_counts c, snapshot s), 'closed fence deletes nothing');

-- Dry run
update private.meet_transcript_purge_control set fence_open = true, updated_by = 'pgtap';
set local role service_role;
insert into r select 'dry_start', private.start_meet_transcript_purge_run();
insert into r select 'dry', private.purge_meet_transcripts_batch((select (result ->> 'run_id')::uuid from r where step = 'dry_start'), 500);
reset role;
select is((select result ->> 'mode' from r where step = 'dry_start'), 'dry_run', 'an open fence without delete approval dry-runs');
select is((select result from r where step = 'dry'),
  '{"state":"done","chunks":3,"sessions":1,"notes":1,"recording_transcripts":1,"workspaces":1}'::jsonb,
  'dry run reports totals only for data older than 365 days');
select is((select dry_run_counts -> 'by_workspace' -> 0 from private.meet_transcript_purge_runs
    where id = (select (result ->> 'run_id')::uuid from r where step = 'dry_start')),
  '{"ws_id":"00000000-0000-4000-8000-00000000e711","chunks":3,"sessions":1,"notes":1,"recording_transcripts":1}'::jsonb,
  'dry run records per-workspace counts');
select ok((select row(c.*) = row(s.*) from current_counts c, snapshot s), 'dry run deletes nothing');
select is((select status from private.meet_transcript_purge_runs where id = (select (result ->> 'run_id')::uuid from r where step = 'dry_start')),
  'completed', 'dry run reaches a terminal state');

-- Delete, then the fence closes mid-run
update private.meet_transcript_purge_control set delete_enabled = true;
set local role service_role;
insert into r select 'del_start', private.start_meet_transcript_purge_run();
insert into r select 'busy', private.start_meet_transcript_purge_run();
insert into r select 'del1', private.purge_meet_transcripts_batch((select (result ->> 'run_id')::uuid from r where step = 'del_start'), 2);
reset role;
select is((select result ->> 'mode' from r where step = 'del_start'), 'delete', 'delete needs the separate approval');
select is((select result ->> 'mode' from r where step = 'busy'), 'busy', 'only one run is active');
select is((select result from r where step = 'del1'),
  '{"state":"more","chunks":2,"notes":0,"recording_transcripts":0}'::jsonb, 'a batch deletes at most p_limit rows');
update private.meet_transcript_purge_control set fence_open = false, delete_enabled = false;
set local role service_role;
insert into r select 'del2', private.purge_meet_transcripts_batch((select (result ->> 'run_id')::uuid from r where step = 'del_start'), 500);
reset role;
select is((select result ->> 'state' from r where step = 'del2'), 'fenced', 'closing the fence stops the next batch');
select is((select status from private.meet_transcript_purge_runs where id = (select (result ->> 'run_id')::uuid from r where step = 'del_start')),
  'stopped', 'a fenced run is terminal');
select is((select count(*)::int from public.meet_ai_chunks where session_id = '00000000-0000-4000-8000-00000000e731'), 1,
  'the closed fence deleted nothing further');

-- Daily cap, then resume in a later window
update private.meet_transcript_purge_control set fence_open = true, delete_enabled = true;
set local role service_role;
insert into r select 'capped', private.start_meet_transcript_purge_run();
reset role;
select is((select result ->> 'mode' from r where step = 'capped'), 'daily_cap', 'at most two runs start per day');
update private.meet_transcript_purge_runs set started_at = started_at - interval '25 hours', finished_at = finished_at - interval '25 hours';
set local role service_role;
insert into r select 'resume_start', private.start_meet_transcript_purge_run();
insert into r select 'resume', private.purge_meet_transcripts_batch((select (result ->> 'run_id')::uuid from r where step = 'resume_start'), 500);
reset role;
select is((select result from r where step = 'resume'),
  '{"state":"done","chunks":1,"notes":1,"recording_transcripts":1}'::jsonb, 'a later run resumes where the stopped run ended');
select ok((select notes is null and transcript_purged_at is not null and notes_status = 'completed'
  from public.meet_ai_sessions where id = '00000000-0000-4000-8000-00000000e731'),
  'the due session keeps its row but loses its notes');
select is((select count(*)::int from public.meet_ai_chunks where session_id = '00000000-0000-4000-8000-00000000e732'), 2,
  'chunks newer than 365 days are kept');
select is((select notes ->> 'summary' from public.meet_ai_sessions where id = '00000000-0000-4000-8000-00000000e732'), 'new',
  'notes newer than 365 days are kept');
select is((select array_agg(text) from private.recording_transcripts where session_id in ('00000000-0000-4000-8000-00000000e741', '00000000-0000-4000-8000-00000000e742')),
  array['new recording'], 'only the expired recording transcript is deleted');
select ok(exists (select 1 from public.recording_sessions where id = '00000000-0000-4000-8000-00000000e741')
  and exists (select 1 from public.audio_chunks where session_id = '00000000-0000-4000-8000-00000000e741')
  and exists (select 1 from public.workspace_meetings where id = '00000000-0000-4000-8000-00000000e721'),
  'meetings, recording sessions and audio are never deleted');

-- Idempotent re-run and terminal guards
update private.meet_transcript_purge_runs set started_at = started_at - interval '25 hours', finished_at = finished_at - interval '25 hours';
set local role service_role;
insert into r select 'again_start', private.start_meet_transcript_purge_run();
insert into r select 'again', private.purge_meet_transcripts_batch((select (result ->> 'run_id')::uuid from r where step = 'again_start'), 500);
insert into r select 'terminal', private.purge_meet_transcripts_batch((select (result ->> 'run_id')::uuid from r where step = 'again_start'), 500);
insert into r select 'finish_terminal', private.finish_meet_transcript_purge_run((select (result ->> 'run_id')::uuid from r where step = 'again_start'), 'failed');
reset role;
select is((select result from r where step = 'again'),
  '{"state":"done","chunks":0,"notes":0,"recording_transcripts":0}'::jsonb, 'a re-run finds nothing new to delete');
select is((select result ->> 'state' from r where step = 'terminal'), 'terminal', 'a terminal run takes no more batches');
select is((select (result ->> 'finished')::int from r where step = 'finish_terminal'), 0, 'finish leaves terminal runs unchanged');
select throws_ok($$select private.purge_meet_transcripts_batch(gen_random_uuid(), 501)$$, '22023', null, 'batches are capped at 500 rows');

-- A run left running by a lost Worker is abandoned
insert into private.meet_transcript_purge_runs(mode, started_at) values ('delete', now() - interval '20 minutes');
update private.meet_transcript_purge_runs set started_at = started_at - interval '25 hours', finished_at = finished_at - interval '25 hours'
  where status <> 'running';
set local role service_role;
insert into r select 'after_crash', private.start_meet_transcript_purge_run();
reset role;
select is((select count(*)::int from private.meet_transcript_purge_runs where status = 'abandoned'), 1,
  'a stale running run becomes abandoned');
select is((select result ->> 'mode' from r where step = 'after_crash'), 'delete', 'a new run starts after abandonment');

-- Static schema contract: M1-B-style columns change nothing until the function
-- is explicitly replaced. purge_after does not move the cutoff, and
-- notes_edited is never cleared.
alter table public.meet_ai_sessions add column purge_after timestamptz, add column notes_edited jsonb;
insert into public.meet_ai_sessions(id, meeting_id, user_id, created_at, ended_at, notes_status, notes, notes_edited, purge_after) values
  ('00000000-0000-4000-8000-00000000e733', '00000000-0000-4000-8000-00000000e721', '00000000-0000-4000-8000-00000000e701',
    now() - interval '31 days', now() - interval '30 days', 'completed', '{"summary":"short"}', null, now() - interval '1 day'),
  ('00000000-0000-4000-8000-00000000e734', '00000000-0000-4000-8000-00000000e721', '00000000-0000-4000-8000-00000000e701',
    now() - interval '501 days', now() - interval '500 days', 'completed', '{"summary":"old"}', '{"summary":"user edit"}', null);
set local role service_role;
insert into r select 'static', private.purge_meet_transcripts_batch((select (result ->> 'run_id')::uuid from r where step = 'after_crash'), 500);
reset role;
select ok((select notes is not null and transcript_purged_at is null from public.meet_ai_sessions where id = '00000000-0000-4000-8000-00000000e733'),
  'a past purge_after does not make a session due before 365 days');
select ok((select notes is null and notes_edited ->> 'summary' = 'user edit' from public.meet_ai_sessions where id = '00000000-0000-4000-8000-00000000e734'),
  'the 365-day cutoff applies and notes_edited is never cleared');

select * from finish();
rollback;
