create extension if not exists pgtap with schema extensions;

begin;

select plan(7);

select throws_ok(
  $$ select private.assert_finance_chart_date_range(
    '2000-01-01'::timestamptz,
    '2026-06-01'::timestamptz,
    366
  ) $$,
  '22023',
  'Finance analytics date range cannot exceed 366 days',
  'private finance analytics guard rejects oversized ranges'
);

select throws_ok(
  $$ select private.assert_finance_chart_date_range(
    '2026-06-02'::timestamptz,
    '2026-06-01'::timestamptz,
    366
  ) $$,
  '22007',
  'Start date must be before or equal to end date',
  'private finance analytics guard rejects reversed ranges'
);

select lives_ok(
  $$ select private.assert_finance_chart_date_range(
    '2026-05-01'::timestamptz,
    '2026-06-01'::timestamptz,
    366
  ) $$,
  'private finance analytics guard accepts bounded ranges'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'private.assert_finance_chart_date_range(timestamp with time zone,timestamp with time zone,integer)',
    'execute'
  ),
  'authenticated cannot call the private finance date guard directly'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.get_balance_trend(uuid,timestamp with time zone,timestamp with time zone,boolean,integer)',
    'execute'
  ),
  'authenticated can still call the bounded public balance trend compatibility RPC'
);

select throws_ok(
  $$ select * from public.get_balance_trend(
    '00000000-0000-0000-0000-000000000001'::uuid,
    '2000-01-01'::timestamptz,
    '2026-06-01'::timestamptz,
    false,
    60
  ) $$,
  '22023',
  'Finance analytics date range cannot exceed 366 days',
  'public balance-trend RPC rejects oversized ranges before generating daily rows'
);

select throws_ok(
  $$ select public.get_income_expense_chart_summary(
    '00000000-0000-0000-0000-000000000001'::uuid,
    '2000-01-01'::timestamptz,
    '2026-06-01'::timestamptz,
    false,
    'daily'
  ) $$,
  '22023',
  'Finance analytics date range cannot exceed 366 days',
  'public income-expense summary RPC rejects oversized daily ranges'
);

select * from finish();

rollback;
