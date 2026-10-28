begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
insert into auth.users(id,email,email_confirmed_at) values
 ('00000000-0000-4000-8000-00000000e601','lifecycle@example.invalid',now()),
 ('00000000-0000-4000-8000-00000000e602','operator@example.invalid',now());
insert into public.users(id) values ('00000000-0000-4000-8000-00000000e601'),
 ('00000000-0000-4000-8000-00000000e602') on conflict do nothing;
insert into private.devbox_personal_pool_grants(user_id,bound_email,expires_at,created_at,granted_by,security_signoff_by,reason)
 values ('00000000-0000-4000-8000-00000000e601','lifecycle@example.invalid',now()+interval '1 day',now()-interval '1 day',
 '00000000-0000-4000-8000-00000000e602','00000000-0000-4000-8000-00000000e602','disposable lifecycle');
update private.devbox_control_settings set personal_pools_enabled=true;
select ok(private.accept_devbox_personal_grant('00000000-0000-4000-8000-00000000e601'),'accepted for lifecycle test');
insert into private.devbox_runners(id,actor_id,name) values
 ('00000000-0000-4000-8000-00000000e630','00000000-0000-4000-8000-00000000e601','lifecycle-personal');
insert into private.devbox_runner_tokens(runner_id,token_hash,expires_at) values
 ('00000000-0000-4000-8000-00000000e630',repeat('e',64),now()+interval '1 hour');
create temp table lifecycle_tokens(id uuid);
insert into lifecycle_tokens select private.issue_devbox_access_token('00000000-0000-4000-8000-00000000e601',now(),
 'lifecycle',repeat('6',64),'tdba_66666666',array['devbox:run'],now()+interval '1 hour');
insert into private.devbox_leases(id,actor_id,access_token_id,expires_at)
 select '00000000-0000-4000-8000-00000000e610','00000000-0000-4000-8000-00000000e601',id,now()+interval '1 hour' from lifecycle_tokens;
insert into private.devbox_runs(id,actor_id,lease_id,access_token_id,status,command,workload)
 select '00000000-0000-4000-8000-00000000e620','00000000-0000-4000-8000-00000000e601',
 '00000000-0000-4000-8000-00000000e610',id,'queued',array['true'],'run' from lifecycle_tokens;
select throws_ok($$insert into private.devbox_runs(actor_id,lease_id,status,command,workload)
 values ('00000000-0000-4000-8000-00000000e601','00000000-0000-4000-8000-00000000e610','queued',array['true'],'run')$$,
 '42501','Devbox access token required','personal trusted work still needs a token');
create function pg_temp.lifecycle_fail() returns trigger language plpgsql as $$
begin raise exception 'cascade failure'; end $$;
create trigger lifecycle_fail before update of status on private.devbox_runs for each row execute function pg_temp.lifecycle_fail();
select throws_ok($$update private.devbox_personal_pool_grants set status='suspended'
 where user_id='00000000-0000-4000-8000-00000000e601'$$,'P0001','cascade failure','direct suspension is atomic');
select is((select status from private.devbox_personal_pool_grants),'active','failed cascade rolls back status');
select ok((select revoked_at is null from private.devbox_access_tokens),'failed cascade rolls back token');
drop trigger lifecycle_fail on private.devbox_runs;
select lives_ok($$select private.revoke_devbox_personal_identity('00000000-0000-4000-8000-00000000e601',true,
 '00000000-0000-4000-8000-00000000e602')$$,'operator suspends via status trigger');
select is((select revoked_by from private.devbox_access_tokens),'00000000-0000-4000-8000-00000000e602'::uuid,'revocation records operator');
select is((select status from private.devbox_runs where id='00000000-0000-4000-8000-00000000e620'),'cancelled','suspension cancels queue');
select ok((select completed_at is not null from private.devbox_runs where id='00000000-0000-4000-8000-00000000e620'),'cancelled run has completion time');
select is((select status from private.devbox_leases where id='00000000-0000-4000-8000-00000000e610'),'released','suspension releases lease');
select ok((select revoked_at is not null from private.devbox_runner_tokens where runner_id='00000000-0000-4000-8000-00000000e630'),'suspension revokes runner credentials');
select ok(exists(select 1 from private.devbox_grant_events where old_status='active' and new_status='suspended'
 and acting_user_id='00000000-0000-4000-8000-00000000e602'),'audit records principal and transition');
select throws_ok($$update private.devbox_access_tokens set revoked_by='00000000-0000-4000-8000-00000000e601'$$,
 '42501','Devbox token identity is immutable','already-revoked principal cannot be rewritten');
-- Tokenless learner leases and workloads remain valid even for a suspended or past grantee.
select lives_ok($$insert into private.devbox_leases(id,actor_id,expires_at) values
 ('00000000-0000-4000-8000-00000000e611','00000000-0000-4000-8000-00000000e601',now()+interval '1 hour')$$,'learner lease allowed with inactive grant');
select lives_ok($$insert into private.devbox_runs(actor_id,lease_id,status,command,workload) values
 ('00000000-0000-4000-8000-00000000e601','00000000-0000-4000-8000-00000000e611','queued',array['true'],'playground')$$,'suspended grant does not block playground');
update private.devbox_personal_pool_grants set status='active',suspended=false;
insert into lifecycle_tokens select private.issue_devbox_access_token('00000000-0000-4000-8000-00000000e601',now(),
 'direct-revoke',repeat('8',64),'tdba_88888888',array['devbox:read'],now()+interval '1 hour');
update private.devbox_personal_pool_grants set status='revoked';
select ok(not exists(select 1 from private.devbox_access_tokens where revoked_at is null),'direct revoked status revokes every token');
insert into private.devbox_leases(id,actor_id,expires_at) values
 ('00000000-0000-4000-8000-00000000e612','00000000-0000-4000-8000-00000000e601',now()+interval '1 hour');
select lives_ok($$insert into private.devbox_runs(actor_id,lease_id,status,command,workload) values
 ('00000000-0000-4000-8000-00000000e601','00000000-0000-4000-8000-00000000e612','queued',array['true'],'judge')$$,'past grant does not block judge');
select ok((select revoked_at is not null from private.devbox_personal_pool_grants),'direct revoked transition stamps revocation');
-- Natural expiry is materialized in bounded, restart-safe batches by Cloudflare.
update private.devbox_personal_pool_grants set status='active',suspended=false,expires_at=now()+interval '1 hour';
create temp table expiry_tokens(id uuid);
insert into expiry_tokens select private.issue_devbox_access_token('00000000-0000-4000-8000-00000000e601',now(),
 'expiry',repeat('7',64),'tdba_77777777',array['devbox:run'],now()+interval '30 minutes');
update private.devbox_personal_pool_grants set expires_at=now()-interval '1 second';
select ok((select revoked_at is not null from private.devbox_access_tokens where id=(select id from expiry_tokens)),'expiry edit cascades immediately');
select is(private.expire_devbox_personal_grants(1),1,'sweep materializes one expired grant');
select is((select status from private.devbox_personal_pool_grants),'expired','sweep status is terminal');
select is(private.expire_devbox_personal_grants(1),0,'repeated sweep has zero work');
select ok(exists(select 1 from private.devbox_grant_events where old_status='active' and new_status='expired'),'expiry audited');
-- Membership insertion exercises the same suspended transition.
update private.devbox_personal_pool_grants set status='active',suspended=false,expires_at=now()+interval '1 hour';
insert into public.workspaces(id,name,creator_id) values ('00000000-0000-0000-0000-000000000000','lifecycle root','00000000-0000-4000-8000-00000000e602') on conflict do nothing;
insert into public.workspace_members(ws_id,user_id,type) values
 ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-00000000e601','MEMBER');
select is((select status from private.devbox_personal_pool_grants),'suspended','root membership suspends');
select ok(not private.devbox_identity_grant_active('00000000-0000-4000-8000-00000000e601'),'membership denies shared predicate');
-- More than one batch proves the actual scheduled database work bound.
create temp table expiry_batch as
 select gen_random_uuid() as id,'expiry-batch-'||n||'@example.invalid' as email from generate_series(1,27) n;
insert into auth.users(id,email,email_confirmed_at) select id,email,now() from expiry_batch;
insert into public.users(id) select id from expiry_batch on conflict do nothing;
insert into private.devbox_personal_pool_grants(user_id,bound_email,expires_at,created_at,granted_by,security_signoff_by,reason)
 select id,email,now()-interval '1 second',now()-interval '1 day',
 '00000000-0000-4000-8000-00000000e602','00000000-0000-4000-8000-00000000e602','bounded expiry fixture' from expiry_batch;
select is(private.expire_devbox_personal_grants(),25,'default schedule batch stops at 25 grants');
select is((select count(*) from private.devbox_personal_pool_grants g join expiry_batch b on b.id=g.user_id where status='pending'),2::bigint,'remaining grants wait for a later invocation');
select is(private.expire_devbox_personal_grants(),2,'restart resumes only remaining grants');
select is(private.expire_devbox_personal_grants(),0,'completed batches have zero replay work');
select * from finish();
rollback;
