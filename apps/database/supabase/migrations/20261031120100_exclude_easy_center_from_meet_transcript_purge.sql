-- Forward fix: the 2 Nov production sync applied 20261030044719 without the
-- Easy Center exclusions, so the transcript purge could select Easy Center
-- rows. Re-create it with every selection excluding that workspace. Only the
-- function changes; this migration writes no Easy Center row.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

create or replace function private.purge_meet_transcripts_batch(
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

  -- Explicit M1-B adoption: dry-run and delete share the same deadline.
  -- NULL means forever. Edited notes expire with the original notes.
  if run.mode = 'dry_run' then
    with due as (
      select s.id, m.ws_id, (s.notes is not null or s.notes_edited is not null) as has_notes
      from public.meet_ai_sessions s
      join public.workspace_meetings m on m.id = s.meeting_id
      where s.transcript_purged_at is null
        and s.purge_after <= now_at
        -- Never purge the Easy Center workspace (customer never-write rule).
        and m.ws_id <> '42529372-c669-4833-bb32-2cab1f4ffd83'::uuid
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
        -- Never purge the Easy Center workspace (customer never-write rule).
        and m.ws_id <> '42529372-c669-4833-bb32-2cab1f4ffd83'::uuid
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
      and s.purge_after <= now_at
      -- Never purge the Easy Center workspace (customer never-write rule).
      and not exists (select 1 from public.workspace_meetings ec
        where ec.id = s.meeting_id and ec.ws_id = '42529372-c669-4833-bb32-2cab1f4ffd83'::uuid)
    order by s.purge_after, s.id, c.sequence
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
        and s.purge_after <= now_at
        and not exists (select 1 from public.meet_ai_chunks c
                        where c.session_id = s.id)
        -- Never purge the Easy Center workspace (customer never-write rule).
        and not exists (select 1 from public.workspace_meetings ec
          where ec.id = s.meeting_id and ec.ws_id = '42529372-c669-4833-bb32-2cab1f4ffd83'::uuid)
      order by s.purge_after, s.id
      limit remaining
      for update of s skip locked
    )
    update public.meet_ai_sessions s
      set notes = null, notes_edited = null, transcript_purged_at = now_at
      from cleared where s.id = cleared.id;
    get diagnostics n_notes = row_count;
  end if;

  remaining := remaining - n_notes;
  if remaining > 0 then
    with doomed as (
      select t.id from private.recording_transcripts t
      where t.created_at <= cutoff
        -- Never purge the Easy Center workspace (customer never-write rule).
        and not exists (select 1 from public.recording_sessions r
          join public.workspace_meetings ec on ec.id = r.meeting_id
          where r.id = t.session_id and ec.ws_id = '42529372-c669-4833-bb32-2cab1f4ffd83'::uuid)
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

revoke all on function private.purge_meet_transcripts_batch(uuid, integer)
  from public, anon, authenticated;
grant execute on function private.purge_meet_transcripts_batch(uuid, integer)
  to service_role;

COMMIT;
