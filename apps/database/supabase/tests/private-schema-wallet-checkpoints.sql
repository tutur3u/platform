begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(48);

select ok(
  to_regclass('private.workspace_wallet_checkpoints') is not null,
  'wallet checkpoints exist in the private schema'
);

select ok(
  not exists (
    select 1
    from (
      values ('select'), ('insert'), ('update'), ('delete')
    ) as privileges(privilege_name)
    where has_table_privilege(
      'anon',
      'private.workspace_wallet_checkpoints',
      privileges.privilege_name
    )
  ),
  'anon cannot select or mutate private wallet checkpoints'
);

select ok(
  not exists (
    select 1
    from (
      values ('select'), ('insert'), ('update'), ('delete')
    ) as privileges(privilege_name)
    where has_table_privilege(
      'authenticated',
      'private.workspace_wallet_checkpoints',
      privileges.privilege_name
    )
  ),
  'authenticated cannot select or mutate private wallet checkpoints'
);

select ok(
  not exists (
    select 1
    from (
      values ('select'), ('insert'), ('update'), ('delete')
    ) as privileges(privilege_name)
    where not has_table_privilege(
      'service_role',
      'private.workspace_wallet_checkpoints',
      privileges.privilege_name
    )
  ),
  'service role can select and mutate private wallet checkpoints'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'private.workspace_wallet_checkpoints'::regclass
  ),
  'private wallet checkpoints have RLS enabled'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename = 'workspace_wallet_checkpoints'
      and policyname = 'Service role can manage private workspace wallet checkpoints'
  ),
  'private wallet checkpoints have a service-role policy'
);

select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename = 'workspace_wallet_checkpoints'
      and (
        'authenticated' = any (roles)
        or 'anon' = any (roles)
        or 'public' = any (roles)
      )
  ),
  'private wallet checkpoints have no direct anon/authenticated/public policy'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'workspace_wallet_checkpoints_wallet_id_fkey'
      and conrelid = 'private.workspace_wallet_checkpoints'::regclass
      and confrelid = 'private.workspace_wallets'::regclass
      and confdeltype = 'c'
  ),
  'wallet checkpoints cascade when their wallet is deleted'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'workspace_wallet_checkpoints_currency_fkey'
      and conrelid = 'private.workspace_wallet_checkpoints'::regclass
      and confrelid = 'private.currencies'::regclass
  ),
  'wallet checkpoints snapshot a valid private currency'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'workspace_wallet_checkpoints_created_by_fkey'
      and conrelid = 'private.workspace_wallet_checkpoints'::regclass
      and confrelid = 'public.users'::regclass
      and confdeltype = 'n'
  ),
  'wallet checkpoints retain a nullable actor reference'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'workspace_wallet_checkpoints_wallet_checked_at_key'
      and conrelid = 'private.workspace_wallet_checkpoints'::regclass
  ),
  'wallet checkpoints reject exact duplicate wallet timestamps'
);

select ok(
  to_regclass(
    'private.workspace_wallet_checkpoints_wallet_checked_at_desc_idx'
  ) is not null,
  'wallet checkpoints have a wallet timeline index'
);

select ok(
  to_regclass('private.workspace_wallet_checkpoints_created_by_idx') is not null,
  'wallet checkpoints have an actor index'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'private.workspace_wallet_checkpoints'::regclass
      and tgname = 'workspace_wallet_checkpoints_updated_at'
      and not tgisinternal
  ),
  'wallet checkpoints touch updated_at on updates'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'private.workspace_wallet_checkpoints'::regclass
      and tgname = 'audit_i_u_d'
      and not tgisinternal
  ),
  'wallet checkpoints are audit tracked'
);

select ok(
  has_function_privilege(
    'service_role',
    'private.get_wallet_ledger_balance_at(uuid,timestamp with time zone)',
    'execute'
  ),
  'service role can calculate wallet ledger balance at checkpoint time'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'private.get_wallet_ledger_balance_at(uuid,timestamp with time zone)',
    'execute'
  ),
  'authenticated cannot call private checkpoint balance helper directly'
);

select ok(
  has_function_privilege(
    'service_role',
    'private.list_wallet_checkpoint_intervals(uuid,integer)',
    'execute'
  ),
  'service role can list private checkpoint intervals'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'private.create_workspace_wallet_checkpoints_batch(uuid,uuid,timestamp with time zone,jsonb)',
    'execute'
  ),
  'authenticated cannot call private batch checkpoint helper directly'
);

set local role service_role;

insert into private.workspace_wallets (
  id,
  ws_id,
  name,
  type,
  currency,
  balance
) values
  (
    '20000000-0000-0000-0000-000000000801',
    '00000000-0000-0000-0000-000000000000',
    'pgTAP checkpoint VND wallet',
    'STANDARD',
    'VND',
    0
  ),
  (
    '20000000-0000-0000-0000-000000000802',
    '00000000-0000-0000-0000-000000000000',
    'pgTAP checkpoint USD wallet',
    'STANDARD',
    'USD',
    0
  ),
  (
    '20000000-0000-0000-0000-000000000803',
    '00000000-0000-0000-0000-000000000000',
    'pgTAP checkpoint empty wallet',
    'STANDARD',
    'VND',
    0
  );

insert into public.wallet_transactions (
  id,
  wallet_id,
  amount,
  description,
  taken_at
) values
  (
    '20000000-0000-0000-0000-000000000811',
    '20000000-0000-0000-0000-000000000801',
    100.125,
    'checkpoint high precision income',
    '2026-06-10 23:30:00+00'
  ),
  (
    '20000000-0000-0000-0000-000000000812',
    '20000000-0000-0000-0000-000000000801',
    -25.125,
    'checkpoint same timestamp expense',
    '2026-06-11 01:00:00+00'
  ),
  (
    '20000000-0000-0000-0000-000000000813',
    '20000000-0000-0000-0000-000000000801',
    0.333333,
    'checkpoint same timestamp income',
    '2026-06-11 01:00:00+00'
  ),
  (
    '20000000-0000-0000-0000-000000000814',
    '20000000-0000-0000-0000-000000000801',
    -10.333333,
    'checkpoint precise expense',
    '2026-06-11 02:00:00+00'
  ),
  (
    '20000000-0000-0000-0000-000000000815',
    '20000000-0000-0000-0000-000000000801',
    5.5,
    'checkpoint timezone boundary income',
    '2026-06-12 00:30:00+07'
  ),
  (
    '20000000-0000-0000-0000-000000000816',
    '20000000-0000-0000-0000-000000000802',
    -42.75,
    'checkpoint negative balance',
    '2026-06-11 08:00:00+00'
  );

select is(
  private.get_wallet_ledger_balance_at(
    '20000000-0000-0000-0000-000000000801',
    '2026-06-10 23:00:00+00'
  ),
  0::numeric,
  'ledger balance before first transaction is zero'
);

select is(
  private.get_wallet_ledger_balance_at(
    '20000000-0000-0000-0000-000000000801',
    '2026-06-10 23:30:00+00'
  ),
  100.125::numeric,
  'ledger balance includes a transaction at the exact checkpoint time'
);

select is(
  private.get_wallet_ledger_balance_at(
    '20000000-0000-0000-0000-000000000801',
    '2026-06-11 01:00:00+00'
  ),
  75.333333::numeric,
  'ledger balance includes all transactions sharing the checkpoint timestamp'
);

select is(
  private.get_wallet_ledger_balance_at(
    '20000000-0000-0000-0000-000000000801',
    '2026-06-12 00:30:00+07'
  ),
  70.5::numeric,
  'ledger balance respects timezone-equivalent checkpoint boundaries'
);

select is(
  private.get_wallet_ledger_balance_at(
    '20000000-0000-0000-0000-000000000802',
    '2026-06-12 00:00:00+00'
  ),
  -42.75::numeric,
  'ledger balance supports negative wallet balances'
);

select is(
  private.get_wallet_ledger_balance_at(
    '20000000-0000-0000-0000-000000000803',
    '2026-06-12 00:00:00+00'
  ),
  0::numeric,
  'ledger balance supports empty zero-balance wallets'
);

select is(
  (
    select ledger_delta
    from private.get_wallet_checkpoint_interval_delta(
      '20000000-0000-0000-0000-000000000801',
      '2026-06-10 23:00:00+00',
      '2026-06-10 23:30:00+00'
    )
  ),
  100.125::numeric,
  'income-only interval ledger delta is exact'
);

select is(
  (
    select ledger_delta
    from private.get_wallet_checkpoint_interval_delta(
      '20000000-0000-0000-0000-000000000801',
      '2026-06-11 01:00:00+00',
      '2026-06-11 02:00:00+00'
    )
  ),
  -10.333333::numeric,
  'expense-only interval ledger delta is exact'
);

select is(
  (
    select ledger_delta
    from private.get_wallet_checkpoint_interval_delta(
      '20000000-0000-0000-0000-000000000801',
      '2026-06-10 23:30:00+00',
      '2026-06-11 01:00:00+00'
    )
  ),
  -24.791667::numeric,
  'mixed same-timestamp interval ledger delta is exact'
);

select is(
  (
    select transaction_count
    from private.get_wallet_checkpoint_interval_delta(
      '20000000-0000-0000-0000-000000000801',
      '2026-06-10 23:30:00+00',
      '2026-06-11 01:00:00+00'
    )
  ),
  2::bigint,
  'mixed interval counts all same-timestamp transactions'
);

insert into private.workspace_wallet_checkpoints (
  id,
  wallet_id,
  checked_at,
  actual_balance,
  ledger_balance,
  currency,
  note
) values
  (
    '20000000-0000-0000-0000-000000000821',
    '20000000-0000-0000-0000-000000000801',
    '2026-06-10 23:30:00+00',
    100.125,
    private.get_wallet_ledger_balance_at(
      '20000000-0000-0000-0000-000000000801',
      '2026-06-10 23:30:00+00'
    ),
    'VND',
    'first clean checkpoint'
  ),
  (
    '20000000-0000-0000-0000-000000000822',
    '20000000-0000-0000-0000-000000000801',
    '2026-06-11 01:00:00+00',
    75.333333,
    private.get_wallet_ledger_balance_at(
      '20000000-0000-0000-0000-000000000801',
      '2026-06-11 01:00:00+00'
    ),
    'VND',
    'same-day clean checkpoint'
  ),
  (
    '20000000-0000-0000-0000-000000000823',
    '20000000-0000-0000-0000-000000000801',
    '2026-06-11 02:00:00+00',
    65,
    private.get_wallet_ledger_balance_at(
      '20000000-0000-0000-0000-000000000801',
      '2026-06-11 02:00:00+00'
    ),
    'VND',
    'adjacent clean checkpoint'
  ),
  (
    '20000000-0000-0000-0000-000000000824',
    '20000000-0000-0000-0000-000000000801',
    '2026-06-12 00:30:00+07',
    71.5,
    private.get_wallet_ledger_balance_at(
      '20000000-0000-0000-0000-000000000801',
      '2026-06-12 00:30:00+07'
    ),
    'VND',
    'positive variance checkpoint'
  ),
  (
    '20000000-0000-0000-0000-000000000825',
    '20000000-0000-0000-0000-000000000801',
    '2026-06-12 02:00:00+07',
    70.5,
    private.get_wallet_ledger_balance_at(
      '20000000-0000-0000-0000-000000000801',
      '2026-06-12 02:00:00+07'
    ),
    'VND',
    'negative variance checkpoint'
  );

select is(
  (
    select count(*)
    from private.list_wallet_checkpoint_intervals(
      '20000000-0000-0000-0000-000000000801',
      50
    )
  ),
  4::bigint,
  'adjacent checkpoints produce one fewer interval than checkpoints'
);

select is(
  (
    select interval_variance
    from private.list_wallet_checkpoint_intervals(
      '20000000-0000-0000-0000-000000000801',
      50
    )
    where end_checkpoint_id = '20000000-0000-0000-0000-000000000822'
  ),
  0::numeric,
  'clean interval variance is zero'
);

select is(
  (
    select ledger_delta
    from private.list_wallet_checkpoint_intervals(
      '20000000-0000-0000-0000-000000000801',
      50
    )
    where end_checkpoint_id = '20000000-0000-0000-0000-000000000823'
  ),
  -10.333333::numeric,
  'adjacent checkpoint interval uses the open-left closed-right transaction window'
);

select is(
  (
    select interval_variance
    from private.list_wallet_checkpoint_intervals(
      '20000000-0000-0000-0000-000000000801',
      50
    )
    where end_checkpoint_id = '20000000-0000-0000-0000-000000000824'
  ),
  1::numeric,
  'missing ledger amount produces a positive interval variance'
);

select is(
  (
    select interval_variance
    from private.list_wallet_checkpoint_intervals(
      '20000000-0000-0000-0000-000000000801',
      50
    )
    where end_checkpoint_id = '20000000-0000-0000-0000-000000000825'
  ),
  -1::numeric,
  'extra ledger amount produces a negative interval variance'
);

select is(
  (
    select end_checked_at
    from private.list_wallet_checkpoint_intervals(
      '20000000-0000-0000-0000-000000000801',
      1
    )
  ),
  '2026-06-12 02:00:00+07'::timestamp with time zone,
  'interval summary honors limit and newest-first ordering'
);

select throws_ok(
  $$ insert into private.workspace_wallet_checkpoints (
    wallet_id,
    checked_at,
    actual_balance,
    ledger_balance,
    currency
  ) values (
    '20000000-0000-0000-0000-000000000801',
    '2026-06-10 23:30:00+00',
    100.125,
    100.125,
    'VND'
  ) $$,
  '23505',
  'duplicate key value violates unique constraint "workspace_wallet_checkpoints_wallet_checked_at_key"',
  'exact duplicate wallet checkpoint timestamps are rejected'
);

select throws_ok(
  $$ insert into private.workspace_wallet_checkpoints (
    wallet_id,
    checked_at,
    actual_balance,
    ledger_balance,
    currency,
    note
  ) values (
    '20000000-0000-0000-0000-000000000803',
    '2026-06-12 00:00:00+00',
    0,
    0,
    'VND',
    repeat('x', 501)
  ) $$,
  '23514',
  'new row for relation "workspace_wallet_checkpoints" violates check constraint "workspace_wallet_checkpoints_note_length_check"',
  'notes longer than 500 characters are rejected'
);

insert into private.workspace_wallet_checkpoints (
  id,
  wallet_id,
  checked_at,
  actual_balance,
  ledger_balance,
  currency
) values (
  '20000000-0000-0000-0000-000000000831',
  '20000000-0000-0000-0000-000000000803',
  '2026-06-12 04:00:00+00',
  0,
  0,
  'VND'
);

delete from private.workspace_wallets
where id = '20000000-0000-0000-0000-000000000803';

select is(
  (
    select count(*)
    from private.workspace_wallet_checkpoints
    where wallet_id = '20000000-0000-0000-0000-000000000803'
  ),
  0::bigint,
  'checkpoint rows are removed when their wallet is removed'
);

select is(
  (
    select count(*)
    from private.create_workspace_wallet_checkpoints_batch(
      '00000000-0000-0000-0000-000000000000',
      null,
      '2026-06-13 00:00:00+07',
      jsonb_build_array(
        jsonb_build_object(
          'wallet_id',
          '20000000-0000-0000-0000-000000000801',
          'actual_balance',
          70.5,
          'note',
          'batch VND checkpoint'
        ),
        jsonb_build_object(
          'wallet_id',
          '20000000-0000-0000-0000-000000000802',
          'actual_balance',
          -42.75,
          'note',
          'batch USD checkpoint'
        )
      )
    )
  ),
  2::bigint,
  'batch helper saves mixed-currency checkpoints in one call'
);

select is(
  (
    select count(*)
    from private.workspace_wallet_checkpoints
    where checked_at = '2026-06-13 00:00:00+07'
      and wallet_id in (
        '20000000-0000-0000-0000-000000000801',
        '20000000-0000-0000-0000-000000000802'
      )
  ),
  2::bigint,
  'successful batch checkpoints persist all rows'
);

select is(
  (
    select sum(ledger_balance)
    from private.workspace_wallet_checkpoints
    where checked_at = '2026-06-13 00:00:00+07'
      and wallet_id in (
        '20000000-0000-0000-0000-000000000801',
        '20000000-0000-0000-0000-000000000802'
      )
  ),
  27.75::numeric,
  'batch helper stores exact ledger balances for each wallet'
);

select is(
  (
    select count(*)
    from private.workspace_wallet_checkpoints
  ),
  7::bigint,
  'checkpoint count before failed batches is stable'
);

select throws_ok(
  $$ select *
    from private.create_workspace_wallet_checkpoints_batch(
      '00000000-0000-0000-0000-000000000000',
      null,
      '2026-06-14 00:00:00+07',
      jsonb_build_array(
        jsonb_build_object(
          'wallet_id',
          '20000000-0000-0000-0000-000000000801',
          'actual_balance',
          70.5
        ),
        jsonb_build_object(
          'wallet_id',
          '20000000-0000-0000-0000-000000000801',
          'actual_balance',
          70.5
        )
      )
    ) $$,
  '23505',
  'duplicate wallet checkpoint entries are not allowed',
  'batch helper rejects duplicate wallet IDs'
);

select is(
  (
    select count(*)
    from private.workspace_wallet_checkpoints
  ),
  7::bigint,
  'duplicate wallet batch rolls back without partial rows'
);

select throws_ok(
  $$ select *
    from private.create_workspace_wallet_checkpoints_batch(
      '00000000-0000-0000-0000-000000000000',
      null,
      '2026-06-14 00:00:00+07',
      jsonb_build_array(
        jsonb_build_object(
          'wallet_id',
          '20000000-0000-0000-0000-000000000801',
          'actual_balance',
          70.5
        ),
        jsonb_build_object(
          'wallet_id',
          '20000000-0000-0000-0000-000000000999',
          'actual_balance',
          0
        )
      )
    ) $$,
  'P0002',
  'wallet 20000000-0000-0000-0000-000000000999 not found in workspace 00000000-0000-0000-0000-000000000000',
  'batch helper rejects inaccessible wallets'
);

select is(
  (
    select count(*)
    from private.workspace_wallet_checkpoints
  ),
  7::bigint,
  'invalid wallet batch rolls back without partial rows'
);

select throws_ok(
  $$ select *
    from private.create_workspace_wallet_checkpoints_batch(
      '00000000-0000-0000-0000-000000000000',
      null,
      '2026-06-13 00:00:00+07',
      jsonb_build_array(
        jsonb_build_object(
          'wallet_id',
          '20000000-0000-0000-0000-000000000801',
          'actual_balance',
          70.5
        )
      )
    ) $$,
  '23505',
  'duplicate key value violates unique constraint "workspace_wallet_checkpoints_wallet_checked_at_key"',
  'batch helper rejects existing duplicate wallet timestamps'
);

select is(
  (
    select count(*)
    from private.workspace_wallet_checkpoints
  ),
  7::bigint,
  'existing duplicate timestamp batch rolls back without partial rows'
);

reset role;

select * from finish();

rollback;
