begin;
create table private.devbox_quota_raise_requests (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references private.devbox_personal_pool_grants(user_id),
 limit_name text not null check(limit_name in ('cpu_minutes_daily','max_concurrent_boxes','max_concurrent_runs','egress_bytes_daily','memory_mib','disk_gib')),
 requested_max bigint not null check(requested_max>0),
 reason text not null check(length(reason) between 1 and 1000),
 expires_at timestamptz not null,
 status text not null default 'pending' check(status in ('pending','approved','denied')),
 decided_by uuid references public.users(id),
 decided_at timestamptz,
 created_at timestamptz not null default clock_timestamp(),
 check(expires_at>created_at and expires_at<=created_at+interval '7 days')
);
alter table private.devbox_quota_raise_requests enable row level security;
revoke all on private.devbox_quota_raise_requests from public,anon,authenticated;
create function private.devbox_quota_limit(p_user_id uuid,p_limit text)
returns numeric language sql stable security definer set search_path=pg_catalog,pg_temp as $$
 select greatest((to_jsonb(g)->>p_limit)::numeric,coalesce((select max(requested_max) from private.devbox_quota_raise_requests
 where user_id=p_user_id and limit_name=p_limit and status='approved' and expires_at>now()),0))
 from private.devbox_personal_pool_grants g where user_id=p_user_id;
$$;
create function private.request_devbox_quota_raise(p_user_id uuid,p_limit text,p_max bigint,p_reason text,p_expires_at timestamptz)
returns uuid language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare result uuid; ceiling bigint; g private.devbox_personal_pool_grants;
begin
 select * into g from private.devbox_personal_pool_grants where user_id=p_user_id for update;
 if not private.devbox_identity_grant_active(p_user_id) then raise exception 'Inactive grant' using errcode='42501'; end if;
 ceiling:=case p_limit when 'cpu_minutes_daily' then 1920 when 'max_concurrent_boxes' then 4 when 'max_concurrent_runs' then 4 when 'egress_bytes_daily' then 42949672960 when 'memory_mib' then 16384 when 'disk_gib' then 120 end;
 if ceiling is null or p_max>ceiling or p_max<=(to_jsonb(g)->>p_limit)::numeric or p_expires_at>g.expires_at then
  raise exception 'Raise exceeds safety ceiling' using errcode='22023'; end if;
 if (select count(*) from private.devbox_quota_raise_requests where user_id=p_user_id and status='pending' and expires_at>clock_timestamp())>=5 then
  perform private.devbox_quota_error('pending_raises',5,5); end if;
 insert into private.devbox_quota_raise_requests(user_id,limit_name,requested_max,reason,expires_at)
 values(p_user_id,p_limit,p_max,p_reason,p_expires_at) returning id into result;
 insert into private.devbox_grant_events(user_id,event_type,subject_id,acting_user_id) values(p_user_id,'quota_raise:requested',result,p_user_id);
 return result;
end $$;
create function private.decide_devbox_quota_raise(p_id uuid,p_admin_id uuid,p_approve boolean)
returns boolean language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare q private.devbox_quota_raise_requests;
begin
 -- The adapter must additionally enforce the root admin permission gate.
 if not private.devbox_identity_is_root_member(p_admin_id) then raise exception 'Root admin required' using errcode='42501'; end if;
 select * into q from private.devbox_quota_raise_requests where id=p_id;
 if not found then return false; end if;
 perform 1 from private.devbox_personal_pool_grants where user_id=q.user_id for update;
 update private.devbox_quota_raise_requests set status=case when p_approve then 'approved' else 'denied' end,
 decided_by=p_admin_id,decided_at=clock_timestamp() where id=p_id and status='pending' and expires_at>clock_timestamp();
 if not found then return false; end if;
 insert into private.devbox_grant_events(user_id,event_type,subject_id,acting_user_id)
 values(q.user_id,case when p_approve then 'quota_raise:approved' else 'quota_raise:denied' end,p_id,p_admin_id);
 return true;
end $$;
create function private.devbox_quota_guard_capacity()
returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare g private.devbox_personal_pool_grants; n integer;
begin
 select * into g from private.devbox_personal_pool_grants where user_id=new.actor_id for update;
 if not found or new.status='revoked' or private.devbox_identity_is_root_member(new.actor_id) then return new; end if;
 if not private.devbox_identity_grant_active(new.actor_id) then raise exception 'Inactive grant' using errcode='42501'; end if;
 select count(*) into n from private.devbox_runners where actor_id=new.actor_id and status<>'revoked' and id<>new.id;
 if n>=private.devbox_quota_limit(new.actor_id,'max_concurrent_boxes') then perform private.devbox_quota_error('concurrent_boxes',n,private.devbox_quota_limit(new.actor_id,'max_concurrent_boxes')); end if;
 return new;
end $$;
create trigger devbox_quota_guard_capacity before insert or update on private.devbox_runners for each row execute function private.devbox_quota_guard_capacity();
create function private.devbox_quota_guard_token()
returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare g private.devbox_personal_pool_grants; n integer;
begin
 if new.revoked_at is not null then return new; end if;
 select * into g from private.devbox_personal_pool_grants where user_id=new.user_id for update;
 select count(*) into n from private.devbox_access_tokens where user_id=new.user_id and id<>new.id and revoked_at is null and expires_at>clock_timestamp();
 if n>=g.max_access_tokens then perform private.devbox_quota_error('access_tokens',n,g.max_access_tokens); end if;
 return new;
end $$;
create trigger a_devbox_quota_guard_token before insert on private.devbox_access_tokens for each row execute function private.devbox_quota_guard_token();
create function private.devbox_quota_request_stop(p_user_id uuid,p_reason text)
returns void language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
 insert into private.devbox_quota_stops(user_id,reason) values(p_user_id,p_reason) on conflict(user_id) do nothing;
 if found then
  insert into private.devbox_grant_events(user_id,event_type) values(p_user_id,'quota_stop:'||p_reason);
  perform private.revoke_devbox_personal_identity(p_user_id,true);
 end if;
end $$;
create function private.reap_devbox_quota_runs(p_tick timestamptz,p_limit integer default 25)
returns integer language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare progress private.devbox_quota_reaper_progress; g record; r record; n integer:=0; cursor_id uuid;
begin
 select * into progress from private.devbox_quota_reaper_progress where id for update;
 if not found or not progress.enabled or not coalesce((select personal_pools_enabled from private.devbox_control_settings where id),false)
 or p_tick is null or p_tick>clock_timestamp()+interval '1 minute' or p_tick<clock_timestamp()-interval '5 minutes'
 or progress.last_tick>=date_trunc('minute',p_tick) then return 0; end if;
 -- Grant-first lock order matches admission, revocation and metering. Fixed batch.
 for g in select user_id from private.devbox_personal_pool_grants where status='active'
 and (progress.cursor_user_id is null or user_id>progress.cursor_user_id)
 order by user_id limit least(greatest(coalesce(p_limit,25),1),25) for update skip locked loop
  cursor_id:=g.user_id;
  for r in select id from private.devbox_runs where actor_id=g.user_id and workload in ('run','build') and status in ('running','cancel_requested')
   and started_at+make_interval(secs=>timeout_seconds)<=clock_timestamp() order by started_at,id limit 4 for update skip locked loop
   update private.devbox_runs set status='failed',completed_at=clock_timestamp(),updated_at=clock_timestamp() where id=r.id;
   n:=n+1;
   perform private.devbox_quota_request_stop(g.user_id,'max_runtime');
  end loop;
  if exists(select 1 from private.devbox_personal_pool_grants where user_id=g.user_id and expires_at<=clock_timestamp()) then
   update private.devbox_personal_pool_grants set status='expired' where user_id=g.user_id;
  elsif exists(select 1 from private.devbox_personal_pool_grants where user_id=g.user_id and (last_collected_at is null or last_collected_at<clock_timestamp()-interval '10 minutes')) then
   perform private.devbox_quota_request_stop(g.user_id,'collector_silent');
  end if;
 end loop;
 update private.devbox_quota_reaper_progress set last_tick=date_trunc('minute',p_tick),cursor_user_id=cursor_id,runs_reaped=runs_reaped+n where id;
 return n;
end $$;
create function private.authenticate_devbox_host_collector(p_hash text)
returns boolean language sql stable security definer set search_path=pg_catalog,pg_temp as $$
 select exists(select 1 from private.devbox_host_collectors where token_hash=p_hash and revoked_at is null and expires_at>now());
$$;
revoke all on function private.authenticate_devbox_host_collector(text) from public,anon,authenticated;
grant execute on function private.authenticate_devbox_host_collector(text) to service_role;
do $$ declare f record; begin
 for f in select oid::regprocedure signature from pg_proc where pronamespace='private'::regnamespace and proname in
 ('devbox_quota_guard_token','devbox_quota_limit','request_devbox_quota_raise','decide_devbox_quota_raise','devbox_quota_guard_capacity','devbox_quota_request_stop','reap_devbox_quota_runs') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
commit;
