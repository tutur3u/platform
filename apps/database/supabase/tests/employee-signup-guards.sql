begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- Synthetic identities only; all writes roll back. Run after frozen root review.
insert into public.platform_email_roles(email, enabled, allow_role_management)
values ('employee-red@tuturuuu.com', true, true), ('ordinary-red@example.com', true, true), ('forged-red@example.com', true, true);
insert into public.users(id) values('00000000-0000-4000-8000-000000009900');
insert into private.employee_creation_intents(user_id,staff_email,managed_name,actor_id) values('00000000-0000-4000-8000-000000009901','employee-red@tuturuuu.com','Managed fixture','00000000-0000-4000-8000-000000009900');
insert into auth.users(id, email, email_confirmed_at, banned_until, raw_app_meta_data, raw_user_meta_data)
values ('00000000-0000-4000-8000-000000009901', 'employee-red@tuturuuu.com', null, null, '{}', '{"display_name":"Managed fixture","full_name":"Managed fixture"}');
-- Simulate GoTrue's post-INSERT metadata/confirmation/ban updates.
update auth.users set email_confirmed_at=now(),banned_until=now()+interval '100 years',raw_app_meta_data=raw_app_meta_data||'{"employee_onboarding":true}'::jsonb where id='00000000-0000-4000-8000-000000009901';
set constraints auth.check_employee_creation_commit immediate;
select ok(not (select enabled or allow_role_management from public.platform_user_roles where user_id='00000000-0000-4000-8000-000000009901'), 'trusted onboarding ignores preexisting reserved grants');
select ok(exists(select 1 from public.platform_email_roles where email='employee-red@tuturuuu.com'), 'onboarding does not consume a legitimate reservation');
select throws_ok($$insert into public.platform_email_roles(email,enabled,allow_role_management) values('employee-red@tuturuuu.com',true,true)$$, '23505', 'Employee email cannot inherit reserved grants', 'a raced reservation cannot redirect grants to the employee');
select ok(not (select enabled or allow_role_management from public.platform_user_roles where user_id='00000000-0000-4000-8000-000000009901'), 'redirect failure preserves the disabled grant');
insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) values
('00000000-0000-4000-8000-000000009902','ordinary-red@example.com','{}','{}'),
('00000000-0000-4000-8000-000000009903','forged-red@example.com','{}','{"employee_onboarding":true}');
select ok((select allow_role_management from public.platform_user_roles where user_id='00000000-0000-4000-8000-000000009902'), 'ordinary signup still inherits its reserved grants');
select ok((select allow_role_management from public.platform_user_roles where user_id='00000000-0000-4000-8000-000000009903'), 'user_metadata cannot select trusted onboarding semantics');
select ok(not exists(select 1 from private.infrastructure_employees where user_id='00000000-0000-4000-8000-000000009903'), 'forged metadata cannot enter employee registry');
select ok(not has_table_privilege('authenticated','private.infrastructure_employees','SELECT'), 'self cannot read private recovery contact');
select ok(not has_table_privilege('anon','private.infrastructure_employees','SELECT'), 'public cannot read registry');
select ok(not has_function_privilege('authenticated','private.finalize_employee_creation(uuid,uuid,text,text)','EXECUTE'), 'self cannot forge finalization actor');
select ok(not has_function_privilege('authenticated','private.confirm_employee_activation(uuid,uuid,text)','EXECUTE'), 'self cannot confirm lifecycle');
select ok((select recovery_email is null and recovery_verified_at is null and management_role_label is null from private.infrastructure_employees where user_id='00000000-0000-4000-8000-000000009901'), 'recovery has no admission and role label grants nothing');
select throws_ok($$update public.users set display_name='Self rename' where id='00000000-0000-4000-8000-000000009901'$$, '42501', 'Employee name is administrator managed', 'service-role public profile writers cannot rename an employee');
select throws_ok($$update public.user_private_details set full_name='Self rename' where user_id='00000000-0000-4000-8000-000000009901'$$, '42501', 'Employee name is administrator managed', 'direct private-details writers cannot rename an employee');
select lives_ok($$update public.users set display_name=display_name where id='00000000-0000-4000-8000-000000009901'$$, 'unchanged managed name permits unrelated profile edits');
select lives_ok($$update public.users set display_name='Ordinary rename' where id='00000000-0000-4000-8000-000000009902'$$, 'ordinary profile names remain editable');
select throws_ok($$select public.update_public_user_profile('00000000-0000-4000-8000-000000009901','{"display_name":"RPC self rename"}')$$, '42501', 'Employee name is administrator managed', 'real service-role self-profile RPC cannot rename employee');
select throws_ok($$select public.update_public_user_profile_with_banner_lifecycle('00000000-0000-4000-8000-000000009901','{"display_name":"Banner self rename"}','https://storage.fixture.test')$$, '42501', 'Employee name is administrator managed', 'real banner lifecycle RPC cannot bypass managed name');
select lives_ok($$select public.update_public_user_profile('00000000-0000-4000-8000-000000009901','{"bio":"Unrelated fixture biography"}')$$, 'managed employee can update biography');
select ok(not has_table_privilege('service_role','private.employee_creation_intents','INSERT'), 'service callers cannot forge an intent without fresh actor preflight');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000009901',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000009901","role":"authenticated"}',true);
set local role authenticated;
select throws_ok($$update public.user_private_details set full_name='Direct authenticated rename' where user_id='00000000-0000-4000-8000-000000009901'$$,'42501',null,'real authenticated private-details update cannot rename employee');
reset role;
select throws_ok($$insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) values('00000000-0000-4000-8000-000000009904','unbound-fixture@tuturuuu.com','{"employee_onboarding":true}','{"full_name":"Unbound fixture"}')$$,'23514','Employee creation intent is missing','trusted marker alone cannot bypass authorized intent');
insert into private.employee_creation_intents(user_id,staff_email,managed_name,actor_id) values('00000000-0000-4000-8000-000000009905','unbanned-fixture@tuturuuu.com','Unbanned fixture','00000000-0000-4000-8000-000000009900');
select throws_ok($$insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values('00000000-0000-4000-8000-000000009905','unbanned-fixture@tuturuuu.com',now(),'{}','{}')$$,'23514','Employee creation must remain confirmed and pending','final provider transaction cannot commit an unbanned pending employee');
select ok(not exists(select 1 from auth.users where id='00000000-0000-4000-8000-000000009905'),'failed provider commit rolls back identity');
select ok(not exists(select 1 from private.infrastructure_employees where user_id='00000000-0000-4000-8000-000000009905'),'failed provider commit rolls back employee registry');
select * from finish();
rollback;
