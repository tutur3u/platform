begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(18);

select ok(
  to_regclass('public.user_linked_promotions') is null,
  'user linked promotions are absent from public'
);

select ok(
  to_regclass('private.user_linked_promotions') is not null,
  'user linked promotions exist in private'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'private.user_linked_promotions'::regclass
  ),
  'private user linked promotions have RLS enabled'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename = 'user_linked_promotions'
      and policyname = 'Service role can manage private user linked promotions'
      and roles = array['service_role'::name]
      and cmd = 'ALL'
  ),
  'private user linked promotions have a service-role policy'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('select'),
        ('insert'),
        ('update'),
        ('delete')
    ) as privileges(privilege_name)
    cross join (
      values
        ('anon'),
        ('authenticated')
    ) as roles(role_name)
    where has_table_privilege(
      roles.role_name,
      'private.user_linked_promotions',
      privileges.privilege_name
    )
  ),
  'anon and authenticated cannot select or mutate private user linked promotions'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('select'),
        ('insert'),
        ('update'),
        ('delete')
    ) as privileges(privilege_name)
    where not has_table_privilege(
      'service_role',
      'private.user_linked_promotions',
      privileges.privilege_name
    )
  ),
  'service role can select and mutate private user linked promotions'
);

select ok(
  exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conname = 'user_linked_promotions_promo_id_fkey'
      and constraint_row.conrelid = 'private.user_linked_promotions'::regclass
      and constraint_row.confrelid = 'private.workspace_promotions'::regclass
  ),
  'private user linked promotions still reference workspace promotions'
);

select ok(
  exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conname = 'user_linked_promotions_user_id_fkey'
      and constraint_row.conrelid = 'private.user_linked_promotions'::regclass
      and constraint_row.confrelid = 'public.workspace_users'::regclass
  ),
  'private user linked promotions still reference workspace users'
);

select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'private'
      and tablename = 'user_linked_promotions'
      and indexname = 'user_linked_promotions_pkey'
  ),
  'private user linked promotions retain their primary key index'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgname = 't_prevent_invalid_referral_link'
      and tgrelid = 'private.user_linked_promotions'::regclass
      and tgfoid = 'private.fn_prevent_invalid_referral_link()'::regprocedure
      and not tgisinternal
  ),
  'invalid referral link trigger uses the private helper'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgname = 't_prevent_owner_referral_unlink'
      and tgrelid = 'private.user_linked_promotions'::regclass
      and tgfoid = 'private.fn_prevent_owner_referral_unlink()'::regprocedure
      and not tgisinternal
  ),
  'owner referral unlink trigger uses the private helper'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgname = 't_auto_link_referral_promo'
      and tgrelid = 'private.workspace_promotions'::regclass
      and tgfoid = 'private.auto_link_referral_promotion()'::regprocedure
      and not tgisinternal
  ),
  'workspace promotion referral trigger writes through the private helper'
);

select ok(
  to_regprocedure('private.auto_link_referral_promotion()') is not null
    and to_regprocedure('private.fn_prevent_invalid_referral_link()') is not null
    and to_regprocedure('private.fn_prevent_owner_referral_unlink()') is not null,
  'referral link helper functions exist in private'
);

select ok(
  to_regprocedure('public.auto_link_referral_promotion()') is null
    and to_regprocedure('public.fn_prevent_invalid_referral_link()') is null
    and to_regprocedure('public.fn_prevent_owner_referral_unlink()') is null,
  'old public referral link helper functions are absent'
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
    from pg_policies
    where schemaname = 'private'
      and tablename = 'user_linked_promotions'
      and policyname = 'Enable all access for workspace members'
  ),
  'old public user linked promotion policy was removed'
);

select ok(
  not exists (
    select 1
    from pg_class cls
    join pg_namespace ns
      on ns.oid = cls.relnamespace
    where ns.nspname = 'public'
      and cls.relname = 'user_linked_promotions'
      and cls.relkind in ('r', 'p', 'v', 'm')
  ),
  'no public user linked promotion relation remains'
);

select * from finish();

rollback;
