-- Months before a student's first explicit-month invoice keep the legacy
-- paid-through cutoff; gaps after it stay pending (see subscription-coverage.sql).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
set local timezone = 'UTC';
select plan(16);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
insert into public.workspaces(id, name, personal, creator_id) values ('00000000-0000-4000-8000-000000098001', 'Legacy floor fixture', false, '00000000-0000-0000-0000-000000000001');
insert into private.workspace_wallets(id, ws_id, name) values ('00000000-0000-4000-8000-000000098002', '00000000-0000-4000-8000-000000098001', 'Legacy floor wallet');
insert into public.transaction_categories(id, ws_id, name, is_expense) values ('00000000-0000-4000-8000-000000098003', '00000000-0000-4000-8000-000000098001', 'Tuition', false);
insert into public.workspace_user_groups(id, ws_id, name, starting_date) values ('00000000-0000-4000-8000-000000098005', '00000000-0000-4000-8000-000000098001', 'Legacy floor class', date_trunc('month', current_date) - interval '5 months');
insert into private.workspace_user_group_sessions(ws_id, group_id, starts_at, ends_at)
select '00000000-0000-4000-8000-000000098001', '00000000-0000-4000-8000-000000098005', month + interval '4 days 12 hours', month + interval '4 days 13 hours'
from generate_series(date_trunc('month', current_date) - interval '5 months', date_trunc('month', current_date), interval '1 month') month;

-- Students: A legacy + current explicit month, B legacy + explicit gap,
-- C explicit only, D legacy cutoff at Ho Chi Minh midnight, E explicit month older than the cutoff,
-- F reported receipt shape (legacy history, then exact-month invoices for last and this month,
-- issued mid-month), G a standard invoice with no class or months.
insert into public.workspace_configs(id, ws_id, value)
values ('INVOICE_USE_ATTENDANCE_BASED_CALCULATION', '00000000-0000-4000-8000-000000098001', 'false');
insert into public.workspace_users(id, ws_id, full_name)
select ('00000000-0000-4000-8000-0000000981' || n)::uuid, '00000000-0000-4000-8000-000000098001', 'Student ' || n
from unnest(array['0A','0B','0C','0D','0E','0F','01']) n;
insert into public.workspace_user_groups_users(user_id, group_id, role, created_at)
select ('00000000-0000-4000-8000-0000000981' || n)::uuid, '00000000-0000-4000-8000-000000098005', 'STUDENT', date_trunc('month', current_date) - interval '5 months'
from unnest(array['0A','0B','0D','0E','0F']) n;
insert into public.workspace_user_groups_users(user_id, group_id, role, created_at)
values ('00000000-0000-4000-8000-000000098101', '00000000-0000-4000-8000-000000098005', 'STUDENT', date_trunc('month', current_date) - interval '1 month');
insert into public.workspace_user_groups_users(user_id, group_id, role, created_at)
values ('00000000-0000-4000-8000-00000009810c', '00000000-0000-4000-8000-000000098005', 'STUDENT', date_trunc('month', current_date) - interval '2 months');

create temporary table fixture_invoices(id uuid, customer text, valid_until timestamptz, months date[]) on commit drop;
insert into fixture_invoices values
  ('00000000-0000-4000-8000-0000000982a1', '0A', date_trunc('month', current_date) - interval '2 months', null),
  ('00000000-0000-4000-8000-0000000982a2', '0A', null, array[date_trunc('month', current_date)::date]),
  ('00000000-0000-4000-8000-0000000982b1', '0B', date_trunc('month', current_date) - interval '3 months', null),
  ('00000000-0000-4000-8000-0000000982b2', '0B', null, array[(date_trunc('month', current_date) - interval '2 months')::date, date_trunc('month', current_date)::date]),
  ('00000000-0000-4000-8000-0000000982c2', '0C', null, array[date_trunc('month', current_date)::date]),
  ('00000000-0000-4000-8000-0000000982d1', '0D', (date_trunc('month', current_date)::date::text || ' 00:00:00+07')::timestamptz, null),
  ('00000000-0000-4000-8000-0000000982e1', '0E', date_trunc('month', current_date), null),
  ('00000000-0000-4000-8000-0000000982e2', '0E', null, array[(date_trunc('month', current_date) - interval '2 months')::date]),
  ('00000000-0000-4000-8000-0000000982f1', '0F', date_trunc('month', current_date) - interval '2 months', null),
  ('00000000-0000-4000-8000-0000000982f2', '0F', null, array[(date_trunc('month', current_date) - interval '1 month')::date]),
  ('00000000-0000-4000-8000-0000000982f3', '0F', null, array[date_trunc('month', current_date)::date]);
insert into public.finance_invoices(id, ws_id, wallet_id, category_id, customer_id, price, paid_amount, completed_at, valid_until, subscription_months)
select id, '00000000-0000-4000-8000-000000098001', '00000000-0000-4000-8000-000000098002', '00000000-0000-4000-8000-000000098003',
  ('00000000-0000-4000-8000-0000000981' || customer)::uuid, 100, 100,
  case when customer = '0F' and months is not null
    then (date_trunc('month', current_date)::date - case when id::text like '%f2' then interval '1 month' else interval '0' end + interval '16 days 10 hours') at time zone 'Asia/Ho_Chi_Minh'
    else now() end,
  valid_until, months
from fixture_invoices;
insert into public.finance_invoice_user_groups(invoice_id, user_group_id)
select id, '00000000-0000-4000-8000-000000098005' from fixture_invoices;
-- A standard (non-subscription) invoice: legacy-looking cutoff, but no class link or months.
insert into public.finance_invoices(id, ws_id, wallet_id, category_id, customer_id, price, paid_amount, completed_at, valid_until)
values ('00000000-0000-4000-8000-0000000982c9', '00000000-0000-4000-8000-000000098001', '00000000-0000-4000-8000-000000098002', '00000000-0000-4000-8000-000000098003',
  '00000000-0000-4000-8000-000000098101', 100, 100, now(), now() + interval '30 days');

create temporary table pending on commit drop as
select user_id, month from public.get_pending_invoices_base('00000000-0000-4000-8000-000000098001', false);

select is((select count(*)::int from pending where user_id = '00000000-0000-4000-8000-00000009810a'), 0,
  'A: an explicit current-month payment does not reopen months settled by the legacy cutoff');
select ok(not exists(select 1 from pending where user_id = '00000000-0000-4000-8000-00000009810a' and month = to_char(current_date, 'YYYY-MM')),
  'A: the explicitly paid current month is not pending');
select is((select array_agg(month order by month) from pending where user_id = '00000000-0000-4000-8000-00000009810b'),
  array[to_char(current_date - interval '1 month', 'YYYY-MM')],
  'B: a gap after the first explicit month stays pending');
select ok(not exists(select 1 from pending where user_id = '00000000-0000-4000-8000-00000009810b' and month < to_char(current_date - interval '2 months', 'YYYY-MM')),
  'B: months before the first explicit month follow the legacy cutoff');
select is((select array_agg(month order by month) from pending where user_id = '00000000-0000-4000-8000-00000009810c'),
  array[to_char(current_date - interval '2 months', 'YYYY-MM'), to_char(current_date - interval '1 month', 'YYYY-MM')],
  'C: without a legacy invoice, unpaid months since joining stay pending');
select is((select array_agg(month order by month) from pending where user_id = '00000000-0000-4000-8000-00000009810d'),
  array[to_char(current_date, 'YYYY-MM')],
  'D: a legacy cutoff at Ho Chi Minh midnight settles the previous civil month');
select is((select array_agg(month order by month) from pending where user_id = '00000000-0000-4000-8000-00000009810e'),
  array[to_char(current_date, 'YYYY-MM')],
  'E: an explicit month older than the legacy cutoff does not move the start earlier');
select is((select count(*)::int from pending where user_id = '00000000-0000-4000-8000-00000009810f'), 0,
  'F: reported shape - an exact-month payment for this month clears the class row instead of reopening legacy history');
select is((select array_agg(month order by month) from pending where user_id = '00000000-0000-4000-8000-000000098101'),
  array[to_char(current_date - interval '1 month', 'YYYY-MM'), to_char(current_date, 'YYYY-MM')],
  'G: a standard invoice without a class or months never affects pending tuition');

-- The Pending tab shows one row per student and class listing every owed month, oldest first.
create temporary table pending_rows on commit drop as
select user_id, months_owed from public.get_pending_invoices('00000000-0000-4000-8000-000000098001');
select is((select months_owed from pending_rows where user_id = '00000000-0000-4000-8000-00000009810f'), null,
  'F: the Pending tab has no row for the reported shape');
select is((select months_owed from pending_rows where user_id = '00000000-0000-4000-8000-00000009810a'), null,
  'A: the Pending tab has no row once legacy history and the current month are settled');
select is((select months_owed from pending_rows where user_id = '00000000-0000-4000-8000-00000009810b'),
  to_char(current_date - interval '1 month', 'YYYY-MM'),
  'B: the Pending row lists only the real gap');
select is((select months_owed from pending_rows where user_id = '00000000-0000-4000-8000-00000009810c'),
  to_char(current_date - interval '2 months', 'YYYY-MM') || ', ' || to_char(current_date - interval '1 month', 'YYYY-MM'),
  'C: the Pending row lists every owed month, oldest first');

update public.finance_invoices set completed_at = null where id = '00000000-0000-4000-8000-0000000982a2';
select is((select array_agg(month order by month) from public.get_pending_invoices_base('00000000-0000-4000-8000-000000098001', false) where user_id = '00000000-0000-4000-8000-00000009810a'),
  array[to_char(current_date - interval '2 months', 'YYYY-MM'), to_char(current_date - interval '1 month', 'YYYY-MM'), to_char(current_date, 'YYYY-MM')],
  'A: an uncompleted explicit invoice neither covers nor floors months');

select is((select prosecdef from pg_proc where oid = 'public.get_pending_invoices_base_guarded(uuid, boolean)'::regprocedure), true,
  'The guarded function remains security definer');
select ok(not has_function_privilege('authenticated', 'public.get_pending_invoices_base_guarded(uuid, boolean)', 'execute'),
  'Authenticated callers still cannot execute the guarded function');

select * from finish();
rollback;
