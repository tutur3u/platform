begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(18);

select ok(
  not exists (
    select 1
    from (
      values
        ('healthcare_checkups'),
        ('healthcare_checkup_vitals'),
        ('healthcare_checkup_vital_groups')
    ) as tables(table_name)
    where to_regclass(format('public.%I', table_name)) is not null
  ),
  'legacy healthcare checkup tables are no longer in the public schema'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('healthcare_checkups'),
        ('healthcare_checkup_vitals'),
        ('healthcare_checkup_vital_groups')
    ) as tables(table_name)
    where to_regclass(format('private.%I', table_name)) is null
  ),
  'legacy healthcare checkup tables exist in the private schema'
);

select ok(
  not has_schema_privilege('anon', 'private', 'usage'),
  'anon cannot use the private schema'
);

select ok(
  not has_schema_privilege('authenticated', 'private', 'usage'),
  'authenticated cannot use the private schema'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('healthcare_checkups'),
        ('healthcare_checkup_vitals'),
        ('healthcare_checkup_vital_groups')
    ) as tables(table_name)
    where has_table_privilege(
      'anon',
      format('private.%I', table_name),
      'select'
    )
  ),
  'anon cannot select private healthcare checkup tables'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('healthcare_checkups'),
        ('healthcare_checkup_vitals'),
        ('healthcare_checkup_vital_groups')
    ) as tables(table_name)
    cross join (
      values ('select'), ('insert'), ('update'), ('delete')
    ) as privileges(privilege_name)
    where has_table_privilege(
      'authenticated',
      format('private.%I', table_name),
      privilege_name
    )
  ),
  'authenticated cannot select or mutate private healthcare checkup tables'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('healthcare_checkups'),
        ('healthcare_checkup_vitals'),
        ('healthcare_checkup_vital_groups')
    ) as tables(table_name)
    cross join (
      values ('select'), ('insert'), ('update'), ('delete')
    ) as privileges(privilege_name)
    where not has_table_privilege(
      'service_role',
      format('private.%I', table_name),
      privilege_name
    )
  ),
  'service role can select and mutate private healthcare checkup tables'
);

select ok(
  not exists (
    select 1
    from pg_class
    where oid in (
      'private.healthcare_checkups'::regclass,
      'private.healthcare_checkup_vitals'::regclass,
      'private.healthcare_checkup_vital_groups'::regclass
    )
      and not relrowsecurity
  ),
  'private healthcare checkup tables have RLS enabled'
);

select ok(
  (
    select count(*)
    from pg_policies
    where schemaname = 'private'
      and tablename in (
        'healthcare_checkups',
        'healthcare_checkup_vitals',
        'healthcare_checkup_vital_groups'
      )
      and roles = array['service_role']::name[]
      and cmd = 'ALL'
  ) = 3,
  'private healthcare checkup tables have service-role RLS policies'
);

select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename in (
        'healthcare_checkups',
        'healthcare_checkup_vitals',
        'healthcare_checkup_vital_groups'
      )
      and roles && array['anon', 'authenticated']::name[]
  ),
  'private healthcare checkup tables have no client-role RLS policies'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'healthcare_checkups_diagnosis_id_fkey'
      and conrelid = 'private.healthcare_checkups'::regclass
      and confrelid = 'private.healthcare_diagnoses'::regclass
  ),
  'private healthcare checkups still reference private diagnoses'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'healthcare_checkups_patient_id_fkey'
      and conrelid = 'private.healthcare_checkups'::regclass
      and confrelid = 'public.workspace_users'::regclass
  ),
  'private healthcare checkups still reference workspace users'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'healthcare_checkup_vitals_checkup_id_fkey'
      and conrelid = 'private.healthcare_checkup_vitals'::regclass
      and confrelid = 'private.healthcare_checkups'::regclass
  ),
  'private healthcare vital values still reference private checkups'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'healthcare_checkup_vital_groups_checkup_id_fkey'
      and conrelid = 'private.healthcare_checkup_vital_groups'::regclass
      and confrelid = 'private.healthcare_checkups'::regclass
  ),
  'private healthcare vital group links still reference private checkups'
);

select ok(
  position(
    'private.healthcare_checkups' in pg_get_functiondef(
      'public.get_healthcare_checkups_count(uuid)'::regprocedure
    )
  ) > 0,
  'healthcare checkup count function reads from the private schema'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.get_healthcare_checkups_count(uuid)',
    'execute'
  ),
  'authenticated cannot execute the private healthcare checkup count helper'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.get_healthcare_checkups_count(uuid)',
    'execute'
  ),
  'service role can execute the private healthcare checkup count helper'
);

select ok(
  (
    select bool_and(position('private' in setting) > 0)
    from (
      select unnest(proconfig) as setting
      from pg_proc
      where oid in (
        'public.merge_workspace_users_phase1c(uuid,uuid,uuid)'::regprocedure,
        'public.merge_workspace_users_phase1c_batch(uuid,uuid,uuid,integer)'::regprocedure
      )
    ) as function_settings
    where setting like 'search_path=%'
  ),
  'workspace-user merge phase functions can resolve private healthcare checkups'
);

select * from finish();

rollback;
