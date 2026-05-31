begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(28);

select ok(
  to_regclass('public.workspace_promotions') is null,
  'workspace promotions are absent from public'
);

select ok(
  to_regclass('private.workspace_promotions') is not null,
  'workspace promotions exist in private'
);

select ok(
  to_regclass('public.v_user_referral_discounts') is null,
  'user referral discount view is absent from public'
);

select ok(
  to_regclass('private.v_user_referral_discounts') is not null,
  'user referral discount view exists in private'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'private.workspace_promotions'::regclass
  ),
  'private workspace promotions have RLS enabled'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename = 'workspace_promotions'
      and policyname = 'Service role can manage private workspace promotions'
      and roles = array['service_role'::name]
      and cmd = 'ALL'
  ),
  'private workspace promotions have a service-role policy'
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
      'private.workspace_promotions',
      privileges.privilege_name
    )
  ),
  'anon and authenticated cannot select or mutate private workspace promotions'
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
      'private.workspace_promotions',
      privileges.privilege_name
    )
  ),
  'service role can select and mutate private workspace promotions'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('anon'),
        ('authenticated')
    ) as roles(role_name)
    where has_table_privilege(
      roles.role_name,
      'private.v_user_referral_discounts',
      'select'
    )
  ),
  'anon and authenticated cannot select private user referral discount view'
);

select ok(
  has_table_privilege(
    'service_role',
    'private.v_user_referral_discounts',
    'select'
  ),
  'service role can select private user referral discount view'
);

select ok(
  exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conname = 'user_linked_promotions_promo_id_fkey'
      and constraint_row.conrelid = 'private.user_linked_promotions'::regclass
      and constraint_row.confrelid = 'private.workspace_promotions'::regclass
  ),
  'private user linked promotions reference private workspace promotions'
);

select ok(
  exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conname = 'finance_invoice_promotions_promo_id_fkey'
      and constraint_row.conrelid = 'public.finance_invoice_promotions'::regclass
      and constraint_row.confrelid = 'private.workspace_promotions'::regclass
  ),
  'invoice promotions reference private workspace promotions'
);

select ok(
  exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conname = 'workspace_settings_referral_promo_fkey'
      and constraint_row.conrelid = 'public.workspace_settings'::regclass
      and constraint_row.confrelid = 'private.workspace_promotions'::regclass
  ),
  'workspace settings referral promotion FK targets private workspace promotions'
);

select ok(
  exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conname = 'fk_workspace_promotions_owner'
      and constraint_row.conrelid = 'private.workspace_promotions'::regclass
      and constraint_row.confrelid = 'public.workspace_users'::regclass
  ),
  'private workspace promotions retain owner FK'
);

select ok(
  exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conname = 'public_workspace_promotions_creator_id_fkey'
      and constraint_row.conrelid = 'private.workspace_promotions'::regclass
      and constraint_row.confrelid = 'public.workspace_users'::regclass
  ),
  'private workspace promotions retain creator FK'
);

select ok(
  exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conname = 'workspace_promotions_ws_id_fkey'
      and constraint_row.conrelid = 'private.workspace_promotions'::regclass
      and constraint_row.confrelid = 'public.workspaces'::regclass
  ),
  'private workspace promotions retain workspace FK'
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
  'referral promotion auto-link trigger runs on private workspace promotions'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgname = 'trg_increment_promotion_uses'
      and tgrelid = 'public.finance_invoice_promotions'::regclass
      and tgfoid = 'private.increment_promotion_uses()'::regprocedure
      and not tgisinternal
  ),
  'invoice promotion usage trigger uses the private helper'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgname = 'enforce_strict_text_field_limits'
      and tgrelid = 'private.workspace_promotions'::regclass
      and not tgisinternal
  ),
  'private workspace promotions retain strict text limit trigger'
);

select ok(
  to_regprocedure('private.auto_link_referral_promotion()') is not null
    and to_regprocedure('private.fn_prevent_invalid_referral_link()') is not null
    and to_regprocedure('private.fn_prevent_owner_referral_unlink()') is not null
    and to_regprocedure('private.increment_promotion_uses()') is not null
    and to_regprocedure(
      'private.calculate_invoice_values(uuid,jsonb,uuid,numeric,numeric,numeric,boolean)'
    ) is not null,
  'workspace promotion helper functions exist in private'
);

select ok(
  to_regprocedure('public.increment_promotion_uses()') is null,
  'old public promotion usage helper is absent'
);

select ok(
  pg_get_functiondef(
    'private.calculate_invoice_values(uuid,jsonb,uuid,numeric,numeric,numeric,boolean)'::regprocedure
  ) like '%from private.workspace_promotions%'
    and pg_get_functiondef(
      'private.calculate_invoice_values(uuid,jsonb,uuid,numeric,numeric,numeric,boolean)'::regprocedure
    ) not like '%from public.workspace_promotions%',
  'invoice value RPC reads private workspace promotions'
);

select ok(
  pg_get_functiondef(
    'private.fn_prevent_invalid_referral_link()'::regprocedure
  ) like '%from private.workspace_promotions%',
  'invalid referral link helper reads private workspace promotions'
);

select ok(
  pg_get_functiondef(
    'private.fn_prevent_owner_referral_unlink()'::regprocedure
  ) like '%from private.workspace_promotions%',
  'owner referral unlink helper reads private workspace promotions'
);

select ok(
  exists (
    select 1
    from pg_depend dependency
    join pg_rewrite rewrite_rule
      on rewrite_rule.oid = dependency.objid
    where rewrite_rule.ev_class = 'private.v_user_referral_discounts'::regclass
      and dependency.refobjid = 'private.workspace_promotions'::regclass
  ),
  'private user referral discount view depends on private workspace promotions'
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
      and tablename = 'workspace_promotions'
      and policyname = 'Enable all access for workspace members'
  ),
  'old public workspace promotion policy was removed'
);

select * from finish();

rollback;
