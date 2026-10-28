begin;
create function private.devbox_quota_guard_run()
returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare g private.devbox_personal_pool_grants; used_minutes numeric; active_count integer;
begin
 if tg_op='UPDATE' and (new.actor_id is distinct from old.actor_id
   or new.timeout_seconds is distinct from old.timeout_seconds
   or new.access_token_id is distinct from old.access_token_id
   or new.workload is distinct from old.workload or new.lease_id is distinct from old.lease_id) then
   raise exception 'Personal run allocation is immutable' using errcode='42501';
 end if;
 select * into g from private.devbox_personal_pool_grants where user_id=new.actor_id for update;
 if not found or new.workload in ('judge','playground') then return new; end if;
 if tg_op='UPDATE' then
  new.created_at:=old.created_at;
  new.started_at:=old.started_at;
  if old.status='queued' and new.status='running' then
   if not private.devbox_identity_grant_active(new.actor_id) then raise exception 'Inactive grant' using errcode='42501'; end if;
   new.started_at:=clock_timestamp();
  end if;
  if old.status not in ('queued','running','cancel_requested') and new.status in ('queued','running','cancel_requested') then
   raise exception 'Personal run cannot restart' using errcode='42501';
  end if;
  new.completed_at:=old.completed_at;
  if old.completed_at is not null then return new; end if;
  if old.status in ('queued','running','cancel_requested') and new.status not in ('queued','running','cancel_requested') then
   new.completed_at:=case when new.started_at is null then clock_timestamp()
    else least(clock_timestamp(),new.started_at+make_interval(secs=>new.timeout_seconds)) end;
  end if;
  return new;
 end if;
 if not private.devbox_identity_grant_active(new.actor_id) or exists(select 1 from private.devbox_quota_stops where user_id=new.actor_id) then
  raise exception 'Inactive or stopped grant' using errcode='42501'; end if;
 if g.last_collected_at is null or g.last_collected_at<clock_timestamp()-interval '10 minutes' then raise exception 'Host collector unavailable' using errcode='42501'; end if;
 new.timeout_seconds:=coalesce(new.timeout_seconds,g.default_run_seconds);
 if new.timeout_seconds<1 or new.timeout_seconds>g.max_run_seconds then
  perform private.devbox_quota_error('max_run_seconds',new.timeout_seconds,g.max_run_seconds,true); end if;
 select count(*) into active_count from private.devbox_runs where actor_id=new.actor_id and workload not in ('judge','playground') and status in ('queued','running','cancel_requested');
 if active_count>=private.devbox_quota_limit(new.actor_id,'max_concurrent_runs') then perform private.devbox_quota_error('concurrent_runs',active_count,private.devbox_quota_limit(new.actor_id,'max_concurrent_runs')); end if;
 select coalesce(sum(cpu_minutes),0) into used_minutes from private.devbox_usage_ledger
  where user_id=new.actor_id and usage_day=private.devbox_quota_day(clock_timestamp());
 used_minutes:=used_minutes+coalesce((select sum(reserved_minutes) from private.devbox_quota_reservations where user_id=new.actor_id and ended_at is null),0);
 if used_minutes+ceil(new.timeout_seconds*g.vcpus_per_box/60.0)>private.devbox_quota_limit(new.actor_id,'cpu_minutes_daily') then
  perform private.devbox_quota_error('cpu_minutes_daily',used_minutes,private.devbox_quota_limit(new.actor_id,'cpu_minutes_daily')); end if;
 if g.egress_blocked_until>clock_timestamp() then perform private.devbox_quota_error('egress_daily',g.egress_bytes_daily,g.egress_bytes_daily); end if;
 new.created_at:=clock_timestamp(); new.started_at:=null; new.completed_at:=null;
 if new.status<>'queued' then raise exception 'Personal runs must start queued' using errcode='42501'; end if;
 return new;
end $$;
create trigger devbox_quota_guard_run before insert or update on private.devbox_runs
 for each row execute function private.devbox_quota_guard_run();
create function private.devbox_quota_account_run()
returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare g private.devbox_personal_pool_grants; q private.devbox_quota_reservations; d date; lo timestamptz; hi timestamptz;
begin
 if tg_op='INSERT' then
  select * into g from private.devbox_personal_pool_grants where user_id=new.actor_id;
  if found and new.workload not in ('judge','playground') then
   insert into private.devbox_quota_reservations(run_id,user_id,allocated_vcpus,reserved_minutes,timeout_seconds,admitted_at)
    values(new.id,new.actor_id,g.vcpus_per_box,ceil(new.timeout_seconds*g.vcpus_per_box/60.0),new.timeout_seconds,new.created_at);
  end if;
  return new;
 end if;
 update private.devbox_quota_reservations set started_at=new.started_at,ended_at=new.completed_at where run_id=new.id returning * into q;
 if not found or q.ended_at is null or q.started_at is null then return new; end if;
 for d in select generate_series(private.devbox_quota_day(q.started_at)::timestamp,private.devbox_quota_day(q.ended_at)::timestamp,interval '1 day')::date loop
  lo:=greatest(q.started_at,d::timestamp at time zone 'Asia/Ho_Chi_Minh');
  hi:=least(q.ended_at,(d+1)::timestamp at time zone 'Asia/Ho_Chi_Minh');
  insert into private.devbox_usage_ledger(run_id,user_id,usage_day,cpu_minutes)
   values(new.id,new.actor_id,d,greatest(0,ceil(extract(epoch from hi-lo)*q.allocated_vcpus/60.0)))
   on conflict(run_id,usage_day) do nothing;
 end loop;
 return new;
end $$;
create trigger devbox_quota_account_run after insert or update on private.devbox_runs
 for each row execute function private.devbox_quota_account_run();
create function private.create_personal_devbox_run(p_actor_id uuid,p_token_id uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare lease_id uuid; run_id uuid:=gen_random_uuid(); g private.devbox_personal_pool_grants; existing private.devbox_runs;
begin
 select * into g from private.devbox_personal_pool_grants where user_id=p_actor_id for update;
 if not found or not private.devbox_identity_grant_active(p_actor_id) then raise exception 'Inactive grant' using errcode='42501'; end if;
 if p_input->>'idempotencyKey' is not null then
  select * into existing from private.devbox_runs where actor_id=p_actor_id and idempotency_key=p_input->>'idempotencyKey';
  if found then
   if to_jsonb(existing.command)<>p_input->'command' then raise exception 'Idempotency command mismatch'; end if;
   return jsonb_build_object('lease',jsonb_build_object('id',existing.lease_id,'status',(select status from private.devbox_leases where id=existing.lease_id)),'run',jsonb_build_object('id',existing.id,'status',existing.status,'command',existing.command,'exitCode',existing.exit_code));
  end if;
 end if;
 lease_id:=nullif(p_input->>'leaseId','')::uuid;
 if lease_id is null then
  lease_id:=gen_random_uuid();
  insert into private.devbox_leases(id,actor_id,access_token_id,runner_id,expires_at,keep)
   values(lease_id,p_actor_id,p_token_id,nullif(p_input->>'runnerId','')::uuid,clock_timestamp()+case when coalesce((p_input->>'keep')::boolean,false) then interval '1 hour' else interval '10 minutes' end,coalesce((p_input->>'keep')::boolean,false));
 elsif not exists(select 1 from private.devbox_leases where id=lease_id and actor_id=p_actor_id and status='active' and expires_at>clock_timestamp()) then
  raise exception 'Lease not found' using errcode='42501';
 end if;
 insert into private.devbox_runs(id,actor_id,access_token_id,lease_id,command,workload,timeout_seconds,env,env_files,preview_ports,idempotency_key)
 values(run_id,p_actor_id,p_token_id,lease_id,array(select jsonb_array_elements_text(p_input->'command')),
 coalesce(p_input->>'workload','run'),(p_input->>'timeoutSeconds')::integer,coalesce(p_input->'env','{}'),
 array(select jsonb_array_elements_text(p_input->'envFiles')),array(select jsonb_array_elements_text(p_input->'previewPorts')::integer),p_input->>'idempotencyKey');
 return jsonb_build_object('lease',jsonb_build_object('id',lease_id,'status','active'),'run',jsonb_build_object('id',run_id,'status','queued','command',p_input->'command','exitCode',null));
end $$;
do $$ declare f record; begin
 for f in select oid::regprocedure signature from pg_proc where pronamespace='private'::regnamespace and proname in ('devbox_quota_guard_run','devbox_quota_account_run','create_personal_devbox_run') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
commit;
