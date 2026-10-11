-- Auth ordering fixture only, UNEXECUTED until root admits an owned DB gate.
-- Product code never writes provider confirmation, password or ban columns.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into public.users(id) values ('00000000-0000-4000-8000-000000992000');
insert into private.employee_creation_intents(user_id,staff_email,managed_name,actor_id) values
('00000000-0000-4000-8000-000000992001','tuple-contract@tuturuuu.com','Tuple fixture','00000000-0000-4000-8000-000000992000'),
('00000000-0000-4000-8000-000000992002','pending-contract@tuturuuu.com','Pending fixture','00000000-0000-4000-8000-000000992000');
create temporary table original_intents as select user_id,to_jsonb(i) as image from private.employee_creation_intents i;
create temporary table rejected_creates(id uuid,email text,early_marker boolean,expected text,label text);
insert into rejected_creates values
('00000000-0000-4000-8000-000000992011','tuple-contract@tuturuuu.com',false,'Employee creation intent does not match identity','wrong UUID with exact reserved email'),
('00000000-0000-4000-8000-000000992001','wrong-email-contract@tuturuuu.com',false,'Employee creation intent does not match identity','exact UUID with wrong email'),
('00000000-0000-4000-8000-000000992012','both-wrong-contract@tuturuuu.com',false,'Employee onboarding registry is missing','both tuple fields wrong with final marker'),
('00000000-0000-4000-8000-000000992013','no-intent-contract@tuturuuu.com',true,'Employee creation intent is missing','forged service marker at INSERT without intent'),
('00000000-0000-4000-8000-000000992014','late-marker-contract@tuturuuu.com',false,'Employee onboarding registry is missing','no intent with late service marker');
insert into public.platform_email_roles(email,enabled,allow_challenge_management,allow_manage_all_challenges,allow_role_management)
select distinct email,true,true,true,true from rejected_creates
union select 'pending-contract@tuturuuu.com',true,true,true,true
union select 'ordinary-contract@example.com',true,true,false,true
union select 'late-existing-contract@example.com',true,true,false,true;
create temporary table original_reservations as select email,to_jsonb(r) as image from public.platform_email_roles r;

-- Transactional audit rows prove rollback of every tested write, including the
-- ordinary grant branch reached before a rejected deferred late marker.
create temporary table identity_audit(user_id uuid,source text,operation text);
create function pg_temp.audit_identity_contract() returns trigger language plpgsql set search_path='' as $$
declare target uuid;
begin
  if tg_table_name='users' then target=new.id; else target=new.user_id; end if;
  insert into pg_temp.identity_audit values(target,tg_table_schema||'.'||tg_table_name,tg_op);
  return new;
end;
$$;
create trigger z_employee_contract_audit after insert or update on auth.users
for each row execute function pg_temp.audit_identity_contract();
create trigger z_employee_contract_audit after insert or update on public.users
for each row execute function pg_temp.audit_identity_contract();
create trigger z_employee_contract_audit after insert or update on public.user_private_details
for each row execute function pg_temp.audit_identity_contract();
create trigger z_employee_contract_audit after insert or update on public.platform_user_roles
for each row execute function pg_temp.audit_identity_contract();
create trigger z_employee_contract_audit after insert or update on private.infrastructure_employees
for each row execute function pg_temp.audit_identity_contract();

-- Explicitly force the final deferred event inside throws_ok's subtransaction.
-- The INSERT has no confirmation or ban, matching the provider ordering. The
-- UPDATE supplies final service metadata and fixture confirmation/ban fields.
create function pg_temp.attempt_identity_contract(p_id uuid,p_email text,p_early boolean,p_existing boolean default false)
returns void language plpgsql set search_path='' as $$
begin
  set constraints auth.check_employee_creation_commit deferred;
  if not p_existing then
    insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data)
    values(p_id,p_email,case when p_early then '{"employee_onboarding":true}'::jsonb else '{}'::jsonb end,
      '{"employee_onboarding":true}'::jsonb);
  end if;
  update auth.users set raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb)||'{"employee_onboarding":true}'::jsonb,
    email_confirmed_at=now(),banned_until=now()+interval '100 years' where id=p_id;
  set constraints auth.check_employee_creation_commit immediate;
end;
$$;
select throws_ok(format('select pg_temp.attempt_identity_contract(%L,%L,%L)',id,email,early_marker),
  '23514',expected,label) from rejected_creates order by label;
select ok(not exists(select 1 from auth.users where id=c.id),c.label||': Auth rolled back') from rejected_creates c;
select ok(not exists(select 1 from public.users where id=c.id),c.label||': public profile rolled back') from rejected_creates c;
select ok(not exists(select 1 from public.user_private_details where user_id=c.id),c.label||': private profile rolled back') from rejected_creates c;
select ok(not exists(select 1 from public.platform_user_roles where user_id=c.id),c.label||': role/grant writes rolled back') from rejected_creates c;
select ok(not exists(select 1 from private.infrastructure_employees where user_id=c.id),c.label||': registry rolled back') from rejected_creates c;
select ok(not exists(select 1 from identity_audit where user_id=c.id),c.label||': all transactional audits rolled back') from rejected_creates c;
select ok(not exists(select 1 from original_intents o left join private.employee_creation_intents i using(user_id)
  where o.image is distinct from to_jsonb(i)), 'every original private intent retained byte-for-value');
select ok(not exists(select 1 from original_reservations o left join public.platform_email_roles r using(email)
  where o.image is distinct from to_jsonb(r)), 'rejected creates never consume reservations or inherited privileges');

select lives_ok($$select pg_temp.attempt_identity_contract('00000000-0000-4000-8000-000000992002','pending-contract@tuturuuu.com',false)$$,
  'exact pending tuple accepts provider INSERT then final confirmed/banned UPDATE');
select ok(exists(select 1 from auth.users a join private.infrastructure_employees e on e.user_id=a.id
  where a.id='00000000-0000-4000-8000-000000992002' and a.email=e.staff_email
    and a.raw_app_meta_data->'employee_onboarding'='true'::jsonb and a.email_confirmed_at is not null
    and a.banned_until>now() and e.lifecycle_state='pending'), 'exact tuple has matching final registry and identity');
select ok(exists(select 1 from public.platform_user_roles where user_id='00000000-0000-4000-8000-000000992002'
  and not enabled and not allow_challenge_management and not allow_manage_all_challenges and not allow_role_management),
  'pending exact employee receives no inherited privileges');
select ok(exists(select 1 from public.platform_email_roles where email='pending-contract@tuturuuu.com'),
  'exact employee preserves raced reservation');
select ok(exists(select 1 from identity_audit where user_id='00000000-0000-4000-8000-000000992002'
  and source='auth.users' and operation='INSERT') and exists(select 1 from identity_audit
  where user_id='00000000-0000-4000-8000-000000992002' and source='auth.users' and operation='UPDATE'),
  'positive audit control observes both Auth INSERT and UPDATE');

insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) values
('00000000-0000-4000-8000-000000992020','ordinary-contract@example.com','{}','{"employee_onboarding":true}'),
('00000000-0000-4000-8000-000000992021','late-existing-contract@example.com','{}','{}');
set constraints auth.check_employee_creation_commit immediate;
select ok(exists(select 1 from public.platform_user_roles where user_id='00000000-0000-4000-8000-000000992020'
  and enabled and allow_challenge_management and not allow_manage_all_challenges and allow_role_management),
  'ordinary no-intent signup still inherits its reserved grants despite user metadata');
select ok(not exists(select 1 from public.platform_email_roles where email='ordinary-contract@example.com'),
  'ordinary signup still consumes its reservation');
select ok(not exists(select 1 from private.infrastructure_employees where user_id='00000000-0000-4000-8000-000000992020'),
  'user metadata never creates an employee registry');
create temporary table existing_auth_image as select to_jsonb(a) as image from auth.users a where id='00000000-0000-4000-8000-000000992021';
create temporary table existing_public_image as select to_jsonb(u) as image from public.users u where id='00000000-0000-4000-8000-000000992021';
create temporary table existing_private_image as select to_jsonb(d) as image from public.user_private_details d where user_id='00000000-0000-4000-8000-000000992021';
create temporary table existing_role_image as select to_jsonb(r) as image from public.platform_user_roles r where user_id='00000000-0000-4000-8000-000000992021';
create temporary table existing_audit_image as select * from identity_audit;
select throws_ok($$select pg_temp.attempt_identity_contract('00000000-0000-4000-8000-000000992021','late-existing-contract@example.com',false,true)$$,
  '23514','Employee onboarding registry is missing','deferred late marker UPDATE on existing ordinary user is rejected');
select is((select to_jsonb(a) from auth.users a where id='00000000-0000-4000-8000-000000992021'),
  (select image from existing_auth_image),'late rejected UPDATE retains exact original Auth row');
select is((select to_jsonb(r) from public.platform_user_roles r where user_id='00000000-0000-4000-8000-000000992021'),
  (select image from existing_role_image),'late rejected UPDATE retains exact ordinary grants');
select is((select to_jsonb(u) from public.users u where id='00000000-0000-4000-8000-000000992021'),
  (select image from existing_public_image),'late rejected UPDATE retains exact public profile');
select is((select to_jsonb(d) from public.user_private_details d where user_id='00000000-0000-4000-8000-000000992021'),
  (select image from existing_private_image),'late rejected UPDATE retains exact private profile');
select ok(not exists(select 1 from private.infrastructure_employees where user_id='00000000-0000-4000-8000-000000992021'),
  'late rejected UPDATE cannot create an employee registry');
select ok(not exists((select * from identity_audit except all select * from existing_audit_image)
  union all (select * from existing_audit_image except all select * from identity_audit)),
  'late rejected UPDATE leaves no additional transactional audit');
select * from finish();
rollback;
