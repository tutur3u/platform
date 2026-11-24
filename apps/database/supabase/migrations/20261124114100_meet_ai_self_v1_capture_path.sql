-- Meet AI per-speaker transcription: the self_v1 capture path.
-- Design: apps/docs/platform/features/meet-per-speaker-transcription.mdx
-- ("Implementation conditions"). Additive: legacy sessions, legacy chunks and
-- public.reserve_meet_ai_chunk keep their behaviour; the guards from
-- 20261111120201 are unchanged and further triggers add the new rules, so they
-- hold for direct service-role writes as well as for the RPCs.
-- Every RPC is service-role only, takes explicit verified ids and takes the
-- session row lock first. That lock serializes each session's RPCs and
-- consent decisions, so the admission, stream and chunk locks taken after it
-- cannot deadlock with one another.
-- Errcodes: 55000 state refused, 40001 stale room sequence or generation,
-- 54000 cap, P0002 not found, 23514 invalid, 23505 identity conflict,
-- 22023 missing argument. Cost, dispatch and stop RPCs: 20261124114200.
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Chunks: `discarded` (post-provider text refused by the fence) and a
-- per-chunk reservation so settlement moves session counters exactly once.
-- The checks are NOT VALID: they bind every new or updated row at once, and
-- existing rows (all legacy, with NULL new columns) are validated later.
alter table public.meet_ai_chunks
  add column reserved_cost_usd numeric,
  add column reservation_state text;
alter table public.meet_ai_chunks
  drop constraint meet_ai_chunks_status_check,
  add constraint meet_ai_chunks_status_check
    check (status in ('processing', 'completed', 'failed', 'discarded')
      and (status <> 'discarded' or stream_id is not null)) not valid,
  add constraint meet_ai_chunks_reservation_check
    check ((reserved_cost_usd is null and reservation_state is null)
      or (stream_id is not null and reserved_cost_usd >= 0
        and reservation_state in ('reserved', 'released', 'settled', 'unknown'))) not valid;

-- Room sequence numbers: assigned by the room per (session, account) and
-- strictly increasing across decisions, stream closes and upload revokes.
alter table private.meet_ai_consents add column room_seq bigint;
alter table private.meet_ai_consents add constraint meet_ai_consents_room_seq_check
  check (room_seq is null or room_seq >= 1) not valid;
create unique index meet_ai_consents_room_seq_key
  on private.meet_ai_consents (session_id, user_id, room_seq)
  where room_seq is not null;

-- The shared watermark: one row per applied room entry. The largest room_seq
-- of a (session, account) is its last_room_seq; an exact replay of an applied
-- entry is recognised by (room_seq, kind). Content-free. The service role may
-- read and append; only the privacy triggers below delete.
create table private.meet_ai_self_v1_room_ops (
  session_id uuid not null references public.meet_ai_sessions(id) on delete cascade,
  account_id uuid not null references public.users(id) on delete cascade,
  room_seq bigint not null check (room_seq >= 1),
  kind text not null check (kind in ('allow', 'deny', 'withdraw', 'close', 'revoke')),
  recorded_at timestamptz not null default now(),
  primary key (session_id, account_id, room_seq, kind)
);
create index meet_ai_self_v1_room_ops_account
  on private.meet_ai_self_v1_room_ops (account_id);
alter table private.meet_ai_self_v1_room_ops enable row level security;
revoke all on private.meet_ai_self_v1_room_ops from public, anon, authenticated, service_role;
grant select, insert on private.meet_ai_self_v1_room_ops to service_role;

-- An account whose Auth user is gone (public.users is only soft-deleted) or
-- that carries an account_deletion fence takes no new room or consent writes:
-- they would re-link the anonymized account. Writes for it succeed as no-ops,
-- so a late outbox entry is acknowledged.
create function private.meet_ai_self_v1_account_gone(p_account_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, pg_temp
as $$
  select not exists (select 1 from auth.users u where u.id = p_account_id)
    or exists (select 1 from private.meet_ai_account_fences f
      where f.account_id = p_account_id and f.reason = 'account_deletion');
$$;
revoke all on function private.meet_ai_self_v1_account_gone(uuid) from public, anon, authenticated;
grant execute on function private.meet_ai_self_v1_account_gone(uuid) to service_role;

-- Consent rows: room_seq only on self_v1 account decisions, ordered against
-- the shared watermark; every self_v1 account `allow` carries one; at most 10
-- `allow` decisions per account per session (`deny` and `withdraw` are never
-- capped). A decision for a gone account is skipped. Runs after
-- prepare_meet_ai_consent (which locks the session) and before
-- sequence_meet_ai_self_v1_consent.
create function private.order_meet_ai_self_v1_room_seq()
returns trigger language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
begin
  if new.user_id is null or not exists (select 1 from public.meet_ai_sessions s
      where s.id = new.session_id and s.protocol = 'self_v1') then
    if new.room_seq is not null then
      raise exception 'Room sequence numbers belong to self_v1 account decisions'
        using errcode = '23514';
    end if;
    return new;
  end if;
  if private.meet_ai_self_v1_account_gone(new.user_id) then
    return null;
  end if;
  if new.decision = 'allow' and new.room_seq is null then
    raise exception 'A self_v1 allow needs a room sequence number' using errcode = '23514';
  end if;
  if new.decision = 'allow' and (select count(*) from private.meet_ai_consents c
      where c.session_id = new.session_id and c.user_id = new.user_id
        and c.decision = 'allow') >= 10 then
    raise exception 'self_v1 accounts record at most 10 allow decisions per session'
      using errcode = '54000';
  end if;
  if new.room_seq is not null then
    if exists (select 1 from private.meet_ai_self_v1_room_ops o
        where o.session_id = new.session_id and o.account_id = new.user_id
          and o.room_seq >= new.room_seq) then
      raise exception 'Room sequence is not newer than the recorded watermark'
        using errcode = '40001';
    end if;
    insert into private.meet_ai_self_v1_room_ops (session_id, account_id, room_seq, kind)
      values (new.session_id, new.user_id, new.room_seq, new.decision);
  end if;
  return new;
end;
$$;
revoke all on function private.order_meet_ai_self_v1_room_seq() from public, anon, authenticated;
grant execute on function private.order_meet_ai_self_v1_room_seq() to service_role;
create trigger room_seq_meet_ai_self_v1_consent before insert on private.meet_ai_consents
  for each row execute function private.order_meet_ai_self_v1_room_seq();

-- Room entries link an account to its consent rows through room_seq. They go
-- at once when the account is anonymized (Auth deletion; later writes for it
-- are no-ops). A transcript purge or a completed session or person erasure
-- removes them only once capture has ended (closed or deleted), because while
-- capture runs they are the watermark that refuses stale room entries; ending
-- capture later removes them, and deleting the session cascades.
create function private.erase_meet_ai_self_v1_room_ops()
returns trigger language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_table_name = 'users' then
    delete from private.meet_ai_self_v1_room_ops o where o.account_id = old.id;
    return old;
  elsif tg_table_name = 'meet_ai_sessions' then
    if new.capture_state in ('closed', 'deleted') then
      delete from private.meet_ai_self_v1_room_ops o where o.session_id = new.id
        and (new.transcript_purged_at is not null or exists (
          select 1 from private.meet_ai_erasure_jobs j
          where j.session_id = new.id and j.status = 'completed'
            and (j.scope = 'session' or j.subject_account_id = o.account_id)));
    end if;
  elsif new.session_id is not null and exists (select 1 from public.meet_ai_sessions x
      where x.id = new.session_id and x.capture_state in ('closed', 'deleted')) then
    delete from private.meet_ai_self_v1_room_ops o where o.session_id = new.session_id
      and (new.scope = 'session' or o.account_id = new.subject_account_id);
  end if;
  return new;
end;
$$;
revoke all on function private.erase_meet_ai_self_v1_room_ops() from public, anon, authenticated;
grant execute on function private.erase_meet_ai_self_v1_room_ops() to service_role;
create trigger erase_meet_ai_self_v1_room_ops after delete on auth.users
  for each row execute function private.erase_meet_ai_self_v1_room_ops();
create trigger erase_meet_ai_self_v1_room_ops after update of transcript_purged_at, capture_state
  on public.meet_ai_sessions for each row
  when (new.capture_state in ('closed', 'deleted')
    and (old.capture_state is distinct from new.capture_state
      or (old.transcript_purged_at is null and new.transcript_purged_at is not null)))
  execute function private.erase_meet_ai_self_v1_room_ops();
create trigger erase_meet_ai_self_v1_room_ops after insert or update of status
  on private.meet_ai_erasure_jobs for each row when (new.status = 'completed')
  execute function private.erase_meet_ai_self_v1_room_ops();

-- Discarded usage keeps no provider text: an object of at most 4096 bytes
-- whose keys are short identifiers and whose values are numbers, booleans,
-- nulls, nested objects of the same shape, or short strings under named
-- metadata keys. Any other key or string and every array is refused.
create function private.meet_ai_usage_is_text_free(p_usage jsonb)
returns boolean language plpgsql immutable set search_path = pg_catalog, pg_temp
as $$
declare
  k text;
  v jsonb;
begin
  if p_usage is null then return true; end if;
  if jsonb_typeof(p_usage) <> 'object' or octet_length(p_usage::text) > 4096 then
    return false;
  end if;
  for k, v in select e.key, e.value from jsonb_each(p_usage) e loop
    if k !~ '^[A-Za-z0-9_]{1,64}$' then return false; end if;
    if jsonb_typeof(v) = 'object' then
      if not private.meet_ai_usage_is_text_free(v) then return false; end if;
    elsif jsonb_typeof(v) = 'string' then
      if k not in ('model', 'modelId', 'provider', 'finishReason', 'stopReason', 'serviceTier')
         or length(v #>> '{}') > 80 then
        return false;
      end if;
    elsif jsonb_typeof(v) not in ('number', 'boolean', 'null') then
      return false;
    end if;
  end loop;
  return true;
end;
$$;
revoke all on function private.meet_ai_usage_is_text_free(jsonb) from public, anon, authenticated;
grant execute on function private.meet_ai_usage_is_text_free(jsonb) to service_role;

-- Account fences and erasure jobs stop capture for that person at once. A
-- session erasure fences the session permanently, whatever its status; a
-- person erasure fences that person until it completes (handoff included).
create function private.meet_ai_self_v1_upload_fenced(p_session_id uuid, p_account_id uuid)
returns boolean language sql stable set search_path = pg_catalog, pg_temp
as $$
  select exists (select 1 from private.meet_ai_account_fences f
      where f.account_id = p_account_id)
    or exists (select 1 from private.meet_ai_erasure_jobs j
      where j.session_id = p_session_id
        and (j.scope = 'session'
          or (j.subject_account_id = p_account_id and j.status <> 'completed')));
$$;
revoke all on function private.meet_ai_self_v1_upload_fenced(uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.meet_ai_self_v1_upload_fenced(uuid, uuid) to service_role;

-- Upload fence shared by reservation and dispatch, in the RPCs and in the
-- chunk guard: the admission row, then the stream, are locked and must still
-- allow capture: no fence, an unrevoked upload grant, a live stream and an
-- unexpired lease.
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
  if private.meet_ai_self_v1_upload_fenced(p_session_id, p_account_id) then
    raise exception 'Uploader is fenced by deletion or erasure' using errcode = '55000';
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

-- Chunk fence additions (self_v1 rows only; legacy rows return at once).
-- Fires after guard_meet_ai_chunk.
create function private.guard_meet_ai_self_v1_chunk_state()
returns trigger language plpgsql
set search_path = pg_catalog, pg_temp
as $$
declare
  s public.meet_ai_sessions;
  consent record;
  lease timestamptz;
begin
  if tg_op = 'INSERT' then
    if new.stream_id is null then return new; end if;
    if new.status <> 'processing' or new.transcript is not null or new.usage is not null
       or new.cost_usd is not null or new.dispatch_consent_revision is not null
       or new.reservation_state is distinct from 'reserved'
       or coalesce(new.reserved_cost_usd, 0) <= 0 then
      raise exception 'self_v1 chunks are inserted processing and reserved, without text'
        using errcode = '23514';
    end if;
    -- reserve_chunk names the chunk it inserts in a transaction-local setting,
    -- so a direct insert cannot skip the cost reservation. This guards against
    -- stray writes; it is not a privilege boundary for the service role.
    if current_setting('meet_ai.self_v1_reserve', true) is distinct from new.id::text then
      raise exception 'self_v1 chunks are inserted by meet_ai_self_v1_reserve_chunk'
        using errcode = '55000';
    end if;
    -- guard_meet_ai_chunk has checked the grant, stream state and consent; a
    -- missing admission or stream is left to the composite FK (23503).
    if private.meet_ai_self_v1_upload_fenced(new.session_id, new.account_id) then
      raise exception 'Uploader is fenced by deletion or erasure' using errcode = '55000';
    end if;
    select c.lease_expires_at into lease from private.meet_ai_capture_streams c
      where c.id = new.stream_id and c.session_id = new.session_id
        and c.account_id = new.account_id;
    if found and lease <= now() then
      raise exception 'self_v1 chunks need an unexpired stream lease' using errcode = '55000';
    end if;
    return new;
  end if;
  if old.stream_id is null then return new; end if;
  if new.status is distinct from old.status and old.status <> 'processing'
     and not (old.status = 'completed' and new.status = 'discarded') then
    raise exception 'self_v1 chunk outcomes are terminal' using errcode = '55000';
  end if;
  if new.reserved_cost_usd is distinct from old.reserved_cost_usd
     or (new.reservation_state is distinct from old.reservation_state
       and (old.reservation_state is distinct from 'reserved'
         or new.reservation_state is null or new.reservation_state = 'reserved')) then
    raise exception 'self_v1 chunk reservations settle once' using errcode = '55000';
  end if;
  if new.status = 'discarded' and (new.transcript is not null
      or not private.meet_ai_usage_is_text_free(new.usage)) then
    raise exception 'Discarded self_v1 chunks keep no text' using errcode = '23514';
  end if;
  select * into s from public.meet_ai_sessions x where x.id = new.session_id;
  -- Dispatch: once, for a reserved processing chunk of a live, unfenced upload
  -- while capture runs, at the session's current erase generation.
  if old.dispatch_consent_revision is null and new.dispatch_consent_revision is not null then
    if old.status <> 'processing' or old.reservation_state is distinct from 'reserved'
       or not private.meet_ai_self_v1_capturing(s)
       or new.erase_generation is distinct from s.erase_generation then
      raise exception 'self_v1 dispatch needs a reserved chunk while capture runs'
        using errcode = '55000';
    end if;
    perform private.meet_ai_self_v1_lock_live_upload(new.session_id, new.account_id,
      new.stream_id);
  end if;
  -- Text may only be stored under the current dispatch revision, for an
  -- unfenced account at the current erase generation; otherwise the chunk can
  -- only be discarded. Updates that only clear text always pass.
  if new.status = 'completed' and (old.status <> 'completed'
      or (new.transcript is not null and new.transcript is distinct from old.transcript)
      or (new.usage is distinct from old.usage
        and not private.meet_ai_usage_is_text_free(new.usage))) then
    perform 1 from private.meet_ai_session_participants p
      where p.session_id = new.session_id and p.account_id = new.account_id
      for share;
    select * into consent
      from private.meet_ai_self_v1_consent_state(new.session_id, new.account_id);
    if new.dispatch_consent_revision is null or consent.decision is distinct from 'allow'
       or consent.revision is distinct from new.dispatch_consent_revision
       or new.erase_generation is distinct from s.erase_generation
       or private.meet_ai_self_v1_upload_fenced(new.session_id, new.account_id) then
      raise exception 'Completed self_v1 text needs the current dispatch revision'
        using errcode = '55000';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_meet_ai_self_v1_chunk_state() from public, anon, authenticated;
grant execute on function private.guard_meet_ai_self_v1_chunk_state() to service_role;
create trigger guard_meet_ai_self_v1_chunk_state before insert or update on public.meet_ai_chunks
  for each row execute function private.guard_meet_ai_self_v1_chunk_state();

-- A removal recorded by the room (even before admission) blocks every stream.
create function private.guard_meet_ai_self_v1_stream_revoke()
returns trigger language plpgsql set search_path = pg_catalog, pg_temp
as $$
begin
  if exists (select 1 from private.meet_ai_self_v1_room_ops o
      where o.session_id = new.session_id and o.account_id = new.account_id
        and o.kind = 'revoke') then
    raise exception 'Upload was revoked for this session' using errcode = '55000';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_meet_ai_self_v1_stream_revoke() from public, anon, authenticated;
grant execute on function private.guard_meet_ai_self_v1_stream_revoke() to service_role;
create trigger guard_meet_ai_self_v1_stream_revoke before insert
  on private.meet_ai_capture_streams
  for each row execute function private.guard_meet_ai_self_v1_stream_revoke();

-- Helpers for the RPCs below. Service-executable like every self_v1 function;
-- none of them writes anything the service role could not write directly.
create function private.meet_ai_self_v1_lock_session(p_session_id uuid)
returns public.meet_ai_sessions language plpgsql
set search_path = pg_catalog, pg_temp
as $$
declare
  s public.meet_ai_sessions;
begin
  select * into s from public.meet_ai_sessions where id = p_session_id for update;
  if not found or s.protocol <> 'self_v1' then
    raise exception 'Self-capture session not found' using errcode = 'P0002';
  end if;
  return s;
end;
$$;
revoke all on function private.meet_ai_self_v1_lock_session(uuid) from public, anon, authenticated;
grant execute on function private.meet_ai_self_v1_lock_session(uuid) to service_role;

-- Capture runs while active, or draining before its drain deadline, before the
-- capture deadline, with a host and payer.
create function private.meet_ai_self_v1_capturing(p_session public.meet_ai_sessions)
returns boolean language sql stable
set search_path = pg_catalog, pg_temp
as $$
  select p_session.user_id is not null and p_session.billing_host_id is not null
    and p_session.capture_deadline_at > now()
    and (p_session.capture_state = 'active'
      or (p_session.capture_state = 'draining' and p_session.drain_deadline_at > now()));
$$;
revoke all on function private.meet_ai_self_v1_capturing(public.meet_ai_sessions)
  from public, anon, authenticated;
grant execute on function private.meet_ai_self_v1_capturing(public.meet_ai_sessions) to service_role;

-- 'duplicate' for an exact replay (same room_seq and kind), 'next' for a newer
-- entry; anything else is stale. The caller holds the session lock.
create function private.meet_ai_self_v1_room_seq_state(
  p_session_id uuid, p_account_id uuid, p_room_seq bigint, p_kind text
) returns text language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if p_room_seq is null or p_room_seq < 1 then
    raise exception 'Room sequence must be positive' using errcode = '23514';
  end if;
  if exists (select 1 from private.meet_ai_self_v1_room_ops o
      where o.session_id = p_session_id and o.account_id = p_account_id
        and o.room_seq = p_room_seq and o.kind = p_kind) then
    return 'duplicate';
  end if;
  if exists (select 1 from private.meet_ai_self_v1_room_ops o
      where o.session_id = p_session_id and o.account_id = p_account_id
        and o.room_seq >= p_room_seq) then
    raise exception 'Room sequence is not newer than the recorded watermark'
      using errcode = '40001';
  end if;
  return 'next';
end;
$$;
revoke all on function private.meet_ai_self_v1_room_seq_state(uuid, uuid, bigint, text)
  from public, anon, authenticated;
grant execute on function private.meet_ai_self_v1_room_seq_state(uuid, uuid, bigint, text)
  to service_role;

create function private.meet_ai_self_v1_start_session(
  p_meeting_id uuid, p_host_id uuid, p_ws_id uuid
) returns public.meet_ai_sessions
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  meeting_ws uuid;
  s public.meet_ai_sessions;
begin
  if num_nulls(p_meeting_id, p_host_id, p_ws_id) > 0 then
    raise exception 'Missing argument' using errcode = '22023'; end if;
  select m.ws_id into meeting_ws from public.workspace_meetings m
    where m.id = p_meeting_id for key share;
  if not found then raise exception 'Meeting not found' using errcode = 'P0002'; end if;
  if meeting_ws is distinct from p_ws_id then
    raise exception 'The payer workspace must own the meeting' using errcode = '23514';
  end if;
  if exists (select 1 from public.meet_ai_sessions x
      where x.meeting_id = p_meeting_id and x.ended_at is null) then
    raise exception 'A transcription session is already running' using errcode = '55000';
  end if;
  insert into public.meet_ai_sessions (meeting_id, user_id, protocol, billing_ws_id,
    billing_host_id, capture_state, capture_deadline_at, purge_after, visibility, cost_cap_usd)
  values (p_meeting_id, p_host_id, 'self_v1', p_ws_id, p_host_id, 'active',
    now() + interval '3 hours', now() + interval '365 days', 'host', 20)
  returning * into s;
  return s;
end;
$$;
revoke all on function private.meet_ai_self_v1_start_session(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.meet_ai_self_v1_start_session(uuid, uuid, uuid) to service_role;

create function private.meet_ai_self_v1_record_decision(
  p_session_id uuid, p_account_id uuid, p_decision text,
  p_notice_version text, p_room_seq bigint
) returns table (revision integer, recorded boolean)
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
#variable_conflict use_column
begin
  if num_nulls(p_session_id, p_account_id, p_decision, p_notice_version, p_room_seq) > 0 then
    raise exception 'Missing argument' using errcode = '22023'; end if;
  if p_decision not in ('allow', 'deny', 'withdraw') then
    raise exception 'Unknown consent decision' using errcode = '23514';
  end if;
  perform private.meet_ai_self_v1_lock_session(p_session_id);
  if private.meet_ai_self_v1_account_gone(p_account_id)
     or private.meet_ai_self_v1_room_seq_state(p_session_id, p_account_id, p_room_seq,
      p_decision) = 'duplicate' then
    return query select st.revision, false
      from private.meet_ai_self_v1_consent_state(p_session_id, p_account_id) st;
    return;
  end if;
  insert into private.meet_ai_consents (session_id, user_id, decision, notice_version, room_seq)
    values (p_session_id, p_account_id, p_decision, p_notice_version, p_room_seq);
  return query select st.revision, true
    from private.meet_ai_self_v1_consent_state(p_session_id, p_account_id) st;
end;
$$;
revoke all on function private.meet_ai_self_v1_record_decision(uuid, uuid, text, text, bigint)
  from public, anon, authenticated;
grant execute on function private.meet_ai_self_v1_record_decision(uuid, uuid, text, text, bigint)
  to service_role;

create function private.meet_ai_self_v1_open_stream(
  p_session_id uuid, p_account_id uuid, p_generation integer, p_consent_revision integer
) returns table (stream_id uuid, lease_expires_at timestamptz)
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
#variable_conflict use_column
declare
  s public.meet_ai_sessions;
  consent record;
  next_epoch integer;
  opened uuid;
  lease timestamptz := now() + interval '60 seconds';
begin
  if num_nulls(p_session_id, p_account_id, p_generation, p_consent_revision) > 0 then
    raise exception 'Missing argument' using errcode = '22023'; end if;
  s := private.meet_ai_self_v1_lock_session(p_session_id);
  if s.capture_state <> 'active' or not private.meet_ai_self_v1_capturing(s) then
    raise exception 'Session is not capturing' using errcode = '55000';
  end if;
  if exists (select 1 from private.meet_ai_self_v1_room_ops o
      where o.session_id = p_session_id and o.account_id = p_account_id
        and o.kind = 'revoke') then
    raise exception 'Upload was revoked for this session' using errcode = '55000';
  end if;
  if private.meet_ai_self_v1_upload_fenced(p_session_id, p_account_id) then
    raise exception 'Uploader is fenced by deletion or erasure' using errcode = '55000';
  end if;
  select * into consent from private.meet_ai_self_v1_consent_state(p_session_id, p_account_id);
  if consent.decision is distinct from 'allow'
     or consent.revision is distinct from p_consent_revision then
    raise exception 'Stream open needs the current allow revision' using errcode = '55000';
  end if;
  perform private.record_meet_ai_self_v1_admission(p_session_id, p_account_id, p_generation);
  update private.meet_ai_capture_streams c set state = 'closed', closed_at = now()
    where c.session_id = p_session_id and c.account_id = p_account_id
      and c.state in ('active', 'draining');
  select coalesce(max(c.device_epoch), 0) + 1 into next_epoch
    from private.meet_ai_capture_streams c
    where c.session_id = p_session_id and c.account_id = p_account_id;
  insert into private.meet_ai_capture_streams
    (session_id, account_id, device_epoch, input_processing, lease_expires_at)
  values (p_session_id, p_account_id, next_epoch, 'processed_aec', lease)
  returning id into opened;
  return query select opened, lease;
end;
$$;
revoke all on function private.meet_ai_self_v1_open_stream(uuid, uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function private.meet_ai_self_v1_open_stream(uuid, uuid, integer, integer)
  to service_role;

create function private.meet_ai_self_v1_renew_stream(p_stream_id uuid, p_account_id uuid)
returns timestamptz
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  owner_session uuid;
  s public.meet_ai_sessions;
  stream private.meet_ai_capture_streams;
  lease timestamptz := now() + interval '60 seconds';
begin
  if num_nulls(p_stream_id, p_account_id) > 0 then
    raise exception 'Missing argument' using errcode = '22023'; end if;
  select c.session_id into owner_session from private.meet_ai_capture_streams c
    where c.id = p_stream_id and c.account_id = p_account_id;
  if not found then raise exception 'Capture stream not found' using errcode = 'P0002'; end if;
  s := private.meet_ai_self_v1_lock_session(owner_session);
  select * into stream from private.meet_ai_capture_streams c
    where c.id = p_stream_id for update;
  if stream.state not in ('active', 'draining') or stream.lease_expires_at <= now()
     or not private.meet_ai_self_v1_capturing(s) then
    raise exception 'Capture stream is not live' using errcode = '55000';
  end if;
  update private.meet_ai_capture_streams c set lease_expires_at = lease
    where c.id = p_stream_id;
  return lease;
end;
$$;
revoke all on function private.meet_ai_self_v1_renew_stream(uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.meet_ai_self_v1_renew_stream(uuid, uuid) to service_role;

-- Room endings that are not consent decisions. `close` (leave, heartbeat
-- expiry) closes only the live stream, so a later allow and open can capture
-- again; a stale close is refused (40001). `revoke` (removal by the host or a
-- co-host) is permanent for the session, recorded at any room_seq, even for an
-- account that was never admitted. Both are no-ops for a gone account.
create function private.meet_ai_self_v1_end_upload(
  p_session_id uuid, p_account_id uuid, p_room_seq bigint, p_kind text
) returns boolean language plpgsql set search_path = pg_catalog, pg_temp
as $$
begin
  if num_nulls(p_session_id, p_account_id, p_room_seq) > 0 then
    raise exception 'Missing argument' using errcode = '22023'; end if;
  if p_kind not in ('close', 'revoke') then
    raise exception 'Only close and revoke end an upload' using errcode = '23514'; end if;
  perform private.meet_ai_self_v1_lock_session(p_session_id);
  if private.meet_ai_self_v1_account_gone(p_account_id) then
    return false;
  end if;
  if p_kind = 'revoke' then
    -- Removal is never refused as stale: it is recorded at its own room_seq
    -- (which becomes the watermark when it is the newest entry), and an exact
    -- replay is a no-op.
    if exists (select 1 from private.meet_ai_self_v1_room_ops o
        where o.session_id = p_session_id and o.account_id = p_account_id
          and o.room_seq = p_room_seq and o.kind = 'revoke') then
      return false;
    end if;
  elsif private.meet_ai_self_v1_room_seq_state(p_session_id, p_account_id, p_room_seq,
      p_kind) = 'duplicate' then
    return false;
  end if;
  insert into private.meet_ai_self_v1_room_ops (session_id, account_id, room_seq, kind)
    values (p_session_id, p_account_id, p_room_seq, p_kind);
  if p_kind = 'revoke' then
    update private.meet_ai_session_participants p set upload_revoked_at = now()
      where p.session_id = p_session_id and p.account_id = p_account_id
        and p.upload_revoked_at is null;
  end if;
  update private.meet_ai_capture_streams c
    set state = case p_kind when 'revoke' then 'revoked' else 'closed' end, closed_at = now()
    where c.session_id = p_session_id and c.account_id = p_account_id
      and c.state in ('active', 'draining');
  return true;
end;
$$;
revoke all on function private.meet_ai_self_v1_end_upload(uuid, uuid, bigint, text)
  from public, anon, authenticated;
grant execute on function private.meet_ai_self_v1_end_upload(uuid, uuid, bigint, text)
  to service_role;

create function private.meet_ai_self_v1_close_stream(
  p_session_id uuid, p_account_id uuid, p_room_seq bigint
) returns boolean language sql security definer set search_path = pg_catalog, pg_temp
as $$
  select private.meet_ai_self_v1_end_upload(p_session_id, p_account_id, p_room_seq, 'close');
$$;
revoke all on function private.meet_ai_self_v1_close_stream(uuid, uuid, bigint)
  from public, anon, authenticated;
grant execute on function private.meet_ai_self_v1_close_stream(uuid, uuid, bigint) to service_role;

create function private.meet_ai_self_v1_revoke_upload(
  p_session_id uuid, p_account_id uuid, p_room_seq bigint
) returns boolean language sql security definer set search_path = pg_catalog, pg_temp
as $$
  select private.meet_ai_self_v1_end_upload(p_session_id, p_account_id, p_room_seq, 'revoke');
$$;
revoke all on function private.meet_ai_self_v1_revoke_upload(uuid, uuid, bigint)
  from public, anon, authenticated;
grant execute on function private.meet_ai_self_v1_revoke_upload(uuid, uuid, bigint) to service_role;

notify pgrst, 'reload schema';
