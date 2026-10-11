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

-- Match a static guard signature in memory only; never publish its inputs.
create function pg_temp.employee_guard_category(state text, message text, context text)
returns text language plpgsql immutable set search_path = '' as $category$
declare frame text;
begin
  if state is distinct from '23514' or message is null or context is null
    or octet_length(message)>256 or octet_length(context)>8192 then return 'unclassified'; end if;
  frame := split_part(context,E'\n',1);
  if message='Employee creation intent does not match identity'
    and frame ~ '^PL/pgSQL function (private\.)?bind_employee_creation_intent\(\) line [1-9][0-9]* at RAISE\r?$' then
    return 'intent_identity_mismatch';
  elsif message='Employee creation intent is missing'
    and frame ~ '^PL/pgSQL function (public\.)?create_user_profile\(\) line [1-9][0-9]* at RAISE\r?$' then
    return 'creation_intent_missing';
  elsif message='Employee onboarding registry is missing'
    and frame ~ '^PL/pgSQL function (private\.)?check_employee_creation_commit\(\) line [1-9][0-9]* at RAISE\r?$' then
    return 'onboarding_registry_missing';
  elsif message='Employee creation must remain confirmed and pending'
    and frame ~ '^PL/pgSQL function (private\.)?check_employee_creation_commit\(\) line [1-9][0-9]* at RAISE\r?$' then
    return 'creation_final_row_invalid';
  elsif message='Personal workspaces can only have one member'
    and frame ~ '^PL/pgSQL function (public\.)?enforce_personal_workspace_single_member\(\) line [1-9][0-9]* at RAISE\r?$' then
    return 'personal_workspace_second_member';
  end if;
  return 'unclassified';
end;
$category$;

-- Synthetic classifier checks run inside this diagnostic's rollback transaction.
do $classifier_checks$
declare item record;
begin
  for item in select * from (values
    ('Employee creation intent does not match identity','private.bind_employee_creation_intent','intent_identity_mismatch'),
    ('Employee creation intent is missing','public.create_user_profile','creation_intent_missing'),
    ('Employee onboarding registry is missing','private.check_employee_creation_commit','onboarding_registry_missing'),
    ('Employee creation must remain confirmed and pending','private.check_employee_creation_commit','creation_final_row_invalid'),
    ('Personal workspaces can only have one member','public.enforce_personal_workspace_single_member','personal_workspace_second_member')
  ) as cases(message,function_name,category) loop
    if pg_temp.employee_guard_category('23514',item.message,'PL/pgSQL function '||item.function_name||'() line 1 at RAISE')<>item.category
      or pg_temp.employee_guard_category('23514',item.message,'PL/pgSQL function '||split_part(item.function_name,'.',2)||'() line 1 at RAISE')<>item.category
      or pg_temp.employee_guard_category('42501',item.message,'PL/pgSQL function '||item.function_name||'() line 1 at RAISE')<>'unclassified'
      or pg_temp.employee_guard_category('23514',item.message||' suffix','PL/pgSQL function '||item.function_name||'() line 1 at RAISE')<>'unclassified'
      or pg_temp.employee_guard_category('23514',item.message,'PL/pgSQL function unrelated() line 1 at RAISE')<>'unclassified'
      or pg_temp.employee_guard_category('23514',item.message,E'SQL statement "redacted"\nPL/pgSQL function '||item.function_name||'() line 1 at RAISE')<>'unclassified'
      or pg_temp.employee_guard_category('23514',item.message,repeat('x',8193))<>'unclassified'
      or pg_temp.employee_guard_category('23514',repeat('x',257),'PL/pgSQL function '||item.function_name||'() line 1 at RAISE')<>'unclassified' then
      raise exception 'Diagnostic guard classifier failed';
    end if;
  end loop;
end;
$classifier_checks$;

create function pg_temp.employee_failure_provenance(statement text, ordinal integer)
returns jsonb language plpgsql set search_path = '' as $probe$
declare state text; caught_schema text; caught_table text; caught_constraint text;
  caught_message text; caught_context text; guard_category text := 'unclassified';
  matches integer; check_kind boolean; category text := 'other_redacted'; origin text;
begin
  if ordinal not in (22,23) then raise exception 'Unsupported diagnostic ordinal'; end if;
  begin
    execute statement;
    return jsonb_build_object('ordinal',ordinal,'sqlstate',null,'noException',true,
      'structuredOriginCategory','no_exception','constraintCategory','other_redacted','catalogBound',false,
      'guardCategory','unclassified');
  exception when others then
    get stacked diagnostics state = returned_sqlstate, caught_schema = schema_name,
      caught_table = table_name, caught_constraint = constraint_name,
      caught_message = message_text, caught_context = pg_exception_context;
    -- Never serialize structured names, messages, details, context, values or their hashes.
    if coalesce(caught_schema,'')='' and coalesce(caught_table,'')='' and coalesce(caught_constraint,'')='' then
      origin := 'empty_structured_provenance'; matches := 0;
      guard_category := pg_temp.employee_guard_category(state,caught_message,caught_context);
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
      'structuredOriginCategory',origin,'constraintCategory',category,'catalogBound',matches=1,
      'guardCategory',guard_category);
  end;
end;
$probe$;

select pg_temp.employee_failure_provenance($failed22$insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) values('00000000-0000-4000-8000-000000009904','unbound-fixture@tuturuuu.com','{"employee_onboarding":true}','{"full_name":"Unbound fixture"}')$failed22$,22);
insert into private.employee_creation_intents(user_id,staff_email,managed_name,actor_id) values('00000000-0000-4000-8000-000000009905','unbanned-fixture@tuturuuu.com','Unbanned fixture','00000000-0000-4000-8000-000000009900');
select pg_temp.employee_failure_provenance($failed23$do $provider$ begin insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values('00000000-0000-4000-8000-000000009905','unbanned-fixture@tuturuuu.com',now(),'{}','{}'); set constraints auth.check_employee_creation_commit immediate; end; $provider$;$failed23$,23);
rollback;
