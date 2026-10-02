-- Roll out this compatibility guard before the first provider operation ledger.
-- The relation check executes in PostgreSQL, never via a cached API schema.
create function public.calendar_retained_generation(p_ws_id uuid,p_event_id uuid,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare op jsonb; generation text;
begin
  if not exists(select 1 from public.workspace_members m where m.ws_id=p_ws_id and m.user_id=p_actor_id and m.type='MEMBER')
    or public.has_workspace_permission(p_ws_id,p_actor_id,'manage_calendar') is not true then
    raise exception using errcode='42501',message='Calendar generation access unavailable';
  end if;
  if pg_catalog.to_regclass('private.calendar_google_color_operations') is null then return null; end if;
  -- Fixed identifier and bound values: partial/incompatible relations fail closed.
  execute 'select pg_catalog.to_jsonb(o) from private.calendar_google_color_operations o where o.ws_id=$1 and o.event_id=$2'
    into op using p_ws_id,p_event_id;
  if op is null then return null; end if;
  generation:=coalesce(op->>'current_generation',op->>'generation');
  if coalesce(generation,'') !~ '^[1-9][0-9]*$' or coalesce(op->>'phase','') not in ('reserved','prepared','dispatched','applied','superseded','canceled')
    or pg_catalog.jsonb_typeof(op->'intent') is distinct from 'object'
    or pg_catalog.jsonb_typeof(op->'intent'->'kind') is distinct from 'string'
    or coalesce(op->'intent'->>'kind','')='' or op->>'operation_id' is null or op->>'actor_id' is null then
    raise exception using errcode='55000',message='Calendar generation schema unavailable';
  end if;
  return jsonb_build_object('generation',generation,'pending',op->>'phase' in ('reserved','prepared','dispatched'),
    'intentKind',op->'intent'->>'kind','phase',op->>'phase',
    'operationId',case when op->>'actor_id'=p_actor_id::text then op->>'operation_id' else null end);
end;
$$;
revoke all on function public.calendar_retained_generation(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.calendar_retained_generation(uuid,uuid,uuid) to service_role;
