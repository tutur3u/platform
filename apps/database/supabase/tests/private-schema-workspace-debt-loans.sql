begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(52);

select ok(
  to_regclass('public.workspace_debt_loans') is null,
  'workspace debt loans are no longer in the public schema'
);

select ok(
  to_regclass('public.workspace_debt_loan_transactions') is null,
  'workspace debt loan transactions are no longer in the public schema'
);

select ok(
  to_regclass('private.workspace_debt_loans') is not null,
  'workspace debt loans exist in the private schema'
);

select ok(
  to_regclass('private.workspace_debt_loan_transactions') is not null,
  'workspace debt loan transactions exist in the private schema'
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
      'private.workspace_debt_loans',
      privileges.privilege_name
    )
  ),
  'anon cannot select or mutate private workspace debt loans'
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
      'private.workspace_debt_loans',
      privileges.privilege_name
    )
  ),
  'authenticated cannot select or mutate private workspace debt loans'
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
      'private.workspace_debt_loans',
      privileges.privilege_name
    )
  ),
  'service role can select and mutate private workspace debt loans'
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
      'private.workspace_debt_loan_transactions',
      privileges.privilege_name
    )
  ),
  'anon cannot select or mutate private workspace debt loan transactions'
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
      'private.workspace_debt_loan_transactions',
      privileges.privilege_name
    )
  ),
  'authenticated cannot select or mutate private workspace debt loan transactions'
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
      'private.workspace_debt_loan_transactions',
      privileges.privilege_name
    )
  ),
  'service role can select and mutate private workspace debt loan transactions'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'private.workspace_debt_loans'::regclass
  ),
  'private workspace debt loans have RLS enabled'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'private.workspace_debt_loan_transactions'::regclass
  ),
  'private workspace debt loan transactions have RLS enabled'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename = 'workspace_debt_loans'
      and policyname = 'Service role can manage private debt loans'
  ),
  'private workspace debt loans have a service-role policy'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename = 'workspace_debt_loan_transactions'
      and policyname = 'Service role can manage private debt loan transactions'
  ),
  'private workspace debt loan transactions have a service-role policy'
);

select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename = 'workspace_debt_loans'
      and policyname in (
        'Users can view debt/loans in their workspaces',
        'Users can create debt/loans in their workspaces',
        'Users can update debt/loans in their workspaces',
        'Users can delete debt/loans in their workspaces'
      )
  ),
  'old public workspace debt loan policies were removed'
);

select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename = 'workspace_debt_loan_transactions'
      and policyname in (
        'Users can view debt/loan transactions in their workspaces',
        'Users can create debt/loan transactions in their workspaces',
        'Users can update debt/loan transactions in their workspaces',
        'Users can delete debt/loan transactions in their workspaces'
      )
  ),
  'old public workspace debt loan transaction policies were removed'
);

select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename in (
        'workspace_debt_loans',
        'workspace_debt_loan_transactions'
      )
      and (
        'authenticated' = any (roles)
        or 'anon' = any (roles)
        or 'public' = any (roles)
      )
  ),
  'private workspace debt tables have no direct anon/authenticated/public policy'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'workspace_debt_loans_ws_id_fkey'
      and conrelid = 'private.workspace_debt_loans'::regclass
      and confrelid = 'public.workspaces'::regclass
  ),
  'private workspace debt loans still reference public workspaces'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'workspace_debt_loans_wallet_id_fkey'
      and conrelid = 'private.workspace_debt_loans'::regclass
      and confrelid = 'public.workspace_wallets'::regclass
  ),
  'private workspace debt loans still reference public workspace wallets'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'workspace_debt_loan_transactions_debt_loan_id_fkey'
      and conrelid = 'private.workspace_debt_loan_transactions'::regclass
      and confrelid = 'private.workspace_debt_loans'::regclass
  ),
  'private workspace debt loan transactions reference private workspace debt loans'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'workspace_debt_loan_transactions_transaction_id_fkey'
      and conrelid = 'private.workspace_debt_loan_transactions'::regclass
      and confrelid = 'public.wallet_transactions'::regclass
  ),
  'private workspace debt loan transactions still reference public wallet transactions'
);

select ok(
  to_regclass('private.workspace_debt_loans_pkey') is not null,
  'workspace debt loans primary-key index moved with the private table'
);

select ok(
  to_regclass('private.idx_debt_loans_ws_id') is not null,
  'workspace debt loans workspace index moved with the private table'
);

select ok(
  to_regclass('private.idx_debt_loans_status') is not null,
  'workspace debt loans status index moved with the private table'
);

select ok(
  to_regclass('private.idx_debt_loans_type') is not null,
  'workspace debt loans type index moved with the private table'
);

select ok(
  to_regclass('private.idx_debt_loans_creator') is not null,
  'workspace debt loans creator index moved with the private table'
);

select ok(
  to_regclass('private.idx_debt_loans_wallet') is not null,
  'workspace debt loans wallet index moved with the private table'
);

select ok(
  to_regclass('private.idx_debt_loans_due_date') is not null,
  'workspace debt loans due-date index moved with the private table'
);

select ok(
  to_regclass('private.workspace_debt_loan_transactions_pkey') is not null,
  'workspace debt loan transactions primary-key index moved with the private table'
);

select ok(
  to_regclass('private.uq_debt_loan_transaction') is not null,
  'workspace debt loan transaction unique index moved with the private table'
);

select ok(
  to_regclass('private.idx_debt_loan_transactions_debt_loan_id') is not null,
  'workspace debt loan transaction debt-loan index moved with the private table'
);

select ok(
  to_regclass('private.idx_debt_loan_transactions_transaction_id') is not null,
  'workspace debt loan transaction wallet-transaction index moved with the private table'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'private.workspace_debt_loans'::regclass
      and tgname = 'trg_debt_loan_updated_at'
      and tgfoid = 'private.update_debt_loan_updated_at()'::regprocedure
      and not tgisinternal
  ),
  'private workspace debt loans keep the private updated-at trigger'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'private.workspace_debt_loan_transactions'::regclass
      and tgname = 'trg_update_debt_loan_totals'
      and tgfoid = 'private.update_debt_loan_totals()'::regprocedure
      and not tgisinternal
  ),
  'private workspace debt loan transactions keep the private totals trigger'
);

select ok(
  to_regprocedure('private.update_debt_loan_updated_at()') is not null,
  'private updated-at trigger function exists'
);

select ok(
  to_regprocedure('private.update_debt_loan_totals()') is not null,
  'private totals trigger function exists'
);

select ok(
  to_regprocedure('public.update_debt_loan_updated_at()') is null,
  'public updated-at trigger function was removed'
);

select ok(
  to_regprocedure('public.update_debt_loan_totals()') is null,
  'public totals trigger function was removed'
);

select ok(
  to_regprocedure('private.get_debt_loan_summary(uuid, uuid)') is not null,
  'private debt loan summary RPC exists'
);

select ok(
  to_regprocedure('private.get_debt_loans_with_balance(uuid, uuid, public.debt_loan_type, public.debt_loan_status)') is not null,
  'private debt loan list RPC exists'
);

select ok(
  to_regprocedure('private.get_debt_loan_with_balance(uuid, uuid, uuid)') is not null,
  'private debt loan detail RPC exists'
);

select ok(
  to_regprocedure('public.get_debt_loan_summary(uuid)') is null,
  'public debt loan summary RPC was removed'
);

select ok(
  to_regprocedure('public.get_debt_loans_with_balance(uuid, public.debt_loan_type, public.debt_loan_status)') is null,
  'public debt loan list RPC was removed'
);

select ok(
  not exists (
    select 1
    from pg_proc proc
    join pg_namespace ns
      on ns.oid = proc.pronamespace
    where ns.nspname = 'private'
      and proc.proname in (
        'get_debt_loan_summary',
        'get_debt_loans_with_balance',
        'get_debt_loan_with_balance',
        'update_debt_loan_totals'
      )
      and pg_get_functiondef(proc.oid) like '%public.workspace_debt_loans%'
  ),
  'private debt-loan functions do not reference public workspace debt loans'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('private.get_debt_loan_summary(uuid, uuid)'),
        ('private.get_debt_loans_with_balance(uuid, uuid, public.debt_loan_type, public.debt_loan_status)'),
        ('private.get_debt_loan_with_balance(uuid, uuid, uuid)')
    ) as functions(signature)
    where not has_function_privilege(
      'service_role',
      functions.signature,
      'execute'
    )
  ),
  'service role can execute private debt-loan RPCs'
);

select ok(
  public.has_workspace_permission(
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000001',
    'manage_finance'
  ),
  'root test user can manage finance for private debt loan RPC tests'
);

set local role service_role;

insert into public.workspace_wallets (
  id,
  ws_id,
  name,
  type,
  currency
) values (
  '10000000-0000-0000-0000-000000000701',
  '00000000-0000-0000-0000-000000000000',
  'pgTAP private debt wallet',
  'STANDARD',
  'VND'
);

insert into private.workspace_debt_loans (
  id,
  ws_id,
  name,
  description,
  counterparty,
  type,
  principal_amount,
  currency,
  start_date,
  wallet_id,
  creator_id
) values (
  '10000000-0000-0000-0000-000000000702',
  '00000000-0000-0000-0000-000000000000',
  'pgTAP private debt loan',
  'private schema debt loan test',
  'pgTAP',
  'debt',
  10000,
  'VND',
  current_date,
  '10000000-0000-0000-0000-000000000701',
  '00000000-0000-0000-0000-000000000001'
);

insert into public.wallet_transactions (
  id,
  wallet_id,
  amount,
  description
) values (
  '10000000-0000-0000-0000-000000000703',
  '10000000-0000-0000-0000-000000000701',
  2500,
  'pgTAP private debt payment'
);

insert into private.workspace_debt_loan_transactions (
  id,
  debt_loan_id,
  transaction_id,
  amount,
  is_interest,
  note
) values (
  '10000000-0000-0000-0000-000000000704',
  '10000000-0000-0000-0000-000000000702',
  '10000000-0000-0000-0000-000000000703',
  2500,
  false,
  'pgTAP private debt link'
);

reset role;

select ok(
  exists (
    select 1
    from private.workspace_debt_loans
    where id = '10000000-0000-0000-0000-000000000702'
      and total_paid = 2500
      and total_interest_paid = 0
  ),
  'service role can insert private debt loans and transaction links update cached totals'
);

select ok(
  exists (
    select 1
    from private.get_debt_loan_summary(
      '00000000-0000-0000-0000-000000000000',
      '00000000-0000-0000-0000-000000000001'
    ) summary
    where summary.total_debts >= 10000
      and summary.active_debt_count >= 1
      and summary.total_debt_remaining >= 7500
  ),
  'private debt loan summary RPC returns private debt loan totals'
);

select ok(
  exists (
    select 1
    from private.get_debt_loans_with_balance(
      '00000000-0000-0000-0000-000000000000',
      '00000000-0000-0000-0000-000000000001',
      'debt'::public.debt_loan_type,
      'active'::public.debt_loan_status
    ) debt_loan
    where debt_loan.id = '10000000-0000-0000-0000-000000000702'
      and debt_loan.remaining_balance = 7500
      and debt_loan.progress_percentage = 25.00
  ),
  'private debt loan list RPC returns private rows with calculated balances'
);

select ok(
  exists (
    select 1
    from private.get_debt_loan_with_balance(
      '00000000-0000-0000-0000-000000000000',
      '10000000-0000-0000-0000-000000000702',
      '00000000-0000-0000-0000-000000000001'
    ) debt_loan
    where debt_loan.id = '10000000-0000-0000-0000-000000000702'
      and debt_loan.remaining_balance = 7500
      and debt_loan.progress_percentage = 25.00
  ),
  'private debt loan detail RPC returns one private row with calculated balance'
);

select * from finish();

rollback;
