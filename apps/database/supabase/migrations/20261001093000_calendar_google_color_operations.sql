-- Server-only color operation ledger. No customer event backfill, credentials,
-- user table grants, lease-based unlock, or client-writable metadata state.
create table private.calendar_google_color_operations (
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  event_id uuid not null,
  operation_id uuid not null,
  actor_id uuid not null,
  generation bigint not null check (generation > 0),
  identity jsonb not null check (jsonb_typeof(identity) = 'object'),
  intent jsonb not null check (jsonb_typeof(intent) = 'object'),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  phase text not null check (phase in
    ('reserved', 'prepared', 'dispatched', 'applied', 'superseded', 'canceled')),
  prepared jsonb,
  completion jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (ws_id, event_id)
);
alter table private.calendar_google_color_operations enable row level security;
revoke all on private.calendar_google_color_operations from public, anon, authenticated, service_role;

-- Transaction-local capabilities have no public RPC or direct role grant.
-- Neither a forged GUC nor snapshot metadata authorizes a protected event write.
create table private.calendar_google_color_write_permits (
  transaction_id bigint not null,
  ws_id uuid not null,
  event_id uuid not null,
  operation_id uuid not null,
  generation bigint not null,
  primary key (transaction_id, ws_id, event_id)
);
alter table private.calendar_google_color_write_permits enable row level security;
revoke all on private.calendar_google_color_write_permits from public, anon, authenticated, service_role;

create function private.calendar_google_color_operation_json(
  op private.calendar_google_color_operations
) returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('id', op.operation_id::text, 'generation', op.generation::text,
    'identity', op.identity, 'intent', op.intent, 'requestHash', op.request_hash,
    'phase', op.phase, 'prepared', op.prepared);
$$;
revoke all on function private.calendar_google_color_operation_json(
  private.calendar_google_color_operations) from public, anon, authenticated, service_role;

create function private.guard_calendar_google_color_operation()
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
  select * into op from private.calendar_google_color_operations
    where ws_id = guarded_workspace and event_id = guarded_event;
  if not found then
    -- A canceled/deleted event's identity cannot be resurrected by an old import
    -- with a new local UUID. A guarded import must explicitly handle this ledger.
    if tg_op = 'INSERT' and new.provider = 'google' then
      if exists (select 1 from private.calendar_google_color_operations h
        where h.ws_id = new.ws_id
          and h.identity->>'calendarId' = coalesce(new.external_calendar_id, new.google_calendar_id)
          and h.identity->>'providerEventId' = coalesce(new.external_event_id, new.google_event_id)) then
        raise exception using errcode = '40001', message = 'Google import requires generation guard';
      end if;
    end if;
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if exists (select 1 from private.calendar_google_color_write_permits p
    where p.transaction_id = txid_current() and p.ws_id = op.ws_id
      and p.event_id = op.event_id and p.operation_id = op.operation_id
      and p.generation = op.generation) then
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
revoke all on function private.guard_calendar_google_color_operation() from public, anon, authenticated, service_role;
create trigger guard_calendar_google_color_operation
  before insert or update or delete on public.workspace_calendar_events
  for each row execute function private.guard_calendar_google_color_operation();

-- Only the existing trusted service role can invoke this RPC. HTTP orchestration
-- must first reauthorize manage_calendar; this RPC independently binds the token
-- owner and exact connection/calendar/event identity on EVERY invocation.
create function public.calendar_google_color_operation(
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
  if p_action = 'reserve' then
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
    if coalesce(op.generation, 0) <> requested_generation or
      op.phase in ('reserved', 'prepared', 'dispatched') then
      raise exception using errcode = '40001', message = 'Google operation is in progress';
    end if;
    if requested_operation is null or requested_generation is null or
      p_input->'intent'->>'connectionId' is distinct from connection_id::text then
      raise exception using errcode = '22023', message = 'Invalid Google operation reservation';
    end if;
    insert into private.calendar_google_color_operations
      (ws_id,event_id,operation_id,actor_id,generation,identity,intent,request_hash,phase)
    values (p_ws_id,p_event_id,requested_operation,p_actor_id,requested_generation+1,
      requested_identity,p_input->'intent',p_input->>'requestHash','reserved')
    on conflict (ws_id,event_id) do update set operation_id=excluded.operation_id,
      actor_id=excluded.actor_id,generation=excluded.generation,identity=excluded.identity,
      intent=excluded.intent,request_hash=excluded.request_hash,phase='reserved',
      prepared=null,completion=null,created_at=now(),updated_at=now()
    returning * into op;
  else
    if op.operation_id is distinct from requested_operation or
      op.generation is distinct from requested_generation or
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
revoke all on function public.calendar_google_color_operation(text,uuid,uuid,uuid,jsonb)
  from public, anon, authenticated;
grant execute on function public.calendar_google_color_operation(text,uuid,uuid,uuid,jsonb) to service_role;
