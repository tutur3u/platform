begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(17);

select ok(
  not exists (
    select 1
    from (
      values
        ('personal_notes'),
        ('healthcare_diagnoses')
    ) as tables(table_name)
    where to_regclass(format('public.%I', table_name)) is not null
  ),
  'legacy profile and healthcare tables are no longer in the public schema'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('personal_notes'),
        ('healthcare_diagnoses')
    ) as tables(table_name)
    where to_regclass(format('private.%I', table_name)) is null
  ),
  'legacy profile and healthcare tables exist in the private schema'
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
        ('personal_notes'),
        ('healthcare_diagnoses')
    ) as tables(table_name)
    where has_table_privilege('anon', format('private.%I', table_name), 'select')
  ),
  'anon cannot select private legacy profile or healthcare tables'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('personal_notes'),
        ('healthcare_diagnoses')
    ) as tables(table_name)
    cross join (
      values
        ('select'),
        ('insert'),
        ('update'),
        ('delete')
    ) as privileges(privilege_name)
    where has_table_privilege(
      'authenticated',
      format('private.%I', table_name),
      privilege_name
    )
  ),
  'authenticated cannot select or mutate private legacy profile or healthcare tables'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('personal_notes'),
        ('healthcare_diagnoses')
    ) as tables(table_name)
    cross join (
      values
        ('select'),
        ('insert'),
        ('update'),
        ('delete')
    ) as privileges(privilege_name)
    where not has_table_privilege(
      'service_role',
      format('private.%I', table_name),
      privilege_name
    )
  ),
  'service role can select and mutate private legacy profile and healthcare tables'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'personal_notes_pkey'
      and conrelid = 'private.personal_notes'::regclass
  ),
  'private personal notes retain primary key'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'personal_notes_owner_id_fkey'
      and conrelid = 'private.personal_notes'::regclass
      and confrelid = 'public.users'::regclass
  ),
  'private personal notes still reference note owners'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'healthcare_checkups_diagnosis_id_fkey'
      and conrelid = 'private.healthcare_checkups'::regclass
      and confrelid = 'private.healthcare_diagnoses'::regclass
  ),
  'healthcare checkups still reference private healthcare diagnoses'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'healthcare_diagnoses_ws_id_fkey'
      and conrelid = 'private.healthcare_diagnoses'::regclass
      and confrelid = 'public.workspaces'::regclass
  ),
  'private healthcare diagnoses still reference workspaces'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename = 'personal_notes'
      and policyname = 'Service role can manage private personal notes'
  ),
  'private personal notes have service-role RLS policy'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename = 'healthcare_diagnoses'
      and policyname = 'Service role can manage private healthcare diagnoses'
  ),
  'private healthcare diagnoses have service-role RLS policy'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'private.personal_notes'::regclass),
  'private personal notes have RLS enabled'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'private.healthcare_diagnoses'::regclass),
  'private healthcare diagnoses have RLS enabled'
);

select ok(
  position(
    'private.healthcare_diagnoses' in pg_get_functiondef(
      'public.get_healthcare_diagnoses_count(uuid)'::regprocedure
    )
  ) > 0,
  'healthcare diagnoses count function reads from private schema'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.get_healthcare_diagnoses_count(uuid)',
    'execute'
  ),
  'authenticated cannot execute private healthcare diagnosis count helper'
);

select * from finish();

rollback;
