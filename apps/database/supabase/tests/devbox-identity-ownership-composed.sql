-- Rehearsal applies #7130's exact fetched migration locally, never on this branch.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
select exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='private' and p.proname='devbox_actor_has_active_personal_grant'
 and pg_get_functiondef(p.oid) like '%devbox_identity_grant_active%') as ownership_ready \gset
\if :ownership_ready
insert into auth.users(id,email,email_confirmed_at) values
 ('00000000-0000-4000-8000-00000000e701','composed@example.invalid',now()),
 ('00000000-0000-4000-8000-00000000e702','composed-root@example.invalid',now());
insert into public.users(id) values ('00000000-0000-4000-8000-00000000e701'),
 ('00000000-0000-4000-8000-00000000e702') on conflict do nothing;
insert into public.workspaces(id,name,creator_id) values
 ('00000000-0000-0000-0000-000000000000','composed root','00000000-0000-4000-8000-00000000e702') on conflict do nothing;
insert into public.workspace_members(ws_id,user_id,type) values
 ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-00000000e702','MEMBER') on conflict do nothing;
insert into private.devbox_personal_pool_grants(user_id,bound_email,expires_at,granted_by,security_signoff_by,reason)
 values ('00000000-0000-4000-8000-00000000e701','composed@example.invalid',now()+interval '1 day',
 '00000000-0000-4000-8000-00000000e702','00000000-0000-4000-8000-00000000e702','composed disposable test');
update private.devbox_control_settings set personal_pools_enabled=true;
update private.devbox_personal_pool_grants set last_collected_at=now();
select ok(private.accept_devbox_personal_grant('00000000-0000-4000-8000-00000000e701'),'composed grant accepted');
create temp table composed_token(id uuid);
insert into composed_token select private.issue_devbox_access_token('00000000-0000-4000-8000-00000000e701',now(),
 'composed',repeat('9',64),'tdba_99999999',array['devbox:run'],now()+interval '1 hour');
insert into private.devbox_runners(id,actor_id,name,pool,status,heartbeat_enabled,last_heartbeat_at,capabilities,enabled_features) values
 ('00000000-0000-4000-8000-00000000e710','00000000-0000-4000-8000-00000000e701','composed-personal','personal','online',true,now(),'{"executionMode":"trusted"}','{"run":true,"build":true}'),
 ('00000000-0000-4000-8000-00000000e711','00000000-0000-4000-8000-00000000e702','composed-fleet','fleet','online',true,now(),'{"executionMode":"trusted"}','{"run":true,"build":true}');
create function pg_temp.composed_claim(p_status text,p_enabled boolean,p_suspended boolean default false)
returns boolean language plpgsql as $$
declare l uuid:=gen_random_uuid(); r uuid:=gen_random_uuid(); claimed boolean;
begin
 begin
  insert into private.devbox_leases(id,actor_id,access_token_id,expires_at)
   select l,'00000000-0000-4000-8000-00000000e701',id,now()+interval '1 hour' from composed_token;
  insert into private.devbox_runs(id,actor_id,lease_id,access_token_id,command,workload)
   select r,'00000000-0000-4000-8000-00000000e701',l,id,array['true'],'run' from composed_token;
  update private.devbox_personal_pool_grants set status=p_status,suspended=p_suspended;
  update private.devbox_control_settings set personal_pools_enabled=p_enabled;
  claimed:=exists(select 1 from private.claim_next_devbox_run('00000000-0000-4000-8000-00000000e710') c where c.id=r);
  raise exception using errcode='P0004';
 exception when assert_failure then null; end;
 return claimed;
end;
$$;
select ok(pg_temp.composed_claim('active',true),'personal claims accepted active grant');
select ok(not pg_temp.composed_claim('pending',true),'pending grant cannot claim');
select ok(not pg_temp.composed_claim('suspended',true),'suspended status cannot claim');
select ok(not pg_temp.composed_claim('active',true,true),'suspended flag cannot claim');
select ok(not pg_temp.composed_claim('active',false),'switch OFF cannot claim');
select throws_ok($$insert into private.devbox_leases(actor_id,runner_id,expires_at) values
 ('00000000-0000-4000-8000-00000000e701','00000000-0000-4000-8000-00000000e711',now()+interval '1 hour')$$,
 '42501','Devbox runner is not available to this actor.','SR-334 refuses grantee pin to fleet runner');
insert into private.devbox_leases(id,actor_id,access_token_id,expires_at)
 select '00000000-0000-4000-8000-00000000e720','00000000-0000-4000-8000-00000000e701',id,now()+interval '1 hour' from composed_token;
insert into private.devbox_runs(id,actor_id,lease_id,access_token_id,command)
 select '00000000-0000-4000-8000-00000000e730','00000000-0000-4000-8000-00000000e701',
 '00000000-0000-4000-8000-00000000e720',id,array['true'] from composed_token;
-- An inactive non-root queue row must never break unrelated fleet claims.
update private.devbox_control_settings set personal_pools_enabled=false;
insert into private.devbox_leases(id,actor_id,expires_at) values
 ('00000000-0000-4000-8000-00000000e721','00000000-0000-4000-8000-00000000e702',now()+interval '1 hour');
insert into private.devbox_runs(id,actor_id,lease_id,command) values
 ('00000000-0000-4000-8000-00000000e731','00000000-0000-4000-8000-00000000e702','00000000-0000-4000-8000-00000000e721',array['true']);
select is((select id from private.claim_next_devbox_run('00000000-0000-4000-8000-00000000e711')),
 '00000000-0000-4000-8000-00000000e731'::uuid,'fleet claim survives non-root inactive grant in queue');
select is((select status from private.devbox_runs where id='00000000-0000-4000-8000-00000000e730'),'cancelled','claim backstop cancels inactive personal work');
update private.devbox_personal_pool_grants set status='revoked';
select ok((select revoked_at is not null from private.devbox_access_tokens where id=(select id from composed_token)),'composed revoke hook and S1 cascade revoke token');
select is((select status from private.devbox_leases where id='00000000-0000-4000-8000-00000000e720'),'released','composed revoke releases lease without actor_id error');
\else
select skip(1,'#7130 has not yet adopted the shared predicate; composed claim/revoke proof is pending');
\endif
select * from finish();
rollback;
