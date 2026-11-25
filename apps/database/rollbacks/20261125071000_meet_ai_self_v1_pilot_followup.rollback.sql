-- Rollback of 20261125071000_meet_ai_self_v1_pilot_followup.sql: restores the
-- 20261124114100 functions and triggers and drops the added columns, checks
-- and helpers. Consent and Mira choice evidence is immutable, so the rollback
-- refuses (55000) once any allow carries notice evidence or any Mira choice
-- carries a self notice, a pending id or the system fallback source; fix
-- forward instead. Run with psql -X -v ON_ERROR_STOP=1 -f, without -1.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
lock table private.meet_ai_consents, private.meet_mira_participant_choices,
  private.meet_ai_erasure_jobs in access exclusive mode;
-- Fixed checks only (no EXECUTE, no interpolation); they can only raise.
-- tuturuuu: reviewed(dynamic-sql-review): no EXECUTE or interpolated SQL
do $$
begin
  if exists (select 1 from private.meet_ai_consents
      where locale is not null or text_hash is not null) then
    raise exception 'Consent notice evidence is recorded; fix forward instead of rolling back'
      using errcode = '55000';
  end if;
  if exists (select 1 from private.meet_mira_participant_choices
      where notice_mode <> 'room' or pending_id is not null or source = 'system_fallback') then
    raise exception 'Mira choice evidence uses the added columns; fix forward instead of rolling back'
      using errcode = '55000';
  end if;
end;
$$;

drop trigger if exists keep_meet_ai_session_erasure_job on private.meet_ai_erasure_jobs;
drop function if exists private.keep_meet_ai_session_erasure_job();

-- The 20261124114100 definitions, verbatim.
create or replace function private.meet_ai_self_v1_account_gone(p_account_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, pg_temp
as $$
  select not exists (select 1 from auth.users u where u.id = p_account_id)
    or exists (select 1 from private.meet_ai_account_fences f
      where f.account_id = p_account_id and f.reason = 'account_deletion');
$$;
revoke all on function private.meet_ai_self_v1_account_gone(uuid) from public, anon, authenticated;
grant execute on function private.meet_ai_self_v1_account_gone(uuid) to service_role;

create or replace function private.order_meet_ai_self_v1_room_seq()
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

create or replace function private.erase_meet_ai_self_v1_room_ops()
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
drop trigger erase_meet_ai_self_v1_room_ops on public.meet_ai_sessions;
create trigger erase_meet_ai_self_v1_room_ops after update of transcript_purged_at, capture_state
  on public.meet_ai_sessions for each row
  when (new.capture_state in ('closed', 'deleted')
    and (old.capture_state is distinct from new.capture_state
      or (old.transcript_purged_at is null and new.transcript_purged_at is not null)))
  execute function private.erase_meet_ai_self_v1_room_ops();

drop function if exists
  private.meet_ai_self_v1_record_decision(uuid, uuid, text, text, bigint, text, text);
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


create or replace function private.meet_ai_self_v1_renew_stream(p_stream_id uuid, p_account_id uuid)
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


create or replace function private.meet_ai_self_v1_end_upload(
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

create or replace function private.meet_ai_self_v1_capturing(p_session public.meet_ai_sessions)
returns boolean language sql stable
set search_path = pg_catalog, pg_temp
as $$
  select p_session.user_id is not null and p_session.billing_host_id is not null
    and p_session.capture_deadline_at > now()
    and (p_session.capture_state = 'active'
      or (p_session.capture_state = 'draining' and p_session.drain_deadline_at > now()));
$$;

drop function if exists private.meet_ai_self_v1_closed_out(public.meet_ai_sessions, uuid, boolean);

alter table private.meet_mira_participant_choices
  drop constraint meet_mira_participant_choices_source_check,
  add constraint meet_mira_participant_choices_source_check
    check (source in ('join', 'confirm', 'toggle')),
  drop column if exists pending_id,
  drop column if exists notice_mode;
alter table private.meet_ai_consents
  drop constraint if exists meet_ai_consents_text_hash_check,
  drop constraint if exists meet_ai_consents_locale_check,
  drop column if exists text_hash,
  drop column if exists locale;
notify pgrst, 'reload schema';
commit;
