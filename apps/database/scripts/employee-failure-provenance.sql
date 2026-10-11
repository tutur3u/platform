begin;
set local search_path = public, extensions;
-- Separate diagnostic only: original TAP fixtures and expected assertions are unchanged.
-- Minimal synthetic identity prerequisite, matching the original signup fixture.
insert into public.platform_email_roles(email,enabled,allow_role_management) values('employee-red@tuturuuu.com',true,true),('ordinary-red@example.com',true,true),('forged-red@example.com',true,true);
insert into public.users(id) values('00000000-0000-4000-8000-000000009900');
insert into private.employee_creation_intents(user_id,staff_email,managed_name,actor_id) values('00000000-0000-4000-8000-000000009901','employee-red@tuturuuu.com','Managed fixture','00000000-0000-4000-8000-000000009900');
insert into auth.users(id, email, email_confirmed_at, banned_until, raw_app_meta_data, raw_user_meta_data)
values ('00000000-0000-4000-8000-000000009901', 'employee-red@tuturuuu.com', null, null, '{}', '{"display_name":"Managed fixture","full_name":"Managed fixture"}');
update auth.users set email_confirmed_at=now(),banned_until=now()+interval '100 years',raw_app_meta_data=raw_app_meta_data||'{"employee_onboarding":true}'::jsonb where id='00000000-0000-4000-8000-000000009901';
set constraints auth.check_employee_creation_commit immediate;
do $claims$ begin
perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000009901',true);
perform set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000009901","role":"authenticated"}',true);
end; $claims$;
set constraints auth.check_employee_creation_commit deferred;

create function pg_temp.employee_failure_provenance(statement text, ordinal integer)
returns jsonb language plpgsql set search_path = '' as $probe$
declare state text; caught_schema text; caught_table text; caught_constraint text;
  matches integer; check_kind boolean; category text := 'other_redacted'; origin text;
begin
  if ordinal not in (22,23) then raise exception 'Unsupported diagnostic ordinal'; end if;
  begin
    execute statement;
    return jsonb_build_object('ordinal',ordinal,'sqlstate',null,'noException',true,
      'structuredOriginCategory','no_exception','constraintCategory','other_redacted','catalogBound',false);
  exception when others then
    get stacked diagnostics state = returned_sqlstate, caught_schema = schema_name,
      caught_table = table_name, caught_constraint = constraint_name;
    -- Never serialize structured names, messages, details, context, values or their hashes.
    if coalesce(caught_schema,'')='' and coalesce(caught_table,'')='' and coalesce(caught_constraint,'')='' then
      origin := 'empty_structured_provenance'; matches := 0;
    else
      select count(*),bool_and(c.contype='c') into matches,check_kind
      from pg_catalog.pg_constraint c
      join pg_catalog.pg_class r on r.oid=c.conrelid
      join pg_catalog.pg_namespace n on n.oid=r.relnamespace
      where n.nspname=caught_schema and r.relname=caught_table and c.conname=caught_constraint;
      if matches=1 and check_kind then origin := 'catalog_check';
      elsif matches=1 then origin := 'catalog_other_constraint';
      else origin := 'unknown_structured_provenance'; end if;
      if state='23514' and matches=1 and check_kind and caught_schema='private' then
        category := case caught_table || '.' || caught_constraint
          when 'employee_creation_intents.employee_creation_intents_staff_email_check' then 'intent_staff_email_check'
          when 'employee_creation_intents.employee_creation_intents_managed_name_check' then 'intent_managed_name_check'
          when 'infrastructure_employees.infrastructure_employees_staff_email_check' then 'employee_staff_email_check'
          when 'infrastructure_employees.infrastructure_employees_managed_name_check' then 'employee_managed_name_check'
          when 'infrastructure_employees.infrastructure_employees_lifecycle_state_check' then 'employee_lifecycle_check'
          when 'infrastructure_employees.infrastructure_employees_check' then 'employee_recovery_check'
          else 'other_redacted' end;
      end if;
    end if;
    return jsonb_build_object('ordinal',ordinal,'sqlstate',state,'noException',false,
      'structuredOriginCategory',origin,'constraintCategory',category,'catalogBound',matches=1);
  end;
end;
$probe$;

select pg_temp.employee_failure_provenance($failed22$insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) values('00000000-0000-4000-8000-000000009904','unbound-fixture@tuturuuu.com','{"employee_onboarding":true}','{"full_name":"Unbound fixture"}')$failed22$,22);
insert into private.employee_creation_intents(user_id,staff_email,managed_name,actor_id) values('00000000-0000-4000-8000-000000009905','unbanned-fixture@tuturuuu.com','Unbanned fixture','00000000-0000-4000-8000-000000009900');
select pg_temp.employee_failure_provenance($failed23$do $provider$ begin insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values('00000000-0000-4000-8000-000000009905','unbanned-fixture@tuturuuu.com',now(),'{}','{}'); set constraints auth.check_employee_creation_commit immediate; end; $provider$;$failed23$,23);
rollback;
