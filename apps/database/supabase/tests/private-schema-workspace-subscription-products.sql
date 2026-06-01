begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(23);

select ok(
  to_regclass('public.workspace_subscription_products') is null,
  'workspace subscription products are absent from public'
);

select ok(
  to_regclass('private.workspace_subscription_products') is not null,
  'workspace subscription products exist in private'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'private.workspace_subscription_products'::regclass
  ),
  'private workspace subscription products have RLS enabled'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename = 'workspace_subscription_products'
      and policyname = 'Service role can manage private workspace subscription products'
      and roles = array['service_role'::name]
      and cmd = 'ALL'
  ),
  'private workspace subscription products have a service-role policy'
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
      'private.workspace_subscription_products',
      privileges.privilege_name
    )
  ),
  'anon and authenticated cannot select or mutate private workspace subscription products'
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
      'private.workspace_subscription_products',
      privileges.privilege_name
    )
  ),
  'service role can select and mutate private workspace subscription products'
);

select ok(
  exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conname = 'workspace_orders_product_id_fkey'
      and constraint_row.conrelid = 'public.workspace_orders'::regclass
      and constraint_row.confrelid =
        'private.workspace_subscription_products'::regclass
  ),
  'workspace orders reference private workspace subscription products'
);

select ok(
  exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conname = 'workspace_subscription_product_id_fkey'
      and constraint_row.conrelid =
        'public.workspace_subscriptions'::regclass
      and constraint_row.confrelid =
        'private.workspace_subscription_products'::regclass
  ),
  'workspace subscriptions reference private workspace subscription products'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgname = 'enforce_strict_text_field_limits'
      and tgrelid = 'private.workspace_subscription_products'::regclass
      and not tgisinternal
  ),
  'private workspace subscription products retain strict text limit trigger'
);

select ok(
  to_regprocedure('public._resolve_workspace_tier(uuid)') is not null,
  'workspace tier resolver still exists'
);

select ok(
  to_regprocedure(
    'public.get_user_workspace_subscription_info(uuid)'
  ) is not null,
  'user subscription info RPC still exists'
);

select ok(
  to_regprocedure('public.get_workspace_storage_limit(uuid)') is not null,
  'workspace storage limit RPC still exists'
);

select ok(
  to_regprocedure('public.workspace_has_available_seats(uuid)') is not null,
  'workspace seat availability RPC still exists'
);

select ok(
  pg_get_functiondef(
    'public._resolve_workspace_tier(uuid)'::regprocedure
  ) like '%private.workspace_subscription_products%'
    and pg_get_functiondef(
      'public._resolve_workspace_tier(uuid)'::regprocedure
    ) not like '%public.workspace_subscription_products%',
  'workspace tier resolver reads private workspace subscription products'
);

select ok(
  pg_get_functiondef(
    'public.get_user_workspace_subscription_info(uuid)'::regprocedure
  ) like '%private.workspace_subscription_products%'
    and pg_get_functiondef(
      'public.get_user_workspace_subscription_info(uuid)'::regprocedure
    ) not like '%public.workspace_subscription_products%',
  'user subscription info RPC reads private workspace subscription products'
);

select ok(
  pg_get_functiondef(
    'public.get_workspace_storage_limit(uuid)'::regprocedure
  ) like '%private.workspace_subscription_products%'
    and pg_get_functiondef(
      'public.get_workspace_storage_limit(uuid)'::regprocedure
    ) not like '%public.workspace_subscription_products%',
  'storage limit RPC reads private workspace subscription products'
);

select ok(
  pg_get_functiondef(
    'public.workspace_has_available_seats(uuid)'::regprocedure
  ) like '%private.workspace_subscription_products%'
    and pg_get_functiondef(
      'public.workspace_has_available_seats(uuid)'::regprocedure
    ) not like '%public.workspace_subscription_products%',
  'seat availability RPC reads private workspace subscription products'
);

select ok(
  pg_get_functiondef(
    'public.deduct_ai_credits(uuid,text,integer,integer,integer,text,uuid,uuid,jsonb)'::regprocedure
  ) like '%public._resolve_workspace_tier%',
  'legacy AI credit deduction resolves tier through the private-backed helper'
);

select ok(
  pg_get_functiondef(
    'public.get_or_create_credit_balance(uuid)'::regprocedure
  ) like '%public._resolve_workspace_tier%',
  'legacy credit balance creation resolves tier through the private-backed helper'
);

select ok(
  pg_get_functiondef(
    'public.get_workspace_overview(text,text,text,text,text,text,text,integer,integer)'::regprocedure
  ) like '%workspace_subscription_products%'
    and pg_get_functiondef(
      'public.get_workspace_overview(text,text,text,text,text,text,text,integer,integer)'::regprocedure
    ) not like '%public.workspace_subscription_products%',
  'workspace overview RPC does not reference public workspace subscription products'
);

select ok(
  pg_get_functiondef(
    'public.get_workspace_overview_summary()'::regprocedure
  ) like '%workspace_subscription_products%'
    and pg_get_functiondef(
      'public.get_workspace_overview_summary()'::regprocedure
    ) not like '%public.workspace_subscription_products%',
  'workspace overview summary RPC does not reference public workspace subscription products'
);

select ok(
  public._resolve_workspace_tier(
    '00000000-0000-0000-0000-000000000000'::uuid
  ) is not null,
  'workspace tier resolver executes after the private move'
);

select ok(
  public.workspace_has_available_seats(
    '00000000-0000-0000-0000-000000000000'::uuid
  ) is not null,
  'seat availability RPC executes after the private move'
);

select * from finish();

rollback;
