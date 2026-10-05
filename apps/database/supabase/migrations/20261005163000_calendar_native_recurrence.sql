-- Fail malformed direct RPC writes at the database boundary too.
create function private.calendar_series_valid(r jsonb,a jsonb)
returns boolean language plpgsql stable set search_path='' as $$
declare f text := r->>'frequency'; s timestamp; e timestamp;
begin
 if (r->>'version'='1' and f in ('daily','weekly','monthly','yearly')
   and (r->>'interval')::integer between 1 and 1000
   and exists(select 1 from pg_catalog.pg_timezone_names where name=r->>'timeZone')) is not true then return false; end if;
 if (a->>'startLocal' ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$'
   and a->>'endLocal' ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$'
   and jsonb_typeof(a->'allDay')='boolean') is not true then return false; end if;
 s := (a->>'startLocal')::timestamp; e := (a->>'endLocal')::timestamp;
 if e<=s or ((a->>'allDay')::boolean and (s::time<>'00:00:00' or e::time<>'00:00:00')) then return false; end if;
 if r->'end'->>'type'='count' then
   if ((r->'end'->>'count')::integer between 1 and 10000) is not true then return false; end if;
 elsif r->'end'->>'type'='until' then
   if (r->'end'->>'date' ~ '^\d{4}-\d{2}-\d{2}$' and (r->'end'->>'date')::date >= s::date) is not true then return false; end if;
 elsif r->'end'->>'type' is distinct from 'never' then return false;
 end if;
 if r ? 'weekStartsOn' and r->>'weekStartsOn' not in ('MO','TU','WE','TH','FR','SA','SU') then return false; end if;
 if r ? 'weekdays' then
   if jsonb_typeof(r->'weekdays')<>'array' then return false; end if;
   if jsonb_array_length(r->'weekdays') not between 1 and 7 or exists(select 1 from jsonb_array_elements_text(r->'weekdays') x where x not in ('MO','TU','WE','TH','FR','SA','SU')) then return false; end if;
 end if;
 if f='daily' then return not (r ?| array['weekdays','weekIndex','monthDay','month']); end if;
 if f='weekly' then return r ? 'weekdays' and not(r ?| array['weekIndex','monthDay','month']); end if;
 if f='yearly' and ((r->>'month')::integer between 1 and 12) is not true then return false; end if;
 if f='monthly' and r ? 'month' then return false; end if;
 if r ? 'monthDay' then
   return (r->>'monthDay')::integer between 1 and 31 and not(r ?| array['weekdays','weekIndex'])
     and (not(r ? 'monthDayOverflow') or r->>'monthDayOverflow' in ('skip','last-day'));
 end if;
 return r ? 'weekdays' and (r->>'weekIndex')::integer in (-1,1,2,3,4) and not(r ? 'monthDayOverflow');
exception when others then return false;
end;
$$;
revoke all on function private.calendar_series_valid(jsonb,jsonb) from public,anon,authenticated,service_role;

-- Canonical native series are expanded at read time, never copied into event rows.
create table private.calendar_event_series (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  creator_id uuid references auth.users(id) on delete set null,
  workspace_calendar_id uuid references private.workspace_calendars(id) on delete set null,
  rule jsonb not null check (jsonb_typeof(rule)='object' and rule->>'version'='1'
    and rule->>'frequency' in ('daily','weekly','monthly','yearly')),
  anchor jsonb not null check (jsonb_typeof(anchor)='object'
    and anchor ?& array['startLocal','endLocal','allDay']),
  payload jsonb not null check (jsonb_typeof(payload)='object' and payload ? 'title'),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check(private.calendar_series_valid(rule,anchor) is true)
);
create index calendar_event_series_workspace on private.calendar_event_series(ws_id) where deleted_at is null;
create table private.calendar_event_series_exceptions (
  series_id uuid not null references private.calendar_event_series(id) on delete cascade,
  original_start_local text not null check(original_start_local ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$'),
  exception jsonb not null check(jsonb_typeof(exception)='object'),
  payload jsonb,
  primary key(series_id,original_start_local)
);
create table private.calendar_event_series_receipts (
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  input jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(ws_id,actor_id,request_id)
);
alter table private.calendar_event_series enable row level security;
alter table private.calendar_event_series_exceptions enable row level security;
alter table private.calendar_event_series_receipts enable row level security;
revoke all on private.calendar_event_series, private.calendar_event_series_exceptions,
  private.calendar_event_series_receipts from public,anon,authenticated,service_role;

create function private.calendar_series_json(s private.calendar_event_series)
returns jsonb language sql stable security definer set search_path='' as $$
  select to_jsonb(s)||jsonb_build_object('exceptions',coalesce((select jsonb_agg(
    jsonb_build_object('originalStartLocal',e.original_start_local,'exception',e.exception,'payload',e.payload)
    order by e.original_start_local) from private.calendar_event_series_exceptions e where e.series_id=s.id),'[]'::jsonb));
$$;
revoke all on function private.calendar_series_json(private.calendar_event_series) from public,anon,authenticated,service_role;

-- Permission is checked inside the same authenticated transaction as the writes.
-- The idempotency lock serializes duplicate requests before any series row lock.
create function public.calendar_series_operation(p_ws_id uuid,p_action text,p_input jsonb default '{}',p_actor_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid := coalesce(auth.uid(),p_actor_id);
  s private.calendar_event_series;
  receipt private.calendar_event_series_receipts;
  result jsonb;
  v_request_id uuid;
  request_series uuid;
  future_series uuid;
  scope text;
  slot text;
  discarded integer;
begin
  if (auth.uid() is null and auth.role() is distinct from 'service_role') or (auth.uid() is not null and p_actor_id is not null and p_actor_id<>auth.uid()) then
    raise exception 'Actor assertion denied' using errcode='42501';
  end if;
  if actor is null or not exists(select 1 from public.workspace_members m where m.ws_id=p_ws_id and m.user_id=actor)
    or public.has_workspace_permission(p_ws_id,actor,'manage_calendar') is not true then
    raise exception 'Calendar access denied' using errcode='42501';
  end if;
  if p_action='receipt' then
    select * into receipt from private.calendar_event_series_receipts where ws_id=p_ws_id and actor_id=actor
      and calendar_event_series_receipts.request_id=(p_input->>'requestId')::uuid;
    if not found then return null; end if;
    if receipt.input->>'intentHash' is distinct from p_input->>'intentHash' then raise exception 'Request id reused' using errcode='22023'; end if;
    return receipt.result;
  end if;
  if p_action='read' then
    if p_input ? 'seriesId' then
      select * into s from private.calendar_event_series where ws_id=p_ws_id and id=(p_input->>'seriesId')::uuid and deleted_at is null;
      if not found then raise exception 'Series not found' using errcode='P0002'; end if;
      return private.calendar_series_json(s);
    end if;
    if (select count(*) from private.calendar_event_series where ws_id=p_ws_id and deleted_at is null)>1000 then
      raise exception 'Series listing exceeds limit' using errcode='54000';
    end if;
    return coalesce((select jsonb_agg(private.calendar_series_json(x) order by x.id)
      from private.calendar_event_series x where ws_id=p_ws_id and deleted_at is null),'[]'::jsonb);
  end if;
  if p_input->>'intentHash' is null then raise exception 'Intent hash required' using errcode='22023'; end if;
  if p_action not in ('create','update','delete') then raise exception 'Invalid action' using errcode='22023'; end if;
  v_request_id := (p_input->>'requestId')::uuid;
  if v_request_id is null then raise exception 'Request id required' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_ws_id::text||actor::text||v_request_id::text,0));
  select * into receipt from private.calendar_event_series_receipts
    where ws_id=p_ws_id and actor_id=actor and calendar_event_series_receipts.request_id=v_request_id;
  if found then
    if receipt.input->>'action' is distinct from p_action or receipt.input->>'intentHash' is distinct from p_input->>'intentHash' then
      raise exception 'Request id reused with different input' using errcode='22023';
    end if;
    return receipt.result;
  end if;
  if p_action='create' then
    if p_input->>'workspaceCalendarId' is not null and not exists(select 1 from private.workspace_calendars c
      where c.id=(p_input->>'workspaceCalendarId')::uuid and c.ws_id=p_ws_id and c.is_enabled) then
      raise exception 'Calendar not found' using errcode='P0002';
    end if;
    insert into private.calendar_event_series(ws_id,creator_id,workspace_calendar_id,rule,anchor,payload)
      values(p_ws_id,actor,(p_input->>'workspaceCalendarId')::uuid,p_input->'rule',p_input->'anchor',p_input->'payload') returning * into s;
    result := private.calendar_series_json(s);
  else
    request_series := (p_input->>'seriesId')::uuid;
    select * into s from private.calendar_event_series where id=request_series and ws_id=p_ws_id and deleted_at is null for update;
    if not found then raise exception 'Series not found' using errcode='P0002'; end if;
    if s.revision is distinct from (p_input->>'expectedRevision')::integer then
      raise exception 'Series revision changed' using errcode='40001';
    end if;
    scope := p_input->>'scope'; slot := p_input->>'originalStartLocal';
    if scope not in ('this','all','future') or scope is null then raise exception 'Invalid scope' using errcode='22023'; end if;
    if scope='this' then
      if slot is null then raise exception 'Occurrence required' using errcode='22023'; end if;
      if not exists(select 1 from private.calendar_event_series_exceptions where series_id=s.id and original_start_local=slot)
        and (select count(*) from private.calendar_event_series_exceptions where series_id=s.id)>=1000 then
        raise exception 'Exception limit exceeded' using errcode='54000';
      end if;
      insert into private.calendar_event_series_exceptions(series_id,original_start_local,exception,payload)
        values(s.id,slot,case when p_action='delete' then '{"cancelled":true}'::jsonb else p_input->'exception' end,
          case when p_action='delete' then null else p_input->'payload' end)
        on conflict(series_id,original_start_local) do update set exception=excluded.exception,payload=excluded.payload;
      update private.calendar_event_series set revision=revision+1,updated_at=now() where id=s.id returning * into s;
      result := private.calendar_series_json(s);
    elsif scope='all' then
      if p_action='delete' then
        update private.calendar_event_series set deleted_at=now(),revision=revision+1,updated_at=now() where id=s.id returning * into s;
        result := jsonb_build_object('id',s.id,'deleted',true,'revision',s.revision);
      else
        update private.calendar_event_series set rule=p_input->'rule',anchor=p_input->'anchor',payload=p_input->'payload',
          revision=revision+1,updated_at=now() where id=s.id returning * into s;
        if (p_input->>'resetExceptions')::boolean then delete from private.calendar_event_series_exceptions where series_id=s.id; end if;
        result := private.calendar_series_json(s);
      end if;
    else
      if slot is null or p_input->'previousRule' is null then raise exception 'Split boundary required' using errcode='22023'; end if;
      update private.calendar_event_series set rule=p_input->'previousRule',revision=revision+1,updated_at=now() where id=s.id returning * into s;
      delete from private.calendar_event_series_exceptions where series_id=s.id and original_start_local>=slot;
      get diagnostics discarded = row_count;
      result := jsonb_build_object('previous',private.calendar_series_json(s),'discardedFutureExceptions',discarded);
      if p_action='update' then
        insert into private.calendar_event_series(ws_id,creator_id,workspace_calendar_id,rule,anchor,payload)
          values(p_ws_id,actor,s.workspace_calendar_id,p_input->'rule',p_input->'anchor',p_input->'payload') returning id into future_series;
        select * into s from private.calendar_event_series where id=future_series;
        result := result||jsonb_build_object('series',private.calendar_series_json(s));
      end if;
    end if;
  end if;
  insert into private.calendar_event_series_receipts(ws_id,actor_id,request_id,input,result)
    values(p_ws_id,actor,v_request_id,jsonb_build_object('action',p_action,'intentHash',p_input->>'intentHash','input',p_input),result);
  return result;
end;
$$;
revoke all on function public.calendar_series_operation(uuid,text,jsonb,uuid) from public,anon;
grant execute on function public.calendar_series_operation(uuid,text,jsonb,uuid) to authenticated,service_role;
