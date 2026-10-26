-- Decided rule: months before a student's first exact-month invoice never reappear
-- as owed; they are hidden by the legacy floor. Gaps after the first exact month
-- stay pending (see subscription-coverage.sql). Fixtures use fixed 2025 dates:
-- classes only have sessions from January to July 2025, so results do not depend
-- on the current date.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
set local timezone = 'UTC';
select plan(23);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
insert into public.workspaces(id, name, personal, creator_id) values
  ('00000000-0000-4000-8000-000000098001', 'Legacy floor fixture', false, '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-4000-8000-000000098011', 'Legacy floor other workspace', false, '00000000-0000-0000-0000-000000000001');
insert into public.workspace_configs(id, ws_id, value)
values ('INVOICE_USE_ATTENDANCE_BASED_CALCULATION', '00000000-0000-4000-8000-000000098001', 'false');
insert into private.workspace_wallets(id, ws_id, name) values ('00000000-0000-4000-8000-000000098002', '00000000-0000-4000-8000-000000098001', 'Legacy floor wallet');
insert into public.transaction_categories(id, ws_id, name, is_expense) values ('00000000-0000-4000-8000-000000098003', '00000000-0000-4000-8000-000000098001', 'Tuition', false);
insert into public.workspace_user_groups(id, ws_id, name, starting_date) values
  ('00000000-0000-4000-8000-000000098005', '00000000-0000-4000-8000-000000098001', 'Class one', '2025-01-01'),
  ('00000000-0000-4000-8000-000000098006', '00000000-0000-4000-8000-000000098001', 'Class two', '2025-01-01'),
  ('00000000-0000-4000-8000-000000098015', '00000000-0000-4000-8000-000000098011', 'Other workspace class', '2025-01-01');
-- One session per month, January to July 2025, at noon in Ho Chi Minh.
insert into private.workspace_user_group_sessions(ws_id, group_id, starts_at, ends_at)
select g.ws_id, g.id, month, month + interval '1 hour'
from public.workspace_user_groups g
cross join generate_series(timestamptz '2025-01-10 05:00:00+00', timestamptz '2025-07-10 05:00:00+00', interval '1 month') month
where g.id in ('00000000-0000-4000-8000-000000098005', '00000000-0000-4000-8000-000000098006', '00000000-0000-4000-8000-000000098015');

-- 01 legacy then exact current month, 02 legacy then exact months with a gap,
-- 03 exact only (joined mid-March), 04 legacy only, 05/06 legacy cutoffs either side
-- of Ho Chi Minh midnight, 07 exact month older than the cutoff, 08 reported receipt
-- shape, 09 standard IOE-style invoice only, 0a two classes, 0b other workspace.
insert into public.workspace_users(id, ws_id, full_name)
select ('00000000-0000-4000-8000-0000000981' || n)::uuid, '00000000-0000-4000-8000-000000098001', 'Student ' || n
from unnest(array['01','02','03','04','05','06','07','08','09','0a']) n;
insert into public.workspace_users(id, ws_id, full_name)
values ('00000000-0000-4000-8000-00000009810b', '00000000-0000-4000-8000-000000098011', 'Student 0b');
insert into public.workspace_user_groups_users(user_id, group_id, role, created_at)
select ('00000000-0000-4000-8000-0000000981' || n)::uuid, '00000000-0000-4000-8000-000000098005', 'STUDENT',
  case n when '03' then timestamptz '2025-03-15 00:00:00+07' when '09' then timestamptz '2025-06-01 00:00:00+07' else timestamptz '2025-01-01 00:00:00+07' end
from unnest(array['01','02','03','04','05','06','07','08','09','0a']) n;
insert into public.workspace_user_groups_users(user_id, group_id, role, created_at) values
  ('00000000-0000-4000-8000-00000009810a', '00000000-0000-4000-8000-000000098006', 'STUDENT', '2025-01-01 00:00:00+07'),
  ('00000000-0000-4000-8000-00000009810b', '00000000-0000-4000-8000-000000098015', 'STUDENT', '2025-01-01 00:00:00+07');

-- Legacy invoices carry the cutoff the app wrote (UTC month start) unless a case
-- probes the time-zone boundary. Exact-month invoices derive valid_until by trigger.
create temporary table fixture_invoices(id uuid, customer text, grp uuid, valid_until timestamptz, months date[], completed timestamptz) on commit drop;
insert into fixture_invoices values
  ('00000000-0000-4000-8000-000000098201', '01', '00000000-0000-4000-8000-000000098005', '2025-04-01 00:00:00+00', null, '2025-03-20 10:00:00+07'),
  ('00000000-0000-4000-8000-000000098202', '01', '00000000-0000-4000-8000-000000098005', null, array['2025-07-01']::date[], '2025-07-17 10:00:00+07'),
  ('00000000-0000-4000-8000-000000098203', '02', '00000000-0000-4000-8000-000000098005', '2025-04-01 00:00:00+00', null, '2025-03-20 10:00:00+07'),
  ('00000000-0000-4000-8000-000000098204', '02', '00000000-0000-4000-8000-000000098005', null, array['2025-05-01','2025-07-01']::date[], '2025-05-05 10:00:00+07'),
  ('00000000-0000-4000-8000-000000098205', '03', '00000000-0000-4000-8000-000000098005', null, array['2025-05-01','2025-07-01']::date[], '2025-05-05 10:00:00+07'),
  ('00000000-0000-4000-8000-000000098206', '04', '00000000-0000-4000-8000-000000098005', '2025-04-01 00:00:00+00', null, '2025-03-20 10:00:00+07'),
  ('00000000-0000-4000-8000-000000098207', '05', '00000000-0000-4000-8000-000000098005', '2025-03-31 18:30:00+00', null, '2025-03-20 10:00:00+07'),
  ('00000000-0000-4000-8000-000000098208', '06', '00000000-0000-4000-8000-000000098005', '2025-03-31 16:30:00+00', null, '2025-03-20 10:00:00+07'),
  ('00000000-0000-4000-8000-000000098209', '07', '00000000-0000-4000-8000-000000098005', '2025-07-01 00:00:00+00', null, '2025-06-20 10:00:00+07'),
  ('00000000-0000-4000-8000-00000009820a', '07', '00000000-0000-4000-8000-000000098005', null, array['2025-03-01']::date[], '2025-06-25 10:00:00+07'),
  ('00000000-0000-4000-8000-00000009820b', '08', '00000000-0000-4000-8000-000000098005', '2025-05-01 00:00:00+00', null, '2025-04-20 10:00:00+07'),
  ('00000000-0000-4000-8000-00000009820c', '08', '00000000-0000-4000-8000-000000098005', null, array['2025-06-01']::date[], '2025-06-25 10:00:00+07'),
  ('00000000-0000-4000-8000-00000009820d', '08', '00000000-0000-4000-8000-000000098005', null, array['2025-07-01']::date[], '2025-07-17 10:00:00+07'),
  ('00000000-0000-4000-8000-00000009820e', '0a', '00000000-0000-4000-8000-000000098005', null, array['2025-06-01','2025-07-01']::date[], '2025-06-05 10:00:00+07'),
  ('00000000-0000-4000-8000-00000009820f', '0a', '00000000-0000-4000-8000-000000098006', '2025-07-01 00:00:00+00', null, '2025-06-20 10:00:00+07'),
  -- Recorded in the fixture workspace for the other workspace's student and class.
  ('00000000-0000-4000-8000-000000098210', '0b', '00000000-0000-4000-8000-000000098015', null, array['2025-01-01','2025-02-01','2025-03-01','2025-04-01','2025-05-01','2025-06-01','2025-07-01']::date[], '2025-07-17 10:00:00+07'),
  ('00000000-0000-4000-8000-000000098211', '0b', '00000000-0000-4000-8000-000000098015', '2025-08-01 00:00:00+00', null, '2025-07-17 10:00:00+07');
insert into public.finance_invoices(id, ws_id, wallet_id, category_id, customer_id, price, paid_amount, completed_at, valid_until, subscription_months)
select id, '00000000-0000-4000-8000-000000098001', '00000000-0000-4000-8000-000000098002', '00000000-0000-4000-8000-000000098003',
  ('00000000-0000-4000-8000-0000000981' || customer)::uuid, 100, 100, completed, valid_until, months
from fixture_invoices;
insert into public.finance_invoice_user_groups(invoice_id, user_group_id)
select id, grp from fixture_invoices;
-- A standard (non-subscription) invoice: 30-day valid_until, but no class link or months.
insert into public.finance_invoices(id, ws_id, wallet_id, category_id, customer_id, price, paid_amount, completed_at, valid_until)
values ('00000000-0000-4000-8000-000000098212', '00000000-0000-4000-8000-000000098001', '00000000-0000-4000-8000-000000098002', '00000000-0000-4000-8000-000000098003',
  '00000000-0000-4000-8000-000000098109', 100, 100, '2025-07-17 10:00:00+07', '2025-08-16 10:00:00+07');

create temporary table pending on commit drop as
select user_id, group_id, month from public.get_pending_invoices_base('00000000-0000-4000-8000-000000098001', false);
create function pg_temp.months(p_user text, p_group text default '00000000-0000-4000-8000-000000098005')
returns text[] language sql as $$
  select array_agg(month order by month) from pending
  where user_id = ('00000000-0000-4000-8000-0000000981' || p_user)::uuid and group_id = p_group::uuid
$$;

select is(pg_temp.months('01'), null,
  'Mixed: months before the first exact month are hidden by the floor, not owed, and the paid month clears');
select is(pg_temp.months('02'), array['2025-06'],
  'Mixed: a gap after the first exact month stays pending');
select is(pg_temp.months('03'), array['2025-04','2025-06'],
  'Exact only: pending starts at the join date and gaps stay pending');
select is(pg_temp.months('04'), array['2025-04','2025-05','2025-06','2025-07'],
  'Legacy only: pending starts at the legacy cutoff as before');
select is(pg_temp.months('05'), array['2025-04','2025-05','2025-06','2025-07'],
  'Time zone: a cutoff at 18:30 UTC on 31 March is April in Ho Chi Minh, so March is not owed');
select is(pg_temp.months('06'), array['2025-03','2025-04','2025-05','2025-06','2025-07'],
  'Time zone: a cutoff at 16:30 UTC on 31 March is still March in Ho Chi Minh, so March is owed');
select is(pg_temp.months('07'), array['2025-07'],
  'An exact month older than the legacy cutoff never moves the start earlier');
select is(pg_temp.months('08'), null,
  'Reported receipt shape: a mid-month exact payment clears the class row instead of reopening legacy history');
select is(pg_temp.months('09'), array['2025-06','2025-07'],
  'A standard invoice without a class or months never affects pending tuition');
select is(pg_temp.months('0a'), array['2025-01','2025-02','2025-03','2025-04','2025-05'],
  'Two classes: class one ignores the other class''s legacy cutoff');
select is(pg_temp.months('0a', '00000000-0000-4000-8000-000000098006'), array['2025-07'],
  'Two classes: class one''s July payment never clears class two''s July');

select is((select array_agg(month order by month) from public.get_pending_invoices_base('00000000-0000-4000-8000-000000098011', false)),
  array['2025-01','2025-02','2025-03','2025-04','2025-05','2025-06','2025-07'],
  'Workspace isolation: invoices recorded in another workspace never cover or floor pending tuition');
select ok(not exists(select 1 from pending where user_id = '00000000-0000-4000-8000-00000009810b'),
  'Workspace isolation: another workspace''s student never appears in this workspace');

select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-4000-8000-0000000981ff"}', true);
select throws_ok(
  $$select * from public.get_pending_invoices_base_guarded('00000000-0000-4000-8000-000000098001', false)$$,
  'P0001', null, 'The guard denies a signed-in non-member');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- The Pending tab shows one row per student and class listing every owed month, oldest first.
create temporary table pending_rows on commit drop as
select user_id, group_id, months_owed from public.get_pending_invoices('00000000-0000-4000-8000-000000098001');
select is((select months_owed from pending_rows where user_id = '00000000-0000-4000-8000-000000098108'), null,
  'Pending tab: no row for the reported receipt shape');
select is((select months_owed from pending_rows where user_id = '00000000-0000-4000-8000-000000098101'), null,
  'Pending tab: no row once hidden history and the paid month are excluded');
select is((select months_owed from pending_rows where user_id = '00000000-0000-4000-8000-000000098102'), '2025-06',
  'Pending tab: a mixed row lists only the real gap');
select is((select months_owed from pending_rows where user_id = '00000000-0000-4000-8000-000000098104'), '2025-04, 2025-05, 2025-06, 2025-07',
  'Pending tab: a row lists every owed month, oldest first');
select is((select count(*)::int from pending_rows where user_id = '00000000-0000-4000-8000-00000009810a'), 2,
  'Pending tab: each class of a student has its own row');

update public.finance_invoices set completed_at = null where id = '00000000-0000-4000-8000-000000098202';
select is((select array_agg(month order by month) from public.get_pending_invoices_base('00000000-0000-4000-8000-000000098001', false)
  where user_id = '00000000-0000-4000-8000-000000098101'),
  array['2025-04','2025-05','2025-06','2025-07'],
  'An uncompleted exact invoice neither covers nor floors months');

select is((select prosecdef from pg_proc where oid = 'public.get_pending_invoices_base_guarded(uuid, boolean)'::regprocedure), true,
  'The guarded function remains security definer');
select ok(not has_function_privilege('authenticated', 'public.get_pending_invoices_base_guarded(uuid, boolean)', 'execute'),
  'Authenticated callers still cannot execute the guarded function');
select is((select proconfig from pg_proc where oid = 'public.get_pending_invoices_base_guarded(uuid, boolean)'::regprocedure), array['search_path=""'],
  'The guarded function pins an empty search_path');

select * from finish();
rollback;
