begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
select is((select personal_pools_enabled from private.devbox_control_settings),false,'default OFF');
select is((select count(*) from private.devbox_personal_pool_grants),0::bigint,'no grants seeded');
insert into auth.users(id,email,email_confirmed_at) values
 ('00000000-0000-4000-8000-00000000e501','predicate@example.invalid',now());
insert into public.users(id) values ('00000000-0000-4000-8000-00000000e501') on conflict do nothing;
select ok(not private.devbox_identity_grant_active('00000000-0000-4000-8000-00000000e501'),'missing grant denied');
-- Extra JSON fields are ignored by the prerequisite's minimal row type.
-- This keeps the same suite valid after S1 adds required enrollment metadata.
insert into private.devbox_personal_pool_grants
 select (jsonb_populate_record(null::private.devbox_personal_pool_grants,jsonb_build_object(
 'user_id','00000000-0000-4000-8000-00000000e501','status','pending',
 'expires_at',now()+interval '1 day','accepted_at',null,'suspended',false,
 'id',gen_random_uuid(),'bound_email','predicate@example.invalid',
 'sessions_not_before',now(),'reason','disposable predicate test',
 'granted_by','00000000-0000-4000-8000-00000000e501',
 'security_signoff_by','00000000-0000-4000-8000-00000000e501',
 'require_mfa',true,'max_access_tokens',5,'created_at',now()-interval '1 day','updated_at',now()
 ))).*;
update private.devbox_control_settings set personal_pools_enabled=true;
select ok(not private.devbox_identity_grant_active('00000000-0000-4000-8000-00000000e501'),'pending denied');
select to_regprocedure('private.accept_devbox_personal_grant(uuid)') is not null as lifecycle_installed \gset
\if :lifecycle_installed
select throws_ok($$update private.devbox_personal_pool_grants set status='active'$$,
 '23514',null,'S1 rejects active unaccepted grants');
\else
update private.devbox_personal_pool_grants set status='active';
select ok(not private.devbox_identity_grant_active('00000000-0000-4000-8000-00000000e501'),'unaccepted denied');
\endif
update private.devbox_personal_pool_grants set status='active',accepted_at=now()+interval '1 minute';
select ok(not private.devbox_identity_grant_active('00000000-0000-4000-8000-00000000e501'),'future acceptance denied');
update private.devbox_personal_pool_grants set accepted_at=now();
select ok(private.devbox_identity_grant_active('00000000-0000-4000-8000-00000000e501'),'accepted active grant allowed');
update private.devbox_control_settings set personal_pools_enabled=false;
select ok(not private.devbox_identity_grant_active('00000000-0000-4000-8000-00000000e501'),'global OFF overrides active');
update private.devbox_control_settings set personal_pools_enabled=true;
update private.devbox_personal_pool_grants set suspended=true;
select ok(not private.devbox_identity_grant_active('00000000-0000-4000-8000-00000000e501'),'suspended boolean denied');
update private.devbox_personal_pool_grants set suspended=false,status='suspended';
select ok(not private.devbox_identity_grant_active('00000000-0000-4000-8000-00000000e501'),'suspended status denied');
update private.devbox_personal_pool_grants set status='revoked';
select ok(not private.devbox_identity_grant_active('00000000-0000-4000-8000-00000000e501'),'revoked denied');
update private.devbox_personal_pool_grants set status='expired';
select ok(not private.devbox_identity_grant_active('00000000-0000-4000-8000-00000000e501'),'expired status denied');
update private.devbox_personal_pool_grants set status='active',suspended=false,expires_at=now();
select ok(not private.devbox_identity_grant_active('00000000-0000-4000-8000-00000000e501'),'expiry is exclusive');
update private.devbox_personal_pool_grants set expires_at=now()+interval '1 day';
insert into public.workspaces(id,name,creator_id) values ('00000000-0000-0000-0000-000000000000','predicate root','00000000-0000-4000-8000-00000000e501') on conflict do nothing;
insert into public.workspace_members(ws_id,user_id,type)
 values ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-00000000e501','MEMBER') on conflict do nothing;
select ok(not private.devbox_identity_grant_active('00000000-0000-4000-8000-00000000e501'),'root member excluded');
select ok(not has_function_privilege('anon','private.devbox_identity_grant_active(uuid)','EXECUTE'),'anon cannot execute');
select ok(not has_function_privilege('authenticated','private.devbox_identity_grant_active(uuid)','EXECUTE'),'authenticated cannot execute');
select ok(has_function_privilege('service_role','private.devbox_identity_grant_active(uuid)','EXECUTE'),'service role executes');
select ok(not has_table_privilege('authenticated','private.devbox_personal_pool_grants','SELECT'),'client cannot read grants');
select * from finish();
rollback;
