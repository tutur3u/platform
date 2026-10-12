begin;
set local search_path = public, extensions;
-- Diagnostic only. The original 52 assertions and every migration remain unchanged.
-- All identities are copied from the synthetic identity packet; never production data.
insert into public.users(id) values ('00000000-0000-4000-8000-000000992000');
insert into private.employee_creation_intents(user_id,staff_email,managed_name,actor_id) values
('00000000-0000-4000-8000-000000992002','pending-contract@tuturuuu.com','Pending fixture','00000000-0000-4000-8000-000000992000');
insert into public.platform_email_roles(email,enabled,allow_challenge_management,allow_manage_all_challenges,allow_role_management) values
('late-marker-contract@tuturuuu.com',true,true,true,true),
('pending-contract@tuturuuu.com',true,true,true,true),
('ordinary-contract@example.com',true,true,false,true);

-- Preserve the original audit function's invoker semantics and body, including ACLs.
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

create temporary table identity_diagnostic_records(ordinal integer primary key, payload jsonb not null);
do $diagnostic$
declare
  item record;
  phase integer;
  state text;
  context text;
  routine text;
  no_exception boolean;
  rolled_back boolean;
  catalog_hash text;
  catalog_present boolean;
  profile_owner oid;
  deferred_owner oid;
  audit_owner oid;
  intent_before jsonb;
  reservation_before jsonb;
  intent_retained boolean;
  reservation_retained boolean;
  current_actor oid := current_user::regrole::oid;
  temp_schema oid := pg_catalog.pg_my_temp_schema();
  audit_table oid := 'pg_temp.identity_audit'::regclass::oid;
begin
  select proowner into profile_owner from pg_catalog.pg_proc where oid='public.create_user_profile()'::regprocedure;
  select proowner into deferred_owner from pg_catalog.pg_proc where oid='private.check_employee_creation_commit()'::regprocedure;
  select proowner into audit_owner from pg_catalog.pg_proc where oid='pg_temp.audit_identity_contract()'::regprocedure;
  -- Hash only fixed catalog definitions/owners. Never hash an exception or its values.
  select count(p.oid)=8,
    pg_catalog.md5(pg_catalog.string_agg(expected.signature || ':' || p.proowner::text || ':' || pg_catalog.pg_get_functiondef(p.oid), E'\n' order by expected.signature))
    into catalog_present,catalog_hash
  from (values
    ('pg_temp.audit_identity_contract()'),
    ('public.create_user_profile()'),
    ('private.bind_employee_creation_intent()'),
    ('private.check_employee_creation_commit()'),
    ('private.enforce_employee_full_name()'),
    ('public.auto_create_personal_workspace()'),
    ('public.add_ws_creator()'),
    ('public.enforce_personal_workspace_single_member()')
  ) expected(signature)
  left join pg_catalog.pg_proc p on p.oid=pg_catalog.to_regprocedure(expected.signature);

  for item in select * from (values
    (1,'negative','00000000-0000-4000-8000-000000992014'::uuid,'late-marker-contract@tuturuuu.com'),
    (2,'positive','00000000-0000-4000-8000-000000992002'::uuid,'pending-contract@tuturuuu.com'),
    (3,'ordinary','00000000-0000-4000-8000-000000992020'::uuid,'ordinary-contract@example.com')
  ) cases(ordinal,kind,id,email) order by ordinal loop
    select to_jsonb(i) into intent_before from private.employee_creation_intents i where user_id=item.id;
    select to_jsonb(r) into reservation_before from public.platform_email_roles r where email=item.email;
    phase := 0; state := null; context := null; routine := 'none'; no_exception := false;
    begin
      -- Original negative/positive helper has SET search_path=''; ordinary uses outer context.
      -- Transaction-local setting rolls back with this case on success or failure.
      if item.kind <> 'ordinary' then perform set_config('search_path','',true); end if;
      -- Same constraint schedule and identity statements as the original fixture.
      set constraints auth.check_employee_creation_commit deferred;
      phase := 1;
      insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data)
      values(item.id,item.email,'{}','{"employee_onboarding":true}');
      if item.kind <> 'ordinary' then
        phase := 2;
        update auth.users set raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb)||'{"employee_onboarding":true}'::jsonb,
          email_confirmed_at=now(),banned_until=now()+interval '100 years' where id=item.id;
      end if;
      phase := 3;
      set constraints auth.check_employee_creation_commit immediate;
      phase := 4;
      no_exception := true;
      -- Roll back successful controls as well as caught failures. Never commit a case.
      raise exception using errcode='PTD01',message='Diagnostic rollback sentinel';
    exception when others then
      get stacked diagnostics state=returned_sqlstate,context=pg_exception_context;
      if no_exception and phase=4 and state='PTD01' then
        state := null; routine := 'none';
      else
        no_exception := false;
        -- Match fixed routine frames locally, never serialize the raw context.
        routine := 'other_redacted';
        if octet_length(coalesce(context,'')) <= 8192 then
          if context ~ 'function (pg_temp_[0-9]+\.|pg_temp\.)?audit_identity_contract\(' then routine := 'audit_identity_contract';
          elsif context ~ 'function (public\.)?create_user_profile\(' then routine := 'create_user_profile';
          elsif context ~ 'function (private\.)?bind_employee_creation_intent\(' then routine := 'bind_employee_creation_intent';
          elsif context ~ 'function (private\.)?check_employee_creation_commit\(' then routine := 'check_employee_creation_commit';
          elsif context ~ 'function (private\.)?enforce_employee_full_name\(' then routine := 'enforce_employee_full_name';
          elsif context ~ 'function (public\.)?auto_create_personal_workspace\(' then routine := 'auto_create_personal_workspace';
          elsif context ~ 'function (public\.)?add_ws_creator\(' then routine := 'add_ws_creator';
          elsif context ~ 'function (public\.)?enforce_personal_workspace_single_member\(' then routine := 'enforce_personal_workspace_single_member'; end if;
        end if;
        if state not in ('23514','42501','42P01','42703','42883','3F000','23505','23503','55000','40P01','57014') then state := 'other_redacted'; end if;
      end if;
      context := null;
    end;
    intent_retained := intent_before is not distinct from (select to_jsonb(i) from private.employee_creation_intents i where user_id=item.id);
    reservation_retained := reservation_before is not distinct from (select to_jsonb(r) from public.platform_email_roles r where email=item.email);
    -- The exception block is a real subtransaction: prove all case writes vanished.
    rolled_back := not exists(select 1 from auth.users where id=item.id)
      and not exists(select 1 from public.users where id=item.id)
      and not exists(select 1 from public.user_private_details where user_id=item.id)
      and not exists(select 1 from public.platform_user_roles where user_id=item.id)
      and not exists(select 1 from private.infrastructure_employees where user_id=item.id)
      and not exists(select 1 from pg_temp.identity_audit where user_id=item.id);
    insert into pg_temp.identity_diagnostic_records values(item.ordinal,pg_catalog.jsonb_build_object(
      'ordinal',item.ordinal,'caseCategory',item.kind,'phase',phase,'sqlstate',state,
      'noException',no_exception,'caseRolledBack',rolled_back,'routineCategory',routine,
      'intentBeforeimageRetained',intent_retained,'reservationBeforeimageRetained',reservation_retained,
      'catalogPresent',catalog_present,'catalogHash',catalog_hash,
      'sessionIsSupabaseAdmin',current_user='supabase_admin',
      'auditOwnerIsSessionUser',audit_owner=current_actor,
      'profileOwnerIsSessionUser',profile_owner=current_actor,
      'profileOwnerCanUseTempSchema',pg_catalog.has_schema_privilege(profile_owner,temp_schema,'USAGE'),
      'profileOwnerCanInsertAudit',pg_catalog.has_table_privilege(profile_owner,audit_table,'INSERT'),
      'deferredOwnerCanUseTempSchema',pg_catalog.has_schema_privilege(deferred_owner,temp_schema,'USAGE'),
      'deferredOwnerCanInsertAudit',pg_catalog.has_table_privilege(deferred_owner,audit_table,'INSERT')
    ));
  end loop;
end;
$diagnostic$;
select payload from pg_temp.identity_diagnostic_records order by ordinal;
rollback;
