-- Fee lock tables (20261104060200): service-role-only access, the CHECK and
-- unique rules from the design, workspace-consistent child rows and append-only
-- revisions. Synthetic fixtures only.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(34);

insert into auth.users(id, email) values
  ('00000000-0000-4000-8000-0000000fe001', 'fee-lock-owner@example.test'),
  ('00000000-0000-4000-8000-0000000fe002', 'fee-lock-staff@example.test')
on conflict (id) do nothing;
insert into public.users(id, display_name) values
  ('00000000-0000-4000-8000-0000000fe001', 'Synthetic fee owner'),
  ('00000000-0000-4000-8000-0000000fe002', 'Synthetic fee staff')
on conflict (id) do nothing;
insert into public.workspaces(id, name, creator_id, personal) values
  ('00000000-0000-4000-8000-0000000fe010', 'Fee lock fixture', '00000000-0000-4000-8000-0000000fe001', false),
  ('00000000-0000-4000-8000-0000000fe011', 'Fee lock other workspace', '00000000-0000-4000-8000-0000000fe001', false);
insert into public.workspace_users(id, ws_id, full_name) values
  ('00000000-0000-4000-8000-0000000fe101', '00000000-0000-4000-8000-0000000fe010', 'Synthetic student A'),
  ('00000000-0000-4000-8000-0000000fe102', '00000000-0000-4000-8000-0000000fe010', 'Synthetic student B');
insert into public.workspace_user_groups(id, ws_id, name) values
  ('00000000-0000-4000-8000-0000000fe201', '00000000-0000-4000-8000-0000000fe010', 'Synthetic class');

-- Line insert shorthand: workspace suffix, kind, class name snapshot, price,
-- quantity, adjustment, reason, line amount. Lines go to fee lock fe301.
create function pg_temp.line(p_ws text, p_kind text, p_snapshot text, p_price numeric, p_qty numeric,
  p_adj numeric, p_reason text, p_amount numeric)
returns void language sql as $$
  insert into public.fee_lock_lines(fee_lock_id, ws_id, kind, group_id, group_name_snapshot, label,
    unit_price, quantity, adjustment_amount, reason, line_amount)
  values ('00000000-0000-4000-8000-0000000fe301', ('00000000-0000-4000-8000-0000000fe' || p_ws)::uuid, p_kind,
    '00000000-0000-4000-8000-0000000fe201', p_snapshot, 'Synthetic line', p_price, p_qty, p_adj, p_reason, p_amount);
$$;
grant execute on function pg_temp.line(text, text, text, numeric, numeric, numeric, text, numeric) to service_role;

-- Access model.
select has_table('public', t, t || ' exists')
from unnest(array['fee_locks', 'fee_lock_lines', 'fee_lock_revisions', 'fee_lock_events']) t;
select is((select count(*)::int from pg_class where relnamespace = 'public'::regnamespace
  and relname in ('fee_locks', 'fee_lock_lines', 'fee_lock_revisions', 'fee_lock_events') and relrowsecurity),
  4, 'RLS is enabled on every fee lock table');
select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename like 'fee_lock%'
  and permissive = 'PERMISSIVE'), 0, 'fee lock tables have no permissive policies');
select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename like 'fee_lock%'
  and policyname = 'account_required_mfa'), 4, 'every fee lock table carries the restrictive MFA policy');
select is((select count(*)::int from unnest(array['anon', 'authenticated']) r
  cross join unnest(array['public.fee_locks', 'public.fee_lock_lines', 'public.fee_lock_revisions', 'public.fee_lock_events']) t
  cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p
  where has_table_privilege(r, t, p)), 0, 'anon and authenticated hold no privilege on fee lock tables');
select ok(has_table_privilege('service_role', 'public.fee_locks', 'SELECT, INSERT, UPDATE, DELETE'),
  'service_role can read and write fee locks');
select ok(not has_function_privilege('authenticated', 'private.fee_lock_revisions_block_update()', 'EXECUTE'),
  'clients cannot call the append-only trigger function');

-- Header rules.
set local role service_role;
select lives_ok($$insert into public.fee_locks(id, ws_id, student_id, period_month, created_by)
  values ('00000000-0000-4000-8000-0000000fe301', '00000000-0000-4000-8000-0000000fe010',
          '00000000-0000-4000-8000-0000000fe101', '2026-12-01', '00000000-0000-4000-8000-0000000fe001')$$,
  'service_role can create a draft fee lock');
select is((select status || ':' || revision || ':' || version || ':' || currency from public.fee_locks
  where id = '00000000-0000-4000-8000-0000000fe301'), 'draft:0:1:VND',
  'a new fee lock starts as a version-1 VND draft with no locked revision');
select throws_ok($$insert into public.fee_locks(ws_id, student_id, period_month) values
  ('00000000-0000-4000-8000-0000000fe010', '00000000-0000-4000-8000-0000000fe102', '2026-12-15')$$,
  '23514', null, 'period_month must be the first day of a month');
select throws_ok($$insert into public.fee_locks(ws_id, student_id, period_month) values
  ('00000000-0000-4000-8000-0000000fe010', '00000000-0000-4000-8000-0000000fe101', '2026-12-01')$$,
  '23505', null, 'a student has one fee lock per month');
select throws_ok($$insert into public.fee_locks(ws_id, student_id, period_month, status) values
  ('00000000-0000-4000-8000-0000000fe010', '00000000-0000-4000-8000-0000000fe102', '2026-12-01', 'locked')$$,
  '23514', null, 'a locked header needs a revision and a lock time');
select throws_ok($$insert into public.fee_locks(ws_id, student_id, period_month, total_amount) values
  ('00000000-0000-4000-8000-0000000fe010', '00000000-0000-4000-8000-0000000fe102', '2026-12-01', -1)$$,
  '23514', null, 'the total cannot be negative');

-- Line rules.
select lives_ok($$select pg_temp.line('010', 'tuition', 'Synthetic class', 150000, 8, -100000, 'Achievement discount', 1100000)$$,
  'a discounted tuition line with a reason is accepted');
select throws_ok($$select pg_temp.line('010', 'tuition', 'Synthetic class', 150000, 8, 0, null, 1200000)$$,
  '23505', null, 'a fee lock has one tuition line per class');
select lives_ok($$select pg_temp.line('010', 'extra', null, 90000, 2, 0, null, 180000);
                  select pg_temp.line('010', 'extra', null, 50000, 1, 0, null, 50000)$$,
  'several extra lines may carry the same class tag');
select throws_ok($$select pg_temp.line('010', 'extra', null, 90000, 1, 5000, '   ', 95000)$$,
  '23514', null, 'a non-zero adjustment needs a non-blank reason');
select throws_ok($$select pg_temp.line('010', 'tuition', null, 150000, 8, 0, null, 1200000)$$,
  '23514', null, 'a tuition line keeps the class name snapshot');
select throws_ok($$select pg_temp.line('010', 'extra', null, 90000, 0, 0, null, 0)$$,
  '23514', null, 'quantity must be positive');
select throws_ok($$select pg_temp.line('010', 'extra', null, 90000, 1, -100000, 'Too much', -10000)$$,
  '23514', null, 'a line amount cannot be negative');
select throws_ok($$select pg_temp.line('011', 'extra', null, 90000, 1, 0, null, 90000)$$,
  '23503', null, 'a line cannot claim another workspace than its fee lock');

-- Revisions are append-only.
select lives_ok($$insert into public.fee_lock_revisions(fee_lock_id, ws_id, revision, total_amount, snapshot, locked_by)
  values ('00000000-0000-4000-8000-0000000fe301', '00000000-0000-4000-8000-0000000fe010', 1, 1330000,
          '{"revision": 1}', '00000000-0000-4000-8000-0000000fe002')$$,
  'a revision snapshot can be written');
select throws_ok($$update public.fee_lock_revisions set total_amount = 0
  where fee_lock_id = '00000000-0000-4000-8000-0000000fe301'$$,
  '55000', 'fee_lock_revisions is append-only', 'a locked revision cannot be changed');
select throws_ok($$insert into public.fee_lock_revisions(fee_lock_id, ws_id, revision, total_amount, snapshot) values
  ('00000000-0000-4000-8000-0000000fe301', '00000000-0000-4000-8000-0000000fe010', 1, 0, '{}')$$,
  '23505', null, 'a revision number is used once per fee lock');
select throws_ok($$insert into public.fee_lock_revisions(fee_lock_id, ws_id, revision, total_amount, snapshot) values
  ('00000000-0000-4000-8000-0000000fe301', '00000000-0000-4000-8000-0000000fe010', 2, 0,
   jsonb_build_object('pad', repeat('x', 70000)))$$,
  '23514', null, 'a snapshot is capped at 64 KB');

-- Events.
select lives_ok($$insert into public.fee_lock_events(ws_id, fee_lock_id, event_type, actor_id, revision, after_total, metadata)
  values ('00000000-0000-4000-8000-0000000fe010', '00000000-0000-4000-8000-0000000fe301', 'locked',
          '00000000-0000-4000-8000-0000000fe001', 1, 1330000, '{"line_count": 3}')$$,
  'a lock event can be recorded');
select throws_ok($$insert into public.fee_lock_events(ws_id, event_type)
  values ('00000000-0000-4000-8000-0000000fe010', 'sent')$$,
  '23514', null, 'event types are limited to the Phase 1 list');
select throws_ok($$insert into public.fee_lock_events(ws_id, event_type, metadata)
  values ('00000000-0000-4000-8000-0000000fe010', 'exported', jsonb_build_object('pad', repeat('x', 9000)))$$,
  '23514', null, 'event metadata is capped at 8 KB');

-- Deletes: a deleted user only clears locked_by; a deleted fee lock takes its
-- lines and revisions and leaves its events.
reset role;
delete from public.users where id = '00000000-0000-4000-8000-0000000fe002';
select is((select count(*)::int from public.fee_lock_revisions where fee_lock_id = '00000000-0000-4000-8000-0000000fe301'
  and locked_by is null and total_amount = 1330000), 1,
  'deleting the locking user keeps the revision and clears locked_by');
delete from public.fee_locks where id = '00000000-0000-4000-8000-0000000fe301';
select is((select count(*)::int from public.fee_lock_lines where fee_lock_id = '00000000-0000-4000-8000-0000000fe301')
  + (select count(*)::int from public.fee_lock_revisions where fee_lock_id = '00000000-0000-4000-8000-0000000fe301'),
  0, 'deleting a fee lock removes its lines and revisions');
select is((select count(*)::int from public.fee_lock_events where ws_id = '00000000-0000-4000-8000-0000000fe010'
  and fee_lock_id is null and event_type = 'locked'), 1,
  'events outlive their fee lock with fee_lock_id cleared');

select * from finish();
rollback;
