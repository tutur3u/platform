-- Disposable database only: connections need committed fixtures.
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
insert into auth.users(id,email,email_confirmed_at) values
 ('00000000-0000-4000-8000-00000000f011','s2-race@example.invalid',now()),
 ('00000000-0000-4000-8000-00000000f012','s2-race-admin@example.invalid',now());
insert into public.users(id) values ('00000000-0000-4000-8000-00000000f011'),('00000000-0000-4000-8000-00000000f012') on conflict do nothing;
insert into private.devbox_personal_pool_grants(user_id,bound_email,expires_at,granted_by,security_signoff_by,reason,last_collected_at)
 values('00000000-0000-4000-8000-00000000f011','s2-race@example.invalid',now()+interval '1 day',
 '00000000-0000-4000-8000-00000000f012','00000000-0000-4000-8000-00000000f012','disposable race',now());
update private.devbox_control_settings set personal_pools_enabled=true;
select private.accept_devbox_personal_grant('00000000-0000-4000-8000-00000000f011');
select private.issue_devbox_access_token('00000000-0000-4000-8000-00000000f011',now(),'race',repeat('e',64),'tdba_eeeeeeee',array['devbox:run'],now()+interval '1 hour');
create function private.devbox_quota_test_admit() returns boolean language plpgsql as $$
begin
 perform private.create_personal_devbox_run('00000000-0000-4000-8000-00000000f011',
 (select id from private.devbox_access_tokens where user_id='00000000-0000-4000-8000-00000000f011'),jsonb_build_object('command',array['true'],'timeoutSeconds',60));
 return true;
exception when sqlstate 'P0001' then
 if sqlerrm<>'DEVBOX_LIMIT_REACHED' then raise; end if;
 return false;
end $$;
select private.devbox_quota_test_admit();
begin;
select no_plan();
-- PARALLEL ADMISSION
select is((select count(*) from private.devbox_runs where actor_id='00000000-0000-4000-8000-00000000f011'),2::bigint,'exactly two runs');
select is((select count(*) from private.devbox_leases where actor_id='00000000-0000-4000-8000-00000000f011'),2::bigint,'no loser lease leaks');
select * from finish();
rollback;
drop function private.devbox_quota_test_admit();
delete from private.devbox_runs where actor_id='00000000-0000-4000-8000-00000000f011';
delete from private.devbox_leases where actor_id='00000000-0000-4000-8000-00000000f011';
delete from private.devbox_personal_pool_grants where user_id='00000000-0000-4000-8000-00000000f011';
delete from auth.users where id in ('00000000-0000-4000-8000-00000000f011','00000000-0000-4000-8000-00000000f012');
update private.devbox_control_settings set personal_pools_enabled=false;
