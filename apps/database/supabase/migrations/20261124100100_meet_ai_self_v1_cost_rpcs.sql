-- Meet AI per-speaker transcription: self_v1 cost and dispatch RPCs.
-- Design: apps/docs/platform/features/meet-per-speaker-transcription.mdx
-- (Upload contract, In-flight fence, Billing). Builds on the capture path in
-- 20261124100000 (session lock helper, capture predicate, chunk state guard).
-- Session cost counters are the spend ceiling: each chunk stores its own
-- reservation so settlement moves the counters exactly once. Every RPC locks
-- the session row first (session -> admission -> stream -> chunk).
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Upload fence shared by reservation and dispatch: the admission row and the
-- stream are locked (after the session, in the shared order) and must still
-- allow capture: an unrevoked upload grant, a live stream and an unexpired
-- lease. A close, revoke or lease expiry therefore stops every later
-- reservation and dispatch of that stream.
create function private.meet_ai_self_v1_lock_live_upload(
  p_session_id uuid, p_account_id uuid, p_stream_id uuid
) returns void language plpgsql set search_path = pg_catalog, pg_temp
as $$
declare
  revoked_at timestamptz;
  stream private.meet_ai_capture_streams;
begin
  select p.upload_revoked_at into revoked_at from private.meet_ai_session_participants p
    where p.session_id = p_session_id and p.account_id = p_account_id for share;
  if not found then
    raise exception 'Uploader is not admitted to this session' using errcode = '55000';
  end if;
  if revoked_at is not null then
    raise exception 'Upload was revoked for this session' using errcode = '55000';
  end if;
  select * into stream from private.meet_ai_capture_streams c
    where c.id = p_stream_id and c.session_id = p_session_id and c.account_id = p_account_id
    for share;
  if not found then raise exception 'Capture stream not found' using errcode = 'P0002'; end if;
  if stream.state not in ('active', 'draining') or stream.lease_expires_at <= now() then
    raise exception 'Capture stream is not live' using errcode = '55000';
  end if;
end;
$$;
revoke all on function private.meet_ai_self_v1_lock_live_upload(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.meet_ai_self_v1_lock_live_upload(uuid, uuid, uuid)
  to service_role;

-- Admission of one uploaded chunk: cost reservation against the session cap,
-- per-account budgets, the chunk row and the stream lease, in one transaction.
create function private.meet_ai_self_v1_reserve_chunk(
  p_id uuid, p_session_id uuid, p_stream_id uuid, p_account_id uuid,
  p_sequence integer, p_start_sample bigint, p_start_ms bigint, p_end_ms bigint,
  p_content_digest bytea, p_consent_revision integer, p_audio_seconds numeric,
  p_max_cost_usd numeric
) returns public.meet_ai_chunks
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  s public.meet_ai_sessions;
  admitted private.meet_ai_session_participants;
  stream private.meet_ai_capture_streams;
  chunk public.meet_ai_chunks;
begin
  if num_nulls(p_id, p_session_id, p_stream_id, p_account_id, p_sequence, p_start_sample,
      p_start_ms, p_end_ms, p_content_digest, p_consent_revision, p_audio_seconds,
      p_max_cost_usd) > 0 then
    raise exception 'Chunk reservation requires every argument' using errcode = '22023';
  end if;
  s := private.meet_ai_self_v1_lock_session(p_session_id);
  select * into chunk from public.meet_ai_chunks c where c.id = p_id;
  if found then
    if chunk.session_id = p_session_id and chunk.stream_id = p_stream_id
       and chunk.account_id = p_account_id and chunk.sequence = p_sequence
       and chunk.content_digest = p_content_digest then
      return chunk;
    end if;
    raise exception 'Chunk identity conflict' using errcode = '23505';
  end if;
  if exists (select 1 from public.meet_ai_chunks c
      where c.session_id = p_session_id and c.stream_id = p_stream_id
        and c.sequence = p_sequence) then
    raise exception 'Stream sequence already holds another chunk' using errcode = '23505';
  end if;
  if p_audio_seconds <= 0 or p_audio_seconds > 10 or p_max_cost_usd <= 0
     or octet_length(p_content_digest) <> 32 then
    raise exception 'Invalid chunk reservation' using errcode = '23514';
  end if;
  if not private.meet_ai_self_v1_capturing(s) then
    raise exception 'Session is not capturing' using errcode = '55000';
  end if;
  if s.cost_reserved_usd + s.cost_unknown_usd + s.cost_settled_usd + p_max_cost_usd
       > s.cost_cap_usd then
    raise exception 'Session cost cap reached' using errcode = '54000';
  end if;
  perform private.meet_ai_self_v1_lock_live_upload(p_session_id, p_account_id, p_stream_id);
  select * into admitted from private.meet_ai_session_participants p
    where p.session_id = p_session_id and p.account_id = p_account_id for update;
  if admitted.chunk_count + 1 > 1080 or admitted.audio_seconds + p_audio_seconds > 10800 then
    raise exception 'Per-account capture budget reached' using errcode = '54000';
  end if;
  select * into stream from private.meet_ai_capture_streams c
    where c.id = p_stream_id and c.session_id = p_session_id
      and c.account_id = p_account_id
    for update;
  insert into public.meet_ai_chunks (id, session_id, sequence, start_seconds,
    duration_seconds, status, stream_id, account_id, source_kind, content_digest,
    start_ms, end_ms, timing_uncertainty_ms, start_sample, capture_consent_revision,
    erase_generation, transcript_revision, reserved_cost_usd, reservation_state)
  values (p_id, p_session_id, p_sequence, p_start_ms / 1000.0, p_audio_seconds,
    'processing', p_stream_id, p_account_id, 'microphone', p_content_digest,
    p_start_ms, p_end_ms, coalesce(stream.anchor_uncertainty_ms, 0), p_start_sample,
    p_consent_revision, s.erase_generation, s.transcript_revision, p_max_cost_usd,
    'reserved')
  returning * into chunk;
  update public.meet_ai_sessions x set cost_reserved_usd = x.cost_reserved_usd + p_max_cost_usd
    where x.id = p_session_id;
  update private.meet_ai_session_participants p set
    chunk_count = p.chunk_count + 1,
    audio_seconds = p.audio_seconds + p_audio_seconds
    where p.session_id = p_session_id and p.account_id = p_account_id;
  update private.meet_ai_capture_streams c set
    lease_expires_at = now() + interval '60 seconds',
    uploaded_count = c.uploaded_count + 1,
    highest_sequence = greatest(coalesce(c.highest_sequence, p_sequence), p_sequence)
    where c.id = p_stream_id;
  return chunk;
end;
$$;
revoke all on function private.meet_ai_self_v1_reserve_chunk(uuid, uuid, uuid, uuid, integer,
  bigint, bigint, bigint, bytea, integer, numeric, numeric) from public, anon, authenticated;
grant execute on function private.meet_ai_self_v1_reserve_chunk(uuid, uuid, uuid, uuid, integer,
  bigint, bigint, bigint, bytea, integer, numeric, numeric) to service_role;

-- Commit in its own short transaction before the provider call. The chunk
-- guard refuses it unless the current decision is allow at this revision.
create function private.meet_ai_self_v1_mark_dispatch(
  p_chunk_id uuid, p_account_id uuid, p_consent_revision integer
) returns public.meet_ai_chunks
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  owner_session uuid;
  owner_stream uuid;
  s public.meet_ai_sessions;
  chunk public.meet_ai_chunks;
begin
  if num_nulls(p_chunk_id, p_account_id, p_consent_revision) > 0 then
    raise exception 'Missing argument' using errcode = '22023'; end if;
  select c.session_id, c.stream_id into owner_session, owner_stream from public.meet_ai_chunks c
    where c.id = p_chunk_id and c.account_id = p_account_id and c.stream_id is not null;
  if not found then raise exception 'Chunk not found' using errcode = 'P0002'; end if;
  s := private.meet_ai_self_v1_lock_session(owner_session);
  -- A refused chunk stays reserved; the caller settles it as `released`.
  perform private.meet_ai_self_v1_lock_live_upload(owner_session, p_account_id, owner_stream);
  select * into chunk from public.meet_ai_chunks c where c.id = p_chunk_id for update;
  if chunk.status <> 'processing' or chunk.reservation_state is distinct from 'reserved'
     or chunk.dispatch_consent_revision is not null then
    raise exception 'Chunk is not awaiting dispatch' using errcode = '55000';
  end if;
  if not private.meet_ai_self_v1_capturing(s) then
    raise exception 'Session is not capturing' using errcode = '55000';
  end if;
  if chunk.attempts >= 5 then
    raise exception 'Chunk attempt budget reached' using errcode = '54000';
  end if;
  update public.meet_ai_chunks c set
    dispatch_consent_revision = p_consent_revision,
    attempts = c.attempts + 1,
    attempt_started_at = now()
    where c.id = p_chunk_id
    returning * into chunk;
  return chunk;
end;
$$;
revoke all on function private.meet_ai_self_v1_mark_dispatch(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function private.meet_ai_self_v1_mark_dispatch(uuid, uuid, integer)
  to service_role;

-- Moves the chunk's own reservation exactly once:
-- released (only before dispatch) frees it; completed and discarded settle the
-- measured cost; unknown (after dispatch) keeps the full reservation as
-- unknown cost. Repeating the same outcome returns the row unchanged.
create function private.meet_ai_self_v1_settle_chunk(
  p_chunk_id uuid, p_outcome text, p_transcript text, p_usage jsonb, p_cost_usd numeric
) returns public.meet_ai_chunks
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  owner_session uuid;
  chunk public.meet_ai_chunks;
  target_status text;
  target_state text;
begin
  if num_nulls(p_chunk_id, p_outcome) > 0 then
    raise exception 'Missing argument' using errcode = '22023'; end if;
  case p_outcome
    when 'released' then target_status := 'failed'; target_state := 'released';
    when 'completed' then target_status := 'completed'; target_state := 'settled';
    when 'discarded' then target_status := 'discarded'; target_state := 'settled';
    when 'unknown' then target_status := 'failed'; target_state := 'unknown';
    else raise exception 'Unknown settlement outcome' using errcode = '23514';
  end case;
  select c.session_id into owner_session from public.meet_ai_chunks c
    where c.id = p_chunk_id and c.stream_id is not null;
  if not found then raise exception 'Chunk not found' using errcode = 'P0002'; end if;
  perform private.meet_ai_self_v1_lock_session(owner_session);
  select * into chunk from public.meet_ai_chunks c where c.id = p_chunk_id for update;
  if chunk.reservation_state is null then
    raise exception 'Chunk has no capture-path reservation' using errcode = '55000';
  end if;
  if chunk.reservation_state <> 'reserved' then
    if chunk.status = target_status and chunk.reservation_state = target_state then
      return chunk;
    end if;
    raise exception 'Chunk is already settled' using errcode = '55000';
  end if;
  if (chunk.dispatch_consent_revision is null) <> (p_outcome = 'released') then
    raise exception 'Released needs an undispatched chunk; other outcomes need dispatch'
      using errcode = '55000';
  end if;
  if p_outcome in ('released', 'unknown') and (p_transcript is not null or p_usage is not null) then
    raise exception 'Failed chunks keep no text' using errcode = '23514';
  end if;
  if p_outcome in ('completed', 'discarded') and (p_cost_usd is null or p_cost_usd < 0) then
    raise exception 'Settled chunks need a measured cost' using errcode = '23514';
  end if;
  update public.meet_ai_chunks c set
    status = target_status,
    reservation_state = target_state,
    transcript = p_transcript,
    usage = p_usage,
    cost_usd = case when target_state = 'settled' then p_cost_usd end
    where c.id = p_chunk_id
    returning * into chunk;
  update public.meet_ai_sessions x set
    cost_reserved_usd = x.cost_reserved_usd - chunk.reserved_cost_usd,
    cost_settled_usd = x.cost_settled_usd
      + case when target_state = 'settled' then p_cost_usd else 0 end,
    cost_unknown_usd = x.cost_unknown_usd
      + case when target_state = 'unknown' then chunk.reserved_cost_usd else 0 end
    where x.id = owner_session;
  return chunk;
end;
$$;
revoke all on function private.meet_ai_self_v1_settle_chunk(uuid, text, text, jsonb, numeric)
  from public, anon, authenticated;
grant execute on function private.meet_ai_self_v1_settle_chunk(uuid, text, text, jsonb, numeric)
  to service_role;

-- Counts one notes provider attempt before dispatch (at most 3 per session).
create function private.meet_ai_self_v1_note_attempt(p_session_id uuid)
returns integer
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  s public.meet_ai_sessions;
begin
  if num_nulls(p_session_id) > 0 then
    raise exception 'Missing argument' using errcode = '22023'; end if;
  s := private.meet_ai_self_v1_lock_session(p_session_id);
  if s.user_id is null or s.billing_host_id is null then
    raise exception 'A session without host or payer generates no notes' using errcode = '55000';
  end if;
  if s.notes_provider_attempts >= 3 then
    raise exception 'Notes attempt budget reached' using errcode = '54000';
  end if;
  update public.meet_ai_sessions x set notes_provider_attempts = x.notes_provider_attempts + 1
    where x.id = p_session_id;
  return s.notes_provider_attempts + 1;
end;
$$;
revoke all on function private.meet_ai_self_v1_note_attempt(uuid) from public, anon, authenticated;
grant execute on function private.meet_ai_self_v1_note_attempt(uuid) to service_role;

notify pgrst, 'reload schema';
