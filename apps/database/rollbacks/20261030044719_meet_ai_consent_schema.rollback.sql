begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
-- Restore the M0 predicate explicitly, retaining the hardened path and ACL.
update private.meet_transcript_purge_control
  set fence_open = false, delete_enabled = false, updated_at = now(),
      updated_by = 'M1-B rollback';
drop index public.meet_ai_sessions_transcript_retention_idx;
create index meet_ai_sessions_transcript_retention_idx
  on public.meet_ai_sessions ((coalesce(ended_at, created_at)), id)
  where transcript_purged_at is null;
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

revoke all on function private.purge_meet_transcripts_batch(uuid, integer)
  from public, anon, authenticated;
grant execute on function private.purge_meet_transcripts_batch(uuid, integer)
  to service_role;

drop table public.workspace_meet_settings;
drop trigger anonymize_meet_ai_consents on auth.users;
drop function private.anonymize_meet_ai_consents();
drop table private.meet_ai_consents;
drop function private.prepare_meet_ai_consent();
drop function private.protect_meet_ai_consent();
alter table public.meet_ai_sessions
  drop column visibility, drop column language_hint, drop column source,
  drop column notes_model, drop column notes_prompt_version,
  drop column notes_edited, drop column purge_after;
commit;
