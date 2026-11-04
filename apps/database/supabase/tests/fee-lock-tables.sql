-- Fee lock tables (20261104130000): service-role-only access, CHECK and unique
-- rules, same-workspace guards, append-only revisions and delete behaviour.
-- Synthetic fixtures only; ids are 00000000-0000-4000-8000-0000000fe<suffix>.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(58);

create function pg_temp.id(p text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-0000000fe' || p)::uuid $$;
insert into auth.users(id, email) values (pg_temp.id('001'), 'fee-lock-owner@example.test'), (pg_temp.id('002'), 'fee-lock-staff@example.test') on conflict (id) do nothing;
insert into public.users(id, display_name) values (pg_temp.id('001'), 'Synthetic fee owner'), (pg_temp.id('002'), 'Synthetic fee staff') on conflict (id) do nothing;
insert into public.workspaces(id, name, creator_id, personal) values
  (pg_temp.id('010'), 'Fee lock fixture', pg_temp.id('001'), false), (pg_temp.id('011'), 'Fee lock other workspace', pg_temp.id('001'), false);
-- Per workspace (A = 010 suffix 1xx/2xx/4xx/5xx, B = 011 suffix x9x): students, a class, a product, a unit and a warehouse.
insert into public.workspace_users(id, ws_id, full_name) values
  (pg_temp.id('101'), pg_temp.id('010'), 'Synthetic student A'), (pg_temp.id('102'), pg_temp.id('010'), 'Synthetic student B'),
  (pg_temp.id('191'), pg_temp.id('011'), 'Synthetic other student');
insert into public.workspace_user_groups(id, ws_id, name) values (pg_temp.id('201'), pg_temp.id('010'), 'Synthetic class'), (pg_temp.id('291'), pg_temp.id('011'), 'Other class');
insert into public.product_categories(id, ws_id, name) values (pg_temp.id('401'), pg_temp.id('010'), 'Synthetic'), (pg_temp.id('491'), pg_temp.id('011'), 'Synthetic');
insert into private.inventory_owners(id, ws_id, name) values (pg_temp.id('402'), pg_temp.id('010'), 'Synthetic'), (pg_temp.id('492'), pg_temp.id('011'), 'Synthetic');
insert into private.inventory_units(id, ws_id, name) values (pg_temp.id('403'), pg_temp.id('010'), 'Unit'), (pg_temp.id('493'), pg_temp.id('011'), 'Unit');
insert into private.inventory_warehouses(id, ws_id, name) values (pg_temp.id('404'), pg_temp.id('010'), 'Desk'), (pg_temp.id('494'), pg_temp.id('011'), 'Desk');
insert into public.workspace_products(id, ws_id, name, category_id, owner_id) values
  (pg_temp.id('501'), pg_temp.id('010'), 'Book', pg_temp.id('401'), pg_temp.id('402')), (pg_temp.id('591'), pg_temp.id('011'), 'Other book', pg_temp.id('491'), pg_temp.id('492'));

-- Line on fee lock 301 (workspace A lines are tagged with class 201).
create function pg_temp.line(p_ws text, p_kind text, p_snapshot text, p_price numeric, p_qty numeric, p_adj numeric, p_reason text, p_amount numeric) returns void language sql as $$
  insert into public.fee_lock_lines(fee_lock_id, ws_id, kind, group_id, group_name_snapshot, label, unit_price, quantity, adjustment_amount, reason, line_amount)
  values (pg_temp.id('301'), pg_temp.id(p_ws), p_kind, case when p_ws = '010' then pg_temp.id('201') end, p_snapshot, 'Synthetic line', p_price, p_qty, p_adj, p_reason, p_amount) $$;
-- An extra line on fee lock 301 that sets one workspace-scoped reference.
create function pg_temp.ref_line(p_column text, p_id text) returns void language plpgsql as $$ begin execute format('insert into public.fee_lock_lines(fee_lock_id, ws_id, kind, label, unit_price, quantity, line_amount, %I)
    values (%L, %L, ''extra'', ''Ref'', 1, 1, 1, %L)', p_column, pg_temp.id('301'), pg_temp.id('010'), pg_temp.id(p_id)); end $$;

-- Access model.
select has_table('public', t, t || ' exists') from unnest(array['fee_locks', 'fee_lock_lines', 'fee_lock_revisions', 'fee_lock_events']) t;
select is((select count(*)::int from pg_class where relnamespace = 'public'::regnamespace
  and relname in ('fee_locks', 'fee_lock_lines', 'fee_lock_revisions', 'fee_lock_events') and relrowsecurity), 4, 'RLS is enabled on every fee lock table');
select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename like 'fee_lock%' and permissive = 'PERMISSIVE'), 0, 'fee lock tables have no permissive policies');
select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename in ('fee_locks', 'fee_lock_lines', 'fee_lock_revisions', 'fee_lock_events') and policyname = 'account_required_mfa'), 4, 'every fee lock table carries the restrictive MFA policy');
select is((select count(*)::int from unnest(array['anon', 'authenticated']) r
  cross join unnest(array['public.fee_locks', 'public.fee_lock_lines', 'public.fee_lock_revisions', 'public.fee_lock_events']) t
  cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p
  where has_table_privilege(r, t, p)), 0, 'anon and authenticated hold no privilege on fee lock tables');
select ok(has_table_privilege('service_role', 'public.fee_locks', 'SELECT, INSERT, UPDATE, DELETE'), 'service_role can read and write fee locks');
select ok(not has_function_privilege('authenticated', 'private.fee_lock_append_only()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.fee_lock_same_workspace()', 'EXECUTE'), 'clients cannot call the fee lock trigger functions');

-- Header rules.
select lives_ok($$insert into public.fee_locks(id, ws_id, student_id, period_month, created_by)
  values (pg_temp.id('301'), pg_temp.id('010'), pg_temp.id('101'), '2026-12-01', pg_temp.id('001'))$$, 'a same-workspace student gets a draft fee lock');
select is((select status || ':' || revision || ':' || version || ':' || currency from public.fee_locks
  where id = pg_temp.id('301')), 'draft:0:1:VND', 'a new fee lock starts as a version-1 VND draft with no locked revision');
select throws_ok($$insert into public.fee_locks(ws_id, student_id, period_month) values (pg_temp.id('010'), pg_temp.id('191'), '2026-12-01')$$,
  '23514', 'student_id does not belong to ws_id', 'a student from another workspace is rejected');
select throws_ok($$insert into public.fee_locks(ws_id, student_id, period_month) values (pg_temp.id('010'), pg_temp.id('102'), '2026-12-15')$$,
  '23514', null, 'period_month must be the first day of a month');
select throws_ok($$insert into public.fee_locks(ws_id, student_id, period_month) values (pg_temp.id('010'), pg_temp.id('101'), '2026-12-01')$$,
  '23505', null, 'a student has one fee lock per month');
select throws_ok($$insert into public.fee_locks(ws_id, student_id, period_month, status) values (pg_temp.id('010'), pg_temp.id('102'), '2026-12-01', 'locked')$$,
  '23514', null, 'a locked header needs a revision and a lock time');
select throws_ok($$insert into public.fee_locks(ws_id, student_id, period_month, total_amount) values (pg_temp.id('010'), pg_temp.id('102'), '2026-12-01', -1)$$,
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
create temporary table refs(c text, same text, other text) on commit drop;
insert into refs values ('group_id', '201', '291'), ('product_id', '501', '591'), ('unit_id', '403', '493'), ('warehouse_id', '404', '494');
select lives_ok(format('select pg_temp.ref_line(%L, %L)', c, same), 'a same-workspace ' || c || ' is accepted') from refs;
select throws_ok(format('select pg_temp.ref_line(%L, %L)', c, other), '23514', c || ' does not belong to ws_id',
  'a ' || c || ' from another workspace is rejected') from refs;

-- Revisions are append-only.
select lives_ok($$insert into public.fee_lock_revisions(fee_lock_id, ws_id, revision, total_amount, snapshot, locked_by)
  values (pg_temp.id('301'), pg_temp.id('010'), 1, 1330000, '{"revision": 1}', pg_temp.id('002'))$$, 'a revision snapshot can be written');
select throws_ok($$update public.fee_lock_revisions set total_amount = 0 where fee_lock_id = pg_temp.id('301')$$,
  '55000', 'fee_lock_revisions rows are immutable', 'a locked revision cannot be changed');
select throws_ok($$delete from public.fee_lock_revisions where fee_lock_id = pg_temp.id('301')$$,
  '55000', 'fee_lock_revisions rows are immutable', 'a locked revision cannot be deleted directly');
-- fee_lock_invoice_links (20261104130300) references revisions, so a plain TRUNCATE is refused by Postgres first.
select throws_ok($$truncate public.fee_lock_revisions$$, '0A000', null, 'revisions cannot be truncated while links reference them');
select throws_ok($$truncate public.fee_lock_revisions cascade$$, '55000', 'fee_lock_revisions rows are immutable', 'revisions cannot be truncated, even with cascade');
select throws_ok($$insert into public.fee_lock_revisions(fee_lock_id, ws_id, revision, total_amount, snapshot) values
  (pg_temp.id('301'), pg_temp.id('010'), 1, 0, '{}')$$, '23505', null, 'a revision number is used once per fee lock');
select throws_ok($$insert into public.fee_lock_revisions(fee_lock_id, ws_id, revision, total_amount, snapshot) values
  (pg_temp.id('301'), pg_temp.id('010'), 2, 0, jsonb_build_object('pad', repeat('x', 70000)))$$, '23514', null, 'a snapshot is capped at 64 KB');

-- Events are append-only too.
select lives_ok($$insert into public.fee_lock_events(ws_id, fee_lock_id, event_type, actor_id, revision, after_total, metadata)
  values (pg_temp.id('010'), pg_temp.id('301'), 'locked', pg_temp.id('002'), 1, 1330000, '{"line_count": 3}')$$, 'a lock event can be recorded');
insert into public.fee_locks(id, ws_id, student_id, period_month, status, revision, locked_at) values (pg_temp.id('391'), pg_temp.id('011'), pg_temp.id('191'), '2026-12-01', 'locked', 1, now());
select throws_ok($$insert into public.fee_lock_events(ws_id, fee_lock_id, event_type) values (pg_temp.id('010'), pg_temp.id('391'), 'draft_saved')$$,
  '23503', null, 'an event cannot name a fee lock of another workspace');
select throws_ok($$insert into public.fee_lock_events(ws_id, event_type) values (pg_temp.id('010'), 'sent')$$, '23514', null, 'event types are limited to the Phase 1 list');
select throws_ok($$insert into public.fee_lock_events(ws_id, event_type, after_total) values (pg_temp.id('010'), 'exported', -1)$$, '23514', null, 'event totals cannot be negative');
select throws_ok($$insert into public.fee_lock_events(ws_id, event_type, metadata)
  values (pg_temp.id('010'), 'exported', jsonb_build_object('pad', repeat('x', 9000)))$$, '23514', null, 'event metadata is capped at 8 KB');
select throws_ok($$update public.fee_lock_events set reason = 'edited' where ws_id = pg_temp.id('010')$$, '55000', 'fee_lock_events rows are immutable', 'an event cannot be changed');
select throws_ok($$delete from public.fee_lock_events where ws_id = pg_temp.id('010')$$, '55000', 'fee_lock_events rows are immutable', 'an event cannot be deleted');
select throws_ok($$truncate public.fee_lock_events$$, '55000', 'fee_lock_events rows are immutable', 'events cannot be truncated');

-- Deletes: locked fee locks are kept; drafts, user deletes and workspace deletes work.
select throws_ok($$delete from public.workspace_users where id = pg_temp.id('101')$$, '23503', null, 'a student with fee locks cannot be deleted');
-- Every auth user gets a personal workspace and membership; the personal-workspace guard admits
-- its delete only once the auth user is gone (same order as calendar-provider-saga.sql).
delete from public.workspace_members where user_id = pg_temp.id('002');
delete from auth.users where id = pg_temp.id('002');
delete from public.workspaces where personal and creator_id = pg_temp.id('002');
delete from public.users where id = pg_temp.id('002');
select is((select count(*)::int from public.fee_lock_revisions where fee_lock_id = pg_temp.id('301') and locked_by is null)
  + (select count(*)::int from public.fee_lock_events where fee_lock_id = pg_temp.id('301') and actor_id is null), 2,
  'deleting a user keeps the revision and the event and clears locked_by and actor_id');
update public.fee_locks set status = 'locked', revision = 1, locked_at = now() where id = pg_temp.id('301');
select throws_ok($$delete from public.fee_locks where id = pg_temp.id('301')$$, '55000', 'fee_locks rows are immutable', 'a locked fee lock cannot be deleted');
select throws_ok($$truncate public.fee_locks cascade$$, '55000', 'fee_locks rows are immutable', 'fee locks cannot be truncated');
create function pg_temp.try(p_sql text) returns text language plpgsql as $$ begin execute p_sql; return 'ok'; exception when others then return sqlstate; end $$;
select is(pg_temp.try($$update public.fee_locks set revision = 0 where id = pg_temp.id('301')$$) || ',' || pg_temp.try($$update public.fee_locks set ws_id = pg_temp.id('011') where id = pg_temp.id('301')$$)
  || ',' || pg_temp.try($$update public.fee_locks set status = 'draft', version = version + 1 where id = pg_temp.id('301')$$), '55000,55000,ok',
  'a locked fee lock cannot lower its revision or change workspace, and reopening (revision kept) still works');
insert into public.fee_locks(id, ws_id, student_id, period_month) values (pg_temp.id('302'), pg_temp.id('010'), pg_temp.id('102'), '2026-12-01');
insert into public.fee_lock_events(ws_id, fee_lock_id, event_type) values (pg_temp.id('010'), pg_temp.id('302'), 'draft_saved');
select lives_ok($$delete from public.fee_locks where id = pg_temp.id('302')$$, 'a never-locked draft can be deleted');
select is((select count(*)::int from public.fee_lock_events where ws_id = pg_temp.id('010') and fee_lock_id is null and event_type = 'draft_saved'), 1,
  'events outlive a deleted draft with fee_lock_id cleared');
insert into public.fee_lock_revisions(fee_lock_id, ws_id, revision, total_amount, snapshot) values (pg_temp.id('391'), pg_temp.id('011'), 1, 0, '{}');
insert into public.fee_lock_events(ws_id, fee_lock_id, event_type, revision) values (pg_temp.id('011'), pg_temp.id('391'), 'locked', 1);
select lives_ok($$delete from public.workspaces where id = pg_temp.id('011')$$, 'deleting a workspace removes its locked fee locks, revisions and events');
select is((select count(*)::int from public.fee_locks where ws_id = pg_temp.id('011')) + (select count(*)::int from public.fee_lock_revisions where ws_id = pg_temp.id('011'))
  + (select count(*)::int from public.fee_lock_events where ws_id = pg_temp.id('011')), 0, 'no fee lock rows remain for the deleted workspace');

select ok(private.inventory_merge_schema_ready(), 'M1 keeps the inventory merge schema ready: fee_lock_lines product and warehouse references carry both inventory guards');
select * from finish();
rollback;
