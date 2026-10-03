-- Native edits after provider transfer retain the same logical event generation.
-- The caller's encrypted patch and expected generation are checked atomically.
create function public.calendar_native_generation_mutation(
  p_action text,p_ws_id uuid,p_event_id uuid,p_actor_id uuid,p_input jsonb default '{}'
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  event_row public.workspace_calendar_events;
  op private.calendar_google_color_operations;
  patch jsonb;
  generation bigint;
  task_id uuid;
  linked_habit_id uuid;
  habit_date date;
begin
  if not exists(select 1 from public.workspace_members m where m.ws_id=p_ws_id and m.user_id=p_actor_id and m.type='MEMBER')
    or public.has_workspace_permission(p_ws_id,p_actor_id,'manage_calendar') is not true then
    raise exception using errcode='42501',message='Native calendar access unavailable';
  end if;
  select * into event_row from public.workspace_calendar_events where ws_id=p_ws_id and id=p_event_id for update;
  if not found or event_row.provider is distinct from 'tuturuuu' then
    raise exception using errcode='40001',message='Native calendar source changed';
  end if;
  select * into op from private.calendar_google_color_operations where ws_id=p_ws_id and event_id=p_event_id for update;
  generation:=coalesce(op.current_generation,0);
  if p_action='inspect' then return jsonb_build_object('generation',generation::text,'pending',coalesce(op.phase in ('reserved','prepared','dispatched'),false)); end if;
  if coalesce(p_input->>'expectedGeneration','') is distinct from generation::text or op.phase in ('reserved','prepared','dispatched') then
    raise exception using errcode='40001',message='Native calendar generation changed';
  end if;
  if p_action not in ('patch','delete') then raise exception using errcode='22023',message='Invalid native calendar action'; end if;
  if p_action='patch' then
    patch:=p_input->'patch';
    if jsonb_typeof(patch) is distinct from 'object'
      or (patch-'title'-'description'-'location'-'is_encrypted'-'start_at'-'end_at'-'locked'-'color')<>'{}'::jsonb
      or ((patch ? 'title' or patch ? 'description' or patch ? 'location') and patch->>'is_encrypted' is distinct from 'true') then
      raise exception using errcode='22023',message='Invalid encrypted native calendar patch';
    end if;
  end if;
  if op.operation_id is not null then
    update private.calendar_google_color_operations set current_generation=current_generation+1,updated_at=now()
      where ws_id=p_ws_id and event_id=p_event_id returning * into op;
    insert into private.calendar_google_color_write_permits values(txid_current(),p_ws_id,p_event_id,op.operation_id,op.current_generation);
  end if;
  if p_action='delete' then
    select t.task_id into task_id from public.task_calendar_events t where t.event_id=p_event_id;
    select h.habit_id,h.occurrence_date into linked_habit_id,habit_date from public.habit_calendar_events h where h.event_id=p_event_id;
    if linked_habit_id is not null and habit_date is not null then
      insert into public.habit_skipped_occurrences(ws_id,habit_id,occurrence_date,created_by,source_event_id,revoked_at)
      values(p_ws_id,linked_habit_id,habit_date,p_actor_id,p_event_id,null)
      on conflict(ws_id,habit_id,occurrence_date) do update set revoked_at=null,created_by=excluded.created_by,source_event_id=excluded.source_event_id;
    end if;
    delete from public.workspace_calendar_events where ws_id=p_ws_id and id=p_event_id;
  else
    update public.workspace_calendar_events set
      title=case when patch ? 'title' then patch->>'title' else title end,
      description=case when patch ? 'description' then patch->>'description' else description end,
      location=case when patch ? 'location' then patch->>'location' else location end,
      is_encrypted=case when patch ? 'is_encrypted' then (patch->>'is_encrypted')::boolean else is_encrypted end,
      start_at=case when patch ? 'start_at' then (patch->>'start_at')::timestamptz else start_at end,
      end_at=case when patch ? 'end_at' then (patch->>'end_at')::timestamptz else end_at end,
      locked=case when patch ? 'locked' then (patch->>'locked')::boolean else locked end,
      color=case when patch ? 'color' then patch->>'color' else color end
      where ws_id=p_ws_id and id=p_event_id returning * into event_row;
  end if;
  if op.operation_id is not null then
    delete from private.calendar_google_color_write_permits where transaction_id=txid_current() and ws_id=p_ws_id and event_id=p_event_id;
  end if;
  return case when p_action='delete' then jsonb_build_object('deleted',true,'linkedTaskId',task_id,'skippedHabitId',linked_habit_id,'skippedHabitDate',habit_date)
    else to_jsonb(event_row) end;
end;
$$;
revoke all on function public.calendar_native_generation_mutation(text,uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.calendar_native_generation_mutation(text,uuid,uuid,uuid,jsonb) to service_role;

