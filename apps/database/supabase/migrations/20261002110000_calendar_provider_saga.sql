-- Retained locators map retired source calendars to the current event generation.
-- They are not independent locks and never contain credentials/provider payloads.
create table private.calendar_provider_saga_scopes (
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  event_id uuid not null,
  provider text not null check(provider in ('google','microsoft')),
  calendar_id text not null,
  provider_event_id text not null,
  auth_token_id uuid not null,
  primary key(ws_id,provider,calendar_id,provider_event_id)
);
alter table private.calendar_provider_saga_scopes enable row level security;
revoke all on private.calendar_provider_saga_scopes from public,anon,authenticated,service_role;

-- Provider creation and moves use the same retained event-generation ledger.
-- The runtime remains disabled until endpoint capabilities pass acceptance.
create function private.calendar_saga_endpoint_allowed(endpoint jsonb, ws uuid, actor uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select case when endpoint->>'provider'='tuturuuu' then
    endpoint->>'wsId'=ws::text and exists(select 1 from private.workspace_calendars c
      where c.id=(endpoint->>'workspaceCalendarId')::uuid and c.ws_id=ws and c.is_enabled)
  else endpoint->'identity'->>'wsId'=ws::text and exists(
    select 1 from public.calendar_connections c join public.calendar_auth_tokens t on t.id=c.auth_token_id
    where c.id=(endpoint->'identity'->>'connectionId')::uuid and c.ws_id=ws and c.is_enabled
      and c.provider=endpoint->>'provider' and c.calendar_id=endpoint->'identity'->>'calendarId'
      and c.workspace_calendar_id is not distinct from (endpoint->>'workspaceCalendarId')::uuid
      and t.id=(endpoint->'identity'->>'authTokenId')::uuid and t.ws_id=ws
      and t.user_id=actor and t.provider=endpoint->>'provider' and t.is_active)
  end;
$$;
revoke all on function private.calendar_saga_endpoint_allowed(jsonb,uuid,uuid) from public,anon,authenticated,service_role;

create function private.calendar_provider_saga_json(op private.calendar_google_color_operations)
returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object('id',op.operation_id::text,'generation',op.generation::text,'phase',op.phase,
    'prepared',op.prepared,'checkpoint',op.completion->'checkpoint');
$$;
revoke all on function private.calendar_provider_saga_json(private.calendar_google_color_operations) from public,anon,authenticated,service_role;

create function public.calendar_provider_saga_operation(
  p_action text,p_ws_id uuid,p_event_id uuid,p_actor_id uuid,p_input jsonb default '{}'
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  op private.calendar_google_color_operations;
  event_row public.workspace_calendar_events;
  has_event boolean;
  prepared jsonb;
  binding jsonb;
  source_endpoint jsonb;
  destination jsonb;
  endpoint jsonb;
  locator jsonb;
  checkpoint jsonb;
  previous jsonb;
  snapshot jsonb;
  projection jsonb;
  placeholder jsonb;
  operation_id uuid;
  expected bigint;
  action text;
  mode text;
  outcome text;
begin
  if not exists(select 1 from public.workspace_members m where m.ws_id=p_ws_id and m.user_id=p_actor_id and m.type='MEMBER')
    or public.has_workspace_permission(p_ws_id,p_actor_id,'manage_calendar') is not true then
    raise exception using errcode='42501',message='Provider saga management permission unavailable';
  end if;
  -- Shared event-first ordering prevents deadlocks with color/import admission.
  select * into event_row from public.workspace_calendar_events where ws_id=p_ws_id and id=p_event_id for update;
  has_event:=found;
  select * into op from private.calendar_google_color_operations where ws_id=p_ws_id and event_id=p_event_id for update;
  prepared:=case when p_action in ('admit','inspect') then p_input->'prepared' else op.prepared end;
  binding:=prepared->'binding'; source_endpoint:=binding->'source'; destination:=binding->'destination';
  action:=binding->>'action'; mode:=binding->>'mode'; operation_id:=(p_input->>'id')::uuid;
  if binding is null or operation_id is null or binding->>'operationId' is distinct from operation_id::text
    or coalesce(action,'') not in ('create','move') or coalesce(mode,'') not in ('insert','google-move','copy-delete','external-to-native')
    or (action='create') is distinct from (source_endpoint='null'::jsonb)
    or (action='create' and mode<>'insert')
    or jsonb_typeof(binding) is distinct from 'object' or jsonb_typeof(destination) is distinct from 'object'
    or source_endpoint is null
    or (action='create' and binding->'baseETag' is distinct from 'null'::jsonb)
    or (mode='insert' and source_endpoint<>'null'::jsonb and source_endpoint->>'provider'<>'tuturuuu')
    or (source_endpoint->>'provider'='tuturuuu' and destination->>'provider'='tuturuuu')
    or coalesce(destination->>'provider','') not in ('google','microsoft','tuturuuu')
    or coalesce(case when destination->>'provider'='tuturuuu' then destination->>'eventId' else destination->'identity'->>'eventId' end,'')<>p_event_id::text
    or (source_endpoint<>'null'::jsonb and coalesce(case when source_endpoint->>'provider'='tuturuuu' then source_endpoint->>'eventId' else source_endpoint->'identity'->>'eventId' end,'')<>p_event_id::text)
    or (mode='insert' and destination->>'provider'='tuturuuu')
    or (mode='copy-delete' and (coalesce(source_endpoint->>'provider','') not in ('google','microsoft') or destination->>'provider' not in ('google','microsoft')))
    or (mode='external-to-native' and (destination->>'provider'<>'tuturuuu' or source_endpoint->>'provider'='tuturuuu'))
    or (mode='google-move' and (source_endpoint->>'provider'<>'google' or destination->>'provider'<>'google'
      or source_endpoint->'identity'->>'authTokenId' is distinct from destination->'identity'->>'authTokenId'
      or source_endpoint->'identity'->>'providerEventId' is distinct from destination->'identity'->>'providerEventId'
      or source_endpoint->'identity'->>'calendarId'=destination->'identity'->>'calendarId'))
    or (destination->>'provider'='google' and mode<>'google-move'
      and destination->'identity'->>'providerEventId' is distinct from 'tt'||replace(operation_id::text,'-',''))
    or (source_endpoint<>'null'::jsonb and source_endpoint->>'provider'<>'tuturuuu'
      and (coalesce(source_endpoint->'identity'->>'providerEventId','')='' or coalesce(binding->>'baseETag','')='')) then
    raise exception using errcode='22023',message='Invalid provider saga binding';
  end if;
  if private.calendar_saga_endpoint_allowed(destination,p_ws_id,p_actor_id) is not true
    or (source_endpoint<>'null'::jsonb and private.calendar_saga_endpoint_allowed(source_endpoint,p_ws_id,p_actor_id) is not true) then
    raise exception using errcode='42501',message='Provider saga access unavailable';
  end if;
  locator:=case when source_endpoint<>'null'::jsonb and source_endpoint->>'provider'<>'tuturuuu'
    then source_endpoint->'identity' else destination->'identity' end;
  if locator is null then raise exception using errcode='22023',message='External saga endpoint required'; end if;
  locator:=locator||jsonb_build_object('providerEventId',coalesce(locator->>'providerEventId','saga:'||operation_id::text));
  if op.operation_id=operation_id and op.actor_id is distinct from p_actor_id then
    raise exception using errcode='42501',message='Provider saga actor changed';
  end if;
  if p_action='inspect' then
    return jsonb_build_object('generation',coalesce(op.current_generation,0)::text,
      'operation',case when op.operation_id is null then null else private.calendar_google_color_operation_json(op) end);
  end if;
  if p_action='admit' then
    expected:=(p_input->>'expectedGeneration')::bigint;
    if op.operation_id=operation_id and op.prepared=prepared and op.request_hash=p_input->>'requestHash' then return private.calendar_provider_saga_json(op); end if;
    if expected is null or expected<0 or coalesce(op.current_generation,0)<>expected or op.phase in ('reserved','prepared','dispatched') then
      raise exception using errcode='40001',message='Provider saga generation changed';
    end if;
    if binding->>'generation' is distinct from (expected+1)::text
      or prepared->'journal'->>'version' is distinct from '1' or jsonb_typeof(prepared->'journal'->'ciphertext') is distinct from 'string' or coalesce(prepared->'journal'->>'ciphertext','')=''
      or coalesce(p_input->>'requestHash','') !~ '^[a-f0-9]{64}$'
      or (prepared-'binding'-'journal')<>'{}'::jsonb
      or ((prepared->'journal')-'version'-'ciphertext')<>'{}'::jsonb
      or (binding-'operationId'-'generation'-'action'-'mode'-'source'-'destination'-'baseETag')<>'{}'::jsonb then
      raise exception using errcode='22023',message='Invalid encrypted provider saga';
    end if;
    if action='create' then
      if has_event then raise exception using errcode='40001',message='Provider creation identity already exists'; end if;
      placeholder:=p_input->'placeholder';
      if placeholder->>'is_encrypted' is distinct from 'true' or jsonb_typeof(placeholder->'title') is distinct from 'string'
        or jsonb_typeof(placeholder->'description') is distinct from 'string'
        or (placeholder ? 'metadata' and jsonb_typeof(placeholder->'metadata') is distinct from 'object')
        or (placeholder-'title'-'description'-'location'-'is_encrypted'-'start_at'-'end_at'-'locked'-'color'-'metadata')<>'{}'::jsonb then
        raise exception using errcode='22023',message='Invalid encrypted provider placeholder';
      end if;
      insert into public.workspace_calendar_events(id,ws_id,title,description,location,is_encrypted,start_at,end_at,locked,color,
        provider,source_calendar_id,external_calendar_id,external_event_id,google_calendar_id,google_event_id,scheduling_metadata,sync_status)
      values(p_event_id,p_ws_id,placeholder->>'title',placeholder->>'description',placeholder->>'location',true,
        (placeholder->>'start_at')::timestamptz,(placeholder->>'end_at')::timestamptz,coalesce((placeholder->>'locked')::boolean,false),placeholder->>'color',
        (destination->>'provider')::public.calendar_provider,(destination->>'workspaceCalendarId')::uuid,destination->'identity'->>'calendarId',destination->'identity'->>'providerEventId',
        case when destination->>'provider'='google' then destination->'identity'->>'calendarId' end,
        case when destination->>'provider'='google' then destination->'identity'->>'providerEventId' end,
        coalesce(placeholder->'metadata','{}'::jsonb)||jsonb_build_object('provider_saga_operation',operation_id::text),'syncing');
    else
      if not has_event or event_row.provider::text is distinct from source_endpoint->>'provider'
        or event_row.source_calendar_id is distinct from (source_endpoint->>'workspaceCalendarId')::uuid
        or (source_endpoint->>'provider'<>'tuturuuu' and (
          coalesce(event_row.external_calendar_id,event_row.google_calendar_id) is distinct from source_endpoint->'identity'->>'calendarId'
          or coalesce(event_row.external_event_id,event_row.google_event_id) is distinct from source_endpoint->'identity'->>'providerEventId')) then
        raise exception using errcode='40001',message='Provider saga source changed';
      end if;
    end if;
    insert into private.calendar_google_color_operations(ws_id,event_id,operation_id,actor_id,generation,current_generation,identity,intent,request_hash,phase,prepared)
    values(p_ws_id,p_event_id,operation_id,p_actor_id,expected+1,expected+1,locator,
      jsonb_build_object('kind','saga','connectionId',locator->>'connectionId'),p_input->>'requestHash','prepared',prepared)
    on conflict(ws_id,event_id) do update set operation_id=excluded.operation_id,actor_id=excluded.actor_id,generation=excluded.generation,
      current_generation=excluded.current_generation,identity=excluded.identity,intent=excluded.intent,request_hash=excluded.request_hash,
      phase='prepared',prepared=excluded.prepared,completion=null,created_at=now(),updated_at=now() returning * into op;
    for endpoint in select value from jsonb_array_elements(jsonb_build_array(source_endpoint,destination)) loop
      if endpoint->>'provider' in ('google','microsoft') and endpoint->'identity'->>'providerEventId' is not null then
        insert into private.calendar_provider_saga_scopes values(p_ws_id,p_event_id,endpoint->>'provider',endpoint->'identity'->>'calendarId',
          endpoint->'identity'->>'providerEventId',(endpoint->'identity'->>'authTokenId')::uuid) on conflict do nothing;
        if not exists(select 1 from private.calendar_provider_saga_scopes h where h.ws_id=p_ws_id and h.provider=endpoint->>'provider'
          and h.calendar_id=endpoint->'identity'->>'calendarId' and h.provider_event_id=endpoint->'identity'->>'providerEventId' and h.event_id=p_event_id) then
          raise exception using errcode='40001',message='Provider saga locator already belongs to another event';
        end if;
      end if;
    end loop;
  else
    if op.operation_id is distinct from operation_id or op.intent->>'kind' is distinct from 'saga' then
      raise exception using errcode='40001',message='Provider saga changed';
    end if;
    if p_action='read' then return private.calendar_provider_saga_json(op); end if;
    if op.generation::text is distinct from p_input->>'generation' or op.current_generation<>op.generation then
      raise exception using errcode='40001',message='Provider saga generation changed';
    end if;
    if p_action='dispatch' then
      if op.phase not in ('prepared','dispatched') then raise exception using errcode='40001',message='Provider saga cannot dispatch'; end if;
      update private.calendar_google_color_operations set phase='dispatched',updated_at=now() where ws_id=p_ws_id and event_id=p_event_id returning * into op;
    elsif p_action='cancel' then
      if op.phase<>'prepared' then raise exception using errcode='40001',message='Provider saga may have been sent'; end if;
      if action='create' then
        insert into private.calendar_google_color_write_permits values(txid_current(),p_ws_id,p_event_id,op.operation_id,op.current_generation);
        delete from public.workspace_calendar_events where ws_id=p_ws_id and id=p_event_id;
        delete from private.calendar_google_color_write_permits where transaction_id=txid_current() and ws_id=p_ws_id and event_id=p_event_id;
      end if;
      update private.calendar_google_color_operations set phase='canceled',updated_at=now() where ws_id=p_ws_id and event_id=p_event_id returning * into op;
    elsif p_action='checkpoint' then
      checkpoint:=p_input->'checkpoint'; previous:=op.completion->'checkpoint';
      if op.phase<>'dispatched' or coalesce(checkpoint->>'step','') not in ('target-created','source-deleted','target-removed')
        or (mode='external-to-native' and (checkpoint->>'step'<>'source-deleted' or checkpoint ? 'targetEventId' or checkpoint ? 'targetETag'))
        or (mode='insert' and checkpoint->>'step'<>'target-created')
        or (mode='google-move' and checkpoint->>'step'='target-removed')
        or (checkpoint-'step'-'targetEventId'-'targetETag')<>'{}'::jsonb
        or (checkpoint->>'step'<>'source-deleted' and (coalesce(checkpoint->>'targetEventId','')='' or coalesce(checkpoint->>'targetETag','')=''))
        or (previous is not null and ((previous-'step') is distinct from (checkpoint-'step')
          or previous->>'step' in ('source-deleted','target-removed') and previous is distinct from checkpoint))
        or (previous is null and checkpoint->>'step'<>'target-created' and mode<>'external-to-native')
        or (previous->>'step'='target-created' and checkpoint->>'step' not in ('target-created','source-deleted','target-removed'))
        or (destination->>'provider'='google' and checkpoint ? 'targetEventId' and checkpoint->>'targetEventId' is distinct from destination->'identity'->>'providerEventId') then
        raise exception using errcode='40001',message='Provider saga checkpoint changed';
      end if;
      if checkpoint ? 'targetEventId' then
        insert into private.calendar_provider_saga_scopes values(p_ws_id,p_event_id,destination->>'provider',destination->'identity'->>'calendarId',
          checkpoint->>'targetEventId',(destination->'identity'->>'authTokenId')::uuid) on conflict do nothing;
        if not exists(select 1 from private.calendar_provider_saga_scopes h where h.ws_id=p_ws_id and h.provider=destination->>'provider'
          and h.calendar_id=destination->'identity'->>'calendarId' and h.provider_event_id=checkpoint->>'targetEventId' and h.event_id=p_event_id) then
          raise exception using errcode='40001',message='Provider saga target already belongs to another event';
        end if;
      end if;
      update private.calendar_google_color_operations set completion=jsonb_build_object('checkpoint',checkpoint),updated_at=now()
        where ws_id=p_ws_id and event_id=p_event_id returning * into op;
    elsif p_action='finalize' then
      if op.phase in ('applied','superseded') then return private.calendar_provider_saga_json(op); end if;
      snapshot:=p_input->'snapshot'; outcome:=snapshot->>'outcome'; endpoint:=snapshot->'endpoint'; projection:=snapshot->'projection';
      checkpoint:=op.completion->'checkpoint';
      if op.phase<>'dispatched' or coalesce(outcome,'') not in ('applied','superseded')
        or (outcome='superseded' and source_endpoint='null'::jsonb)
        or endpoint is distinct from (case when outcome='applied' then destination else source_endpoint end)
        or (outcome='applied' and source_endpoint<>'null'::jsonb and source_endpoint->>'provider'<>'tuturuuu' and checkpoint->>'step' is distinct from 'source-deleted')
        or (outcome='applied' and destination->>'provider'<>'tuturuuu' and coalesce(checkpoint->>'step','') not in ('target-created','source-deleted'))
        or (outcome='superseded' and mode<>'external-to-native' and checkpoint->>'step' is distinct from 'target-removed')
        or projection->>'is_encrypted' is distinct from 'true' or jsonb_typeof(projection->'title') is distinct from 'string'
        or jsonb_typeof(projection->'description') is distinct from 'string' or jsonb_typeof(snapshot->'metadata') is distinct from 'object'
        or (projection-'title'-'description'-'location'-'is_encrypted'-'start_at'-'end_at'-'locked')<>'{}'::jsonb
        or (outcome='superseded' and (snapshot->>'etag' is not distinct from binding->>'baseETag' or projection ? 'locked'))
        or (endpoint->>'provider'<>'tuturuuu' and (coalesce(snapshot->>'providerEventId','')='' or coalesce(snapshot->>'etag','')=''))
        or (outcome='applied' and endpoint->>'provider'<>'tuturuuu' and mode<>'google-move'
          and snapshot->>'operationMarker' is distinct from operation_id::text)
        or (outcome='applied' and checkpoint ? 'targetEventId' and snapshot->>'providerEventId' is distinct from checkpoint->>'targetEventId') then
        raise exception using errcode='22023',message='Invalid authoritative provider saga projection';
      end if;
      insert into private.calendar_google_color_write_permits values(txid_current(),p_ws_id,p_event_id,op.operation_id,op.current_generation);
      update public.workspace_calendar_events set title=projection->>'title',description=projection->>'description',location=projection->>'location',is_encrypted=true,
        start_at=(projection->>'start_at')::timestamptz,end_at=(projection->>'end_at')::timestamptz,
        locked=case when projection ? 'locked' then (projection->>'locked')::boolean else locked end,
        provider=(endpoint->>'provider')::public.calendar_provider,source_calendar_id=(endpoint->>'workspaceCalendarId')::uuid,
        external_calendar_id=case when endpoint->>'provider'<>'tuturuuu' then endpoint->'identity'->>'calendarId' end,
        external_event_id=case when endpoint->>'provider'<>'tuturuuu' then snapshot->>'providerEventId' end,
        google_calendar_id=case when endpoint->>'provider'='google' then endpoint->'identity'->>'calendarId' end,
        google_event_id=case when endpoint->>'provider'='google' then snapshot->>'providerEventId' end,
        scheduling_metadata=(coalesce(scheduling_metadata,'{}'::jsonb)-'provider_saga_operation')||(snapshot->'metadata'),
        color=snapshot->>'compatibilityColor',last_synced_at=now(),sync_status=case when outcome='applied' then 'synced' else 'conflict' end,
        sync_error=case when outcome='superseded' then 'Provider move was superseded' end where ws_id=p_ws_id and id=p_event_id;
      if not found then raise exception using errcode='40001',message='Provider saga event unavailable'; end if;
      delete from private.calendar_google_color_write_permits where transaction_id=txid_current() and ws_id=p_ws_id and event_id=p_event_id;
      if endpoint->>'provider'<>'tuturuuu' then locator:=endpoint->'identity'||jsonb_build_object('providerEventId',snapshot->>'providerEventId'); end if;
      update private.calendar_google_color_operations set phase=outcome,identity=locator,
        intent=jsonb_build_object('kind','saga','connectionId',locator->>'connectionId'),completion=snapshot||jsonb_build_object('checkpoint',checkpoint),updated_at=now()
        where ws_id=p_ws_id and event_id=p_event_id returning * into op;
    else raise exception using errcode='22023',message='Unknown provider saga action'; end if;
  end if;
  return private.calendar_provider_saga_json(op);
end;
$$;
revoke all on function public.calendar_provider_saga_operation(text,uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.calendar_provider_saga_operation(text,uuid,uuid,uuid,jsonb) to service_role;
