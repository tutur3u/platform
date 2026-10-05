-- Unsupported provider rules remain authoritative and encrypted; never replace
-- them with an approximate native rule. Explicit aliases fence legacy edits.
alter table private.calendar_provider_series_bindings
 add column projection_state text not null default 'canonical' check(projection_state in ('canonical','unsupported'));
create table private.calendar_provider_readonly_series (
 ws_id uuid not null references public.workspaces(id) on delete cascade,
 connection_id uuid not null references public.calendar_connections(id) on delete cascade,
 provider text not null check(provider in ('google','microsoft')),
 calendar_id text not null,
 master_id text not null check(length(master_id) between 1 and 4096),
 series_id uuid references private.calendar_event_series(id) on delete cascade,
 etag text not null check(length(etag) between 1 and 8192),
 observation_hash text not null,
 metadata_journal jsonb not null check((metadata_journal->>'version'='1' and length(metadata_journal->>'ciphertext')>0) is true),
 instance_aliases jsonb not null default '[]' check(jsonb_typeof(instance_aliases)='array' and jsonb_array_length(instance_aliases)<=25000),
 updated_at timestamptz not null default now(),
 primary key(ws_id,connection_id,master_id)
);
alter table private.calendar_provider_readonly_series enable row level security;
revoke all on private.calendar_provider_readonly_series from public,anon,authenticated,service_role;
-- Preserve the existing validated canonical publication implementation behind
-- one service-only dispatch boundary. Its advisory lock is shared with below.
alter function public.calendar_provider_series_reconcile(uuid,uuid,uuid,text,jsonb) set schema private;
alter function private.calendar_provider_series_reconcile(uuid,uuid,uuid,text,jsonb) rename to calendar_provider_series_reconcile_canonical;
revoke all on function private.calendar_provider_series_reconcile_canonical(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
create function public.calendar_provider_series_reconcile(p_ws_id uuid,p_actor_id uuid,p_connection_id uuid,p_action text,p_input jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.calendar_connections; b private.calendar_provider_series_bindings; old private.calendar_provider_readonly_series; result jsonb; aliases jsonb;
begin
 if p_action not in ('unsupported','readonly-bindings') then
  if p_action in ('snapshot','deleted') then
   perform pg_advisory_xact_lock(hashtextextended(p_ws_id::text||p_connection_id::text||(p_input->>'masterId'),0));
   select * into b from private.calendar_provider_series_bindings where ws_id=p_ws_id and connection_id=p_connection_id and master_id=p_input->>'masterId' for update;
   select * into old from private.calendar_provider_readonly_series where ws_id=p_ws_id and connection_id=p_connection_id and master_id=p_input->>'masterId' for update;
   if p_input ? 'expectedBindingObservationHash' and coalesce(b.observation_hash,old.observation_hash) is distinct from p_input->>'expectedBindingObservationHash' then return jsonb_build_object('status','deferred'); end if;
   if old.master_id is not null and old.etag is distinct from p_input->>'expectedBindingETag' then return jsonb_build_object('status','deferred'); end if;
   if old.master_id is not null and old.series_id is null then p_input:=p_input||jsonb_build_object('expectedBindingETag',null); end if;
  end if;
  result:=private.calendar_provider_series_reconcile_canonical(p_ws_id,p_actor_id,p_connection_id,p_action,p_input);
  if p_action='deleted' and old.master_id is not null and result->>'status' in ('deleted','absent') then
   delete from public.workspace_calendar_events e where e.ws_id=p_ws_id and e.provider::text=old.provider and e.external_calendar_id=old.calendar_id and
    (old.instance_aliases ? e.external_event_id or (old.provider='google' and e.scheduling_metadata->'google_recurrence'->>'recurring_event_id'=old.master_id));
   delete from private.calendar_provider_readonly_series where ws_id=p_ws_id and connection_id=p_connection_id and master_id=old.master_id;
   return jsonb_build_object('status','deleted');
  end if;
  if p_action='snapshot' and result->>'status'='applied' then
   delete from private.calendar_provider_readonly_series where ws_id=p_ws_id and connection_id=p_connection_id and master_id=p_input->>'masterId';
   update private.calendar_provider_series_bindings set projection_state='canonical' where ws_id=p_ws_id and connection_id=p_connection_id and master_id=p_input->>'masterId';
  end if;
  return result;
 end if;
 if auth.role() is distinct from 'service_role' or p_actor_id is null or
  not exists(select 1 from public.workspace_members where ws_id=p_ws_id and user_id=p_actor_id) or
  public.has_workspace_permission(p_ws_id,p_actor_id,'manage_calendar') is not true then
  raise exception 'Provider readonly reconciliation denied' using errcode='42501';
 end if;
 select * into c from public.calendar_connections where id=p_connection_id and ws_id=p_ws_id;
 if c.is_enabled is not true or c.sync_inbound_enabled is not true or c.provider not in ('google','microsoft') or
  not exists(select 1 from public.calendar_auth_tokens t where t.id=c.auth_token_id and t.ws_id=p_ws_id and t.user_id=p_actor_id and t.provider=c.provider and t.is_active) then
  raise exception 'Provider source reconciliation denied' using errcode='42501';
 end if;
 if p_action='readonly-bindings' then
  if (select count(*) from private.calendar_provider_readonly_series where ws_id=p_ws_id and connection_id=c.id)>1000 then raise exception 'Provider readonly binding bound exceeded' using errcode='22023'; end if;
  return coalesce((select jsonb_agg(to_jsonb(x)) from private.calendar_provider_readonly_series x where x.ws_id=p_ws_id and x.connection_id=c.id),'[]'::jsonb);
 end if;
 if coalesce(length(p_input->>'masterId'),0) not between 1 and 4096 or coalesce(length(p_input->>'etag'),0) not between 1 and 8192 or
  coalesce(length(p_input->>'observationHash'),0)=0 or (p_input->'metadataJournal'->>'version'='1' and length(p_input->'metadataJournal'->>'ciphertext')>0) is not true or
  jsonb_typeof(p_input->'representedInstanceIds') is distinct from 'array' or jsonb_array_length(p_input->'representedInstanceIds')>25000 or
  exists(select 1 from jsonb_array_elements(p_input->'representedInstanceIds') id where jsonb_typeof(id)<>'string' or length(id#>>'{}') not between 1 and 4096) then
  raise exception 'Incomplete unsupported provider observation' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_ws_id::text||c.id::text||(p_input->>'masterId'),0));
 select * into b from private.calendar_provider_series_bindings where ws_id=p_ws_id and connection_id=c.id and master_id=p_input->>'masterId' for update;
 select * into old from private.calendar_provider_readonly_series where ws_id=p_ws_id and connection_id=c.id and master_id=p_input->>'masterId' for update;
 -- Reserve locks the native series before inserting its operation; wait for it
 -- before deciding whether this observation owns publication authority.
 perform 1 from private.calendar_event_series where id=b.series_id and ws_id=p_ws_id for update;
 if coalesce(b.etag,old.etag) is distinct from p_input->>'expectedBindingETag' or
  (p_input ? 'expectedBindingObservationHash' and coalesce(b.observation_hash,old.observation_hash) is distinct from p_input->>'expectedBindingObservationHash') or
  exists(select 1 from private.calendar_provider_series_operations where ws_id=p_ws_id and series_id=b.series_id and phase<>'applied') then
  return jsonb_build_object('status','deferred');
 end if;
 select coalesce(jsonb_agg(distinct id),'[]') into aliases from jsonb_array_elements(coalesce(old.instance_aliases,'[]')||(p_input->'representedInstanceIds')) id;
 if jsonb_array_length(aliases)>25000 then raise exception 'Provider readonly alias bound exceeded' using errcode='22023'; end if;
 -- Serialize with legacy operation admission, which locks its cached event first.
 perform 1 from public.workspace_calendar_events e where e.ws_id=p_ws_id and e.provider::text=c.provider and e.external_calendar_id=c.calendar_id and
  (aliases ? e.external_event_id or (c.provider='google' and e.scheduling_metadata->'google_recurrence'->>'recurring_event_id'=p_input->>'masterId')) order by e.id for update;
 if exists(select 1 from private.calendar_google_color_operations op join public.workspace_calendar_events e on e.id=op.event_id and e.ws_id=op.ws_id where e.ws_id=p_ws_id and e.provider::text=c.provider and e.external_calendar_id=c.calendar_id and
  (aliases ? e.external_event_id or (c.provider='google' and e.scheduling_metadata->'google_recurrence'->>'recurring_event_id'=p_input->>'masterId')) and op.phase in ('reserved','prepared','dispatched')) then return jsonb_build_object('status','deferred'); end if;
 insert into private.calendar_provider_readonly_series(ws_id,connection_id,provider,calendar_id,master_id,series_id,etag,observation_hash,metadata_journal,instance_aliases)
 values(p_ws_id,c.id,c.provider,c.calendar_id,p_input->>'masterId',b.series_id,p_input->>'etag',p_input->>'observationHash',p_input->'metadataJournal',aliases)
 on conflict(ws_id,connection_id,master_id) do update set etag=excluded.etag,observation_hash=excluded.observation_hash,metadata_journal=excluded.metadata_journal,instance_aliases=excluded.instance_aliases,updated_at=now();
 if b.series_id is not null then
  update private.calendar_event_series set deleted_at=now(),revision=revision+1,updated_at=now() where id=b.series_id and ws_id=p_ws_id and deleted_at is null;
  update private.calendar_provider_series_bindings set projection_state='unsupported',etag=p_input->>'etag',observation_hash='unsupported:'||(p_input->>'observationHash'),metadata_journal=p_input->'metadataJournal',updated_at=now() where series_id=b.series_id and ws_id=p_ws_id;
 end if;
 update public.workspace_calendar_events set scheduling_metadata=coalesce(scheduling_metadata,'{}')||jsonb_build_object('provider_recurrence',jsonb_build_object('state','unsupported','master_id',p_input->>'masterId','provider',c.provider)),locked=true
 where ws_id=p_ws_id and provider::text=c.provider and external_calendar_id=c.calendar_id and
 (external_event_id in(select jsonb_array_elements_text(aliases)) or (c.provider='google' and scheduling_metadata->'google_recurrence'->>'recurring_event_id'=p_input->>'masterId'));
 return jsonb_build_object('status','applied');
end;
$$;
revoke all on function public.calendar_provider_series_reconcile(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.calendar_provider_series_reconcile(uuid,uuid,uuid,text,jsonb) to service_role;
-- An independent current-state guard protects cached legacy events even if a
-- delayed projection overwrites their UI metadata. It grants no mutation access.
create function public.calendar_provider_series_is_readonly(p_ws_id uuid,p_actor_id uuid,p_event_id uuid default null,p_series_id uuid default null)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' or p_actor_id is null or
  not exists(select 1 from public.workspace_members where ws_id=p_ws_id and user_id=p_actor_id) or
  public.has_workspace_permission(p_ws_id,p_actor_id,'manage_calendar') is not true then raise exception 'Provider readonly lookup denied' using errcode='42501'; end if;
 return exists(select 1 from private.calendar_provider_readonly_series r where r.ws_id=p_ws_id and
  (r.series_id=p_series_id or exists(select 1 from public.workspace_calendar_events e where e.ws_id=p_ws_id and e.id=p_event_id and e.provider::text=r.provider and e.external_calendar_id=r.calendar_id and
   (r.instance_aliases ? e.external_event_id or (r.provider='google' and e.scheduling_metadata->'google_recurrence'->>'recurring_event_id'=r.master_id)))));
end;
$$;
revoke all on function public.calendar_provider_series_is_readonly(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.calendar_provider_series_is_readonly(uuid,uuid,uuid,uuid) to service_role;

-- A preflight alone cannot fence a delayed admission after readonly publication.
create function private.calendar_provider_readonly_admission() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.phase in ('reserved','prepared','dispatched') and exists(
  select 1 from private.calendar_provider_readonly_series r join public.workspace_calendar_events e on e.ws_id=r.ws_id and e.provider::text=r.provider and e.external_calendar_id=r.calendar_id
  where e.ws_id=new.ws_id and e.id=new.event_id and (r.instance_aliases ? e.external_event_id or (r.provider='google' and e.scheduling_metadata->'google_recurrence'->>'recurring_event_id'=r.master_id))) then
  raise exception 'Unsupported provider recurrence is read only' using errcode='42501';
 end if;
 return new;
end;
$$;
revoke all on function private.calendar_provider_readonly_admission() from public,anon,authenticated,service_role;
create trigger calendar_provider_readonly_admission before insert or update on private.calendar_google_color_operations for each row execute function private.calendar_provider_readonly_admission();
