-- Original user-authored journals are isolated from workspace Notes and public profiles.
create table private.personal_journal_entries (
  id uuid primary key,
  actor_id uuid not null references public.users(id) on delete cascade,
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null check (length(title) <= 200),
  body text not null check (length(body) between 1 and 20000),
  occurred_at timestamptz not null,
  timezone text not null check (length(timezone) between 1 and 100),
  mood text check (mood in ('very_low','low','neutral','good','great')),
  mood_context text not null check (length(mood_context) <= 2000),
  domain text not null check (domain in ('life','work')),
  category text not null check (category in ('reflection','good','challenge','milestone')),
  revision integer not null check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index personal_journal_owner_period on private.personal_journal_entries(actor_id, ws_id, occurred_at desc, id desc);
create table private.personal_journal_revisions (
  entry_id uuid not null references private.personal_journal_entries(id) on delete cascade,
  revision integer not null check (revision > 0),
  operation_id uuid not null,
  expected_revision integer not null check (expected_revision >= 0),
  request_document jsonb not null,
  entry_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  primary key (entry_id, revision),
  unique (entry_id, operation_id)
);
alter table private.personal_journal_entries enable row level security;
alter table private.personal_journal_revisions enable row level security;
revoke all on private.personal_journal_entries, private.personal_journal_revisions from public, anon, authenticated, service_role;
-- No direct authenticated grants. Owner RLS is defense in depth, never a sharing grant.
create policy journal_owner on private.personal_journal_entries to authenticated
  using (actor_id = (select auth.uid())) with check (actor_id = (select auth.uid()));
create policy journal_revision_owner on private.personal_journal_revisions for select to authenticated
  using (exists (select 1 from private.personal_journal_entries e where e.id = entry_id and e.actor_id = (select auth.uid())));

create function private.personal_journal_authorized(p_actor_id uuid, p_ws_id uuid) returns boolean
language sql stable set search_path = '' as $$
  select exists (select 1 from public.workspaces w
    join public.workspace_members m on m.ws_id = w.id and m.user_id = p_actor_id and m.type = 'MEMBER'
    where w.id = p_ws_id and w.personal and w.creator_id = p_actor_id and not coalesce(w.deleted,false))
$$;
create function private.personal_journal_snapshot(p_entry private.personal_journal_entries) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('id',p_entry.id,'actorId',p_entry.actor_id,'workspaceId',p_entry.ws_id,
    'title',p_entry.title,'body',p_entry.body,
    'occurredAt',to_char(p_entry.occurred_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'timezone',p_entry.timezone,'mood',p_entry.mood,'moodContext',p_entry.mood_context,
    'domain',p_entry.domain,'category',p_entry.category,'revision',p_entry.revision,
    'createdAt',to_char(p_entry.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'updatedAt',to_char(p_entry.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
$$;
create function private.personal_journal_valid_document(p_document jsonb) returns boolean
language sql stable set search_path = '' as $$
  select coalesce(jsonb_typeof(p_document) = 'object'
    and (p_document - array['title','body','occurredAt','timezone','mood','moodContext','domain','category']) = '{}'::jsonb
    and p_document ?& array['title','body','occurredAt','timezone','mood','moodContext','domain','category']
    and jsonb_typeof(p_document->'title') = 'string' and length(p_document->>'title') <= 200
    and jsonb_typeof(p_document->'body') = 'string' and length(p_document->>'body') between 1 and 20000
    and jsonb_typeof(p_document->'occurredAt') = 'string' and (p_document->>'occurredAt') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
    and jsonb_typeof(p_document->'timezone') = 'string' and exists(select 1 from pg_catalog.pg_timezone_names tz where tz.name = p_document->>'timezone')
    and ((p_document->'mood') = 'null'::jsonb or (jsonb_typeof(p_document->'mood') = 'string' and p_document->>'mood' in ('very_low','low','neutral','good','great')))
    and jsonb_typeof(p_document->'moodContext') = 'string' and length(p_document->>'moodContext') <= 2000
    and p_document->>'domain' in ('life','work') and p_document->>'category' in ('reflection','good','challenge','milestone'), false)
$$;

create function private.read_personal_journal(p_actor_id uuid,p_ws_id uuid,p_entry_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.personal_journal_authorized(p_actor_id,p_ws_id) then raise exception 'Forbidden' using errcode = '42501'; end if;
  return (select private.personal_journal_snapshot(e) from private.personal_journal_entries e
    where e.id = p_entry_id and e.actor_id = p_actor_id and e.ws_id = p_ws_id);
end $$;
create function private.list_personal_journal(p_actor_id uuid,p_ws_id uuid,p_before uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare cursor_entry private.personal_journal_entries; result jsonb;
begin
  if not private.personal_journal_authorized(p_actor_id,p_ws_id) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if p_before is not null then
    select e.* into cursor_entry from private.personal_journal_entries e where e.id=p_before and e.actor_id=p_actor_id and e.ws_id=p_ws_id;
    if not found then raise exception 'Invalid cursor' using errcode = '22023'; end if;
  end if;
  with page as (select e.* from private.personal_journal_entries e where e.actor_id=p_actor_id and e.ws_id=p_ws_id
    and (p_before is null or (e.occurred_at,e.id) < (cursor_entry.occurred_at,cursor_entry.id))
    order by e.occurred_at desc,e.id desc limit 101),
  visible as (select * from page order by occurred_at desc,id desc limit 100)
  select jsonb_build_object('items',coalesce((select jsonb_agg(private.personal_journal_snapshot(v) order by v.occurred_at desc,v.id desc) from visible v),'[]'::jsonb),
    'nextBefore',case when (select count(*) from page)>100 then (select v.id from visible v order by v.occurred_at,v.id limit 1) else null end) into result;
  return result;
end $$;

create function private.write_personal_journal(p_actor_id uuid,p_ws_id uuid,p_entry_id uuid,p_operation_id uuid,p_expected_revision integer,p_document jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare current_entry private.personal_journal_entries; receipt private.personal_journal_revisions; snapshot jsonb;
begin
  if not private.personal_journal_authorized(p_actor_id,p_ws_id) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if p_entry_id is null or p_operation_id is null or p_expected_revision is null or p_expected_revision<0
    or not private.personal_journal_valid_document(p_document) then raise exception 'Invalid journal document' using errcode = '22023'; end if;
  if p_expected_revision=0 and p_operation_id<>p_entry_id then raise exception 'Invalid create operation' using errcode = '22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_entry_id::text,0));
  -- Admission locks survive through ACK/history insertion, including lock waits.
  perform w.id from public.workspaces w join public.workspace_members m on m.ws_id=w.id
    where w.id=p_ws_id and w.personal and w.creator_id=p_actor_id and not coalesce(w.deleted,false)
      and m.user_id=p_actor_id and m.type='MEMBER' for share of w,m;
  if not found then raise exception 'Forbidden' using errcode = '42501'; end if;
  select e.* into current_entry from private.personal_journal_entries e where e.id=p_entry_id for update;
  if found and (current_entry.actor_id<>p_actor_id or current_entry.ws_id<>p_ws_id) then raise exception 'Forbidden' using errcode = '42501'; end if;
  select r.* into receipt from private.personal_journal_revisions r where r.entry_id=p_entry_id and r.operation_id=p_operation_id;
  if found then
    if receipt.expected_revision<>p_expected_revision or receipt.request_document<>p_document then raise exception 'Journal revision conflict' using errcode = '40001'; end if;
    return receipt.entry_snapshot;
  end if;
  if p_expected_revision=0 then
    if current_entry.id is not null then raise exception 'Journal revision conflict' using errcode = '40001'; end if;
    insert into private.personal_journal_entries(id,actor_id,ws_id,title,body,occurred_at,timezone,mood,mood_context,domain,category,revision)
      values(p_entry_id,p_actor_id,p_ws_id,p_document->>'title',p_document->>'body',(p_document->>'occurredAt')::timestamptz,
        p_document->>'timezone',p_document->>'mood',p_document->>'moodContext',p_document->>'domain',p_document->>'category',1) returning * into current_entry;
  else
    if current_entry.id is null then raise exception 'Journal entry not found' using errcode = 'P0002'; end if;
    if current_entry.revision<>p_expected_revision then raise exception 'Journal revision conflict' using errcode = '40001'; end if;
    update private.personal_journal_entries e set title=p_document->>'title',body=p_document->>'body',occurred_at=(p_document->>'occurredAt')::timestamptz,
      timezone=p_document->>'timezone',mood=p_document->>'mood',mood_context=p_document->>'moodContext',domain=p_document->>'domain',category=p_document->>'category',
      revision=e.revision+1,updated_at=clock_timestamp() where e.id=p_entry_id and e.actor_id=p_actor_id and e.ws_id=p_ws_id returning * into current_entry;
  end if;
  snapshot := private.personal_journal_snapshot(current_entry);
  insert into private.personal_journal_revisions(entry_id,revision,operation_id,expected_revision,request_document,entry_snapshot)
    values(p_entry_id,current_entry.revision,p_operation_id,p_expected_revision,p_document,snapshot);
  return snapshot;
end $$;

revoke all on function private.personal_journal_authorized(uuid,uuid),private.personal_journal_snapshot(private.personal_journal_entries),
  private.personal_journal_valid_document(jsonb),private.read_personal_journal(uuid,uuid,uuid),private.list_personal_journal(uuid,uuid,uuid),
  private.write_personal_journal(uuid,uuid,uuid,uuid,integer,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.read_personal_journal(uuid,uuid,uuid),private.list_personal_journal(uuid,uuid,uuid),
  private.write_personal_journal(uuid,uuid,uuid,uuid,integer,jsonb) to service_role;
