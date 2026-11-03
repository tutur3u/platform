-- V10. Apply only after V3 reader deployment and V2/V4 migrations; Rex gate.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

create table private.meet_content_hold_scopes (
 ws_id uuid primary key references public.workspaces(id),
 epoch bigint not null default 0, ledger_seq bigint not null default 0,
 pending_transition uuid, registry_ready boolean not null default false
);
create table private.meet_erasure_issuances (
 operation_key uuid primary key, ws_id uuid not null, meeting_id uuid not null,
 actor_user_id uuid not null, actor_kind text not null check(actor_kind in ('host','workspace_admin','subject')),
 issued_at timestamptz not null default clock_timestamp(), expires_at timestamptz not null,
 cancelled_at timestamptz, check(expires_at>issued_at)
);
create table private.meet_erasure_operations (
 operation_key uuid primary key, ws_id uuid not null, meeting_id uuid not null,
 state text not null check(state in ('in_progress','held','completed')),
 generation bigint not null, doc_generation bigint not null,
 created_at timestamptz not null default now(), completed_at timestamptz
);
create table private.meet_erasure_store_progress (
 operation_key uuid references private.meet_erasure_operations, store text not null,
 state text not null check(state in ('pending','confirmed','not_applicable','attested_unchanged','held')),
 attempts int not null default 0, next_attempt_at timestamptz, last_error_code text
 check(last_error_code in ('legal_hold','unavailable','reconciliation_required')),
 cursor bigint, receipt jsonb check(receipt is null or (jsonb_typeof(receipt)='object' and receipt-'count'-'hash'-'generation'-'id'-'revision'='{}'::jsonb and (not receipt ? 'count' or receipt->>'count' ~ '^[0-9]+$') and (not receipt ? 'generation' or receipt->>'generation' ~ '^[0-9]+$') and (not receipt ? 'revision' or receipt->>'revision' ~ '^[0-9]+$') and (not receipt ? 'hash' or receipt->>'hash' ~ '^[0-9a-f]{64}$') and (not receipt ? 'id' or receipt->>'id' ~ '^[0-9a-f-]{36}$'))), updated_at timestamptz not null default now(),
 primary key(operation_key,store),
 check(store in ('S-T','S-L','S-DL','S-DS','S-DH','S-PL') or store ~ '^S-X:[a-z0-9_-]+$')
);
create table private.meet_erasure_completions (
 operation_key uuid primary key references private.meet_erasure_operations, completed_at timestamptz not null default now()
);
create table private.meet_erasure_plans (
 operation_key uuid primary key references private.meet_erasure_operations,
 ws_id uuid not null, meeting_id uuid not null, plan_version smallint not null check(plan_version=1),
 plan jsonb not null, plan_hash bytea not null check(octet_length(plan_hash)=32),
 payload_hash bytea not null check(octet_length(payload_hash)=32), ledger_seq bigint not null check(ledger_seq>0),
 ledger_mac bytea not null, history_cutoff_id bigint, attested_state_hash bytea, created_at timestamptz not null default now()
);
create table private.meet_erasure_requests (
 id uuid primary key default gen_random_uuid(), ws_id uuid not null, meeting_id uuid not null,
 requester_user_id uuid not null,
 kind text not null default 'subject_request' check(kind in ('subject_request','document_review')),
 linked_operation_key uuid,
 status text not null default 'pending' check(status in ('pending','escalated','in_progress','on_hold','completed','declined','withdrawn')),
 decline_code text check(decline_code in ('no_lines_found','not_from_subject','abusive_repeat')),
 held_at timestamptz, deferred_duration interval not null default interval '0', resume_status text,
 resolved_by uuid, resolved_at timestamptz, operation_key uuid, created_at timestamptz not null default now()
);
create unique index meet_erasure_open_request on private.meet_erasure_requests(meeting_id,requester_user_id)
 where status in ('pending','escalated','in_progress','on_hold');
create table private.meet_transcript_erasures (
 id uuid primary key default gen_random_uuid(), ws_id uuid not null, meeting_id uuid not null,
 actor_user_id uuid references public.users(id) on delete set null,
 actor_role text not null check(actor_role in ('host','workspace_admin','subject','tuturuuu_operator')),
 subject_kind text not null check(subject_kind in ('account','selection','recording','whole_transcript')),
 subject_tag bytea, subject_key_version smallint, reason text not null
 check(reason in ('participant_request','recorded_by_mistake','legal_request','other')),
 request_id uuid, session_ids uuid[] not null,
 lines_erased int not null check(lines_erased>=0), chunks_touched int not null check(chunks_touched>=0),
 notes_cleared int not null check(notes_cleared>=0), edited_notes_cleared int not null check(edited_notes_cleared>=0),
 shared_audio_lines int not null default 0 check(shared_audio_lines>=0), doc_blocks_removed int not null default 0,
 doc_decision text not null check(doc_decision in ('none','blocks','whole','leave')),
 operation_key uuid unique not null, payload_hash bytea not null check(octet_length(payload_hash)=32),
 generation_after bigint not null, created_at timestamptz not null default now(),
 check((subject_tag is null and subject_key_version is null) or (octet_length(subject_tag)=32 and subject_key_version>0))
);
create table private.meet_erasure_events (
 id uuid primary key default gen_random_uuid(), operation_key uuid not null, ws_id uuid not null, meeting_id uuid not null,
 event text not null check(event in ('history_cleared','attested_nothing','playground_deleted','document_review_linked','owner_notified')),
 store text, actor_user_id uuid references public.users(id) on delete set null, actor_role text not null,
 subject_tag bytea, subject_key_version smallint, created_at timestamptz not null default now()
);
create table private.meet_collaboration_rooms (
 ws_id uuid not null, meeting_id uuid not null, resource text not null check(resource in ('playground','problem')),
 resource_id uuid not null, first_seen_at timestamptz not null default now(), erased_operation_key uuid,
 primary key(meeting_id,resource,resource_id)
);
create table private.meet_content_apply_leases (
 id uuid primary key default gen_random_uuid(), ws_id uuid not null, meeting_id uuid not null,
 operation_key uuid not null references private.meet_erasure_operations, store text not null,
 hold_epoch bigint not null, ticket_nonce uuid unique not null,
 expires_at timestamptz not null, settled_at timestamptz, result text check(result in ('confirmed','refused','unknown')),
 created_at timestamptz not null default clock_timestamp(),
 check(expires_at>created_at and expires_at<=created_at+interval '30 seconds')
);

create function private.check_meet_erase_workspace(p_ws_id uuid) returns void
language plpgsql immutable set search_path=pg_catalog,pg_temp as $$
begin
 -- Match the existing excluded workspace without publishing its identifier.
 if p_ws_id is null or sha256(convert_to(p_ws_id::text,'UTF8'))=decode('d2ed2d5bb8f94f099ba7167cac02018858573eac129ba71f42aec33eb5eca21a','hex') then
 raise exception 'MEET_ERASE_UNAVAILABLE' using errcode='42501'; end if;
end $$;

create function private.lock_meet_hold_barrier(p_ws_id uuid,p_transition boolean default false)
returns private.meet_content_hold_scopes language plpgsql security definer
set search_path=pg_catalog,pg_temp set lock_timeout='2s' as $$
declare b private.meet_content_hold_scopes;
begin
 perform private.check_meet_erase_workspace(p_ws_id);
 -- Provision once before any shared admission: no insert/upsert or lock upgrade here.
 if p_transition then
  select * into b from private.meet_content_hold_scopes where ws_id=p_ws_id for update;
 else
  select * into b from private.meet_content_hold_scopes where ws_id=p_ws_id for share;
 end if;
 if not found then raise exception 'MEET_ERASE_REGISTRY_UNREADY' using errcode='55000'; end if;
 return b;
end $$;

create function private.check_meet_destructive_batch(p_ws_id uuid,p_meeting_id uuid)
returns bigint language plpgsql security definer set search_path=pg_catalog,pg_temp set lock_timeout='2s' as $$
declare b private.meet_content_hold_scopes;
begin
 b:=private.lock_meet_hold_barrier(p_ws_id,false);
 if not b.registry_ready or b.pending_transition is not null then
 raise exception 'MEET_ERASE_REGISTRY_UNREADY' using errcode='55000'; end if;
 if not exists(select 1 from public.workspace_meetings where id=p_meeting_id and ws_id=p_ws_id) then
 raise exception 'MEET_ERASE_NOT_FOUND' using errcode='P0002'; end if;
 perform private.lock_meet_content_fence(p_meeting_id);
 if exists(select 1 from private.meet_content_holds where ws_id=p_ws_id and (meeting_id is null or meeting_id=p_meeting_id) and released_at is null) then
 raise exception 'MEET_ERASE_LEGAL_HOLD' using errcode='55000'; end if;
 return b.epoch;
end $$;

-- V9 owns ledger append/projection. Its projection must retain this trigger.
create function private.serialize_meet_hold_transition() returns trigger
language plpgsql security definer set search_path=pg_catalog,pg_temp set lock_timeout='2s' as $$
declare b private.meet_content_hold_scopes; w uuid;
begin
 w:=case when TG_OP='DELETE' then old.ws_id else new.ws_id end;
 b:=private.lock_meet_hold_barrier(w,true);
 if TG_OP='UPDATE' and (old.ws_id,old.meeting_id) is distinct from (new.ws_id,new.meeting_id) then
 raise exception 'Hold scope is immutable'; end if;
 if b.pending_transition is null or exists(select 1 from private.meet_content_apply_leases
 where ws_id=w and (settled_at is null or result='unknown')) then
 raise exception 'MEET_ERASE_HOLD_PROJECTION_PENDING' using errcode='55000'; end if;
 return case when TG_OP='DELETE' then old else new end;
end $$;
create trigger meet_hold_barrier before insert or update or delete on private.meet_content_holds
 for each row execute function private.serialize_meet_hold_transition();

create function private.admit_meet_erase_apply(p_ws_id uuid,p_meeting_id uuid,p_key uuid,p_store text,p_nonce uuid,p_ticket_exp timestamptz)
returns private.meet_content_apply_leases language plpgsql security definer
set search_path=pg_catalog,pg_temp set lock_timeout='2s' as $$
declare e bigint; l private.meet_content_apply_leases;
begin
 e:=private.check_meet_destructive_batch(p_ws_id,p_meeting_id);
 if p_ticket_exp is null or p_ticket_exp<=clock_timestamp() or p_ticket_exp>clock_timestamp()+interval '30 seconds' then
 raise exception 'MEET_ERASE_EXPIRED'; end if;
 if not exists(select 1 from private.meet_erasure_operations o join private.meet_erasure_store_progress s using(operation_key)
 where o.operation_key=p_key and o.ws_id=p_ws_id and o.meeting_id=p_meeting_id and s.store=p_store and s.state='pending') then
 raise exception 'MEET_ERASE_STALE'; end if;
 insert into private.meet_content_apply_leases(ws_id,meeting_id,operation_key,store,hold_epoch,ticket_nonce,expires_at)
 values(p_ws_id,p_meeting_id,p_key,p_store,e,p_nonce,p_ticket_exp) returning * into l;
 return l;
end $$;

create function private.decide_meet_erasure_finality(p_ws_id uuid,p_meeting_id uuid,p_operation_key uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,pg_temp set lock_timeout='2s' as $$
declare i private.meet_erasure_issuances; s text;
begin
 perform private.check_meet_erase_workspace(p_ws_id);
 if not exists(select 1 from public.workspace_meetings where id=p_meeting_id and ws_id=p_ws_id) then raise exception 'MEET_ERASE_NOT_FOUND' using errcode='P0002'; end if;
 perform private.lock_meet_hold_barrier(p_ws_id,false);
 perform private.lock_meet_content_fence(p_meeting_id);
 select * into i from private.meet_erasure_issuances where operation_key=p_operation_key and ws_id=p_ws_id and meeting_id=p_meeting_id for update;
 if not found then raise exception 'MEET_ERASE_NOT_FOUND' using errcode='P0002'; end if;
 select state into s from private.meet_erasure_operations where operation_key=p_operation_key and ws_id=p_ws_id and meeting_id=p_meeting_id;
 if found then return jsonb_build_object('state',s); end if;
 if clock_timestamp()<=i.expires_at then return jsonb_build_object('state','unknown'); end if;
 update private.meet_erasure_issuances set cancelled_at=coalesce(cancelled_at,clock_timestamp()) where operation_key=p_operation_key;
 -- Route must append aborted to V9 before exposing not_committed.
 return jsonb_build_object('state','cancelled','ledger_outcome_required',true);
exception when lock_not_available then return jsonb_build_object('state','unknown');
end $$;

create function private.meet_erasure_target(p_meeting_id uuid,p_account uuid,p_selection jsonb,p_session uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,pg_temp as $$
 with eligible as (
 select c.*,s.notes,s.notes_edited,s.notes_status,s.notes_started_at,
 case when jsonb_typeof(c.usage->'segments')='array' then
 (select jsonb_agg((n-1)::int order by n) from jsonb_array_elements(c.usage->'segments') with ordinality a(x,n)
 where x->>'erased' is distinct from 'true' and
 ((p_account is not null and x->'speaker'->>'accountId'=p_account::text) or
 (p_account is null and exists(select 1 from jsonb_array_elements(p_selection) q where q->>'chunk_id'=c.id::text and (q->>'segment_index')::int=n-1))))
 else case when c.usage->>'erased' is distinct from 'true' and
 ((p_account is not null and c.usage->'speaker'->>'accountId'=p_account::text) or
 (p_account is null and exists(select 1 from jsonb_array_elements(p_selection) q where q->>'chunk_id'=c.id::text and (q->>'segment_index')::int=0)))
 then '"single_speaker"'::jsonb end end as selected
 from public.meet_ai_sessions s join public.meet_ai_chunks c on c.session_id=s.id
 where s.meeting_id=p_meeting_id and (p_session is null or s.id=p_session)
 ), targets as (select * from eligible where selected is not null),
 sessions as (select distinct session_id,notes,notes_edited,notes_status,notes_started_at from targets)
 select jsonb_build_object(
 'chunks',coalesce((select jsonb_agg(jsonb_build_object('chunk_id',id,'segments',selected) order by id) from targets),'[]'),
 'sessions',coalesce((select jsonb_agg(session_id order by session_id) from sessions),'[]'),
 'chunks_touched',(select count(*) from targets),
 'lines_erased',coalesce((select sum(case when selected='"single_speaker"'::jsonb then 1 else jsonb_array_length(selected) end) from targets),0),
 'notes_cleared',(select count(*) from sessions where notes is not null),
 'edited_notes_cleared',(select count(*) from sessions where notes_edited is not null),
 'digest',encode(sha256(convert_to(jsonb_build_object(
 'chunks',coalesce((select jsonb_agg(jsonb_build_array(id,transcript,usage,status) order by id) from targets),'[]'),
 'sessions',coalesce((select jsonb_agg(jsonb_build_array(session_id,notes,notes_edited,notes_status,notes_started_at) order by session_id) from sessions),'[]'))::text,'UTF8')),'hex'))
$$;

create function private.plan_meet_subject_erasure(p_ws_id uuid,p_meeting_id uuid,p_account uuid,p_session uuid default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,pg_temp set lock_timeout='2s' as $$
declare t jsonb; g bigint;
begin
 perform private.check_meet_erase_workspace(p_ws_id);
 if p_account is null or not exists(select 1 from public.workspace_meetings where id=p_meeting_id and ws_id=p_ws_id) then
 raise exception 'MEET_ERASE_NOT_FOUND' using errcode='P0002'; end if;
 -- Hold the meeting fence while reading generation then content. Departed verified speakers remain eligible.
 perform private.lock_meet_hold_barrier(p_ws_id,false);
 g:=(private.lock_meet_content_fence(p_meeting_id)).generation;
 t:=private.meet_erasure_target(p_meeting_id,p_account,null,p_session);
 if (t->>'lines_erased')::int=0 then raise exception 'MEET_ERASE_NO_LINES' using errcode='42501'; end if;
 return t||jsonb_build_object('generation',g,'transcript',jsonb_build_object('chunks',t->'chunks','sessions',t->'sessions'));
end $$;
create function private.count_meet_subject_segments(p_ws_id uuid,p_meeting_id uuid,p_account uuid,p_session uuid default null)
returns integer language sql security definer set search_path=pg_catalog,pg_temp as $$
 select (private.plan_meet_subject_erasure(p_ws_id,p_meeting_id,p_account,p_session)->>'lines_erased')::int
$$;

create function private.erase_meet_transcript_contributions(
 p_meeting_id uuid,p_ws_id uuid,p_actor_id uuid,p_subject_account_id uuid,
 p_subject_tag bytea,p_subject_key_version smallint,p_selection jsonb,p_session_id uuid,
 p_reason text,p_request_id uuid,p_doc_decision text,p_doc_plan jsonb,p_doc_freeze_confirmed boolean,
 p_operation_key uuid,p_payload_hash bytea,p_expected_generation bigint,p_expected_digest bytea,p_expires_at timestamptz,
 p_self boolean,p_plan jsonb,p_plan_hash bytea,p_ledger_seq bigint,p_ledger_mac bytea,
 p_playground_decision text,p_history_ack boolean)
returns jsonb language plpgsql security definer set search_path=pg_catalog,pg_temp set lock_timeout='2s' as $$
declare
 f private.meet_content_fences; i private.meet_erasure_issuances; a private.meet_transcript_erasures;
 d private.meeting_documents; t jsonb; expected jsonb; item jsonb; seg jsonb; rewritten jsonb;
 v_chunk public.meet_ai_chunks; role_name text; actor_member boolean; ids uuid[]; cutoff bigint;
 doc_target bigint; store_name text; pg_plan jsonb; doc_plan jsonb; stores jsonb;
 shared_count int:=0;
begin
 perform private.check_meet_erase_workspace(p_ws_id);
 if not exists(select 1 from public.workspace_meetings where id=p_meeting_id and ws_id=p_ws_id) then raise exception 'MEET_ERASE_NOT_FOUND' using errcode='P0002'; end if;
 actor_member:=exists(select 1 from public.workspace_members where ws_id=p_ws_id and user_id=p_actor_id);
 if p_self is null then raise exception 'MEET_ERASE_INVALID_TARGET'; end if;
 if p_self is true then
  if p_actor_id is distinct from p_subject_account_id or p_actor_id is null or p_selection is not null or
  p_doc_decision is distinct from 'none' or p_playground_decision is distinct from 'none' then raise exception 'MEET_ERASE_FORBIDDEN' using errcode='42501'; end if;
  role_name:='subject';
 elsif actor_member and exists(select 1 from public.workspace_meetings where id=p_meeting_id and creator_id=p_actor_id) then role_name:='host';
 elsif actor_member and public.has_workspace_permission(p_ws_id,p_actor_id,'admin') then role_name:='workspace_admin';
 else raise exception 'MEET_ERASE_FORBIDDEN' using errcode='42501'; end if;
 perform private.lock_meet_hold_barrier(p_ws_id,false);
 if p_subject_account_id is not null and (p_subject_tag is null or octet_length(p_subject_tag)<>32 or p_subject_key_version is null or p_subject_key_version<1) or p_subject_account_id is null and (p_subject_tag is not null or p_subject_key_version is not null) then raise exception 'MEET_ERASE_INVALID_TARGET'; end if;
 f:=private.lock_meet_content_fence(p_meeting_id);
 select * into i from private.meet_erasure_issuances where operation_key=p_operation_key for update;
 if not found or (i.ws_id,i.meeting_id,i.actor_user_id,i.actor_kind) is distinct from (p_ws_id,p_meeting_id,p_actor_id,role_name) then raise exception 'MEET_ERASE_KEY_CONFLICT'; end if;
 select * into a from private.meet_transcript_erasures where operation_key=p_operation_key;
 if found then
  if a.payload_hash is distinct from p_payload_hash or a.ws_id<>p_ws_id or a.meeting_id<>p_meeting_id or a.actor_user_id is distinct from p_actor_id then raise exception 'MEET_ERASE_KEY_CONFLICT'; end if;
  return jsonb_build_object('operationKey',p_operation_key,'replayed',true,'state',(select state from private.meet_erasure_operations where operation_key=p_operation_key));
 end if;
 if i.cancelled_at is not null or clock_timestamp()>i.expires_at or p_expires_at is distinct from i.expires_at then raise exception 'MEET_ERASE_EXPIRED'; end if;
 if f.restore_hold or f.doc_hold then raise exception 'MEET_ERASE_CONFLICT'; end if;
 -- Release only document-terminal predecessors; unrelated S-X work resumes by its own plan.
 if f.active_operation_key is not null and exists(select 1 from private.meet_erasure_store_progress where operation_key=f.active_operation_key and store in ('S-DL','S-DS','S-PL') and state not in ('confirmed','not_applicable','attested_unchanged')) then raise exception 'MEET_ERASE_CONFLICT'; end if;
 perform 1 from public.meet_ai_sessions where meeting_id=p_meeting_id order by id for update;
 if exists(select 1 from public.meet_ai_sessions where meeting_id=p_meeting_id and ended_at is null) or
 exists(select 1 from public.meet_ai_chunks c join public.meet_ai_sessions s on s.id=c.session_id where s.meeting_id=p_meeting_id and c.status='processing' and c.attempt_started_at>clock_timestamp()-interval '90 seconds') then raise exception 'MEET_ERASE_PROCESSING'; end if;
 if (p_subject_account_id is null)=(p_selection is null) then raise exception 'MEET_ERASE_INVALID_TARGET'; end if;
 if p_selection is not null and (jsonb_typeof(p_selection)<>'array' or jsonb_array_length(p_selection)>500) then raise exception 'MEET_ERASE_TOO_LARGE'; end if;
 t:=private.meet_erasure_target(p_meeting_id,p_subject_account_id,p_selection,p_session_id);
 if (t->>'chunks_touched')::int>2000 or (t->>'lines_erased')::int>2000 or jsonb_array_length(t->'sessions')>20 then raise exception 'MEET_ERASE_TOO_LARGE'; end if;
 if (t->>'lines_erased')::int=0 or p_selection is not null and jsonb_array_length(p_selection)<>(t->>'lines_erased')::int then raise exception 'MEET_ERASE_STALE'; end if;
 perform 1 from public.meet_ai_chunks where id in (select (x->>'chunk_id')::uuid from jsonb_array_elements(t->'chunks') x) order by id for update;
 t:=private.meet_erasure_target(p_meeting_id,p_subject_account_id,p_selection,p_session_id);
 if p_expected_generation is distinct from f.generation or p_expected_digest is distinct from decode(t->>'digest','hex') then raise exception 'MEET_ERASE_STALE'; end if;
 select array_agg(x::uuid) into ids from jsonb_array_elements_text(t->'sessions') x;
 select * into d from private.meeting_documents where meeting_id=p_meeting_id for update;
 doc_target:=f.doc_generation;
 if d.meeting_id is not null and not p_self then
  perform 1 from public.workspace_documents where id=d.document_id and ws_id=p_ws_id for update;
  if not found or jsonb_typeof(p_doc_plan) is distinct from 'object' or p_doc_decision is null or p_doc_decision not in ('blocks','whole','leave') or p_doc_freeze_confirmed is not true or
   (p_doc_plan->>'document_id')::uuid is distinct from d.document_id or (p_doc_plan->>'doc_generation')::bigint is distinct from f.doc_generation then raise exception 'MEET_ERASE_STALE'; end if;
  if exists(select 1 from jsonb_object_keys(p_doc_plan) k where k not in ('document_id','doc_generation','decision','pre_state_hash','blocks')) or p_doc_plan->>'pre_state_hash' is null or p_doc_plan->>'pre_state_hash' !~ '^[0-9a-f]{64}$' or exists(select 1 from jsonb_array_elements(coalesce(p_doc_plan->'blocks','[]')) b where b->>'index' is null or b->>'block_sha256' is null or b->>'index' !~ '^[0-9]+$' or b->>'block_sha256' !~ '^[0-9a-f]{64}$' or (b-'index'-'block_sha256')<>'{}'::jsonb) then raise exception 'MEET_ERASE_INVALID_PLAN'; end if;
  if jsonb_array_length(coalesce(p_doc_plan->'blocks','[]'))>200 then raise exception 'MEET_ERASE_TOO_LARGE'; end if;
  if p_history_ack is not true then raise exception 'MEET_ERASE_HISTORY_ACK_REQUIRED'; end if;
  doc_plan:=p_doc_plan-'doc_generation';
  if doc_plan->>'decision' is distinct from p_doc_decision then raise exception 'MEET_ERASE_STALE'; end if;
  if p_doc_decision in ('blocks','whole') then doc_target:=f.doc_generation+1; end if;
  select max(rv.id) into cutoff from audit.record_version rv where rv.record_id=audit.to_record_id('public.workspace_documents'::regclass,array['id'],jsonb_build_object('id',d.document_id)) and rv.table_oid='public.workspace_documents'::regclass;
 elsif p_doc_decision is distinct from 'none' then raise exception 'MEET_ERASE_STALE'; end if;
 if exists(select 1 from private.meet_collaboration_rooms where meeting_id=p_meeting_id and ws_id=p_ws_id) and not p_self then
  if p_playground_decision is null or p_playground_decision not in ('whole','leave') then raise exception 'MEET_ERASE_STALE'; end if;
  select jsonb_build_object('decision',p_playground_decision,'rooms',jsonb_agg(jsonb_build_object('resource',resource,'resource_id',resource_id) order by resource,resource_id)) into pg_plan from private.meet_collaboration_rooms where meeting_id=p_meeting_id and ws_id=p_ws_id;
 elsif p_playground_decision is distinct from 'none' then raise exception 'MEET_ERASE_STALE'; end if;
 stores:=jsonb_build_array('S-T','S-L','S-X:inventory');
 if doc_plan is not null then stores:=stores||'["S-DL","S-DS","S-DH"]'; end if;
 if pg_plan is not null then stores:=stores||'["S-PL"]'; end if;
 expected:=jsonb_build_object('v',1,'kind','meeting_erase','ws_id',p_ws_id,'meeting_id',p_meeting_id,'operation_key',p_operation_key,
 'actor_role',role_name,'subject',case when p_subject_account_id is null then jsonb_build_object('kind','selection') else jsonb_build_object('tag',encode(p_subject_tag,'hex'),'key_version',p_subject_key_version) end,
 'generation_target',f.generation+1,'doc_generation_target',case when doc_plan is not null then doc_target end,
 'transcript',jsonb_build_object('chunks',t->'chunks','sessions',t->'sessions'),'document',doc_plan,'playground',pg_plan,'label_removal',null,'recording',null,'stores',stores);
 if expected is distinct from p_plan or p_plan_hash is distinct from sha256(convert_to(expected::text,'UTF8')) or p_ledger_seq is null or p_ledger_seq<=0 or p_ledger_mac is null then raise exception 'MEET_ERASE_STALE'; end if;
 -- Authoritative 9b recheck after all target locks. Shared barrier is already held, never upgraded.
 perform private.check_meet_destructive_batch(p_ws_id,p_meeting_id);
 if exists(select 1 from public.meet_ai_chunks c cross join lateral jsonb_object_keys(c.usage) k where c.id in (select (x->>'chunk_id')::uuid from jsonb_array_elements(t->'chunks') x)
 and k not in ('model','available','inputTokens','audioTokens','outputTokens','pricing','pricingDate','currency','segments','speaker','erased')) then raise exception 'MEET_ERASE_UNCLASSIFIED'; end if;
 if p_request_id is not null then
  perform 1 from private.meet_erasure_requests where id=p_request_id and ws_id=p_ws_id and meeting_id=p_meeting_id and status in ('pending','escalated') and (p_subject_account_id is null or requester_user_id=p_subject_account_id) for update;
  if not found then raise exception 'MEET_ERASE_STALE'; end if;
 end if;
 for item in select x from jsonb_array_elements(t->'chunks') x loop
  select * into v_chunk from public.meet_ai_chunks where id=(item->>'chunk_id')::uuid;
  if item->'segments'='"single_speaker"'::jsonb then
   if v_chunk.usage->'speaker'->>'kind'='shared_audio' then shared_count:=shared_count+1; end if;
   update public.meet_ai_chunks set transcript='',usage=(usage-'speaker')||'{"erased":true}' where id=v_chunk.id;
  else
   select count(*)+shared_count into shared_count from jsonb_array_elements(v_chunk.usage->'segments') with ordinality a(x,n) where item->'segments' @> to_jsonb((n-1)::int) and x->>'kind'='shared_audio';
   select jsonb_agg(case when item->'segments' @> to_jsonb((n-1)::int) then '{"erased":true}'::jsonb else x end order by n) into rewritten from jsonb_array_elements(v_chunk.usage->'segments') with ordinality a(x,n);
   update public.meet_ai_chunks set usage=(usage-'speaker')||jsonb_build_object('segments',rewritten),transcript=(select coalesce(string_agg(x->>'transcript',E'\n' order by n),'') from jsonb_array_elements(rewritten) with ordinality a(x,n) where x->>'erased' is distinct from 'true') where id=v_chunk.id;
  end if;
 end loop;
 update public.meet_ai_sessions set notes=null,notes_edited=case when p_self then notes_edited else null end,notes_status='pending',notes_started_at=null where id=any(ids);
 update private.meet_content_fences set generation=generation+1,doc_generation=doc_target,active_operation_key=p_operation_key,doc_hold=(p_doc_decision in ('blocks','whole')),updated_at=now() where meeting_id=p_meeting_id;
 perform set_config('meet.content_fence',jsonb_build_object('meeting_id',p_meeting_id,'generation',f.generation+1)::text,true);
 if p_doc_decision in ('blocks','whole') then update public.workspace_documents set content='{"type":"doc","content":[]}' where id=d.document_id and ws_id=p_ws_id; end if;
 update private.meet_erasure_requests set status='in_progress',operation_key=p_operation_key where id=p_request_id;
 insert into private.meet_transcript_erasures(ws_id,meeting_id,actor_user_id,actor_role,subject_kind,subject_tag,subject_key_version,reason,request_id,session_ids,lines_erased,chunks_touched,notes_cleared,edited_notes_cleared,shared_audio_lines,doc_decision,operation_key,payload_hash,generation_after)
 values(p_ws_id,p_meeting_id,p_actor_id,role_name,case when p_subject_account_id is null then 'selection' else 'account' end,p_subject_tag,p_subject_key_version,p_reason,p_request_id,ids,(t->>'lines_erased')::int,(t->>'chunks_touched')::int,(t->>'notes_cleared')::int,case when p_self then 0 else (t->>'edited_notes_cleared')::int end,shared_count,p_doc_decision,p_operation_key,p_payload_hash,f.generation+1);
 insert into private.meet_erasure_operations(operation_key,ws_id,meeting_id,state,generation,doc_generation) values(p_operation_key,p_ws_id,p_meeting_id,'in_progress',f.generation+1,doc_target);
 insert into private.meet_erasure_plans(operation_key,ws_id,meeting_id,plan_version,plan,plan_hash,payload_hash,ledger_seq,ledger_mac,history_cutoff_id,attested_state_hash)
 values(p_operation_key,p_ws_id,p_meeting_id,1,p_plan,p_plan_hash,p_payload_hash,p_ledger_seq,p_ledger_mac,cutoff,case when p_doc_decision='leave' then decode(p_doc_plan->>'pre_state_hash','hex') end);
 for store_name in select jsonb_array_elements_text(stores) loop
 insert into private.meet_erasure_store_progress(operation_key,store,state) values(p_operation_key,store_name,case when store_name='S-T' then 'confirmed' when store_name in ('S-DL','S-DS') and p_doc_decision='leave' or store_name='S-PL' and p_playground_decision='leave' then 'attested_unchanged' else 'pending' end);
 end loop;
 if p_doc_decision='leave' or p_playground_decision='leave' then insert into private.meet_erasure_events(operation_key,ws_id,meeting_id,event,actor_user_id,actor_role,subject_tag,subject_key_version) values(p_operation_key,p_ws_id,p_meeting_id,'attested_nothing',p_actor_id,role_name,p_subject_tag,p_subject_key_version); end if;
 if p_self and (d.meeting_id is not null or exists(select 1 from private.meet_collaboration_rooms where meeting_id=p_meeting_id) or exists(select 1 from public.meet_ai_sessions where id=any(ids) and notes_edited is not null)) then
 insert into private.meet_erasure_requests(ws_id,meeting_id,requester_user_id,kind,linked_operation_key) values(p_ws_id,p_meeting_id,p_actor_id,'document_review',p_operation_key)
 on conflict(meeting_id,requester_user_id) where status in ('pending','escalated','in_progress','on_hold') do update set linked_operation_key=p_operation_key;
 end if;
 return jsonb_build_object('operationKey',p_operation_key,'state','in_progress','replayed',false,'linesErased',(t->>'lines_erased')::int);
end $$;

create function private.defer_meet_subject_erasure(p_ws_id uuid,p_meeting_id uuid,p_actor_id uuid)
returns uuid language plpgsql security definer set search_path=pg_catalog,pg_temp set lock_timeout='2s' as $$
declare r uuid;
begin
 perform private.check_meet_erase_workspace(p_ws_id);
 perform private.plan_meet_subject_erasure(p_ws_id,p_meeting_id,p_actor_id,null);
 if not exists(select 1 from private.meet_content_holds where ws_id=p_ws_id and (meeting_id is null or meeting_id=p_meeting_id) and released_at is null) then raise exception 'MEET_ERASE_NOT_HELD'; end if;
 insert into private.meet_erasure_requests(ws_id,meeting_id,requester_user_id,status,held_at,resume_status)
 values(p_ws_id,p_meeting_id,p_actor_id,'on_hold',clock_timestamp(),'pending')
 on conflict(meeting_id,requester_user_id) where status in ('pending','escalated','in_progress','on_hold') do update
 set status='on_hold',held_at=coalesce(meet_erasure_requests.held_at,excluded.held_at),resume_status=coalesce(meet_erasure_requests.resume_status,meet_erasure_requests.status)
 returning id into r;
 return r;
end $$;

create function private.protect_meet_erasure_record() returns trigger
language plpgsql set search_path=pg_catalog,pg_temp as $$
begin
 if TG_OP='UPDATE' and TG_TABLE_NAME='meet_erasure_plans' and to_jsonb(old)-'plan'=to_jsonb(new)-'plan' and (to_jsonb(old)->'plan')->'document' is not null and
 (to_jsonb(new)->'plan')=jsonb_set((to_jsonb(old)->'plan'),'{document,blocks}',coalesce((select jsonb_agg(b||jsonb_build_object('block_sha256',null) order by n) from jsonb_array_elements((to_jsonb(old)->'plan')->'document'->'blocks') with ordinality x(b,n)),'[]'::jsonb)) then return new; end if;
 -- FK account deletion can only remove the actor link, never change the receipt.
 if TG_OP='UPDATE' and pg_trigger_depth()>1 and TG_TABLE_NAME in ('meet_transcript_erasures','meet_erasure_events') and
 to_jsonb(old)->>'actor_user_id' is not null and to_jsonb(new)->>'actor_user_id' is null and
 to_jsonb(old)-'actor_user_id'=to_jsonb(new)-'actor_user_id' then return new; end if;
 raise exception 'MEET_ERASE_IMMUTABLE' using errcode='55000';
end $$;
alter table private.meet_content_hold_scopes enable row level security;
revoke all on private.meet_content_hold_scopes from public,anon,authenticated,service_role;
grant select,insert on private.meet_content_hold_scopes to service_role;
grant update on private.meet_content_hold_scopes to service_role;
alter table private.meet_erasure_issuances enable row level security;
revoke all on private.meet_erasure_issuances from public,anon,authenticated,service_role;
grant select,insert on private.meet_erasure_issuances to service_role;
grant update on private.meet_erasure_issuances to service_role;
alter table private.meet_erasure_operations enable row level security;
revoke all on private.meet_erasure_operations from public,anon,authenticated,service_role;
grant select,insert on private.meet_erasure_operations to service_role;
grant update on private.meet_erasure_operations to service_role;
alter table private.meet_erasure_store_progress enable row level security;
revoke all on private.meet_erasure_store_progress from public,anon,authenticated,service_role;
grant select,insert on private.meet_erasure_store_progress to service_role;
grant update on private.meet_erasure_store_progress to service_role;
alter table private.meet_erasure_completions enable row level security;
revoke all on private.meet_erasure_completions from public,anon,authenticated,service_role;
grant select,insert on private.meet_erasure_completions to service_role;
alter table private.meet_erasure_plans enable row level security;
revoke all on private.meet_erasure_plans from public,anon,authenticated,service_role;
grant select,insert on private.meet_erasure_plans to service_role;
alter table private.meet_erasure_requests enable row level security;
revoke all on private.meet_erasure_requests from public,anon,authenticated,service_role;
grant select,insert on private.meet_erasure_requests to service_role;
grant update on private.meet_erasure_requests to service_role;
alter table private.meet_transcript_erasures enable row level security;
revoke all on private.meet_transcript_erasures from public,anon,authenticated,service_role;
grant select,insert on private.meet_transcript_erasures to service_role;
alter table private.meet_erasure_events enable row level security;
revoke all on private.meet_erasure_events from public,anon,authenticated,service_role;
grant select,insert on private.meet_erasure_events to service_role;
alter table private.meet_collaboration_rooms enable row level security;
revoke all on private.meet_collaboration_rooms from public,anon,authenticated,service_role;
grant select,insert on private.meet_collaboration_rooms to service_role;
grant update on private.meet_collaboration_rooms to service_role;
alter table private.meet_content_apply_leases enable row level security;
revoke all on private.meet_content_apply_leases from public,anon,authenticated,service_role;
grant select,insert on private.meet_content_apply_leases to service_role;
grant update on private.meet_content_apply_leases to service_role;
create trigger meet_transcript_erasures_immutable before update or delete on private.meet_transcript_erasures for each row execute function private.protect_meet_erasure_record();
create trigger meet_erasure_plans_immutable before update or delete on private.meet_erasure_plans for each row execute function private.protect_meet_erasure_record();
create trigger meet_erasure_completions_immutable before update or delete on private.meet_erasure_completions for each row execute function private.protect_meet_erasure_record();
create trigger meet_erasure_events_immutable before update or delete on private.meet_erasure_events for each row execute function private.protect_meet_erasure_record();
revoke all on function private.check_meet_erase_workspace(uuid) from public,anon,authenticated,service_role;
revoke all on function private.lock_meet_hold_barrier(uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function private.lock_meet_hold_barrier(uuid,boolean) to service_role;
revoke all on function private.check_meet_destructive_batch(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.check_meet_destructive_batch(uuid,uuid) to service_role;
revoke all on function private.serialize_meet_hold_transition() from public,anon,authenticated,service_role;
revoke all on function private.admit_meet_erase_apply(uuid,uuid,uuid,text,uuid,timestamptz) from public,anon,authenticated,service_role;
grant execute on function private.admit_meet_erase_apply(uuid,uuid,uuid,text,uuid,timestamptz) to service_role;
revoke all on function private.decide_meet_erasure_finality(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.decide_meet_erasure_finality(uuid,uuid,uuid) to service_role;
revoke all on function private.meet_erasure_target(uuid,uuid,jsonb,uuid) from public,anon,authenticated,service_role;
revoke all on function private.plan_meet_subject_erasure(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.plan_meet_subject_erasure(uuid,uuid,uuid,uuid) to service_role;
revoke all on function private.count_meet_subject_segments(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.count_meet_subject_segments(uuid,uuid,uuid,uuid) to service_role;
revoke all on function private.erase_meet_transcript_contributions(uuid,uuid,uuid,uuid,bytea,smallint,jsonb,uuid,text,uuid,text,jsonb,boolean,uuid,bytea,bigint,bytea,timestamptz,boolean,jsonb,bytea,bigint,bytea,text,boolean) from public,anon,authenticated,service_role;
grant execute on function private.erase_meet_transcript_contributions(uuid,uuid,uuid,uuid,bytea,smallint,jsonb,uuid,text,uuid,text,jsonb,boolean,uuid,bytea,bigint,bytea,timestamptz,boolean,jsonb,bytea,bigint,bytea,text,boolean) to service_role;
revoke all on function private.defer_meet_subject_erasure(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.defer_meet_subject_erasure(uuid,uuid,uuid) to service_role;
revoke all on function private.protect_meet_erasure_record() from public,anon,authenticated,service_role;

-- V9 orchestration calls begin, commits, appends the ledger event, then projects
-- the hold row and finishes in one new transaction. No lock spans external I/O.
create function private.begin_meet_hold_transition(p_ws_id uuid,p_transition uuid)
returns bigint language plpgsql security definer set search_path=pg_catalog,pg_temp set lock_timeout='2s' as $$
declare b private.meet_content_hold_scopes;
begin
 b:=private.lock_meet_hold_barrier(p_ws_id,true);
 if p_transition is null or b.pending_transition is not null and b.pending_transition<>p_transition then raise exception 'MEET_ERASE_CONFLICT'; end if;
 update private.meet_content_hold_scopes set pending_transition=p_transition where ws_id=p_ws_id;
 return b.epoch;
end $$;
create function private.finish_meet_hold_transition(p_ws_id uuid,p_transition uuid,p_ledger_seq bigint)
returns bigint language plpgsql security definer set search_path=pg_catalog,pg_temp set lock_timeout='2s' as $$
declare b private.meet_content_hold_scopes;
begin
 b:=private.lock_meet_hold_barrier(p_ws_id,true);
 if b.pending_transition is distinct from p_transition or p_transition is null or p_ledger_seq is null or p_ledger_seq<=b.ledger_seq then raise exception 'MEET_ERASE_STALE'; end if;
 if exists(select 1 from private.meet_content_apply_leases where ws_id=p_ws_id and (settled_at is null or result='unknown')) then raise exception 'MEET_ERASE_RECONCILIATION_REQUIRED'; end if;
 update private.meet_content_hold_scopes set pending_transition=null,epoch=epoch+1,ledger_seq=p_ledger_seq,registry_ready=true where ws_id=p_ws_id returning epoch into b.epoch;
 return b.epoch;
end $$;
revoke all on function private.begin_meet_hold_transition(uuid,uuid),private.finish_meet_hold_transition(uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function private.begin_meet_hold_transition(uuid,uuid),private.finish_meet_hold_transition(uuid,uuid,bigint) to service_role;
commit;
