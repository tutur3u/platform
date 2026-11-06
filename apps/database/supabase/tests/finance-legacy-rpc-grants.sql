begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(24);

create function pg_temp.flr_id(n integer) returns uuid
language sql immutable
as $$ select ('00009033-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;
-- Anonymous assertions must reach the RPC rather than fail in the ID fixture.
grant execute on function pg_temp.flr_id(integer) to anon;

insert into auth.users (id) values (pg_temp.flr_id(1)) on conflict (id) do nothing;
insert into public.users (id) values (pg_temp.flr_id(1)) on conflict (id) do nothing;
insert into public.workspaces (id, name, personal, creator_id)
values (pg_temp.flr_id(10), 'Legacy finance workspace', false, pg_temp.flr_id(1));
insert into public.workspace_members (ws_id, user_id, type)
values (pg_temp.flr_id(10), pg_temp.flr_id(1), 'MEMBER')
on conflict (ws_id, user_id) do update set type = excluded.type;
insert into private.workspace_wallets (id, ws_id, name)
values (pg_temp.flr_id(20), pg_temp.flr_id(10), 'Synthetic wallet');
insert into public.wallet_transactions (wallet_id, amount, taken_at)
values
  (pg_temp.flr_id(20), 100, now() - interval '1 day'),
  (pg_temp.flr_id(20), -40, now() - interval '1 day');

select ok(
  not has_function_privilege('anon', 'public.get_daily_income_expense(uuid,integer,boolean)', 'execute')
  and not has_function_privilege('authenticated', 'public.get_daily_income_expense(uuid,integer,boolean)', 'execute')
  and has_function_privilege('service_role', 'public.get_daily_income_expense(uuid,integer,boolean)', 'execute'),
  'get_daily_income_expense is service_role only'
);
select ok(
  not has_function_privilege('anon', 'public.get_monthly_income_expense(uuid,integer,boolean)', 'execute')
  and not has_function_privilege('authenticated', 'public.get_monthly_income_expense(uuid,integer,boolean)', 'execute')
  and has_function_privilege('service_role', 'public.get_monthly_income_expense(uuid,integer,boolean)', 'execute'),
  'get_monthly_income_expense is service_role only'
);
select ok(
  not has_function_privilege('anon', 'public.get_wallet_balance_at_date(uuid,timestamptz,boolean)', 'execute')
  and not has_function_privilege('authenticated', 'public.get_wallet_balance_at_date(uuid,timestamptz,boolean)', 'execute')
  and has_function_privilege('service_role', 'public.get_wallet_balance_at_date(uuid,timestamptz,boolean)', 'execute'),
  'get_wallet_balance_at_date is service_role only'
);
select ok(
  not has_function_privilege('anon', 'public.get_finance_invoice_products_by_workspace(uuid,integer,integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.get_finance_invoice_products_by_workspace(uuid,integer,integer)', 'execute')
  and has_function_privilege('service_role', 'public.get_finance_invoice_products_by_workspace(uuid,integer,integer)', 'execute'),
  'get_finance_invoice_products_by_workspace is service_role only'
);
select ok(
  not has_function_privilege('anon', 'public.get_finance_invoice_promotions_by_workspace(uuid,integer,integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.get_finance_invoice_promotions_by_workspace(uuid,integer,integer)', 'execute')
  and has_function_privilege('service_role', 'public.get_finance_invoice_promotions_by_workspace(uuid,integer,integer)', 'execute'),
  'get_finance_invoice_promotions_by_workspace is service_role only'
);
select ok(
  not has_function_privilege('anon', 'public.get_finance_invoice_user_groups_by_workspace(uuid,integer,integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.get_finance_invoice_user_groups_by_workspace(uuid,integer,integer)', 'execute')
  and has_function_privilege('service_role', 'public.get_finance_invoice_user_groups_by_workspace(uuid,integer,integer)', 'execute'),
  'get_finance_invoice_user_groups_by_workspace is service_role only'
);
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  format('select count(*) from public.get_daily_income_expense(%L::uuid, 7, true)', pg_temp.flr_id(10)),
  '42501', null, 'anon cannot call get_daily_income_expense'
);
select throws_ok(
  format('select count(*) from public.get_monthly_income_expense(%L::uuid, 2, true)', pg_temp.flr_id(10)),
  '42501', null, 'anon cannot call get_monthly_income_expense'
);
select throws_ok(
  format('select public.get_wallet_balance_at_date(%L::uuid, now(), true)', pg_temp.flr_id(10)),
  '42501', null, 'anon cannot call get_wallet_balance_at_date'
);
select throws_ok(
  format('select count(*) from public.get_finance_invoice_products_by_workspace(%L::uuid, 0, 10)', pg_temp.flr_id(10)),
  '42501', null, 'anon cannot call get_finance_invoice_products_by_workspace'
);
select throws_ok(
  format('select count(*) from public.get_finance_invoice_promotions_by_workspace(%L::uuid, 0, 10)', pg_temp.flr_id(10)),
  '42501', null, 'anon cannot call get_finance_invoice_promotions_by_workspace'
);
select throws_ok(
  format('select count(*) from public.get_finance_invoice_user_groups_by_workspace(%L::uuid, 0, 10)', pg_temp.flr_id(10)),
  '42501', null, 'anon cannot call get_finance_invoice_user_groups_by_workspace'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claims', format('{"role":"authenticated","sub":"%s"}', pg_temp.flr_id(1)), true);
select throws_ok(
  format('select count(*) from public.get_daily_income_expense(%L::uuid, 7, true)', pg_temp.flr_id(10)),
  '42501', null, 'authenticated cannot call get_daily_income_expense'
);
select throws_ok(
  format('select count(*) from public.get_monthly_income_expense(%L::uuid, 2, true)', pg_temp.flr_id(10)),
  '42501', null, 'authenticated cannot call get_monthly_income_expense'
);
select throws_ok(
  format('select public.get_wallet_balance_at_date(%L::uuid, now(), true)', pg_temp.flr_id(10)),
  '42501', null, 'authenticated cannot call get_wallet_balance_at_date'
);
select throws_ok(
  format('select count(*) from public.get_finance_invoice_products_by_workspace(%L::uuid, 0, 10)', pg_temp.flr_id(10)),
  '42501', null, 'authenticated cannot call get_finance_invoice_products_by_workspace'
);
select throws_ok(
  format('select count(*) from public.get_finance_invoice_promotions_by_workspace(%L::uuid, 0, 10)', pg_temp.flr_id(10)),
  '42501', null, 'authenticated cannot call get_finance_invoice_promotions_by_workspace'
);
select throws_ok(
  format('select count(*) from public.get_finance_invoice_user_groups_by_workspace(%L::uuid, 0, 10)', pg_temp.flr_id(10)),
  '42501', null, 'authenticated cannot call get_finance_invoice_user_groups_by_workspace'
);
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((select public.get_wallet_balance_at_date(pg_temp.flr_id(10), now(), true)), 60::numeric, 'service_role reads the balance at a date');
select is((select count(*) from public.get_daily_income_expense(pg_temp.flr_id(10), 7, true)) > 0, true, 'service_role reads daily income/expense');
select is((select count(*) from public.get_monthly_income_expense(pg_temp.flr_id(10), 2, true)) > 0, true, 'service_role reads monthly income/expense');
select lives_ok(
  format('select count(*) from public.get_finance_invoice_products_by_workspace(%L::uuid, 0, 10)', pg_temp.flr_id(10)),
  'service_role can call get_finance_invoice_products_by_workspace'
);
select lives_ok(
  format('select count(*) from public.get_finance_invoice_promotions_by_workspace(%L::uuid, 0, 10)', pg_temp.flr_id(10)),
  'service_role can call get_finance_invoice_promotions_by_workspace'
);
select lives_ok(
  format('select count(*) from public.get_finance_invoice_user_groups_by_workspace(%L::uuid, 0, 10)', pg_temp.flr_id(10)),
  'service_role can call get_finance_invoice_user_groups_by_workspace'
);
reset role;

select * from finish();

rollback;
