begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(24);

select ok(
  to_regclass('public.workspace_wallets') is null,
  'workspace wallets are no longer in the public schema'
);

select ok(
  to_regclass('private.workspace_wallets') is not null,
  'workspace wallets exist in the private schema'
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
        ('select'),
        ('insert'),
        ('update'),
        ('delete')
    ) as privileges(privilege_name)
    where has_table_privilege(
      'anon',
      'private.workspace_wallets',
      privileges.privilege_name
    )
  ),
  'anon cannot select or mutate private workspace wallets'
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
    where has_table_privilege(
      'authenticated',
      'private.workspace_wallets',
      privileges.privilege_name
    )
  ),
  'authenticated cannot select or mutate private workspace wallets'
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
      'private.workspace_wallets',
      privileges.privilege_name
    )
  ),
  'service role can select and mutate private workspace wallets'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'private.workspace_wallets'::regclass
  ),
  'private workspace wallets have RLS enabled'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename = 'workspace_wallets'
      and policyname = 'Service role can manage private workspace wallets'
  ),
  'private workspace wallets have a service-role policy'
);

select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename = 'workspace_wallets'
      and (
        'authenticated' = any (roles)
        or 'anon' = any (roles)
        or 'public' = any (roles)
      )
  ),
  'private workspace wallets have no direct anon/authenticated/public policy'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'workspace_wallets_ws_id_fkey'
      and conrelid = 'private.workspace_wallets'::regclass
      and confrelid = 'public.workspaces'::regclass
  ),
  'private workspace wallets still reference public workspaces'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'workspace_wallets_currency_fkey'
      and conrelid = 'private.workspace_wallets'::regclass
      and confrelid = 'private.currencies'::regclass
  ),
  'private workspace wallets still reference private currencies'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'workspace_wallets_type_fkey'
      and conrelid = 'private.workspace_wallets'::regclass
      and confrelid = 'public.wallet_types'::regclass
  ),
  'private workspace wallets still reference public wallet types'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('public.credit_wallets'::regclass, 'credit_wallets_wallet_id_fkey'),
        ('public.finance_budgets'::regclass, 'finance_budgets_wallet_id_fkey'),
        ('public.finance_invoices'::regclass, 'finance_invoices_wallet_id_fkey'),
        ('private.workspace_debt_loans'::regclass, 'workspace_debt_loans_wallet_id_fkey'),
        ('public.recurring_transactions'::regclass, 'recurring_transactions_wallet_id_fkey'),
        ('public.sepay_wallet_links'::regclass, 'sepay_wallet_links_wallet_id_fkey'),
        ('public.sepay_webhook_endpoints'::regclass, 'sepay_webhook_endpoints_wallet_id_fkey'),
        ('public.sepay_webhook_events'::regclass, 'sepay_webhook_events_wallet_id_fkey'),
        ('public.wallet_interest_configs'::regclass, 'wallet_interest_configs_wallet_id_fkey'),
        ('public.wallet_transactions'::regclass, 'wallet_transactions_wallet_id_fkey'),
        ('public.workspace_role_wallet_whitelist'::regclass, 'workspace_role_wallet_whitelist_wallet_id_fkey')
    ) as wallet_fks(child_table, constraint_name)
    where not exists (
      select 1
      from pg_constraint
      where conname = wallet_fks.constraint_name
        and conrelid = wallet_fks.child_table
        and confrelid = 'private.workspace_wallets'::regclass
    )
  ),
  'all wallet child tables now reference private workspace wallets'
);

select ok(
  to_regclass('private.projects_wallets_pkey') is not null,
  'workspace wallets primary-key index moved with the private table'
);

select ok(
  to_regclass('private.idx_workspace_wallets_ws_id') is not null,
  'workspace wallets workspace index moved with the private table'
);

select ok(
  to_regclass('private.workspace_wallets_ws_id_idx') is not null,
  'workspace wallets duplicate workspace index moved with the private table'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'private.workspace_wallets'::regclass
      and tgname = 'audit_i_u_d'
      and not tgisinternal
  ),
  'workspace wallet audit trigger moved with the private table'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'private.workspace_wallets'::regclass
      and tgname = 'enforce_strict_text_field_limits'
      and not tgisinternal
  ),
  'workspace wallet strict text trigger moved with the private table'
);

select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.prokind <> 'a'
      and pg_get_functiondef(p.oid) ilike '%public.workspace_wallets%'
  ),
  'database functions no longer reference public workspace wallets'
);

select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.prokind <> 'a'
      and pg_get_functiondef(p.oid) ilike '%workspace_wallets%'
      and not exists (
        select 1
        from unnest(coalesce(p.proconfig, array[]::text[])) as config(value)
        where config.value = 'search_path=private, public, pg_temp'
      )
  ),
  'wallet-related functions resolve private before public in their search path'
);

set local role service_role;

insert into private.workspace_wallets (
  id,
  ws_id,
  name,
  type,
  currency
) values (
  '10000000-0000-0000-0000-000000000801',
  '00000000-0000-0000-0000-000000000000',
  'pgTAP private wallet',
  'STANDARD',
  'VND'
);

insert into public.wallet_transactions (
  id,
  wallet_id,
  amount,
  description
) values (
  '10000000-0000-0000-0000-000000000802',
  '10000000-0000-0000-0000-000000000801',
  1234,
  'pgTAP private wallet balance update'
);

reset role;

select ok(
  exists (
    select 1
    from private.workspace_wallets
    where id = '10000000-0000-0000-0000-000000000801'
      and balance = 1234
  ),
  'wallet transaction triggers update private workspace wallet balances'
);

select is(
  audit.get_ws_id(
    'wallet_transactions',
    jsonb_build_object(
      'wallet_id',
      '10000000-0000-0000-0000-000000000801'
    )
  ),
  '00000000-0000-0000-0000-000000000000'::uuid,
  'audit workspace lookup resolves wallet transactions through private wallets'
);

select ok(
  public.get_workspace_wallets_count(
    '00000000-0000-0000-0000-000000000000'
  ) >= 1,
  'legacy workspace wallet count RPC reads private wallets'
);

select * from finish();

rollback;
