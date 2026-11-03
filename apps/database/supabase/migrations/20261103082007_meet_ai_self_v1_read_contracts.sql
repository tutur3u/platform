-- Meet AI self_v1 durable read, admission and sharing contracts (PR 1).
-- Every function is service-only and takes the verified principal explicitly;
-- service-role bypass is never itself authorization. Nothing here reads live
-- room (Durable Object) state: host, admission, sharing, erasure fences and
-- the live/post-call boundary are all durable database state.
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- N5: post-call is decided only by durable session state: closure at the drain
-- deadline, a passed drain deadline, or the fixed capture lifetime plus drain.
-- A missing or never-ended room cannot keep live sharing in force, and a room
-- that ends early cannot switch flags.
create function private.meet_ai_self_v1_post_call(p_session public.meet_ai_sessions)
returns boolean language sql stable
set search_path = pg_catalog, pg_temp
as $$
  select p_session.ended_at is not null
    or coalesce(p_session.capture_state in ('closed', 'deleted'), false)
    or coalesce(p_session.drain_deadline_at <= now(), false)
    or coalesce(p_session.capture_deadline_at + interval '20 seconds' <= now(), false);
$$;
revoke all on function private.meet_ai_self_v1_post_call(public.meet_ai_sessions)
  from public, anon, authenticated;
grant execute on function private.meet_ai_self_v1_post_call(public.meet_ai_sessions)
  to service_role;

-- N1/H4: an account fence or person erasure hides every segment the subject
-- reserved before the fence, before any physical cleanup runs.
create function private.meet_ai_self_v1_chunk_hidden(
  p_session_id uuid, p_account_id uuid, p_created_at timestamptz
) returns boolean language sql stable
set search_path = pg_catalog, pg_temp
as $$
  select exists (
      select 1 from private.meet_ai_account_fences f
      where f.account_id = p_account_id and p_created_at <= f.fenced_at)
    or exists (
      select 1 from private.meet_ai_erasure_jobs j
      where j.session_id = p_session_id and j.scope = 'person_session'
        and j.subject_account_id = p_account_id and p_created_at <= j.created_at);
$$;
revoke all on function private.meet_ai_self_v1_chunk_hidden(uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function private.meet_ai_self_v1_chunk_hidden(uuid, uuid, timestamptz)
  to service_role;

-- Mixed notes contain everyone's speech, so any erase or fenced contributor
-- redacts them for every reader until regenerated at a new revision.
create function private.meet_ai_self_v1_notes_redacted(p_session_id uuid)
returns boolean language sql stable
set search_path = pg_catalog, pg_temp
as $$
  select exists (
      select 1 from public.meet_ai_sessions s
      where s.id = p_session_id and s.notes_redacted_at is not null)
    or exists (
      select 1 from private.meet_ai_erasure_jobs j
      where j.session_id = p_session_id and j.status <> 'completed')
    or exists (
      select 1 from private.meet_ai_account_fences f
      join public.meet_ai_chunks c
        on c.account_id = f.account_id and c.session_id = p_session_id
      where c.created_at <= f.fenced_at);
$$;
revoke all on function private.meet_ai_self_v1_notes_redacted(uuid)
  from public, anon, authenticated;
grant execute on function private.meet_ai_self_v1_notes_redacted(uuid) to service_role;

-- H3 reader role: host | admin | participant (durably admitted AND shared) |
-- own (own speech only) | none. Generic workspace membership, `workspace`
-- visibility, invitations and approved-but-never-admitted accounts never
-- qualify beyond their own segments.
create function private.meet_ai_self_v1_reader_role(p_session_id uuid, p_reader_id uuid)
returns text language plpgsql stable security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  s public.meet_ai_sessions;
  meeting_ws uuid;
begin
  if p_session_id is null or p_reader_id is null then return 'none'; end if;
  select * into s from public.meet_ai_sessions where id = p_session_id;
  if not found or s.protocol <> 'self_v1' or s.capture_state = 'deleted'
     or s.transcript_purged_at is not null or s.purge_after <= now()
     or exists (select 1 from private.meet_ai_erasure_jobs j
       where j.session_id = s.id and j.scope = 'session') then
    return 'none';
  end if;
  -- An account being deleted reads nothing; an erase-only fence still lets
  -- the person read others under the rules below (their own rows are hidden).
  if exists (select 1 from private.meet_ai_account_fences f
      where f.account_id = p_reader_id and f.reason = 'account_deletion') then
    return 'none';
  end if;
  if s.user_id = p_reader_id then return 'host'; end if;
  select m.ws_id into meeting_ws from public.workspace_meetings m where m.id = s.meeting_id;
  if public.has_workspace_permission(meeting_ws, p_reader_id, 'admin') is true then
    return 'admin';
  end if;
  if exists (select 1 from private.meet_ai_session_participants p
      where p.session_id = s.id and p.account_id = p_reader_id) then
    if s.visibility = 'participants' and (case
        when private.meet_ai_self_v1_post_call(s) then s.share_notes_after
        else s.share_notes_live end) then
      return 'participant';
    end if;
    return 'own';
  end if;
  if exists (select 1 from public.meet_ai_chunks c
      where c.account_id = p_reader_id and c.session_id = s.id) then
    return 'own';
  end if;
  return 'none';
end;
$$;
revoke all on function private.meet_ai_self_v1_reader_role(uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.meet_ai_self_v1_reader_role(uuid, uuid) to service_role;

-- Segments in deterministic keyset order. Own segments are always returned,
-- regardless of sharing, presence, departure or room availability.
create function private.list_meet_ai_self_v1_segments(
  p_session_id uuid,
  p_reader_id uuid,
  p_after_start_ms bigint default null,
  p_after_account_id uuid default null,
  p_after_stream_id uuid default null,
  p_after_sequence integer default null,
  p_limit integer default 200
) returns table (
  chunk_id uuid, account_id uuid, stream_id uuid, sequence integer,
  start_ms bigint, end_ms bigint, timing_uncertainty_ms integer,
  transcript text, is_own boolean
) language plpgsql stable security definer
set search_path = pg_catalog, pg_temp
as $$
#variable_conflict use_column
declare
  reader_role text;
begin
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'p_limit must be between 1 and 500' using errcode = '22023';
  end if;
  if num_nulls(p_after_start_ms, p_after_account_id, p_after_stream_id,
      p_after_sequence) not in (0, 4) then
    raise exception 'Cursor must be complete or absent' using errcode = '22023';
  end if;
  reader_role := private.meet_ai_self_v1_reader_role(p_session_id, p_reader_id);
  if reader_role = 'none' then return; end if;
  return query
    select c.id, c.account_id, c.stream_id, c.sequence, c.start_ms, c.end_ms,
      c.timing_uncertainty_ms, c.transcript, c.account_id = p_reader_id
    from public.meet_ai_chunks c
    where c.session_id = p_session_id and c.stream_id is not null
      and c.status = 'completed'
      and (reader_role in ('host', 'admin', 'participant') or c.account_id = p_reader_id)
      and (p_after_start_ms is null
        or (c.start_ms, c.account_id, c.stream_id, c.sequence)
          > (p_after_start_ms, p_after_account_id, p_after_stream_id, p_after_sequence))
      and not private.meet_ai_self_v1_chunk_hidden(c.session_id, c.account_id, c.created_at)
    order by c.start_ms, c.account_id, c.stream_id, c.sequence
    limit p_limit;
end;
$$;
revoke all on function private.list_meet_ai_self_v1_segments(uuid, uuid, bigint, uuid, uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function private.list_meet_ai_self_v1_segments(uuid, uuid, bigint, uuid, uuid, integer, integer)
  to service_role;

-- Mixed notes: host, admins and shared admitted participants only. Own speech
-- never grants notes. Redaction reveals no erasing person (N3).
create function private.get_meet_ai_self_v1_notes(p_session_id uuid, p_reader_id uuid)
returns table (
  notes_state text, notes jsonb, notes_edited jsonb, transcript_revision integer
) language plpgsql stable security definer
set search_path = pg_catalog, pg_temp
as $$
#variable_conflict use_column
declare
  reader_role text := private.meet_ai_self_v1_reader_role(p_session_id, p_reader_id);
begin
  if reader_role not in ('host', 'admin', 'participant') then
    return query select 'unavailable'::text, null::jsonb, null::jsonb, null::integer;
    return;
  end if;
  if private.meet_ai_self_v1_notes_redacted(p_session_id) then
    return query select 'redacted'::text, null::jsonb, null::jsonb, s.transcript_revision
      from public.meet_ai_sessions s where s.id = p_session_id;
    return;
  end if;
  return query select s.notes_status, s.notes, s.notes_edited, s.transcript_revision
    from public.meet_ai_sessions s where s.id = p_session_id;
end;
$$;
revoke all on function private.get_meet_ai_self_v1_notes(uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.get_meet_ai_self_v1_notes(uuid, uuid) to service_role;

-- N4: coverage never distinguishes deny, withdraw, decide-later, unsupported
-- or offline; consent decisions are not read at all. Host and admins see the
-- admitted roster; anyone else sees only their own row.
create function private.list_meet_ai_self_v1_coverage(p_session_id uuid, p_reader_id uuid)
returns table (account_id uuid, coverage text)
language plpgsql stable security definer
set search_path = pg_catalog, pg_temp
as $$
#variable_conflict use_column
declare
  reader_role text := private.meet_ai_self_v1_reader_role(p_session_id, p_reader_id);
  s public.meet_ai_sessions;
  post_call boolean;
begin
  if reader_role = 'none' then return; end if;
  select * into s from public.meet_ai_sessions where id = p_session_id;
  post_call := private.meet_ai_self_v1_post_call(s);
  return query
    select p.account_id,
      case when (not post_call and exists (
          select 1 from private.meet_ai_capture_streams cs
          where cs.session_id = p.session_id and cs.account_id = p.account_id
            and cs.state in ('active', 'draining') and cs.lease_expires_at > now()))
        or (post_call and exists (
          select 1 from public.meet_ai_chunks c
          where c.account_id = p.account_id and c.session_id = p.session_id
            and c.status = 'completed'
            and not private.meet_ai_self_v1_chunk_hidden(c.session_id, c.account_id, c.created_at)))
      then 'contributing' else 'not_contributing' end
    from private.meet_ai_session_participants p
    where p.session_id = p_session_id
      and (reader_role in ('host', 'admin') or p.account_id = p_reader_id)
      and not exists (select 1 from private.meet_ai_account_fences f
        where f.account_id = p.account_id)
    order by p.first_admitted_at, p.account_id;
end;
$$;
revoke all on function private.list_meet_ai_self_v1_coverage(uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.list_meet_ai_self_v1_coverage(uuid, uuid) to service_role;

-- Durable actual admission, written only by the trusted room authority after
-- it has admitted the account to this exact session generation. There is no
-- client or admin path to fabricate a reader record.
create function private.record_meet_ai_self_v1_admission(
  p_session_id uuid, p_account_id uuid, p_generation integer
) returns private.meet_ai_session_participants
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  s public.meet_ai_sessions;
  admitted private.meet_ai_session_participants;
begin
  if p_session_id is null or p_account_id is null or p_generation is null then
    raise exception 'Admission requires session, account and generation' using errcode = '22023';
  end if;
  select * into s from public.meet_ai_sessions where id = p_session_id for update;
  if not found or s.protocol <> 'self_v1' then
    raise exception 'Self-capture session not found' using errcode = 'P0002';
  end if;
  if s.capture_state <> 'active' or s.capture_deadline_at <= now()
     or s.user_id is null or s.billing_host_id is null then
    raise exception 'Session is not admitting participants' using errcode = '55000';
  end if;
  if s.generation <> p_generation then
    raise exception 'Stale session generation' using errcode = '40001';
  end if;
  if exists (select 1 from private.meet_ai_account_fences f
      where f.account_id = p_account_id) then
    raise exception 'Account is fenced' using errcode = '55000';
  end if;
  insert into private.meet_ai_session_participants as p
    (session_id, account_id, first_admitted_generation, last_admitted_generation)
  values (p_session_id, p_account_id, p_generation, p_generation)
  on conflict (session_id, account_id) do update set
    last_admitted_at = now(),
    last_admitted_generation = excluded.last_admitted_generation,
    upload_revoked_at = null
  returning * into admitted;
  return admitted;
end;
$$;
revoke all on function private.record_meet_ai_self_v1_admission(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function private.record_meet_ai_self_v1_admission(uuid, uuid, integer)
  to service_role;

-- N5: the host's live and after-meeting choices are persisted with a
-- monotonic revision before any broadcast. Only the fixed host may change
-- them; admins review without sharing authority. Stale revisions fail.
create function private.set_meet_ai_self_v1_sharing(
  p_session_id uuid, p_actor_id uuid, p_share_live boolean,
  p_share_after boolean, p_expected_revision integer
) returns integer
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  s public.meet_ai_sessions;
begin
  if p_session_id is null or p_actor_id is null or p_share_live is null
     or p_share_after is null or p_expected_revision is null then
    raise exception 'Sharing requires every argument' using errcode = '22023';
  end if;
  select * into s from public.meet_ai_sessions where id = p_session_id for update;
  if not found or s.protocol <> 'self_v1' or s.capture_state = 'deleted' then
    raise exception 'Self-capture session not found' using errcode = 'P0002';
  end if;
  if s.user_id is distinct from p_actor_id or s.billing_host_id is null then
    raise exception 'Only the session host can change sharing' using errcode = '42501';
  end if;
  if s.share_revision <> p_expected_revision then
    raise exception 'Sharing revision changed' using errcode = '40001';
  end if;
  update public.meet_ai_sessions set
    share_notes_live = p_share_live,
    share_notes_after = p_share_after,
    share_revision = share_revision + 1
  where id = p_session_id;
  return s.share_revision + 1;
end;
$$;
revoke all on function private.set_meet_ai_self_v1_sharing(uuid, uuid, boolean, boolean, integer)
  from public, anon, authenticated;
grant execute on function private.set_meet_ai_self_v1_sharing(uuid, uuid, boolean, boolean, integer)
  to service_role;

notify pgrst, 'reload schema';
