-- Event generation survives completed operations and also advances for guarded
-- imports. Operation.generation itself remains immutable for late-call fencing.
alter table private.calendar_google_color_operations
  add column current_generation bigint not null default 0;
update private.calendar_google_color_operations set current_generation=generation;
alter table private.calendar_google_color_operations
  add constraint calendar_google_current_generation_check check(current_generation>=generation);

create table private.calendar_google_import_reads (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  calendar_id text not null,
  auth_token_id uuid,
  generations jsonb not null,
  created_at timestamptz not null default now()
);
create table private.calendar_google_deferred_imports (
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  calendar_id text not null,
  auth_scope text not null,
  external_event_id text not null,
  reason text not null check(reason in ('pending','generation','identity')),
  observed_generation bigint not null,
  updated_at timestamptz not null default now(),
  primary key(ws_id,calendar_id,auth_scope,external_event_id)
);
alter table private.calendar_google_import_reads enable row level security;
alter table private.calendar_google_deferred_imports enable row level security;
revoke all on private.calendar_google_import_reads,private.calendar_google_deferred_imports
  from public,anon,authenticated,service_role;

create or replace function private.guard_calendar_google_color_operation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  op private.calendar_google_color_operations;
  old_projection jsonb;
  new_projection jsonb;
  guarded_event uuid;
  guarded_workspace uuid;
begin
  guarded_event := case when tg_op = 'INSERT' then new.id else old.id end;
  guarded_workspace := case when tg_op = 'INSERT' then new.ws_id else old.ws_id end;
  -- Parent workspace FK deletion revokes the source and this ledger together.
  if tg_op = 'DELETE' and not exists (select 1 from public.workspaces w where w.id=guarded_workspace) then
    return old;
  end if;
  select * into op from private.calendar_google_color_operations
    where ws_id = guarded_workspace and event_id = guarded_event;
  if not found then
    -- A canceled/deleted event's identity cannot be resurrected by an old import
    -- with a new local UUID. A guarded import must explicitly handle this ledger.
    if tg_op = 'INSERT' and new.provider = 'google' then
      select * into op from private.calendar_google_color_operations h
        where h.ws_id=new.ws_id
          and ((h.identity->>'calendarId'=coalesce(new.external_calendar_id,new.google_calendar_id)
            and h.identity->>'providerEventId'=coalesce(new.external_event_id,new.google_event_id))
          or exists(select 1 from private.calendar_provider_saga_scopes s where s.ws_id=h.ws_id and s.event_id=h.event_id
            and s.provider='google' and s.calendar_id=coalesce(new.external_calendar_id,new.google_calendar_id)
            and s.provider_event_id=coalesce(new.external_event_id,new.google_event_id))) for update;
      if found then
        if exists(select 1 from private.calendar_google_color_write_permits p
          where p.transaction_id=txid_current() and p.ws_id=op.ws_id and p.event_id=op.event_id
            and p.operation_id=op.operation_id and p.generation=op.current_generation) then
          new.id:=op.event_id;
          return new;
        end if;
        raise exception using errcode='40001',message='Google import requires generation guard';
      end if;
    end if;
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if exists (select 1 from private.calendar_google_color_write_permits p
    where p.transaction_id = txid_current() and p.ws_id = op.ws_id
      and p.event_id = op.event_id and p.operation_id = op.operation_id
      and p.generation = op.current_generation) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'UPDATE' then
    old_projection := to_jsonb(old) - 'scheduling_metadata' - 'updated_at';
    new_projection := to_jsonb(new) - 'scheduling_metadata' - 'updated_at';
    if old_projection = new_projection and
      (coalesce(old.scheduling_metadata, '{}'::jsonb)->'google_color') is not distinct from
      (coalesce(new.scheduling_metadata, '{}'::jsonb)->'google_color') and
      (coalesce(old.scheduling_metadata, '{}'::jsonb)->'google_recurrence') is not distinct from
      (coalesce(new.scheduling_metadata, '{}'::jsonb)->'google_recurrence') and
      (coalesce(old.scheduling_metadata, '{}'::jsonb)->'google_event_type') is not distinct from
      (coalesce(new.scheduling_metadata, '{}'::jsonb)->'google_event_type') and
      (coalesce(old.scheduling_metadata, '{}'::jsonb)->'google_working_location_type') is not distinct from
      (coalesce(new.scheduling_metadata, '{}'::jsonb)->'google_working_location_type') and
      (coalesce(old.scheduling_metadata, '{}'::jsonb)->'google_working_location_label') is not distinct from
      (coalesce(new.scheduling_metadata, '{}'::jsonb)->'google_working_location_label') then
      return new;
    end if;
  end if;
  raise exception using errcode = '40001', message = 'Google event requires operation generation guard';
end;
$$;

create or replace function public.calendar_google_color_operation(
  p_action text, p_ws_id uuid, p_event_id uuid, p_actor_id uuid, p_input jsonb default '{}'
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  event_row public.workspace_calendar_events;
  op private.calendar_google_color_operations;
  requested_identity jsonb;
  incoming_prepared jsonb;
  requested_generation bigint;
  requested_operation uuid;
  connection_id uuid;
  snapshot jsonb;
  outcome text;
begin
  -- All operation transactions lock event before ledger, including finalization.
  select * into event_row from public.workspace_calendar_events
    where ws_id = p_ws_id and id = p_event_id for update;
  if not found or event_row.provider <> 'google' then
    raise exception using errcode = 'P0002', message = 'Google event is unavailable';
  end if;
  select * into op from private.calendar_google_color_operations
    where ws_id = p_ws_id and event_id = p_event_id for update;
  if p_action in ('reserve','inspect') then
    requested_identity := p_input->'identity';
  else
    requested_identity := op.identity;
  end if;
  if requested_identity is null or requested_identity->>'wsId' <> p_ws_id::text
    or requested_identity->>'eventId' <> p_event_id::text
    or requested_identity->>'calendarId' is distinct from
      coalesce(event_row.external_calendar_id, event_row.google_calendar_id)
    or requested_identity->>'providerEventId' is distinct from
      coalesce(event_row.external_event_id, event_row.google_event_id) then
    raise exception using errcode = '40001', message = 'Google operation identity changed';
  end if;
  connection_id := (requested_identity->>'connectionId')::uuid;
  if not exists (select 1 from public.calendar_connections c
    join public.calendar_auth_tokens t on t.id = c.auth_token_id
    where c.id = connection_id and c.ws_id = p_ws_id and c.provider = 'google'
      and c.is_enabled and c.calendar_id = requested_identity->>'calendarId'
      and t.id = (requested_identity->>'authTokenId')::uuid
      and t.user_id = p_actor_id and t.ws_id = p_ws_id and t.provider = 'google' and t.is_active) then
    raise exception using errcode = '42501', message = 'Google operation access is unavailable';
  end if;
  if p_action = 'inspect' then
    if op.phase in ('reserved','prepared','dispatched') and op.identity is distinct from requested_identity then
      raise exception using errcode='40001', message='Google operation is in progress';
    end if;
    return jsonb_build_object('generation',coalesce(op.current_generation,0)::text,
      'operation',case when op.identity=requested_identity then
        private.calendar_google_color_operation_json(op) else null end);
  end if;
  if p_action = 'read' then
    if op.operation_id is distinct from (p_input->>'id')::uuid then
      raise exception using errcode = '40001', message = 'Google operation changed';
    end if;
    return private.calendar_google_color_operation_json(op);
  end if;
  requested_operation := (p_input->>'id')::uuid;
  requested_generation := (p_input->>'generation')::bigint;
  if p_action = 'reserve' then
    if op.operation_id = requested_operation and op.request_hash = p_input->>'requestHash'
      and op.identity = requested_identity and op.intent = p_input->'intent' then
      return private.calendar_google_color_operation_json(op);
    end if;
    if coalesce(op.current_generation, 0) <> requested_generation or
      op.phase in ('reserved', 'prepared', 'dispatched') then
      raise exception using errcode = '40001', message = 'Google operation is in progress';
    end if;
    if requested_operation is null or requested_generation is null or
      p_input->'intent'->>'connectionId' is distinct from connection_id::text then
      raise exception using errcode = '22023', message = 'Invalid Google operation reservation';
    end if;
    insert into private.calendar_google_color_operations
      (ws_id,event_id,operation_id,actor_id,generation,current_generation,identity,intent,request_hash,phase)
    values (p_ws_id,p_event_id,requested_operation,p_actor_id,requested_generation+1,requested_generation+1,
      requested_identity,p_input->'intent',p_input->>'requestHash','reserved')
    on conflict (ws_id,event_id) do update set operation_id=excluded.operation_id,
      actor_id=excluded.actor_id,generation=excluded.generation,current_generation=excluded.current_generation,identity=excluded.identity,
      intent=excluded.intent,request_hash=excluded.request_hash,phase='reserved',
      prepared=null,completion=null,created_at=now(),updated_at=now()
    returning * into op;
  else
    if op.operation_id is distinct from requested_operation or
      op.generation is distinct from requested_generation or
      op.current_generation is distinct from requested_generation or
      op.identity is distinct from requested_identity then
      raise exception using errcode = '40001', message = 'Google operation changed';
    end if;
    if p_action = 'prepare' then
      if op.phase = 'reserved' then
        incoming_prepared := p_input->'prepared';
        if jsonb_typeof(incoming_prepared->'baseETag') is distinct from 'string'
          or length(incoming_prepared->>'baseETag') = 0
          or coalesce(incoming_prepared->>'eventLabelVersion','') not in ('0','1')
          or incoming_prepared->'patch'->'extendedProperties'->'private'->>'tuturuuuColorOperation'
            is distinct from op.operation_id::text then
          raise exception using errcode = '22023', message = 'Invalid prepared Google operation';
        end if;
        update private.calendar_google_color_operations set prepared=incoming_prepared,
          phase='prepared',updated_at=now() where ws_id=p_ws_id and event_id=p_event_id
          returning * into op;
      elsif op.phase not in ('prepared','dispatched') then
        raise exception using errcode = '40001', message = 'Google operation cannot prepare';
      end if;
    elsif p_action = 'dispatch' then
      if op.phase not in ('prepared','dispatched') then
        raise exception using errcode = '40001', message = 'Google operation cannot dispatch';
      end if;
      update private.calendar_google_color_operations set phase='dispatched',updated_at=now()
        where ws_id=p_ws_id and event_id=p_event_id returning * into op;
    elsif p_action = 'cancel' then
      if op.phase not in ('reserved','prepared') then
        raise exception using errcode = '40001', message = 'Google operation may have been sent';
      end if;
      update private.calendar_google_color_operations set phase='canceled',updated_at=now()
        where ws_id=p_ws_id and event_id=p_event_id returning * into op;
    elsif p_action = 'finalize' then
      if op.phase in ('applied','superseded') then
        return private.calendar_google_color_operation_json(op);
      end if;
      snapshot := p_input->'snapshot';
      outcome := p_input->>'outcome';
      if op.phase <> 'dispatched' or outcome not in ('applied','superseded') or
        jsonb_typeof(snapshot->'etag') is distinct from 'string' or
        snapshot->>'etag' = op.prepared->>'baseETag' or
        jsonb_typeof(snapshot->'metadata'->'google_color') is distinct from 'object' or
        (outcome = 'applied') is distinct from
          coalesce(snapshot->>'operationMarker' = op.operation_id::text,false) then
        raise exception using errcode = '22023', message = 'Google operation is not fenced';
      end if;
      -- Capability is inserted and consumed in the same transaction. It cannot
      -- be forged through PostgREST input or a session setting.
      insert into private.calendar_google_color_write_permits values
        (txid_current(),p_ws_id,p_event_id,op.operation_id,op.generation);
      update public.workspace_calendar_events set
        scheduling_metadata=jsonb_set(coalesce(scheduling_metadata,'{}'::jsonb),
          '{google_color}',snapshot->'metadata'->'google_color',true),
        color=snapshot->>'compatibilityColor',last_synced_at=now(),
        sync_status=case when outcome='applied' then 'synced' else 'conflict' end,
        sync_error=case when outcome='superseded' then 'Google color operation was superseded' else null end
        where ws_id=p_ws_id and id=p_event_id;
      delete from private.calendar_google_color_write_permits
        where transaction_id=txid_current() and ws_id=p_ws_id and event_id=p_event_id;
      update private.calendar_google_color_operations set phase=outcome,
        completion=snapshot,updated_at=now() where ws_id=p_ws_id and event_id=p_event_id
        returning * into op;
    else
      raise exception using errcode = '22023', message = 'Unknown Google operation action';
    end if;
  end if;
  return private.calendar_google_color_operation_json(op);
end;
$$;

-- Capture occurs BEFORE any provider GET/list, never just before DB application.
create function public.capture_calendar_google_import(
  p_ws_id uuid,p_calendar_id text,p_auth_token_id uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare capture private.calendar_google_import_reads;
begin
  if p_auth_token_id is not null and not exists(select 1 from public.calendar_auth_tokens
    where id=p_auth_token_id and ws_id=p_ws_id and provider='google' and is_active) then
    raise exception using errcode='42501',message='Google import scope is unavailable';
  end if;
  delete from private.calendar_google_import_reads
    where ws_id=p_ws_id and calendar_id=p_calendar_id
      and created_at<now()-interval '30 minutes';
  insert into private.calendar_google_import_reads(ws_id,calendar_id,auth_token_id,generations)
  select p_ws_id,p_calendar_id,p_auth_token_id,coalesce(jsonb_object_agg(
    external_id,current_generation::text),'{}'::jsonb)
  from (
    select identity->>'providerEventId' as external_id,current_generation from private.calendar_google_color_operations
      where ws_id=p_ws_id and identity->>'calendarId'=p_calendar_id
    union
    select s.provider_event_id,o.current_generation from private.calendar_provider_saga_scopes s
      join private.calendar_google_color_operations o on o.ws_id=s.ws_id and o.event_id=s.event_id
      where s.ws_id=p_ws_id and s.provider='google' and s.calendar_id=p_calendar_id
  ) scopes
  returning * into capture;
  return jsonb_build_object('id',capture.id,'wsId',p_ws_id,'calendarId',p_calendar_id,
    'authTokenId',p_auth_token_id);
end;
$$;

create function public.list_deferred_calendar_google_imports(
  p_ws_id uuid,p_calendar_id text,p_auth_token_id uuid default null
) returns jsonb language sql security definer set search_path='' as $$
  select coalesce(jsonb_agg(external_event_id),'[]'::jsonb) from (
    select external_event_id from private.calendar_google_deferred_imports
    where ws_id=p_ws_id and calendar_id=p_calendar_id
      and auth_scope=coalesce(p_auth_token_id::text,'legacy')
    order by updated_at,external_event_id limit 100
  ) queue;
$$;

-- Existing importer data remains provider-owned snapshots; only these identities
-- are retained for replay. Never persist a stale payload or a credential.
create function public.apply_calendar_google_import(
  p_capture_id uuid,p_events jsonb default '[]',p_tombstones jsonb default '[]'
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  capture private.calendar_google_import_reads;
  item jsonb;
  event_row public.workspace_calendar_events;
  op private.calendar_google_color_operations;
  external_id text;
  expected bigint;
  reason text;
  metadata jsonb;
  old_color jsonb;
  new_color jsonb;
  counts jsonb;
  inserted integer:=0;
  updated integer:=0;
  deleted integer:=0;
  deferred integer:=0;
  affected integer;
  tombstone boolean;
begin
  select * into capture from private.calendar_google_import_reads where id=p_capture_id;
  if not found or capture.created_at<now()-interval '30 minutes' then
    raise exception using errcode='40001',message='Google import read must restart';
  end if;
  if capture.auth_token_id is not null and not exists(select 1 from public.calendar_auth_tokens
    where id=capture.auth_token_id and ws_id=capture.ws_id and provider='google' and is_active) then
    raise exception using errcode='42501',message='Google import scope is unavailable';
  end if;
  if jsonb_typeof(p_events) is distinct from 'array' or jsonb_typeof(p_tombstones) is distinct from 'array' then
    raise exception using errcode='22023',message='Invalid Google import batch';
  end if;
  for item in select value from jsonb_array_elements(p_events)
    union all select jsonb_build_object('external_event_id',value#>>'{}','_tombstone',true)
      from jsonb_array_elements(p_tombstones)
  loop
    tombstone:=coalesce((item->>'_tombstone')::boolean,false);
    external_id:=coalesce(nullif(item->>'external_event_id',''),nullif(item->>'google_event_id',''));
    if external_id is null then
      raise exception using errcode='22023',message='Google import identity is unavailable';
    end if;
    if not tombstone and (item->>'ws_id' is distinct from capture.ws_id::text or
      coalesce(item->>'external_calendar_id',item->>'google_calendar_id') is distinct from capture.calendar_id or
      item->>'provider' is distinct from 'google') then
      raise exception using errcode='22023',message='Google import does not match captured scope';
    end if;
    -- Match operation lock ordering: event, then ledger. Retained ledger identity
    -- also protects tombstones and potential resurrection after a local delete.
    select * into event_row from public.workspace_calendar_events
      where ws_id=capture.ws_id and provider='google'
        and coalesce(external_calendar_id,google_calendar_id)=capture.calendar_id
        and coalesce(external_event_id,google_event_id)=external_id for update;
    select * into op from private.calendar_google_color_operations
      where ws_id=capture.ws_id and ((identity->>'calendarId'=capture.calendar_id and identity->>'providerEventId'=external_id)
        or exists(select 1 from private.calendar_provider_saga_scopes s where s.ws_id=private.calendar_google_color_operations.ws_id
          and s.event_id=private.calendar_google_color_operations.event_id and s.provider='google'
          and s.calendar_id=capture.calendar_id and s.provider_event_id=external_id)) for update;
    reason:=null;
    if found then
      expected:=coalesce((capture.generations->>external_id)::bigint,0);
      if op.identity->>'calendarId' is distinct from capture.calendar_id or op.identity->>'providerEventId' is distinct from external_id then
        reason:='identity';
      elsif capture.auth_token_id is null or op.identity->>'authTokenId' is distinct from capture.auth_token_id::text then
        reason:='identity';
      elsif op.phase in ('reserved','prepared','dispatched') then reason:='pending';
      elsif expected<>op.current_generation then reason:='generation';
      end if;
      if reason is not null then
        insert into private.calendar_google_deferred_imports
          (ws_id,calendar_id,auth_scope,external_event_id,reason,observed_generation)
        values(capture.ws_id,capture.calendar_id,coalesce(capture.auth_token_id::text,'legacy'),
          external_id,reason,op.current_generation)
        on conflict(ws_id,calendar_id,auth_scope,external_event_id) do update
          set reason=excluded.reason,observed_generation=excluded.observed_generation,updated_at=now();
        deferred:=deferred+1;
        continue;
      end if;
      insert into private.calendar_google_color_write_permits values
        (txid_current(),op.ws_id,op.event_id,op.operation_id,op.current_generation);
      -- A genuinely fresh GET may restore a provider resource, but reuse its
      -- logical local ID so an older snapshot cannot invent a new UUID bypass.
      if not tombstone then item:=item||jsonb_build_object('id',op.event_id); end if;
    end if;
    if tombstone then
      delete from public.workspace_calendar_events where ws_id=capture.ws_id and provider='google'
        and coalesce(external_calendar_id,google_calendar_id)=capture.calendar_id
        and coalesce(external_event_id,google_event_id)=external_id;
      get diagnostics affected=row_count;
      deleted:=deleted+affected;
    else
      metadata:=item->'scheduling_metadata';
      old_color:=event_row.scheduling_metadata->'google_color';
      new_color:=metadata->'google_color';
      -- Preserve optional-read RGB only for exact matching current identity;
      -- unrelated metadata is merged atomically by the owning import RPC.
      if old_color->>'background' is not null and new_color->>'resolution'='unresolved'
        and old_color->'calendar_id' is not distinct from new_color->'calendar_id'
        and old_color->'color_id' is not distinct from new_color->'color_id'
        and old_color->'event_label_id' is not distinct from new_color->'event_label_id'
        and old_color->'inherited' is not distinct from new_color->'inherited' then
        item:=jsonb_set(item,'{scheduling_metadata,google_color}',new_color||jsonb_build_object(
          'background',old_color->'background','foreground',old_color->'foreground','resolution',old_color->'resolution'));
      end if;
      counts:=public.upsert_calendar_events_and_count(jsonb_build_array(item));
      inserted:=inserted+coalesce((counts->>'inserted')::integer,0);
      updated:=updated+coalesce((counts->>'updated')::integer,0);
    end if;
    if op.operation_id is not null then
      delete from private.calendar_google_color_write_permits where transaction_id=txid_current()
        and ws_id=op.ws_id and event_id=op.event_id;
      update private.calendar_google_color_operations set current_generation=current_generation+1,
        updated_at=now() where ws_id=op.ws_id and event_id=op.event_id;
    end if;
    delete from private.calendar_google_deferred_imports where ws_id=capture.ws_id
      and calendar_id=capture.calendar_id and auth_scope=coalesce(capture.auth_token_id::text,'legacy')
      and external_event_id=external_id;
  end loop;
  return jsonb_build_object('inserted',inserted,'updated',updated,'deleted',deleted,'deferred',deferred);
end;
$$;
revoke all on function public.capture_calendar_google_import(uuid,text,uuid),
  public.list_deferred_calendar_google_imports(uuid,text,uuid),
  public.apply_calendar_google_import(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.capture_calendar_google_import(uuid,text,uuid),
  public.list_deferred_calendar_google_imports(uuid,text,uuid),
  public.apply_calendar_google_import(uuid,jsonb,jsonb) to service_role;
notify pgrst,'reload schema';
