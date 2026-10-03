-- Generic mutations share the color/import ledger, so no competing writer can
-- obtain a second generation while an encrypted mutation is dispatched. This
-- candidate remains disabled until every outbound writer cooperates.
create function public.calendar_google_mutation_operation(
  p_action text, p_ws_id uuid, p_event_id uuid, p_actor_id uuid, p_input jsonb default '{}'
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  event_row public.workspace_calendar_events;
  op private.calendar_google_color_operations;
  identity jsonb;
  prepared jsonb;
  snapshot jsonb;
  outcome text;
  generation bigint;
  operation_id uuid;
  has_event boolean;
  task_id uuid;
  linked_habit_id uuid;
  habit_date date;
  result_completion jsonb;
  linked_habit record;
begin
  select * into event_row from public.workspace_calendar_events
    where ws_id=p_ws_id and id=p_event_id for update;
  has_event := found;
  select * into op from private.calendar_google_color_operations
    where ws_id=p_ws_id and event_id=p_event_id for update;
  identity := case when p_action='admit' then p_input->'prepared'->'binding'->'identity' when p_action='inspect' then p_input->'identity' else op.identity end;
  if identity is null or identity->>'wsId' is distinct from p_ws_id::text
    or identity->>'eventId' is distinct from p_event_id::text
    or (has_event and (event_row.provider is distinct from 'google'
      or identity->>'calendarId' is distinct from coalesce(event_row.external_calendar_id,event_row.google_calendar_id)
      or identity->>'providerEventId' is distinct from coalesce(event_row.external_event_id,event_row.google_event_id)))
    or (not has_event and not (op.phase in ('applied','superseded') and op.completion->>'deleted'='true')) then
    raise exception using errcode='40001',message='Google mutation identity changed';
  end if;
  if not exists(select 1 from public.calendar_connections c
    join public.calendar_auth_tokens t on t.id=c.auth_token_id
    where c.id=(identity->>'connectionId')::uuid and c.ws_id=p_ws_id
      and c.provider='google' and c.is_enabled and c.calendar_id=identity->>'calendarId'
      and t.id=(identity->>'authTokenId')::uuid and t.ws_id=p_ws_id
      and t.user_id=p_actor_id and t.provider='google' and t.is_active) then
    raise exception using errcode='42501',message='Google mutation access unavailable';
  end if;
  if p_action='inspect' then
    return jsonb_build_object('generation',coalesce(op.current_generation,0)::text,
      'operation',case when op.operation_id is not null then private.calendar_google_color_operation_json(op) else null end);
  end if;
  operation_id := (p_input->>'id')::uuid;
  if p_action='admit' then
    prepared := p_input->'prepared';
    generation := (p_input->>'expectedGeneration')::bigint;
    if op.operation_id=operation_id and op.prepared=prepared then
      return private.calendar_google_color_operation_json(op);
    end if;
    if not has_event or coalesce(op.current_generation,0)<>generation
      or op.phase in ('reserved','prepared','dispatched') then
      raise exception using errcode='40001',message='Google mutation in progress';
    end if;
    -- Exact immutable binding; the journal's only payload is authenticated
    -- ciphertext. No raw title, provider patch or local fields enter the ledger.
    if operation_id is null or generation is null or generation<0
      or prepared->'binding'->>'operationId' is distinct from operation_id::text
      or prepared->'binding'->>'generation' is distinct from (generation+1)::text
      or coalesce(prepared->'binding'->>'action','') not in ('patch','delete')
      or jsonb_typeof(prepared->'binding'->'baseETag') is distinct from 'string'
      or length(prepared->'binding'->>'baseETag')=0
      or prepared->'journal'->>'version' is distinct from '1'
      or jsonb_typeof(prepared->'journal'->'ciphertext') is distinct from 'string'
      or length(prepared->'journal'->>'ciphertext')=0
      or (prepared - 'binding' - 'journal')<>'{}'::jsonb
      or ((prepared->'journal') - 'version' - 'ciphertext')<>'{}'::jsonb
      or ((prepared->'binding') - 'operationId' - 'generation' - 'identity' - 'action' - 'baseETag')<>'{}'::jsonb then
      raise exception using errcode='22023',message='Invalid encrypted Google mutation';
    end if;
    insert into private.calendar_google_color_operations
      (ws_id,event_id,operation_id,actor_id,generation,current_generation,identity,intent,request_hash,phase,prepared)
    values(p_ws_id,p_event_id,operation_id,p_actor_id,generation+1,generation+1,identity,
      jsonb_build_object('kind','mutation','connectionId',identity->>'connectionId'),p_input->>'requestHash','prepared',prepared)
    on conflict(ws_id,event_id) do update set operation_id=excluded.operation_id,
      actor_id=excluded.actor_id,generation=excluded.generation,current_generation=excluded.current_generation,
      identity=excluded.identity,intent=excluded.intent,request_hash=excluded.request_hash,
      phase='prepared',prepared=excluded.prepared,completion=null,created_at=now(),updated_at=now()
    returning * into op;
  else
    if op.operation_id is distinct from operation_id or op.intent->>'kind' is distinct from 'mutation' then
      raise exception using errcode='40001',message='Google mutation changed';
    end if;
    if p_action='read' then return private.calendar_google_color_operation_json(op); end if;
    if p_action='result' then
      if op.phase not in ('applied','superseded') or op.completion->>'deleted' is distinct from 'true' then
        raise exception using errcode='40001',message='Google deletion is not final';
      end if;
      -- Return only the stable deletion UI summary, never encrypted provider
      -- content, stored request preparation, or unrelated event metadata.
      return jsonb_build_object('operationId',op.operation_id::text,'deleted',true,
        'linkedTaskId',op.completion->'linkedTaskId','skippedHabitId',op.completion->'skippedHabitId',
        'skippedHabitDate',op.completion->'skippedHabitDate');
    end if;
    generation := (p_input->>'generation')::bigint;
    if op.generation is distinct from generation or op.current_generation is distinct from generation then
      raise exception using errcode='40001',message='Google mutation generation changed';
    end if;
    if p_action='dispatch' then
      if op.phase not in ('prepared','dispatched') then
        raise exception using errcode='40001',message='Google mutation cannot dispatch';
      end if;
      update private.calendar_google_color_operations set phase='dispatched',updated_at=now()
        where ws_id=p_ws_id and event_id=p_event_id returning * into op;
    elsif p_action='cancel' then
      if op.phase<>'prepared' then
        raise exception using errcode='40001',message='Google mutation may have been sent';
      end if;
      update private.calendar_google_color_operations set phase='canceled',updated_at=now()
        where ws_id=p_ws_id and event_id=p_event_id returning * into op;
    elsif p_action='finalize' then
      if op.phase in ('applied','superseded') then return private.calendar_google_color_operation_json(op); end if;
      snapshot := p_input->'snapshot';
      outcome := snapshot->>'outcome';
      if op.phase<>'dispatched' or coalesce(outcome,'') not in ('applied','superseded')
        or jsonb_typeof(snapshot->'deleted') is distinct from 'boolean' then
        raise exception using errcode='22023',message='Google mutation is not fenced';
      end if;
      if snapshot->>'deleted'='true' then
        if (outcome='applied') is distinct from (op.prepared->'binding'->>'action'='delete') then
          raise exception using errcode='22023',message='Google deletion outcome changed';
        end if;
      elsif jsonb_typeof(snapshot->'etag') is distinct from 'string'
        or length(snapshot->>'etag')=0 or snapshot->>'etag'=op.prepared->'binding'->>'baseETag'
        or (outcome='applied') is distinct from
          (op.prepared->'binding'->>'action'='patch' and coalesce(snapshot->>'operationMarker'=operation_id::text,false))
        or snapshot->'projection'->>'is_encrypted' is distinct from 'true'
        or jsonb_typeof(snapshot->'projection'->'title') is distinct from 'string'
        or jsonb_typeof(snapshot->'projection'->'description') is distinct from 'string'
        or jsonb_typeof(snapshot->'metadata'->'google_color') is distinct from 'object'
        or ((snapshot->'projection') - 'title' - 'description' - 'location' - 'is_encrypted' - 'start_at' - 'end_at' - 'locked')<>'{}'::jsonb
        or (outcome='superseded' and snapshot->'projection' ? 'locked') then
        raise exception using errcode='22023',message='Invalid authoritative Google projection';
      end if;
      insert into private.calendar_google_color_write_permits values
        (txid_current(),p_ws_id,p_event_id,op.operation_id,op.current_generation);
      if snapshot->>'deleted'='true' then
        select t.task_id into task_id from public.task_calendar_events t where t.event_id=p_event_id;
        for linked_habit in select h.habit_id,h.occurrence_date
          from public.habit_calendar_events h where h.event_id=p_event_id order by h.habit_id,h.occurrence_date loop
          if linked_habit_id is null then linked_habit_id:=linked_habit.habit_id; habit_date:=linked_habit.occurrence_date; end if;
          if linked_habit.habit_id is not null and linked_habit.occurrence_date is not null then
            insert into public.habit_skipped_occurrences(ws_id,habit_id,occurrence_date,created_by,source_event_id,revoked_at)
            values(p_ws_id,linked_habit.habit_id,linked_habit.occurrence_date,p_actor_id,p_event_id,null)
            on conflict(ws_id,habit_id,occurrence_date) do update set revoked_at=null,
              created_by=excluded.created_by,source_event_id=excluded.source_event_id;
          end if;
        end loop;
        result_completion := snapshot || jsonb_build_object('linkedTaskId',task_id,'skippedHabitId',linked_habit_id,'skippedHabitDate',habit_date);
        delete from public.workspace_calendar_events where ws_id=p_ws_id and id=p_event_id;
      else
        update public.workspace_calendar_events set
          title=snapshot->'projection'->>'title',description=snapshot->'projection'->>'description',
          location=snapshot->'projection'->>'location',is_encrypted=true,
          start_at=(snapshot->'projection'->>'start_at')::timestamptz,
          end_at=(snapshot->'projection'->>'end_at')::timestamptz,
          locked=case when snapshot->'projection' ? 'locked' then (snapshot->'projection'->>'locked')::boolean else locked end,
          scheduling_metadata=coalesce(scheduling_metadata,'{}'::jsonb) || (snapshot->'metadata'),
          color=snapshot->>'compatibilityColor',last_synced_at=now(),
          sync_status=case when outcome='applied' then 'synced' else 'conflict' end,
          sync_error=case when outcome='superseded' then 'Google mutation was superseded' else null end
          where ws_id=p_ws_id and id=p_event_id;
        result_completion := snapshot;
      end if;
      delete from private.calendar_google_color_write_permits
        where transaction_id=txid_current() and ws_id=p_ws_id and event_id=p_event_id;
      update private.calendar_google_color_operations set phase=outcome,completion=result_completion,updated_at=now()
        where ws_id=p_ws_id and event_id=p_event_id returning * into op;
    else
      raise exception using errcode='22023',message='Unknown Google mutation action';
    end if;
  end if;
  return private.calendar_google_color_operation_json(op);
end;
$$;
revoke all on function public.calendar_google_mutation_operation(text,uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.calendar_google_mutation_operation(text,uuid,uuid,uuid,jsonb) to service_role;
