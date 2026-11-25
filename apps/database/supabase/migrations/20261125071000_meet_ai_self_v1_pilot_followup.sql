-- Meet AI per-speaker transcription: pilot follow-up to the self_v1 capture
-- path (20261124114100, 20261124114200).
-- Design: apps/docs/platform/features/meet-per-speaker-transcription.mdx.
-- - Room and consent writes lock the account's Auth row before the session,
--   so an Auth deletion and a late outbox write are serialized: either the
--   write lands first and the deletion anonymizes it, or the deletion lands
--   first and the write is an acknowledged no-op.
-- - A closed-out session (deleted, purged, any session erasure, or a completed
--   person erasure for that account) takes no further room or consent writes
--   for that account; they succeed as no-ops so the outbox acknowledges them.
--   An allow is refused once capture has ended.
-- - Room entries go as soon as a purge happens, and after an erasure once the
--   session no longer captures; the erasure branch locks the session row so a
--   concurrent close cannot leave them behind.
-- - Stream renewal re-checks the live-upload fence and the current allow.
-- - An allow records its notice evidence (locale and text hash).
-- - A session erasure job is kept while its session exists.
-- - Mira participant choices record the notice mode, the two-phase pending id
--   and the system fallback source.
-- Errcodes: 55000 state refused, 40001 stale room sequence, 23514 invalid,
-- 22023 missing argument, P0002 not found.
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Notice evidence of a self_v1 allow: the locale and SHA-256 hex of the exact
-- notice text shown. The checks bind new rows; existing rows hold NULL.
alter table private.meet_ai_consents
  add column locale text,
  add column text_hash text;
alter table private.meet_ai_consents
  add constraint meet_ai_consents_locale_check
    check (locale is null or locale ~ '^[a-z]{2}(-[A-Z]{2})?$') not valid,
  add constraint meet_ai_consents_text_hash_check
    check (text_hash is null or text_hash ~ '^[0-9a-f]{64}$') not valid;

-- Mira participant choices: whether the notice was the room or the
-- per-speaker one, the two-phase pending id, and the system fallback source
-- written by the legacy-room compensation path. Widening the source check
-- cannot fail on existing rows.
alter table private.meet_mira_participant_choices
  add column notice_mode text not null default 'room'
    constraint meet_mira_participant_choices_notice_mode_check
    check (notice_mode in ('room', 'self')),
  add column pending_id uuid,
  drop constraint meet_mira_participant_choices_source_check,
  add constraint meet_mira_participant_choices_source_check
    check (source in ('join', 'confirm', 'toggle', 'system_fallback'));

-- An account is gone when its Auth user no longer exists (public.users is
-- only soft-deleted), when it carries an account_deletion fence, or while an
-- account_erase fence has not completed. The Auth row is locked FOR KEY SHARE
-- for the rest of the transaction, which makes a concurrent Auth deletion wait
-- until this write commits, so its anonymization sees the write.
create or replace function private.meet_ai_self_v1_account_gone(p_account_id uuid)
returns boolean language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
begin
  perform 1 from auth.users u where u.id = p_account_id for key share;
  if not found then
    return true;
  end if;
  return exists (select 1 from private.meet_ai_account_fences f
    where f.account_id = p_account_id
      and (f.reason = 'account_deletion'
        or (f.reason = 'account_erase' and f.status <> 'completed')));
end;
$$;
revoke all on function private.meet_ai_self_v1_account_gone(uuid) from public, anon, authenticated;
grant execute on function private.meet_ai_self_v1_account_gone(uuid) to service_role;

-- A session closed out for one account: capture deleted, transcript purged or
-- any session erasure job, for every write; and, only for a write that opens
-- or re-links capture (p_opening, an allow), a person erasure of that account
-- in any status (a running erasure must not gain a new row either). A withdraw, deny, close or revoke after a completed person erasure
-- is still recorded: it is the only way to stop a stream that is still live
-- once the upload fence lifts.
create function private.meet_ai_self_v1_closed_out(
  p_session public.meet_ai_sessions, p_account_id uuid, p_opening boolean
) returns boolean language sql stable set search_path = pg_catalog, pg_temp
as $$
  select p_session.capture_state = 'deleted' or p_session.transcript_purged_at is not null
    or exists (select 1 from private.meet_ai_erasure_jobs j
      where j.session_id = p_session.id
        and (j.scope = 'session'
          or (p_opening and j.subject_account_id = p_account_id)));
$$;
revoke all on function private.meet_ai_self_v1_closed_out(public.meet_ai_sessions, uuid, boolean)
  from public, anon, authenticated;
grant execute on function private.meet_ai_self_v1_closed_out(public.meet_ai_sessions, uuid, boolean)
  to service_role;

-- A purged transcript ends capture: a session that is still active but whose
-- transcript was purged opens no stream, reserves no chunk and dispatches none
-- (the purge deletes the room entries that enforce a revoke).
create or replace function private.meet_ai_self_v1_capturing(p_session public.meet_ai_sessions)
returns boolean language sql stable
set search_path = pg_catalog, pg_temp
as $$
  select p_session.user_id is not null and p_session.billing_host_id is not null
    and p_session.transcript_purged_at is null
    and p_session.capture_deadline_at > now()
    and (p_session.capture_state = 'active'
      or (p_session.capture_state = 'draining' and p_session.drain_deadline_at > now()));
$$;
revoke all on function private.meet_ai_self_v1_capturing(public.meet_ai_sessions)
  from public, anon, authenticated;
grant execute on function private.meet_ai_self_v1_capturing(public.meet_ai_sessions) to service_role;

-- Consent rows: room_seq only on self_v1 account decisions, ordered against
-- the shared watermark; every self_v1 account `allow` carries a room_seq and
-- its notice evidence, other decisions carry no evidence; at most 10 `allow`
-- decisions per account per session (`deny` and `withdraw` are never capped).
-- A decision for a gone account or a closed-out session is skipped; an allow
-- after capture has ended is refused. Runs after prepare_meet_ai_consent
-- (which locks the session) and before sequence_meet_ai_self_v1_consent.
create or replace function private.order_meet_ai_self_v1_room_seq()
returns trigger language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  s public.meet_ai_sessions;
begin
  select * into s from public.meet_ai_sessions x where x.id = new.session_id;
  if new.user_id is null or not found or s.protocol <> 'self_v1' then
    if new.room_seq is not null then
      raise exception 'Room sequence numbers belong to self_v1 account decisions'
        using errcode = '23514';
    end if;
    return new;
  end if;
  if private.meet_ai_self_v1_account_gone(new.user_id)
     or private.meet_ai_self_v1_closed_out(s, new.user_id, new.decision = 'allow') then
    return null;
  end if;
  if new.decision = 'allow' then
    if coalesce(s.capture_state not in ('active', 'draining'), true)
       or coalesce(s.capture_deadline_at <= now(), false) then
      raise exception 'Capture has ended for this session' using errcode = '55000';
    end if;
    if new.room_seq is null then
      raise exception 'A self_v1 allow needs a room sequence number' using errcode = '23514';
    end if;
    if new.locale is null or new.text_hash is null then
      raise exception 'A self_v1 allow needs its notice locale and text hash'
        using errcode = '23514';
    end if;
    if (select count(*) from private.meet_ai_consents c
        where c.session_id = new.session_id and c.user_id = new.user_id
          and c.decision = 'allow') >= 10 then
      raise exception 'self_v1 accounts record at most 10 allow decisions per session'
        using errcode = '54000';
    end if;
  elsif new.locale is not null or new.text_hash is not null then
    raise exception 'Only an allow carries notice evidence' using errcode = '23514';
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

-- Room entries link an account to its consent rows through room_seq. They go
-- at once when the account is anonymized (Auth deletion) and when the
-- session's transcript is purged (later writes for either are no-ops). A
-- completed session or person erasure removes them once the session no longer
-- captures (closed, deleted, or past its capture deadline); while capture runs
-- they are the watermark that refuses stale room entries, and ending capture
-- removes them. The erasure branch locks the session row FOR SHARE, so it
-- serializes with a concurrent close, which reads the jobs under its own lock.
create or replace function private.erase_meet_ai_self_v1_room_ops()
returns trigger language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  s public.meet_ai_sessions;
begin
  if tg_table_name = 'users' then
    delete from private.meet_ai_self_v1_room_ops o where o.account_id = old.id;
    return old;
  elsif tg_table_name = 'meet_ai_sessions' then
    if new.transcript_purged_at is not null then
      delete from private.meet_ai_self_v1_room_ops o where o.session_id = new.id;
    elsif new.capture_state in ('closed', 'deleted') then
      delete from private.meet_ai_self_v1_room_ops o where o.session_id = new.id
        and exists (select 1 from private.meet_ai_erasure_jobs j
          where j.session_id = new.id and j.status = 'completed'
            and (j.scope = 'session' or j.subject_account_id = o.account_id));
    end if;
  elsif new.session_id is not null then
    select * into s from public.meet_ai_sessions x where x.id = new.session_id for share;
    if found and (s.transcript_purged_at is not null
        or s.capture_state in ('closed', 'deleted')
        or not private.meet_ai_self_v1_capturing(s)) then
      delete from private.meet_ai_self_v1_room_ops o where o.session_id = new.session_id
        and (new.scope = 'session' or o.account_id = new.subject_account_id);
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.erase_meet_ai_self_v1_room_ops() from public, anon, authenticated;
grant execute on function private.erase_meet_ai_self_v1_room_ops() to service_role;
drop trigger erase_meet_ai_self_v1_room_ops on public.meet_ai_sessions;
create trigger erase_meet_ai_self_v1_room_ops after update of transcript_purged_at, capture_state
  on public.meet_ai_sessions for each row
  when ((old.transcript_purged_at is null and new.transcript_purged_at is not null)
    or (new.capture_state in ('closed', 'deleted')
      and old.capture_state is distinct from new.capture_state))
  execute function private.erase_meet_ai_self_v1_room_ops();

-- A session erasure job fences its session for good, so its row stays while
-- the session exists (the session delete sets session_id to NULL first).
create function private.keep_meet_ai_session_erasure_job()
returns trigger language plpgsql set search_path = pg_catalog, pg_temp
as $$
begin
  if old.scope = 'session' and old.session_id is not null
     and exists (select 1 from public.meet_ai_sessions x where x.id = old.session_id) then
    raise exception 'A session erasure job is kept while its session exists'
      using errcode = '55000';
  end if;
  return old;
end;
$$;
revoke all on function private.keep_meet_ai_session_erasure_job() from public, anon, authenticated;
grant execute on function private.keep_meet_ai_session_erasure_job() to service_role;
create trigger keep_meet_ai_session_erasure_job before delete on private.meet_ai_erasure_jobs
  for each row execute function private.keep_meet_ai_session_erasure_job();

-- Decisions carry the notice evidence of an allow. The account's Auth row is
-- locked before the session row; a missing session, a gone account and a
-- closed-out session are acknowledged no-ops (recorded = false).
drop function private.meet_ai_self_v1_record_decision(uuid, uuid, text, text, bigint);
create function private.meet_ai_self_v1_record_decision(
  p_session_id uuid, p_account_id uuid, p_decision text,
  p_notice_version text, p_room_seq bigint,
  p_locale text default null, p_text_hash text default null
) returns table (revision integer, recorded boolean)
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
#variable_conflict use_column
declare
  gone boolean;
  s public.meet_ai_sessions;
  n integer;
begin
  if num_nulls(p_session_id, p_account_id, p_decision, p_notice_version, p_room_seq) > 0 then
    raise exception 'Missing argument' using errcode = '22023'; end if;
  if p_decision not in ('allow', 'deny', 'withdraw') then
    raise exception 'Unknown consent decision' using errcode = '23514';
  end if;
  if p_decision = 'allow' and num_nulls(p_locale, p_text_hash) > 0 then
    raise exception 'An allow needs its notice locale and text hash' using errcode = '22023';
  end if;
  if p_decision <> 'allow' and num_nonnulls(p_locale, p_text_hash) > 0 then
    raise exception 'Only an allow carries notice evidence' using errcode = '23514';
  end if;
  gone := private.meet_ai_self_v1_account_gone(p_account_id);
  select * into s from public.meet_ai_sessions x where x.id = p_session_id for update;
  if not found then
    return query select null::integer, false;
    return;
  end if;
  if s.protocol <> 'self_v1' then
    raise exception 'Self-capture session not found' using errcode = 'P0002';
  end if;
  gone := gone or private.meet_ai_self_v1_account_gone(p_account_id);
  if gone or private.meet_ai_self_v1_closed_out(s, p_account_id, p_decision = 'allow')
     or private.meet_ai_self_v1_room_seq_state(p_session_id, p_account_id, p_room_seq,
      p_decision) = 'duplicate' then
    return query select st.revision, false
      from private.meet_ai_self_v1_consent_state(p_session_id, p_account_id) st;
    return;
  end if;
  insert into private.meet_ai_consents
    (session_id, user_id, decision, notice_version, room_seq, locale, text_hash)
    values (p_session_id, p_account_id, p_decision, p_notice_version, p_room_seq,
      p_locale, p_text_hash);
  -- The BEFORE INSERT trigger can still skip the row (a fence committed after
  -- the check above), and then nothing was recorded.
  get diagnostics n = row_count;
  return query select st.revision, n > 0
    from private.meet_ai_self_v1_consent_state(p_session_id, p_account_id) st;
end;
$$;
revoke all on function
  private.meet_ai_self_v1_record_decision(uuid, uuid, text, text, bigint, text, text)
  from public, anon, authenticated;
grant execute on function
  private.meet_ai_self_v1_record_decision(uuid, uuid, text, text, bigint, text, text)
  to service_role;

-- Renewal keeps a stream alive only under the same fence as an upload: the
-- admission and stream locks of the live-upload fence, the current allow and
-- a capturing session.
create or replace function private.meet_ai_self_v1_renew_stream(
  p_stream_id uuid, p_account_id uuid
) returns timestamptz
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  owner_session uuid;
  s public.meet_ai_sessions;
  consent record;
  lease timestamptz := now() + interval '60 seconds';
begin
  if num_nulls(p_stream_id, p_account_id) > 0 then
    raise exception 'Missing argument' using errcode = '22023'; end if;
  select c.session_id into owner_session from private.meet_ai_capture_streams c
    where c.id = p_stream_id and c.account_id = p_account_id;
  if not found then raise exception 'Capture stream not found' using errcode = 'P0002'; end if;
  s := private.meet_ai_self_v1_lock_session(owner_session);
  perform private.meet_ai_self_v1_lock_live_upload(owner_session, p_account_id, p_stream_id);
  select * into consent from private.meet_ai_self_v1_consent_state(owner_session, p_account_id);
  if consent.decision is distinct from 'allow' or not private.meet_ai_self_v1_capturing(s) then
    raise exception 'Capture stream is not live' using errcode = '55000';
  end if;
  perform 1 from private.meet_ai_capture_streams c where c.id = p_stream_id for update;
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
-- account that was never admitted. The account's Auth row is locked before
-- the session row; a missing session, a gone account and a closed-out session
-- are acknowledged no-ops (false).
create or replace function private.meet_ai_self_v1_end_upload(
  p_session_id uuid, p_account_id uuid, p_room_seq bigint, p_kind text
) returns boolean language plpgsql set search_path = pg_catalog, pg_temp
as $$
declare
  gone boolean;
  s public.meet_ai_sessions;
begin
  if num_nulls(p_session_id, p_account_id, p_room_seq) > 0 then
    raise exception 'Missing argument' using errcode = '22023'; end if;
  if p_kind not in ('close', 'revoke') then
    raise exception 'Only close and revoke end an upload' using errcode = '23514'; end if;
  gone := private.meet_ai_self_v1_account_gone(p_account_id);
  select * into s from public.meet_ai_sessions x where x.id = p_session_id for update;
  if not found then
    return false;
  end if;
  if s.protocol <> 'self_v1' then
    raise exception 'Self-capture session not found' using errcode = 'P0002';
  end if;
  gone := gone or private.meet_ai_self_v1_account_gone(p_account_id);
  if gone or private.meet_ai_self_v1_closed_out(s, p_account_id, false) then
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

notify pgrst, 'reload schema';
