begin;
set local lock_timeout = '2s';
set local statement_timeout = '10s';

create table private.meet_content_fences (
  meeting_id uuid primary key references public.workspace_meetings(id) on delete cascade,
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  generation bigint not null default 0 check (generation >= 0),
  active_operation_key uuid,
  doc_hold boolean not null default false,
  doc_generation bigint not null default 0 check (doc_generation >= 0),
  restore_hold boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table private.meet_content_fences enable row level security;
revoke all on private.meet_content_fences from public, anon, authenticated;
grant all on private.meet_content_fences to service_role;
alter table private.meeting_documents
  add column installed_doc_generation bigint not null default 0 check (installed_doc_generation >= 0),
  add column installed_operation_key uuid;
alter table public.meet_ai_chunks add column erasure_generation bigint not null default 0;
alter table public.meet_ai_sessions add column notes_erasure_generation bigint;

create or replace function private.lock_meet_content_fence(p_meeting_id uuid)
returns private.meet_content_fences language plpgsql security definer set search_path = pg_catalog, pg_temp set lock_timeout = '2s' set statement_timeout = '10s' as $$
declare f private.meet_content_fences;
begin
  insert into private.meet_content_fences(meeting_id,ws_id)
    select id,ws_id from public.workspace_meetings where id=p_meeting_id
    on conflict (meeting_id) do nothing;
  select * into f from private.meet_content_fences where meeting_id=p_meeting_id for update;
  if not found then raise exception 'Meeting missing' using errcode='P0002'; end if;
  perform set_config('meet.content_fence', jsonb_build_object('meeting_id',p_meeting_id,'generation',f.generation)::text,true);
  return f;
end
$$;

create or replace function public.start_meet_ai_session(p_meeting_id uuid,p_user_id uuid,p_id uuid default gen_random_uuid())
returns public.meet_ai_sessions language plpgsql security definer set search_path = pg_catalog, pg_temp set lock_timeout = '2s' set statement_timeout = '10s' as $$
declare f private.meet_content_fences; s public.meet_ai_sessions;
begin
  f := private.lock_meet_content_fence(p_meeting_id);
  if f.restore_hold then raise exception 'Transcript changed' using errcode='40001'; end if;
  insert into public.meet_ai_sessions(id,meeting_id,user_id) values(p_id,p_meeting_id,p_user_id) returning * into s;
  return s;
end
$$;

create or replace function public.reserve_meet_ai_chunk(
  p_id uuid, p_session_id uuid, p_sequence integer,
  p_start_seconds numeric, p_duration_seconds numeric
) returns public.meet_ai_chunks language plpgsql security definer set search_path = pg_catalog, pg_temp set lock_timeout = '2s' set statement_timeout = '10s' as $$
declare
  session public.meet_ai_sessions;
  f private.meet_content_fences;
  v_meeting_id uuid;
  chunk public.meet_ai_chunks;
begin
  select meeting_id into v_meeting_id from public.meet_ai_sessions where id=p_session_id;
  f := private.lock_meet_content_fence(v_meeting_id);
  if f.restore_hold then raise exception 'Transcript changed' using errcode='40001'; end if;
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
      erasure_generation = f.generation, status = 'processing', attempt_id = gen_random_uuid(), attempt_started_at = now(),
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
  insert into public.meet_ai_chunks(id, session_id, sequence, start_seconds, duration_seconds, erasure_generation)
    values(p_id, p_session_id, p_sequence, p_start_seconds, p_duration_seconds, f.generation) returning * into chunk;
  return chunk;
end;
$$;

create or replace function public.complete_meet_ai_chunk(p_id uuid,p_attempt_id uuid,p_payload jsonb)
returns boolean language plpgsql security definer set search_path = pg_catalog, pg_temp set lock_timeout = '2s' set statement_timeout = '10s' as $$
declare m uuid; sid uuid; f private.meet_content_fences; c public.meet_ai_chunks;
begin
  select s.meeting_id,s.id into m,sid from public.meet_ai_chunks ch join public.meet_ai_sessions s on s.id=ch.session_id where ch.id=p_id;
  if m is null then return false; end if;
  f := private.lock_meet_content_fence(m);
  perform 1 from public.meet_ai_sessions where id=sid for update;
  select * into c from public.meet_ai_chunks where id=p_id for update;
  if p_attempt_id is null or c.attempt_id is distinct from p_attempt_id then return false; end if;
  if c.status = 'completed' then return c.erasure_generation = f.generation and not f.restore_hold; end if;
  if c.status <> 'processing' then return false; end if;
  if f.restore_hold or c.erasure_generation <> f.generation then
    update public.meet_ai_chunks set status='failed' where id=p_id;
    return false;
  end if;
  update public.meet_ai_chunks set status='completed', transcript=p_payload->>'transcript',
    usage=p_payload->'usage',cost_usd=(p_payload->>'cost_usd')::numeric where id=p_id;
  return true;
end
$$;

create or replace function public.claim_meet_ai_notes(p_session_id uuid,p_expected_generation bigint,p_started_at timestamptz)
returns boolean language plpgsql security definer set search_path = pg_catalog, pg_temp set lock_timeout = '2s' set statement_timeout = '10s' as $$
declare m uuid; f private.meet_content_fences;
begin
  select meeting_id into m from public.meet_ai_sessions where id=p_session_id;
  if m is null then return false; end if;
  f := private.lock_meet_content_fence(m);
  if p_expected_generation is null or p_started_at is null or f.restore_hold or f.generation <> p_expected_generation then return false; end if;
  update public.meet_ai_sessions set notes_status='processing',notes_started_at=p_started_at,
    notes_erasure_generation=f.generation where id=p_session_id and notes_status in ('pending','failed');
  return found;
end
$$;

create or replace function public.save_meet_ai_notes(p_session_id uuid,p_expected_generation bigint,p_started_at timestamptz,p_payload jsonb)
returns boolean language plpgsql security definer set search_path = pg_catalog, pg_temp set lock_timeout = '2s' set statement_timeout = '10s' as $$
declare m uuid; f private.meet_content_fences; s public.meet_ai_sessions;
begin
  select meeting_id into m from public.meet_ai_sessions where id=p_session_id;
  if m is null then return false; end if;
  f := private.lock_meet_content_fence(m);
  select * into s from public.meet_ai_sessions where id=p_session_id for update;
  if p_started_at is null or s.notes_started_at is distinct from p_started_at or s.notes_status <> 'processing' then return false; end if;
  if p_expected_generation is null or f.restore_hold or f.generation <> p_expected_generation
      or s.notes_erasure_generation is distinct from p_expected_generation then
    update public.meet_ai_sessions set notes_status='pending',notes_started_at=null where id=p_session_id;
    return false;
  end if;
  update public.meet_ai_sessions set notes_status='completed',notes=p_payload->'notes',
    notes_usage=p_payload->'notes_usage',notes_cost_usd=(p_payload->>'notes_cost_usd')::numeric where id=p_session_id;
  return true;
end
$$;

create or replace function private.read_meeting_document(p_meeting_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp set lock_timeout = '2s' set statement_timeout = '10s' as $$
declare v_meeting public.workspace_meetings; v_doc uuid; v_result jsonb; f private.meet_content_fences;
begin
  f := private.lock_meet_content_fence(p_meeting_id);
  if f.doc_hold or f.restore_hold then raise exception 'Document erasing' using errcode='40001'; end if;
  select * into v_meeting from public.workspace_meetings where id = p_meeting_id;
  if v_meeting.id is null then raise exception 'Meeting missing' using errcode = 'P0002'; end if;
  if exists(select 1 from private.meeting_documents where meeting_id=p_meeting_id and installed_doc_generation <> f.doc_generation) then
    raise exception 'Document erasing' using errcode='40001';
  end if;
  if f.doc_generation <> 0 and not exists(select 1 from private.meeting_documents where meeting_id=p_meeting_id) then
    raise exception 'Document erasing' using errcode='40001';
  end if;
  select document_id into v_doc from private.meeting_documents where meeting_id = p_meeting_id;
  if v_doc is null then
    insert into public.workspace_documents(ws_id, name, is_public, content)
      values(v_meeting.ws_id, v_meeting.name, false, '{"type":"doc","content":[]}'::jsonb) returning id into v_doc;
    insert into private.meeting_documents(meeting_id,document_id) values(p_meeting_id,v_doc);
  end if;
  select jsonb_build_object('documentId',document_id,'revision',revision,'state',yjs_state,'docGeneration',f.doc_generation)
    into v_result from private.meeting_documents where meeting_id = p_meeting_id;
  return v_result;
end $$;

create or replace function private.checkpoint_meeting_document(p_meeting_id uuid,p_document_id uuid,p_owner_id uuid,p_state jsonb,p_content jsonb,p_hash text,p_version integer,p_doc_generation bigint)
returns integer language plpgsql security definer set search_path = pg_catalog, pg_temp set lock_timeout = '2s' set statement_timeout = '10s' as $$
declare v_revision integer; v_expected jsonb; v_current jsonb; f private.meet_content_fences;
begin
  f := private.lock_meet_content_fence(p_meeting_id);
  if f.doc_hold or f.restore_hold or p_doc_generation is null or p_doc_generation <> f.doc_generation
    or exists(select 1 from private.meeting_documents where meeting_id=p_meeting_id and installed_doc_generation <> f.doc_generation) then
    raise exception 'Document erasing' using errcode='40001';
  end if;
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

create or replace function private.checkpoint_meeting_document(p_meeting_id uuid,p_document_id uuid,p_owner_id uuid,p_state jsonb,p_content jsonb,p_hash text,p_version integer)
returns integer language plpgsql security definer set search_path = pg_catalog, pg_temp set lock_timeout = '2s' set statement_timeout = '10s' as $$
begin
  return private.checkpoint_meeting_document(p_meeting_id,p_document_id,p_owner_id,p_state,p_content,p_hash,p_version,0);
end
$$;

revoke all on function private.lock_meet_content_fence(uuid) from public, anon, authenticated;
grant execute on function private.lock_meet_content_fence(uuid) to service_role;
revoke all on function public.start_meet_ai_session(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.start_meet_ai_session(uuid,uuid,uuid) to service_role;
revoke all on function public.reserve_meet_ai_chunk(uuid,uuid,integer,numeric,numeric) from public, anon, authenticated;
grant execute on function public.reserve_meet_ai_chunk(uuid,uuid,integer,numeric,numeric) to service_role;
revoke all on function public.complete_meet_ai_chunk(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.complete_meet_ai_chunk(uuid,uuid,jsonb) to service_role;
revoke all on function public.claim_meet_ai_notes(uuid,bigint,timestamptz) from public, anon, authenticated;
grant execute on function public.claim_meet_ai_notes(uuid,bigint,timestamptz) to service_role;
revoke all on function public.save_meet_ai_notes(uuid,bigint,timestamptz,jsonb) from public, anon, authenticated;
grant execute on function public.save_meet_ai_notes(uuid,bigint,timestamptz,jsonb) to service_role;
revoke all on function private.read_meeting_document(uuid) from public, anon, authenticated;
grant execute on function private.read_meeting_document(uuid) to service_role;
revoke all on function private.checkpoint_meeting_document(uuid,uuid,uuid,jsonb,jsonb,text,integer,bigint) from public, anon, authenticated;
grant execute on function private.checkpoint_meeting_document(uuid,uuid,uuid,jsonb,jsonb,text,integer,bigint) to service_role;
revoke all on function private.checkpoint_meeting_document(uuid,uuid,uuid,jsonb,jsonb,text,integer) from public, anon, authenticated;
grant execute on function private.checkpoint_meeting_document(uuid,uuid,uuid,jsonb,jsonb,text,integer) to service_role;
commit;
