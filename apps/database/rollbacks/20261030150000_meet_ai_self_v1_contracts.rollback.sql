-- Manual rollback only with release-authority approval, last in the self_v1
-- order (after 150070, 150050 and the four concurrent index rollbacks; 150060
-- only validated constraints this file drops). Self_v1 sessions must be erased
-- first, and a session whose host profile was deleted needs an owner decision
-- before user_id can become NOT NULL again.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
-- Fixed checks only (no EXECUTE, no interpolation); they can only raise.
-- tuturuuu: reviewed(dynamic-sql-review): no EXECUTE or interpolated SQL
do $$
begin
  if exists (select 1 from public.meet_ai_sessions where protocol <> 'legacy') then
    raise exception 'Erase self_v1 sessions before rolling back' using errcode = '55000';
  end if;
  if exists (select 1 from public.meet_ai_sessions where user_id is null) then
    raise exception 'Resolve host-less sessions before restoring NOT NULL' using errcode = '55000';
  end if;
end;
$$;

drop trigger guard_meet_ai_chunk on public.meet_ai_chunks;
drop function private.guard_meet_ai_chunk();
alter table public.meet_ai_chunks
  drop constraint meet_ai_chunks_provenance_check,
  drop constraint meet_ai_chunks_stream_fkey,
  drop constraint meet_ai_chunks_account_id_fkey,
  drop column stream_id, drop column account_id, drop column source_kind,
  drop column content_digest, drop column start_ms, drop column end_ms,
  drop column timing_uncertainty_ms, drop column start_sample,
  drop column capture_consent_revision, drop column dispatch_consent_revision,
  drop column erase_generation, drop column transcript_revision;

drop table private.meet_ai_capture_streams;
drop table private.meet_ai_session_participants;
drop table private.meet_ai_erasure_jobs;
drop table private.meet_ai_account_fences;
drop function private.guard_meet_ai_capture_stream();
drop function private.guard_meet_ai_participant();

drop trigger release_meet_ai_self_v1_consents on public.meet_ai_sessions;
drop function private.release_meet_ai_self_v1_consents();
drop trigger guard_meet_ai_session on public.meet_ai_sessions;
drop function private.guard_meet_ai_session();
alter table public.meet_ai_sessions
  drop constraint meet_ai_sessions_self_v1_check,
  drop constraint meet_ai_sessions_legacy_check,
  drop constraint meet_ai_sessions_cost_check,
  drop constraint meet_ai_sessions_counters_check,
  drop constraint meet_ai_sessions_capture_state_check,
  drop constraint meet_ai_sessions_protocol_check,
  drop constraint meet_ai_sessions_billing_host_id_fkey,
  drop constraint meet_ai_sessions_billing_ws_id_fkey,
  drop constraint meet_ai_sessions_user_id_fkey,
  add constraint meet_ai_sessions_user_id_fkey
    foreign key (user_id) references public.users(id) not valid,
  drop column protocol, drop column billing_ws_id, drop column billing_host_id,
  drop column generation, drop column capture_state, drop column capture_deadline_at,
  drop column cutoff_at, drop column drain_deadline_at, drop column stop_generation,
  drop column erase_generation, drop column transcript_revision,
  drop column notes_provider_attempts, drop column notes_deliveries,
  drop column notes_redacted_at, drop column share_notes_live,
  drop column share_notes_after, drop column share_revision,
  drop column cost_reserved_usd, drop column cost_unknown_usd,
  drop column cost_settled_usd, drop column cost_cap_usd;
alter table public.meet_ai_sessions alter column user_id set not null;

-- Restore the 20260909153000 reservation body; grants are unchanged.
create or replace function public.reserve_meet_ai_chunk(
  p_id uuid, p_session_id uuid, p_sequence integer,
  p_start_seconds numeric, p_duration_seconds numeric
) returns public.meet_ai_chunks language plpgsql set search_path = '' as $$
declare
  session public.meet_ai_sessions;
  chunk public.meet_ai_chunks;
begin
  select * into session from public.meet_ai_sessions where id = p_session_id for update;
  if not found then raise exception 'Session not found'; end if;
  select * into chunk from public.meet_ai_chunks
    where session_id = p_session_id and sequence = p_sequence for update;
  if found then
    if chunk.id <> p_id then raise exception 'Chunk identity mismatch'; end if;
    if chunk.status = 'completed' then return null; end if;
    if session.ended_at is not null or session.created_at < now() - interval '3 hours' then
      raise exception 'Session ended';
    end if;
    if chunk.attempts >= 5 or
       (chunk.status = 'processing' and chunk.attempt_started_at > now() - interval '90 seconds') then
      return null;
    end if;
    update public.meet_ai_chunks set
      status = 'processing', attempt_id = gen_random_uuid(), attempt_started_at = now(),
      attempts = attempts + 1,
      unpriced_attempts = unpriced_attempts + case when chunk.cost_usd is null then 1 else 0 end,
      prior_cost_usd = prior_cost_usd + coalesce(chunk.cost_usd, 0),
      transcript = null, usage = null, cost_usd = null
      where id = p_id returning * into chunk;
    return chunk;
  end if;
  if session.ended_at is not null or session.created_at < now() - interval '3 hours' then
    raise exception 'Session ended';
  end if;
  if p_sequence > extract(epoch from (now() - session.created_at)) / 8 + 2 then
    raise exception 'Too many chunks';
  end if;
  insert into public.meet_ai_chunks(id, session_id, sequence, start_seconds, duration_seconds)
    values(p_id, p_session_id, p_sequence, p_start_seconds, p_duration_seconds) returning * into chunk;
  return chunk;
end;
$$;
revoke all on function public.reserve_meet_ai_chunk(uuid, uuid, integer, numeric, numeric) from public, anon, authenticated;
grant execute on function public.reserve_meet_ai_chunk(uuid, uuid, integer, numeric, numeric) to service_role;
notify pgrst, 'reload schema';
commit;
-- Then, in a separate transaction:
-- alter table public.meet_ai_sessions validate constraint meet_ai_sessions_user_id_fkey;
