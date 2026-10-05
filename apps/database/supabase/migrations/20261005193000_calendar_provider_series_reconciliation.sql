-- A complete provider snapshot publishes atomically with its native projection.
-- Pending outbound operations retain authority until their checkpointed commit.
alter table private.calendar_provider_series_bindings add column observation_hash text;
alter table private.calendar_provider_series_bindings add column metadata_journal jsonb;
alter table private.calendar_provider_series_bindings add constraint calendar_provider_series_metadata_encrypted check (
 metadata_journal is null or (metadata_journal->>'version'='1' and length(metadata_journal->>'ciphertext')>0) is true
);
create function public.calendar_provider_series_reconcile(p_ws_id uuid,p_actor_id uuid,p_connection_id uuid,p_action text,p_input jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.calendar_connections; b private.calendar_provider_series_bindings; s private.calendar_event_series; e jsonb; result_id uuid;
begin
 if auth.role() is distinct from 'service_role' or p_actor_id is null or
  not exists(select 1 from public.workspace_members where ws_id=p_ws_id and user_id=p_actor_id) or
  public.has_workspace_permission(p_ws_id,p_actor_id,'manage_calendar') is not true then
  raise exception 'Provider series reconciliation denied' using errcode='42501';
 end if;
 select * into c from public.calendar_connections where id=p_connection_id and ws_id=p_ws_id;
 if c.is_enabled is not true or c.sync_inbound_enabled is not true or c.provider not in ('google','microsoft') or
  not exists(select 1 from public.calendar_auth_tokens t where t.id=c.auth_token_id and t.ws_id=p_ws_id and t.user_id=p_actor_id and t.provider=c.provider and t.is_active) then
  raise exception 'Provider source reconciliation denied' using errcode='42501';
 end if;
 if p_action='bindings' then
  if (select count(*) from private.calendar_provider_series_bindings where ws_id=p_ws_id and connection_id=c.id)>1000 then raise exception 'Provider binding bound exceeded' using errcode='22023'; end if;
  return coalesce((select jsonb_agg(to_jsonb(x)||jsonb_build_object('series',(select private.calendar_series_json(cs) from private.calendar_event_series cs where cs.id=x.series_id and cs.ws_id=p_ws_id))) from private.calendar_provider_series_bindings x where x.ws_id=p_ws_id and x.connection_id=c.id),'[]'::jsonb);
 end if;
 if p_action not in ('snapshot','deleted') or coalesce(length(p_input->>'masterId'),0)=0 then raise exception 'Invalid provider observation' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_ws_id::text||c.id::text||(p_input->>'masterId'),0));
 select * into b from private.calendar_provider_series_bindings where ws_id=p_ws_id and connection_id=c.id and master_id=p_input->>'masterId' for update;
 if found then
  select * into s from private.calendar_event_series where id=b.series_id and ws_id=p_ws_id for update;
  if b.etag is distinct from p_input->>'expectedBindingETag' or exists(select 1 from private.calendar_provider_series_operations where ws_id=p_ws_id and series_id=s.id and phase<>'applied') then
   return jsonb_build_object('status','deferred');
  end if;
 elsif p_input->>'expectedBindingETag' is not null then return jsonb_build_object('status','deferred');
 end if;
 if p_action='deleted' then
  if s.id is null then return jsonb_build_object('status','absent'); end if;
  update private.calendar_event_series set deleted_at=now(),revision=revision+1,updated_at=now() where id=s.id and deleted_at is null;
  return jsonb_build_object('status','deleted','seriesId',s.id);
 end if;
 if private.calendar_series_valid(p_input->'rule',p_input->'anchor') is not true or
  jsonb_typeof(p_input->'payload') is distinct from 'object' or not(p_input->'payload' ? 'title') or
  jsonb_typeof(p_input->'exceptions') is distinct from 'array' or jsonb_array_length(p_input->'exceptions')>1000 or
  coalesce(length(p_input->>'etag'),0)=0 or coalesce(length(p_input->>'observationHash'),0)=0 or
  (p_input->'metadataJournal'->>'version'='1' and length(p_input->'metadataJournal'->>'ciphertext')>0) is not true then
  raise exception 'Incomplete provider observation' using errcode='22023';
 end if;
 if s.id is null then
  if c.workspace_calendar_id is not null and not exists(select 1 from private.workspace_calendars where id=c.workspace_calendar_id and ws_id=p_ws_id and is_enabled) then raise exception 'Workspace source calendar unavailable' using errcode='P0002'; end if;
  insert into private.calendar_event_series(ws_id,creator_id,workspace_calendar_id,rule,anchor,payload)
   values(p_ws_id,p_actor_id,c.workspace_calendar_id,p_input->'rule',p_input->'anchor',p_input->'payload') returning * into s;
 elsif b.observation_hash is distinct from p_input->>'observationHash' then
  update private.calendar_event_series set rule=p_input->'rule',anchor=p_input->'anchor',payload=p_input->'payload',revision=revision+1,updated_at=now(),deleted_at=null where id=s.id returning * into s;
 end if;
 if b.observation_hash is distinct from p_input->>'observationHash' then
  -- Caller merges previously known cancellations outside a complete view's
  -- coverage and validates every immutable original slot against this rule.
  delete from private.calendar_event_series_exceptions where series_id=s.id;
  for e in select value from jsonb_array_elements(p_input->'exceptions') loop
   if jsonb_typeof(e->'exception') is distinct from 'object' or e->>'originalStartLocal' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$' then raise exception 'Invalid provider exception' using errcode='22023'; end if;
   insert into private.calendar_event_series_exceptions(series_id,original_start_local,exception,payload)
    values(s.id,e->>'originalStartLocal',e->'exception',nullif(e->'payload','null'::jsonb));
  end loop;
 end if;
 insert into private.calendar_provider_series_bindings(series_id,ws_id,connection_id,provider,calendar_id,master_id,etag,observation_hash,metadata_journal)
  values(s.id,p_ws_id,c.id,c.provider,c.calendar_id,p_input->>'masterId',p_input->>'etag',p_input->>'observationHash',p_input->'metadataJournal')
  on conflict(series_id) do update set etag=excluded.etag,observation_hash=excluded.observation_hash,metadata_journal=excluded.metadata_journal,updated_at=now();
 -- Only explicit represented provider identities from the verified snapshot may
 -- be suppressed. Other source calendars and provider rows remain untouched.
 if jsonb_typeof(p_input->'representedInstanceIds') is distinct from 'array' or jsonb_array_length(p_input->'representedInstanceIds')>25000 then raise exception 'Invalid represented provider identity set' using errcode='22023'; end if;
 delete from public.workspace_calendar_events where ws_id=p_ws_id and provider::text=c.provider and external_calendar_id=c.calendar_id and
  (external_event_id in (select jsonb_array_elements_text(p_input->'representedInstanceIds')) or
   (c.provider='google' and scheduling_metadata->'google_recurrence'->>'recurring_event_id'=p_input->>'masterId'));
 return jsonb_build_object('status','applied','series',private.calendar_series_json(s));
end;
$$;
revoke all on function public.calendar_provider_series_reconcile(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.calendar_provider_series_reconcile(uuid,uuid,uuid,text,jsonb) to service_role;
