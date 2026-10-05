-- New future updates create their replacement before the destructive trim.
-- Older encrypted plans retain the existing trim-first receipt semantics.
create or replace function public.calendar_provider_series_operation(p_ws_id uuid,p_actor_id uuid,p_action text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 op private.calendar_provider_series_operations;
 conn public.calendar_connections;
 native private.calendar_event_series;
 native_result jsonb; target uuid; checkpoint jsonb; receipt jsonb;
begin
 if auth.role() is distinct from 'service_role' or p_actor_id is null or
   not exists(select 1 from public.workspace_members m where m.ws_id=p_ws_id and m.user_id=p_actor_id) or
   public.has_workspace_permission(p_ws_id,p_actor_id,'manage_calendar') is not true then
   raise exception 'Provider series access denied' using errcode='42501';
 end if;
 if p_action='binding' then
   perform private.calendar_series_operation(p_ws_id,'read',jsonb_build_object('seriesId',p_input->>'seriesId'),p_actor_id);
   select b.connection_id into target from private.calendar_provider_series_bindings b where b.ws_id=p_ws_id and b.series_id=(p_input->>'seriesId')::uuid;
   if target is null then raise exception 'Provider series binding not found' using errcode='P0002'; end if;
   if not exists(select 1 from public.calendar_connections c join public.calendar_auth_tokens t on t.id=c.auth_token_id
     where c.id=target and c.ws_id=p_ws_id and c.is_enabled and c.sync_outbound_enabled and t.user_id=p_actor_id and t.ws_id=p_ws_id and t.provider=c.provider and t.is_active
       and (c.access_role is null or lower(c.access_role) in ('owner','writer','write','editor'))) then raise exception 'Provider connection access denied' using errcode='42501'; end if;
   return (select to_jsonb(b) from private.calendar_provider_series_bindings b where b.ws_id=p_ws_id and b.series_id=(p_input->>'seriesId')::uuid);
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_ws_id::text||(p_input->>'id'),0));
 select * into op from private.calendar_provider_series_operations where id=(p_input->>'id')::uuid and ws_id=p_ws_id and actor_id=p_actor_id for update;
 if p_action='reserve' and not found then
   select * into conn from public.calendar_connections where id=(p_input->>'connectionId')::uuid and ws_id=p_ws_id;
   if not found then raise exception 'Calendar connection not found' using errcode='P0002'; end if;
   if p_input->>'seriesId' is not null then
     select * into native from private.calendar_event_series where id=(p_input->>'seriesId')::uuid and ws_id=p_ws_id and deleted_at is null for update;
     if not found then raise exception 'Series not found' using errcode='P0002'; end if;
     if native.revision is distinct from (p_input->'nativeInput'->>'expectedRevision')::integer then raise exception 'Series revision changed' using errcode='40001'; end if;
     if not exists(select 1 from private.calendar_provider_series_bindings b where b.series_id=native.id and b.ws_id=p_ws_id and b.connection_id=conn.id) then
       raise exception 'Provider series binding not found' using errcode='P0002';
     end if;
   elsif p_input->>'nativeAction'<>'create' then raise exception 'Series identity required' using errcode='22023'; end if;
   if p_input->'nativeInput'->>'requestId' is distinct from p_input->>'id' then raise exception 'Request identity mismatch' using errcode='22023'; end if;
   if p_input->'nativeInput' ? 'providerCreateFirst' and (p_input->'nativeInput'->'providerCreateFirst' is distinct from 'true'::jsonb or p_input->>'nativeAction' is distinct from 'update' or p_input->'nativeInput'->>'scope' is distinct from 'future' or (p_input->>'stepCount')::integer is distinct from 2) then raise exception 'Invalid provider execution order' using errcode='22023'; end if;
   insert into private.calendar_provider_series_operations(id,ws_id,actor_id,connection_id,series_id,native_action,native_input,intent_hash,journal,step_count)
    values((p_input->>'id')::uuid,p_ws_id,p_actor_id,conn.id,native.id,p_input->>'nativeAction',p_input->'nativeInput',p_input->>'intentHash',p_input->'journal',(p_input->>'stepCount')::integer) returning * into op;
 elsif not found then raise exception 'Provider operation not found' using errcode='P0002';
 end if;
 select * into conn from public.calendar_connections where id=op.connection_id and ws_id=p_ws_id;
 if conn.is_enabled is not true or conn.sync_outbound_enabled is not true or conn.provider not in ('google','microsoft') or
   (conn.access_role is not null and lower(conn.access_role) not in ('owner','writer','write','editor')) or
   not exists(select 1 from public.calendar_auth_tokens t where t.id=conn.auth_token_id and t.ws_id=p_ws_id and t.user_id=p_actor_id and t.provider=conn.provider and t.is_active) then
   raise exception 'Provider connection access denied' using errcode='42501';
 end if;
 if p_action='reserve' then
   if op.intent_hash is distinct from p_input->>'intentHash' then raise exception 'Provider request id reused' using errcode='22023'; end if;
 elsif p_action='binding' then
   raise exception 'Invalid operation action' using errcode='22023';
 elsif p_action='claim' and op.phase<>'applied' then
   if op.phase='running' and op.lease_until>now() then raise exception 'Provider operation leased' using errcode='40001'; end if;
   update private.calendar_provider_series_operations set phase='running',lease=gen_random_uuid(),lease_until=now()+interval '2 minutes',updated_at=now() where id=op.id returning * into op;
 elsif p_action in ('checkpoint','finalize') and op.phase<>'applied' then
   if op.phase<>'running' or op.lease is distinct from (p_input->>'lease')::uuid or op.lease_until<=now() then raise exception 'Provider lease expired' using errcode='40001'; end if;
   if p_action='checkpoint' then
     checkpoint := p_input->'checkpoint';
     if (checkpoint->>'step')::integer is distinct from jsonb_array_length(op.checkpoints) or jsonb_array_length(op.checkpoints)>=op.step_count or
       jsonb_typeof(checkpoint->'result') is distinct from 'object' or coalesce(length(checkpoint->'result'->>'eventId'),0)=0 then raise exception 'Invalid provider checkpoint' using errcode='22023'; end if;
     update private.calendar_provider_series_operations set checkpoints=checkpoints||jsonb_build_array(checkpoint),lease_until=now()+interval '2 minutes',updated_at=now() where id=op.id returning * into op;
   else
     if jsonb_array_length(op.checkpoints)<>op.step_count then raise exception 'Provider steps incomplete' using errcode='40001'; end if;
     if op.native_input->'providerCreateFirst'='true'::jsonb then
       if op.step_count<>2 or op.checkpoints->0->>'kind' is distinct from 'create' or op.checkpoints->1->>'kind' is distinct from 'trim' then raise exception 'Invalid provider checkpoint roles' using errcode='22023'; end if;
       receipt := op.checkpoints->0->'result';
     else receipt := op.checkpoints->(op.step_count-1)->'result'; end if;
     native_result := private.calendar_series_operation(p_ws_id,op.native_action,op.native_input,p_actor_id);
     if op.native_action='create' then target := (native_result->>'id')::uuid;
     elsif native_result ? 'series' then target := (native_result->'series'->>'id')::uuid;
     else target := op.series_id; end if;
     if op.native_input->>'scope'='future' and op.step_count=2 then
       update private.calendar_provider_series_bindings set etag=op.checkpoints->(case when op.native_input->'providerCreateFirst'='true'::jsonb then 1 else 0 end)->'result'->>'etag',updated_at=now() where series_id=op.series_id;
     end if;
     if receipt->>'deleted' is distinct from 'true' then
       insert into private.calendar_provider_series_bindings(series_id,ws_id,connection_id,provider,calendar_id,master_id,etag)
       values(target,p_ws_id,conn.id,conn.provider,conn.calendar_id,case when op.native_input->>'scope'='this' then (select master_id from private.calendar_provider_series_bindings where series_id=op.series_id) else receipt->>'eventId' end,
       case when op.native_input->>'scope'='this' then (select etag from private.calendar_provider_series_bindings where series_id=op.series_id) else receipt->>'etag' end)
       on conflict(series_id) do update set etag=excluded.etag,updated_at=now();
     end if;
     if native_result ? 'previous' then
       native_result := native_result||jsonb_build_object('previous',(select private.calendar_series_json(s) from private.calendar_event_series s where s.id=(native_result->'previous'->>'id')::uuid));
       if native_result ? 'series' then native_result := native_result||jsonb_build_object('series',(select private.calendar_series_json(s) from private.calendar_event_series s where s.id=(native_result->'series'->>'id')::uuid)); end if;
     elsif native_result->>'deleted' is distinct from 'true' then
       native_result := (select private.calendar_series_json(s) from private.calendar_event_series s where s.id=target);
     end if;
     update private.calendar_provider_series_operations set phase='applied',result=native_result,lease=null,lease_until=null,updated_at=now() where id=op.id returning * into op;
   end if;
 elsif p_action not in ('read','reserve','claim','checkpoint','finalize') then raise exception 'Invalid operation action' using errcode='22023';
 end if;
 return to_jsonb(op);
end;
$$;
revoke all on function public.calendar_provider_series_operation(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.calendar_provider_series_operation(uuid,uuid,text,jsonb) to service_role;
