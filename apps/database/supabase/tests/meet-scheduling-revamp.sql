begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(14);

select has_column('public', 'meet_together_plans', 'timezone', 'plans retain an IANA timezone');
select has_column('public', 'meet_together_plans', 'duration_minutes', 'plans retain a meeting duration');
select has_column('public', 'meet_together_plans', 'finalized_at', 'plans retain finalization time');
select has_column('public', 'meet_together_plans', 'finalized_by', 'plans retain the finalizing creator');
select has_table('public', 'meet_together_finalized_timeframes', 'finalized alternatives are persisted');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.meet_together_finalized_timeframes'::regclass),
  'finalized alternatives have RLS enabled'
);

select ok(
  not has_table_privilege('anon', 'public.meet_together_finalized_timeframes', 'select')
    and not has_table_privilege('authenticated', 'public.meet_together_finalized_timeframes', 'select'),
  'client roles cannot read finalized alternatives directly'
);

select ok(
  has_table_privilege('service_role', 'public.meet_together_finalized_timeframes', 'select')
    and has_table_privilege('service_role', 'public.meet_together_finalized_timeframes', 'insert')
    and has_table_privilege('service_role', 'public.meet_together_finalized_timeframes', 'update')
    and has_table_privilege('service_role', 'public.meet_together_finalized_timeframes', 'delete'),
  'service role manages finalized alternatives'
);

select ok(
  to_regprocedure('private.replace_meet_availability(uuid,uuid,boolean,jsonb)') is not null,
  'atomic availability replacement exists'
);

select ok(
  to_regprocedure('private.replace_meet_finalized_timeframes(uuid,uuid,jsonb)') is not null,
  'atomic finalization replacement exists'
);

select ok(
  not has_function_privilege('anon', 'private.replace_meet_availability(uuid,uuid,boolean,jsonb)', 'execute')
    and not has_function_privilege('authenticated', 'private.replace_meet_availability(uuid,uuid,boolean,jsonb)', 'execute'),
  'client roles cannot execute atomic availability replacement'
);

select ok(
  has_function_privilege('service_role', 'private.replace_meet_availability(uuid,uuid,boolean,jsonb)', 'execute'),
  'service role can replace availability atomically'
);

select ok(
  not has_function_privilege('anon', 'private.replace_meet_finalized_timeframes(uuid,uuid,jsonb)', 'execute')
    and not has_function_privilege('authenticated', 'private.replace_meet_finalized_timeframes(uuid,uuid,jsonb)', 'execute'),
  'client roles cannot finalize or reopen plans directly'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.meet_together_plans'::regclass
      and conname = 'meet_together_plans_duration_minutes_check'
  ),
  'meeting duration is constrained to safe 15-minute increments'
);

select * from finish();
rollback;
