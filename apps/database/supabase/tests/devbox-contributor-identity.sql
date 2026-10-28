begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
select is((select personal_pools_enabled from private.devbox_control_settings), false, 'default OFF');
select is((select count(*) from private.devbox_personal_pool_grants), 0::bigint, 'no grants seeded');
insert into auth.users(id,email,email_confirmed_at) values
 ('00000000-0000-4000-8000-00000000e001','devbox-s1-a@example.invalid', now()),
 ('00000000-0000-4000-8000-00000000e002','devbox-s1-b@example.invalid', now());
insert into public.users(id) values ('00000000-0000-4000-8000-00000000e001'),
 ('00000000-0000-4000-8000-00000000e002') on conflict do nothing;
insert into private.devbox_personal_pool_grants(user_id,bound_email,expires_at,granted_by,security_signoff_by,reason)
 values ('00000000-0000-4000-8000-00000000e001','devbox-s1-a@example.invalid',now()+interval '10 days',
 '00000000-0000-4000-8000-00000000e002','00000000-0000-4000-8000-00000000e002','disposable test');
select is((select status from private.devbox_personal_pool_grants), 'pending', 'grant starts pending');
select ok(private.accept_devbox_personal_grant('00000000-0000-4000-8000-00000000e001'), 'bound subject accepts');
select ok(not private.accept_devbox_personal_grant('00000000-0000-4000-8000-00000000e002'), 'another user cannot accept');
select ok(not private.devbox_identity_grant_active('00000000-0000-4000-8000-00000000e001'), 'OFF switch overrides active grant');
select throws_ok($$select private.issue_devbox_access_token('00000000-0000-4000-8000-00000000e001',now(),
 'a',repeat('a',64),'tdba_aaaaaaaa',array['devbox:run'],now()+interval '7 days')$$,
 '42501', 'Active matching devbox grant required', 'no token while disabled');
update private.devbox_control_settings set personal_pools_enabled = true;
select throws_ok($$select private.issue_devbox_access_token('00000000-0000-4000-8000-00000000e001',now()-interval '1 second',
 'a',repeat('a',64),'tdba_aaaaaaaa',array['devbox:run'],now()+interval '7 days')$$,
 '42501', 'Devbox session reauthentication required', 'pre-accept session cannot mint');
select throws_ok($$select private.issue_devbox_access_token('00000000-0000-4000-8000-00000000e001',now()-interval '1 second',
 'web-proof',repeat('c',64),'tdba_cccccccc',array['devbox:read'],now()+interval '1 day',false)$$,
 '42501','Devbox session reauthentication required','web mint enforces the same authentication cutoff');
delete from private.devbox_access_tokens where label='web-proof';
create temp table s1_tokens(id uuid);
insert into s1_tokens select private.issue_devbox_access_token('00000000-0000-4000-8000-00000000e001',now(),
 'agent-a',repeat('a',64),'tdba_aaaaaaaa',array['devbox:run','devbox:read'],now()+interval '20 days');
select is((select expires_at from private.devbox_access_tokens),
 (select expires_at from private.devbox_personal_pool_grants), 'token capped at grant expiry');
select ok(private.resolve_devbox_identity(null,repeat('a',64))->'token' is not null, 'hash resolves live token');
update private.devbox_personal_pool_grants set max_access_tokens=1;
select throws_ok($$select private.issue_devbox_access_token('00000000-0000-4000-8000-00000000e001',now(),
 'agent-b',repeat('b',64),'tdba_bbbbbbbb',array['devbox:run'],now()+interval '1 day')$$,
 '42501','Devbox token limit reached','grant-locked issuance enforces active token cap');
update private.devbox_personal_pool_grants set max_access_tokens=5;

select ok(not (private.list_devbox_access_tokens('00000000-0000-4000-8000-00000000e001')->0 ? 'token_hash'), 'list never exposes hash');
select is(jsonb_array_length(private.list_devbox_access_tokens('00000000-0000-4000-8000-00000000e002')),0,'list is subject scoped');
select throws_ok($$update private.devbox_access_tokens set scopes=array['devbox:build']$$,
 '42501','Devbox token identity is immutable','UPDATE cannot widen/change scope');
select throws_ok($$update private.devbox_personal_pool_grants set user_id='00000000-0000-4000-8000-00000000e002'$$,
 '42501','Devbox grant identity is immutable','UPDATE cannot transfer bound user');
select throws_ok($$insert into private.devbox_access_tokens(user_id,grant_id,label,token_prefix,token_hash,scopes,expires_at)
 select user_id,id,'illegal','tdba_bbbbbbbb',repeat('b',64),array['devbox:serve'],now()+interval '1 day'
 from private.devbox_personal_pool_grants$$, '23514', null, 'serve scope rejected');
insert into private.devbox_leases(id,actor_id,access_token_id,expires_at)
 select '00000000-0000-4000-8000-00000000e100','00000000-0000-4000-8000-00000000e001',id,now()+interval '1 hour' from s1_tokens;
insert into private.devbox_runs(id,actor_id,lease_id,access_token_id,status,command,workload)
 select '00000000-0000-4000-8000-00000000e200','00000000-0000-4000-8000-00000000e001',
 '00000000-0000-4000-8000-00000000e100',id,'queued',array['true'],'run' from s1_tokens;
insert into private.devbox_runs(id,actor_id,lease_id,access_token_id,status,command,workload)
 select '00000000-0000-4000-8000-00000000e201','00000000-0000-4000-8000-00000000e001',
 '00000000-0000-4000-8000-00000000e100',id,'running',array['true'],'run' from s1_tokens;
select throws_ok($$update private.devbox_runs set workload='serve' where status='queued'$$,
 '42501','Devbox token scope denied','UPDATE workload rechecks scope');
select throws_ok($$update private.devbox_runs set actor_id='00000000-0000-4000-8000-00000000e002' where status='queued'$$,
 '42501','Active devbox token required','UPDATE actor rechecks token binding');
-- A separate actor/run remains untouched by token revocation.
insert into private.devbox_leases(id,actor_id,expires_at) values
 ('00000000-0000-4000-8000-00000000e101','00000000-0000-4000-8000-00000000e002',now()+interval '1 hour');
insert into private.devbox_runs(id,actor_id,lease_id,status,command) values
 ('00000000-0000-4000-8000-00000000e202','00000000-0000-4000-8000-00000000e002',
 '00000000-0000-4000-8000-00000000e101','queued',array['true']);
select ok(not private.revoke_devbox_access_token((select id from s1_tokens),'00000000-0000-4000-8000-00000000e002'), 'foreign token revocation returns false');
create function pg_temp.devbox_test_cancel_failure() returns trigger language plpgsql as $$
begin raise exception 'forced cancellation failure'; end $$;
create trigger devbox_test_cancel_failure before update of status on private.devbox_runs
    for each row execute function pg_temp.devbox_test_cancel_failure();
select throws_ok($$select private.revoke_devbox_access_token((select id from s1_tokens),'00000000-0000-4000-8000-00000000e001')$$,
 'P0001','forced cancellation failure','cancellation failure aborts revocation transaction');
select ok((select revoked_at is null from private.devbox_access_tokens),'failed cancellation leaves token unrevoked');
drop trigger devbox_test_cancel_failure on private.devbox_runs;
select ok(private.revoke_devbox_access_token((select id from s1_tokens),'00000000-0000-4000-8000-00000000e001'), 'own token revoked');
select is((select status from private.devbox_runs where id='00000000-0000-4000-8000-00000000e200'),'cancelled','revoke cancels queued in transaction');
select is((select status from private.devbox_runs where id='00000000-0000-4000-8000-00000000e201'),'cancel_requested','revoke requests running cancellation');
select is((select status from private.devbox_runs where id='00000000-0000-4000-8000-00000000e202'),'queued','other actor unaffected');
select is((select status from private.devbox_leases where id='00000000-0000-4000-8000-00000000e100'),'released','revoke releases token lease');
select ok(private.resolve_devbox_identity(null,repeat('a',64)) is null,'revoked token stops resolving');
select throws_ok($$update private.devbox_access_tokens set revoked_at=null$$,
 '42501','Devbox token identity is immutable','UPDATE cannot un-revoke');
update private.devbox_personal_pool_grants set sessions_not_before=now()+interval '1 minute';
select throws_ok($$select private.issue_devbox_access_token('00000000-0000-4000-8000-00000000e001',now(),
 'b',repeat('b',64),'tdba_bbbbbbbb',array['devbox:run'],now()+interval '7 days')$$,
 '42501','Devbox session reauthentication required','cutoff invalidates later mint');
select ok((select count(*) > 0 from private.devbox_grant_events),'audit is trigger written');
select ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='private' and p.proname like '%devbox%'
 and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE'))),
 'no anon/authenticated execute on any private devbox function');
select ok(not has_table_privilege('authenticated','private.devbox_access_tokens','SELECT'),'tokens not browser-readable');
delete from private.devbox_control_settings;
select ok(not private.devbox_identity_grant_active('00000000-0000-4000-8000-00000000e001'),'missing singleton fails closed');
select * from finish();
rollback;
