-- Rex only: do not run after V5/V8 or any erase generation has advanced.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '10s';
lock table public.meet_ai_sessions, public.meet_ai_chunks, private.meeting_documents in access exclusive mode;
lock table private.meet_content_fences in exclusive mode;
-- tuturuuu: reviewed(dynamic-sql-review): Selene, #7519 rollback preconditions; static SQL only, no EXECUTE.
do $$begin
 if to_regclass('private.meet_erasure_operations') is not null
 or to_regclass('private.meet_erasure_requests') is not null
 or to_regclass('private.meet_transcript_erasures') is not null then
   raise exception 'V10 is installed; roll forward';
 end if;
 if exists(select 1 from private.meet_content_fences where generation <> 0 or doc_generation <> 0 or active_operation_key is not null or doc_hold or restore_hold)
 or exists(select 1 from private.meeting_documents where installed_doc_generation <> 0 or installed_operation_key is not null)
 or exists(select 1 from public.meet_ai_chunks where erasure_generation <> 0) then
   raise exception 'Fence is in use; roll forward';
 end if;
end$$;
-- Restore #7309 bodies verbatim; only SECURITY DEFINER search_path is normalized.
create or replace function private.read_meeting_document(p_meeting_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_meeting public.workspace_meetings; v_doc uuid; v_result jsonb;
begin
  select * into v_meeting from public.workspace_meetings where id = p_meeting_id for update;
  if v_meeting.id is null then raise exception 'Meeting missing' using errcode = 'P0002'; end if;
  select document_id into v_doc from private.meeting_documents where meeting_id = p_meeting_id;
  if v_doc is null then
    insert into public.workspace_documents(ws_id, name, is_public, content)
      values(v_meeting.ws_id, v_meeting.name, false, '{"type":"doc","content":[]}'::jsonb) returning id into v_doc;
    insert into private.meeting_documents(meeting_id,document_id) values(p_meeting_id,v_doc);
  end if;
  select jsonb_build_object('documentId',document_id,'revision',revision,'state',yjs_state)
    into v_result from private.meeting_documents where meeting_id = p_meeting_id;
  return v_result;
end $$;
create or replace function private.checkpoint_meeting_document(p_meeting_id uuid,p_document_id uuid,p_owner_id uuid,p_state jsonb,p_content jsonb,p_hash text,p_version integer)
returns integer language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_revision integer; v_expected jsonb; v_current jsonb;
begin
  if jsonb_typeof(p_state) <> 'array' or jsonb_array_length(p_state) > 524288
    or jsonb_typeof(p_content) <> 'object' or p_content->>'type' <> 'doc'
    or length(p_hash) <> 64 then raise exception 'Invalid checkpoint' using errcode = '22023'; end if;
  if not exists(select 1 from public.workspace_meetings where id = p_meeting_id and creator_id = p_owner_id)
    then raise exception 'Invalid owner' using errcode = '42501'; end if;
  select revision into v_revision from private.meeting_documents where meeting_id = p_meeting_id and document_id = p_document_id for update;
  if v_revision is null then raise exception 'Document missing' using errcode = 'P0002'; end if;
  if p_version < v_revision then return v_revision; end if;
  if p_version = v_revision and exists(select 1 from private.meeting_documents where meeting_id = p_meeting_id and checkpoint_hash is not null and checkpoint_hash <> p_hash) then raise exception 'Conflicting checkpoint' using errcode = '40001'; end if;
  if exists(select 1 from private.meeting_documents where meeting_id = p_meeting_id and checkpoint_hash = p_hash) then return v_revision; end if;
  select checkpoint_content into v_expected from private.meeting_documents where meeting_id = p_meeting_id;
  select content into v_current from public.workspace_documents where id = p_document_id for update;
  if v_current is distinct from v_expected then raise exception 'Document changed outside room' using errcode = '40001'; end if;
  update public.workspace_documents d set content = p_content
    from public.workspace_meetings m where d.id = p_document_id and m.id = p_meeting_id and d.ws_id = m.ws_id;
  if not found then raise exception 'Document scope mismatch' using errcode = '42501'; end if;
  update private.meeting_documents set yjs_state = p_state, checkpoint_hash = p_hash, checkpoint_content = p_content, revision = p_version, updated_at = now()
    where meeting_id = p_meeting_id returning revision into v_revision;
  return v_revision;
end $$;
revoke all on function private.read_meeting_document(uuid) from public, anon, authenticated;
revoke all on function private.checkpoint_meeting_document(uuid,uuid,uuid,jsonb,jsonb,text,integer) from public, anon, authenticated;
grant execute on function private.read_meeting_document(uuid) to service_role;
grant execute on function private.checkpoint_meeting_document(uuid,uuid,uuid,jsonb,jsonb,text,integer) to service_role;
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
  if session.protocol <> 'legacy' then
    raise exception 'Legacy reservation cannot reserve self-capture chunks' using errcode = '55000';
  end if;
  select * into chunk from public.meet_ai_chunks
    where session_id = p_session_id and sequence = p_sequence and stream_id is null
    for update;
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

drop function private.checkpoint_meeting_document(uuid,uuid,uuid,jsonb,jsonb,text,integer,bigint);
drop function public.start_meet_ai_session(uuid,uuid,uuid);
drop function public.complete_meet_ai_chunk(uuid,uuid,jsonb);
drop function public.claim_meet_ai_notes(uuid,bigint,timestamptz);
drop function public.save_meet_ai_notes(uuid,bigint,timestamptz,jsonb);
drop function private.lock_meet_content_fence(uuid);
alter table public.meet_ai_sessions drop column notes_erasure_generation;
alter table public.meet_ai_chunks drop column erasure_generation;
alter table private.meeting_documents drop column installed_doc_generation, drop column installed_operation_key;
drop table private.meet_content_fences;
commit;
