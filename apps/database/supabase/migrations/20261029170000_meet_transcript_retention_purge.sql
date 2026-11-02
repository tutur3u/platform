-- Meet transcript retention: transcripts and AI notes are kept for 365 days.
--
-- Scope: public.meet_ai_chunks rows (transcript text and segments), the AI
-- notes on public.meet_ai_sessions (the session row, its usage and cost stay),
-- and private.recording_transcripts rows. Meetings, participants, sessions,
-- recording sessions, audio chunks/objects, consents and memories are never
-- touched.
--
-- Eligibility: a session is due 365 days after it ended (or was created when
-- it never ended). The functions are static against this schema. M1-B's
-- purge_after and notes_edited are adopted only by an explicitly reviewed
-- CREATE OR REPLACE of private.purge_meet_transcripts_batch.
--
-- Stop fence: private.meet_transcript_purge_control starts closed. With the
-- fence open, runs are dry runs that only count; deletion additionally needs
-- delete_enabled. Both are changed only by the database owner; service_role
-- can call the run functions but cannot read or change the fence row.
-- Cron Control's meet-transcript-retention job drives the runs. See
-- apps/docs/build/devops/meet-transcript-retention.mdx.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table public.meet_ai_sessions add column transcript_purged_at timestamptz;

comment on column public.meet_ai_sessions.transcript_purged_at is
  'Set when retention removed this session''s transcript chunks and AI notes.';

create index meet_ai_sessions_transcript_retention_idx
  on public.meet_ai_sessions ((coalesce(ended_at, created_at)), id)
  where transcript_purged_at is null;

create index recording_transcripts_retention_idx
  on private.recording_transcripts (created_at, id);

create table private.meet_transcript_purge_control (
  id boolean primary key default true check (id),
  fence_open boolean not null default false,
  delete_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by text
    check (updated_by is null or char_length(updated_by) between 1 and 128),
  -- Closing the fence also withdraws delete approval.
  constraint meet_transcript_purge_delete_needs_open_fence
    check (fence_open or not delete_enabled)
);

comment on table private.meet_transcript_purge_control is
  'Singleton stop fence for the Meet transcript retention purge. Closed by default; deletion needs a separate delete_enabled switch. Owner-only.';

insert into private.meet_transcript_purge_control (id) values (true);

create table private.meet_transcript_purge_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  mode text not null check (mode in ('fenced', 'dry_run', 'delete')),
  status text not null default 'running'
    check (status in ('running', 'completed', 'skipped', 'stopped',
      'budget_exhausted', 'failed', 'unknown', 'abandoned')),
  batches integer not null default 0 check (batches between 0 and 20),
  chunks_deleted integer not null default 0 check (chunks_deleted >= 0),
  notes_cleared integer not null default 0 check (notes_cleared >= 0),
  recording_transcripts_deleted integer not null default 0
    check (recording_transcripts_deleted >= 0),
  dry_run_counts jsonb,
  constraint meet_transcript_purge_runs_terminal
    check ((status = 'running') = (finished_at is null))
);

comment on table private.meet_transcript_purge_runs is
  'Audit of Meet transcript retention runs: mode, terminal status and counts only, never content.';

create index meet_transcript_purge_runs_started_idx
  on private.meet_transcript_purge_runs (started_at desc);
create unique index meet_transcript_purge_runs_one_running
  on private.meet_transcript_purge_runs ((true)) where status = 'running';

alter table private.meet_transcript_purge_control enable row level security;
alter table private.meet_transcript_purge_runs enable row level security;
revoke all on table private.meet_transcript_purge_control
  from public, anon, authenticated, service_role;
revoke all on table private.meet_transcript_purge_runs
  from public, anon, authenticated, service_role;

-- Opens one run. A closed fence records a skipped run and returns
-- mode 'fenced'. Runs left running for 15 minutes become 'abandoned'. At most
-- two dry-run or delete runs start per rolling 24 hours.
create function private.start_meet_transcript_purge_run()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set statement_timeout = '10s'
set lock_timeout = '2s'
as $$
declare
  control private.meet_transcript_purge_control;
  run_id uuid;
  run_mode text;
begin
  -- Serializes starts with each other and with fence changes.
  select * into control from private.meet_transcript_purge_control
    where id for update;

  update private.meet_transcript_purge_runs
    set status = 'abandoned', finished_at = transaction_timestamp()
    where status = 'running'
      and started_at < transaction_timestamp() - interval '15 minutes';

  if not coalesce(control.fence_open, false) then
    insert into private.meet_transcript_purge_runs (mode, status, finished_at)
      values ('fenced', 'skipped', transaction_timestamp())
      returning id into run_id;
    return jsonb_build_object('run_id', run_id, 'mode', 'fenced');
  end if;

  if exists (select 1 from private.meet_transcript_purge_runs
             where status = 'running') then
    return jsonb_build_object('run_id', null, 'mode', 'busy');
  end if;

  if (select count(*) from private.meet_transcript_purge_runs
      where mode <> 'fenced'
        and started_at > transaction_timestamp() - interval '24 hours') >= 2 then
    return jsonb_build_object('run_id', null, 'mode', 'daily_cap');
  end if;

  run_mode := case when control.delete_enabled then 'delete' else 'dry_run' end;
  insert into private.meet_transcript_purge_runs (mode) values (run_mode)
    returning id into run_id;
  return jsonb_build_object('run_id', run_id, 'mode', run_mode);
end;
$$;

-- Performs one bounded step of a running run and re-checks the fence first.
-- dry_run: records totals and a per-workspace breakdown (top 100 workspaces)
-- on the run row, returns totals and completes. delete: removes at most p_limit
-- rows in total, oldest sessions first. Progress is the remaining data itself,
-- so a retry or a new run after a crash continues where the last commit ended.
-- The run reaches a terminal status when work runs out, the fence closes or
-- its 20-batch budget is used.
create function private.purge_meet_transcripts_batch(
  p_run_id uuid,
  p_limit integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set statement_timeout = '20s'
set lock_timeout = '2s'
as $$
declare
  control private.meet_transcript_purge_control;
  run private.meet_transcript_purge_runs;
  now_at timestamptz := transaction_timestamp();
  cutoff timestamptz := transaction_timestamp() - interval '365 days';
  remaining integer;
  n_chunks integer := 0;
  n_notes integer := 0;
  n_transcripts integer := 0;
  counts jsonb;
  next_status text;
begin
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'p_limit must be between 1 and 500' using errcode = '22023';
  end if;

  select * into run from private.meet_transcript_purge_runs
    where id = p_run_id for update;
  if not found then
    raise exception 'Unknown purge run' using errcode = 'P0002';
  end if;
  if run.status <> 'running' then
    return jsonb_build_object('state', 'terminal');
  end if;

  -- Holding the fence row until commit makes a concurrent close wait for this
  -- batch and win before the next one.
  select * into control from private.meet_transcript_purge_control
    where id for share;
  if not coalesce(control.fence_open, false)
     or (run.mode = 'delete' and not control.delete_enabled) then
    update private.meet_transcript_purge_runs
      set status = 'stopped', finished_at = now_at where id = p_run_id;
    return jsonb_build_object('state', 'fenced');
  end if;

  if run.batches >= 20 then
    update private.meet_transcript_purge_runs
      set status = 'budget_exhausted', finished_at = now_at where id = p_run_id;
    return jsonb_build_object('state', 'budget_exhausted');
  end if;

  -- Static against today's schema: due means ended (or created, if never
  -- ended) at least 365 days ago, and only notes are cleared. M1-B must adopt
  -- purge_after or notes_edited by explicitly replacing this function after
  -- review, so the dry run approved for deletion always matches the delete.
  -- Session order follows meet_ai_sessions_transcript_retention_idx.
  if run.mode = 'dry_run' then
    with due as (
      select s.id, m.ws_id, (s.notes is not null) as has_notes
      from public.meet_ai_sessions s
      join public.workspace_meetings m on m.id = s.meeting_id
      where s.transcript_purged_at is null
        and coalesce(s.ended_at, s.created_at) <= cutoff
    ),
    sessions as (
      select d.ws_id, count(*) as sessions,
        count(*) filter (where d.has_notes) as notes,
        coalesce(sum((select count(*) from public.meet_ai_chunks c
          where c.session_id = d.id)), 0) as chunks
      from due d group by d.ws_id
    ),
    transcripts as (
      select m.ws_id, count(*) as recording_transcripts
      from private.recording_transcripts t
      join public.recording_sessions r on r.id = t.session_id
      join public.workspace_meetings m on m.id = r.meeting_id
      where t.created_at <= cutoff
      group by m.ws_id
    ),
    per_ws as (
      select coalesce(s.ws_id, t.ws_id) as ws_id,
        coalesce(s.chunks, 0)::bigint as chunks,
        coalesce(s.sessions, 0)::bigint as sessions,
        coalesce(s.notes, 0)::bigint as notes,
        coalesce(t.recording_transcripts, 0)::bigint as recording_transcripts
      from sessions s full join transcripts t on t.ws_id = s.ws_id
    )
    select jsonb_build_object(
      'chunks', coalesce(sum(per_ws.chunks), 0),
      'sessions', coalesce(sum(per_ws.sessions), 0),
      'notes', coalesce(sum(per_ws.notes), 0),
      'recording_transcripts', coalesce(sum(per_ws.recording_transcripts), 0),
      'workspaces', count(*),
      'by_workspace', coalesce((
        select jsonb_agg(to_jsonb(top) order by
          top.chunks + top.sessions + top.recording_transcripts desc, top.ws_id)
        from (select * from per_ws p order by
          p.chunks + p.sessions + p.recording_transcripts desc, p.ws_id
          limit 100) top
      ), '[]'::jsonb))
    into counts
    from per_ws;

    update private.meet_transcript_purge_runs
      set dry_run_counts = counts, batches = batches + 1,
        status = 'completed', finished_at = now_at
      where id = p_run_id;
    return jsonb_build_object(
      'state', 'done',
      'chunks', counts -> 'chunks',
      'sessions', counts -> 'sessions',
      'notes', counts -> 'notes',
      'recording_transcripts', counts -> 'recording_transcripts',
      'workspaces', counts -> 'workspaces');
  end if;

  -- Chunk reservations stop three hours after a session starts, so a due
  -- session gains no chunks after it is cleared.
  with doomed as (
    select c.id from public.meet_ai_sessions s
    join public.meet_ai_chunks c on c.session_id = s.id
    where s.transcript_purged_at is null
      and coalesce(s.ended_at, s.created_at) <= cutoff
    order by coalesce(s.ended_at, s.created_at), s.id, c.sequence
    limit p_limit
    for update of c skip locked
  )
  delete from public.meet_ai_chunks c using doomed where c.id = doomed.id;
  get diagnostics n_chunks = row_count;

  remaining := p_limit - n_chunks;
  if remaining > 0 then
    with cleared as (
      select s.id from public.meet_ai_sessions s
      where s.transcript_purged_at is null
        and coalesce(s.ended_at, s.created_at) <= cutoff
        and not exists (select 1 from public.meet_ai_chunks c
                        where c.session_id = s.id)
      order by coalesce(s.ended_at, s.created_at), s.id
      limit remaining
      for update of s skip locked
    )
    update public.meet_ai_sessions s
      set notes = null, transcript_purged_at = now_at
      from cleared where s.id = cleared.id;
    get diagnostics n_notes = row_count;
  end if;

  remaining := remaining - n_notes;
  if remaining > 0 then
    with doomed as (
      select t.id from private.recording_transcripts t
      where t.created_at <= cutoff
      order by t.created_at, t.id
      limit remaining
      for update skip locked
    )
    delete from private.recording_transcripts t using doomed
      where t.id = doomed.id;
    get diagnostics n_transcripts = row_count;
  end if;

  next_status := case
    when n_chunks + n_notes + n_transcripts < p_limit then 'completed'
    when run.batches + 1 >= 20 then 'budget_exhausted'
    else 'running'
  end;
  update private.meet_transcript_purge_runs set
    batches = batches + 1,
    chunks_deleted = chunks_deleted + n_chunks,
    notes_cleared = notes_cleared + n_notes,
    recording_transcripts_deleted = recording_transcripts_deleted + n_transcripts,
    status = next_status,
    finished_at = case when next_status = 'running' then null else now_at end
    where id = p_run_id;

  return jsonb_build_object(
    'state', case next_status when 'running' then 'more'
      when 'completed' then 'done' else next_status end,
    'chunks', n_chunks,
    'notes', n_notes,
    'recording_transcripts', n_transcripts);
end;
$$;

-- Records the Worker's terminal status for a run it could not finish normally.
-- Already terminal runs are left unchanged.
create function private.finish_meet_transcript_purge_run(
  p_run_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set statement_timeout = '5s'
set lock_timeout = '2s'
as $$
declare
  updated integer;
begin
  if p_status is null
     or p_status not in ('stopped', 'budget_exhausted', 'failed', 'unknown') then
    raise exception 'Invalid terminal status' using errcode = '22023';
  end if;
  update private.meet_transcript_purge_runs
    set status = p_status, finished_at = transaction_timestamp()
    where id = p_run_id and status = 'running';
  get diagnostics updated = row_count;
  return jsonb_build_object('finished', updated);
end;
$$;

revoke all on function private.start_meet_transcript_purge_run()
  from public, anon, authenticated;
revoke all on function private.purge_meet_transcripts_batch(uuid, integer)
  from public, anon, authenticated;
revoke all on function private.finish_meet_transcript_purge_run(uuid, text)
  from public, anon, authenticated;
grant execute on function private.start_meet_transcript_purge_run()
  to service_role;
grant execute on function private.purge_meet_transcripts_batch(uuid, integer)
  to service_role;
grant execute on function private.finish_meet_transcript_purge_run(uuid, text)
  to service_role;

commit;
