begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

select has_table(
  'public',
  'abuse_trust_overrides',
  'abuse trust override table exists'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.abuse_trust_overrides'::regclass
  ),
  'abuse trust overrides keep row level security enabled'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.abuse_trust_overrides',
    'select'
  ),
  'authenticated cannot select abuse trust overrides directly'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.abuse_trust_overrides',
    'insert'
  ),
  'authenticated cannot insert abuse trust overrides directly'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.abuse_trust_overrides',
    'update'
  ),
  'authenticated cannot update abuse trust overrides directly'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.abuse_trust_overrides',
    'delete'
  ),
  'authenticated cannot delete abuse trust overrides directly'
);

select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'abuse_trust_overrides'
      and (
        'anon' = any(roles)
        or 'authenticated' = any(roles)
      )
  ),
  'abuse trust overrides have no anon or authenticated RLS policies'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'abuse_trust_overrides'
      and policyname = 'Allow service role to manage abuse trust overrides'
      and 'service_role' = any(roles)
  ),
  'abuse trust overrides keep the service role RLS policy'
);

select ok(
  has_table_privilege(
    'service_role',
    'public.abuse_trust_overrides',
    'select'
  ),
  'service role can select abuse trust overrides'
);

select ok(
  has_table_privilege(
    'service_role',
    'public.abuse_trust_overrides',
    'insert'
  ),
  'service role can insert abuse trust overrides'
);

select ok(
  has_table_privilege(
    'service_role',
    'public.abuse_trust_overrides',
    'update'
  ),
  'service role can update abuse trust overrides'
);

select ok(
  has_table_privilege(
    'service_role',
    'public.abuse_trust_overrides',
    'delete'
  ),
  'service role can delete abuse trust overrides'
);

select * from finish();

rollback;
