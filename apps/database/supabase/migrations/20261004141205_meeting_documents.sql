create table private.meeting_documents (
  meeting_id uuid primary key references public.workspace_meetings(id) on delete cascade,
  document_id uuid not null unique references public.workspace_documents(id) on delete cascade,
  revision integer not null default 0,
  yjs_state jsonb not null default '[]',
  checkpoint_hash text,
  checkpoint_content jsonb not null default '{"type":"doc","content":[]}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table private.meeting_documents enable row level security;
revoke all on private.meeting_documents from public, anon, authenticated;
grant all on private.meeting_documents to service_role;
-- The caller must first prove current Cloudflare room admission. No browser RPC access.
create or replace function private.read_meeting_document(p_meeting_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
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
returns integer language plpgsql security definer set search_path = '' as $$
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
