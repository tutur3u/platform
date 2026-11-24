-- Meet AI per-speaker transcription: the self_v1 capture path.
-- Design: apps/docs/platform/features/meet-per-speaker-transcription.mdx
-- ("Implementation conditions"). Additive: legacy sessions, legacy chunks and
-- public.reserve_meet_ai_chunk keep their behaviour; the guards from
-- 20261111120201 are unchanged and a second chunk trigger adds the new rules.
-- Every RPC is service-role only, takes explicit verified ids and locks the
-- session row first, so the lock order stays session -> admission -> stream
-- -> chunk exactly as the self_v1 consent and chunk guards expect.
-- Errcodes: 55000 state refused, 40001 stale room sequence or generation,
-- 54000 cap, P0002 not found, 23514 invalid, 23505 identity conflict,
-- 22023 missing argument. Cost and dispatch RPCs: 20261124100100.
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Chunks: `discarded` (post-provider text refused by the fence) and a
-- per-chunk reservation so settlement moves session counters exactly once.
alter table public.meet_ai_chunks
  add column reserved_cost_usd numeric,
  add column reservation_state text;
alter table public.meet_ai_chunks
  drop constraint meet_ai_chunks_status_check,
  add constraint meet_ai_chunks_status_check
    check (status in ('processing', 'completed', 'failed', 'discarded')
      and (status <> 'discarded' or stream_id is not null)),
  add constraint meet_ai_chunks_reservation_check
    check ((reserved_cost_usd is null and reservation_state is null)
      or (stream_id is not null and reserved_cost_usd >= 0
        and reservation_state in ('reserved', 'released', 'settled', 'unknown')));

-- Room sequence numbers: assigned by the room per (session, account) and
-- strictly increasing across decisions, stream closes and upload revokes.
alter table private.meet_ai_consents
  add column room_seq bigint
    constraint meet_ai_consents_room_seq_check check (room_seq is null or room_seq >= 1);
create unique index meet_ai_consents_room_seq_key
  on private.meet_ai_consents (session_id, user_id, room_seq)
  where room_seq is not null;

-- The shared watermark: one row per applied room entry. The largest room_seq
-- of a (session, account) is its last_room_seq; an exact replay of an applied
-- entry is recognised by (room_seq, kind). Content-free.
create table private.meet_ai_self_v1_room_ops (
  session_id uuid not null references public.meet_ai_sessions(id) on delete cascade,
  account_id uuid not null references public.users(id) on delete cascade,
  room_seq bigint not null check (room_seq >= 1),
  kind text not null check (kind in ('allow', 'deny', 'withdraw', 'close', 'revoke')),
  recorded_at timestamptz not null default now(),
  primary key (session_id, account_id, room_seq)
);
create index meet_ai_self_v1_room_ops_account
  on private.meet_ai_self_v1_room_ops (account_id);
alter table private.meet_ai_self_v1_room_ops enable row level security;
revoke all on private.meet_ai_self_v1_room_ops from public, anon, authenticated;
grant select, insert, delete on private.meet_ai_self_v1_room_ops to service_role;

-- Consent rows: room_seq only on self_v1 account decisions, ordered against
-- the shared watermark; at most 10 `allow` decisions per account per session
-- (`deny` and `withdraw` are never capped). Runs after prepare_meet_ai_consent
-- (which locks the session) and before sequence_meet_ai_self_v1_consent.
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

-- Usage carries provider text when it holds segments or any transcript/text.
create function private.meet_ai_usage_has_text(p_usage jsonb)
returns boolean language sql immutable
set search_path = pg_catalog, pg_temp
as $$
  select case
    when p_usage is null then false
    when jsonb_typeof(p_usage) = 'string' then true
    else jsonb_path_exists(p_usage, 'strict $.** ? (@.type() == "object"
      && (exists(@.transcript) || exists(@.text) || exists(@.segments)))')
  end;
$$;
revoke all on function private.meet_ai_usage_has_text(jsonb) from public, anon, authenticated;
grant execute on function private.meet_ai_usage_has_text(jsonb) to service_role;

-- Chunk fence additions (self_v1 rows only; legacy rows return at once).
-- Fires after guard_meet_ai_chunk, which has already taken the session,
-- admission and stream locks in the shared order.
create function private.guard_meet_ai_self_v1_chunk_state()
returns trigger language plpgsql
set search_path = pg_catalog, pg_temp
as $$
declare
  lease timestamptz;
  consent record;
begin
  if tg_op = 'INSERT' then
    if new.stream_id is null then return new; end if;
    if new.status <> 'processing' or new.transcript is not null or new.usage is not null
       or new.cost_usd is not null or new.dispatch_consent_revision is not null then
      raise exception 'self_v1 chunks are inserted processing, without text or dispatch'
        using errcode = '23514';
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
  if new.status = 'discarded'
     and (new.transcript is not null or private.meet_ai_usage_has_text(new.usage)) then
    raise exception 'Discarded self_v1 chunks keep no text' using errcode = '23514';
  end if;
  -- Text may only be stored under the current dispatch revision. Updates that
  -- only clear or erase text (no new transcript, no usage text) always pass.
  if new.status = 'completed' and (old.status <> 'completed'
      or (new.transcript is not null and new.transcript is distinct from old.transcript)
      or (new.usage is distinct from old.usage and private.meet_ai_usage_has_text(new.usage))) then
    perform 1 from private.meet_ai_session_participants p
      where p.session_id = new.session_id and p.account_id = new.account_id
      for share;
    select * into consent
      from private.meet_ai_self_v1_consent_state(new.session_id, new.account_id);
    if new.dispatch_consent_revision is null or consent.decision is distinct from 'allow'
       or consent.revision is distinct from new.dispatch_consent_revision then
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
declare
  recorded_kind text;
begin
  if p_room_seq is null or p_room_seq < 1 then
    raise exception 'Room sequence must be positive' using errcode = '23514';
  end if;
  select o.kind into recorded_kind from private.meet_ai_self_v1_room_ops o
    where o.session_id = p_session_id and o.account_id = p_account_id
      and o.room_seq = p_room_seq;
  if found then
    if recorded_kind = p_kind then return 'duplicate'; end if;
    raise exception 'Room sequence already recorded for another entry' using errcode = '40001';
  end if;
  if exists (select 1 from private.meet_ai_self_v1_room_ops o
      where o.session_id = p_session_id and o.account_id = p_account_id
        and o.room_seq > p_room_seq) then
    raise exception 'Room sequence is older than the recorded watermark' using errcode = '40001';
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
  if private.meet_ai_self_v1_room_seq_state(p_session_id, p_account_id, p_room_seq,
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
-- again. `revoke` (removal by the host or a co-host) is permanent for the
-- session, recorded even for an account that was never admitted.
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
  if private.meet_ai_self_v1_room_seq_state(p_session_id, p_account_id, p_room_seq,
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

-- Soft stop drains chunks for at most 20 seconds; hard stop (kill switch,
-- flag off, cap) closes at once. Both advance stop_generation once.
create function private.meet_ai_self_v1_stop_session(
  p_session_id uuid, p_host_id uuid, p_hard boolean
) returns public.meet_ai_sessions
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  s public.meet_ai_sessions;
begin
  if num_nulls(p_session_id, p_host_id, p_hard) > 0 then
    raise exception 'Missing argument' using errcode = '22023'; end if;
  s := private.meet_ai_self_v1_lock_session(p_session_id);
  if s.user_id is distinct from p_host_id then
    raise exception 'Only the session host can stop capture' using errcode = '42501';
  end if;
  if s.capture_state in ('closed', 'deleted')
     or (s.capture_state = 'draining' and not p_hard) then
    return s;
  end if;
  if p_hard then
    update public.meet_ai_sessions x set capture_state = 'closed',
      cutoff_at = coalesce(x.cutoff_at, now()), ended_at = coalesce(x.ended_at, now()),
      stop_generation = x.stop_generation + 1
      where x.id = p_session_id returning * into s;
    update private.meet_ai_capture_streams c set state = 'closed', closed_at = now()
      where c.session_id = p_session_id and c.state in ('active', 'draining');
  else
    update public.meet_ai_sessions x set capture_state = 'draining', cutoff_at = now(),
      drain_deadline_at = now() + interval '20 seconds',
      stop_generation = x.stop_generation + 1
      where x.id = p_session_id returning * into s;
    update private.meet_ai_capture_streams c set state = 'draining'
      where c.session_id = p_session_id and c.state = 'active';
  end if;
  return s;
end;
$$;
revoke all on function private.meet_ai_self_v1_stop_session(uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function private.meet_ai_self_v1_stop_session(uuid, uuid, boolean) to service_role;

-- Closes a session whose drain deadline or capture deadline has passed;
-- otherwise returns it unchanged.
create function private.meet_ai_self_v1_close_drained(p_session_id uuid)
returns public.meet_ai_sessions
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  s public.meet_ai_sessions;
begin
  if num_nulls(p_session_id) > 0 then
    raise exception 'Missing argument' using errcode = '22023'; end if;
  s := private.meet_ai_self_v1_lock_session(p_session_id);
  if (s.capture_state = 'draining' and s.drain_deadline_at <= now())
     or (s.capture_state = 'active' and s.capture_deadline_at <= now()) then
    update public.meet_ai_sessions x set capture_state = 'closed',
      cutoff_at = coalesce(x.cutoff_at, x.capture_deadline_at),
      ended_at = coalesce(x.ended_at, now())
      where x.id = p_session_id returning * into s;
    update private.meet_ai_capture_streams c set state = 'closed', closed_at = now()
      where c.session_id = p_session_id and c.state in ('active', 'draining');
  end if;
  return s;
end;
$$;
revoke all on function private.meet_ai_self_v1_close_drained(uuid) from public, anon, authenticated;
grant execute on function private.meet_ai_self_v1_close_drained(uuid) to service_role;

notify pgrst, 'reload schema';
