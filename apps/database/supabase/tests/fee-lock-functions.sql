-- Fee lock functions (20261104130100): baseline maths, server totals, the
-- reason rule, version conflicts, cross-workspace rejection, lock/reopen
-- revisions, grants, workspace-owned catalogue units and warehouses, the money
-- limit (22003) and 200-character snapshot names. Synthetic fixtures; December 2026.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
set local timezone = 'UTC';
select plan(39);

-- Fixture ids are 00000000-0000-4000-8000-0000000fe<suffix>.
create function pg_temp.id(p text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-0000000fe' || p)::uuid $$;
insert into auth.users(id, email) values (pg_temp.id('001'), 'fee-lock-fn@example.test') on conflict (id) do nothing;
insert into public.users(id, display_name) values (pg_temp.id('001'), 'Synthetic fee staff') on conflict (id) do nothing;
insert into public.workspaces(id, name, creator_id, personal) values
  (pg_temp.id('010'), 'Fee lock fn fixture', pg_temp.id('001'), false), (pg_temp.id('011'), 'Fee lock fn other', pg_temp.id('001'), false);
insert into public.workspace_users(id, ws_id, full_name, archived) values
  (pg_temp.id('101'), pg_temp.id('010'), 'Student A', false), (pg_temp.id('102'), pg_temp.id('010'), 'Student B', false),
  (pg_temp.id('103'), pg_temp.id('010'), 'Student archived', true), (pg_temp.id('111'), pg_temp.id('011'), 'Student other', false);
-- Class 1 runs all month; class 2 ends on 10 Dec; class 9 is in the other workspace.
insert into public.workspace_user_groups(id, ws_id, name, starting_date, ending_date) values (pg_temp.id('201'), pg_temp.id('010'), 'Class 1', '2026-01-01', null),
  (pg_temp.id('202'), pg_temp.id('010'), 'Class 2', '2026-01-01', '2026-12-10 12:00+07'), (pg_temp.id('209'), pg_temp.id('011'), 'Class 9', '2026-01-01', null);
-- Student B joins class 1 on 15 Dec.
insert into public.workspace_user_groups_users(user_id, group_id, role, created_at)
select pg_temp.id(u), pg_temp.id(g), 'STUDENT', t::timestamptz from (values ('101', '201', '2026-06-01 00:00+07'),
  ('101', '202', '2026-06-01 00:00+07'), ('102', '201', '2026-12-15 00:00+07'), ('103', '201', '2026-06-01 00:00+07'),
  ('111', '209', '2026-06-01 00:00+07')) v(u, g, t);
-- Class 1: 8 sessions at 10:00 Ho Chi Minh, one at 01:00 on 1 Dec (30 Nov UTC), one cancelled. Class 2: 2, 9, 16 Dec.
insert into private.workspace_user_group_sessions(ws_id, group_id, starts_at, ends_at, status)
select pg_temp.id('010'), pg_temp.id(g), t::timestamptz, t::timestamptz + interval '1 hour', st from (values
  ('201', '2026-11-30 18:00+00', 'scheduled'), ('201', '2026-12-30 03:00+00', 'cancelled'), ('202', '2026-12-02 03:00+00', 'scheduled'),
  ('202', '2026-12-09 03:00+00', 'scheduled'), ('202', '2026-12-16 03:00+00', 'scheduled')) v(g, t, st)
union all
select pg_temp.id('010'), pg_temp.id('201'), d + time '03:00', d + time '04:00', 'scheduled'
from unnest(array['2026-12-02', '2026-12-05', '2026-12-09', '2026-12-12', '2026-12-16', '2026-12-19', '2026-12-23', '2026-12-26']::date[]) d;
-- Catalogue: class 1 tuition 150,000 per session, a book at 90,000, and a product in the other workspace.
insert into public.product_categories(id, ws_id, name) values (pg_temp.id('401'), pg_temp.id('010'), 'Synthetic'), (pg_temp.id('402'), pg_temp.id('011'), 'Synthetic');
insert into private.inventory_owners(id, ws_id, name) values (pg_temp.id('403'), pg_temp.id('010'), 'Synthetic'), (pg_temp.id('404'), pg_temp.id('011'), 'Synthetic');
insert into private.inventory_units(id, ws_id, name) values (pg_temp.id('405'), pg_temp.id('010'), 'Unit'), (pg_temp.id('406'), pg_temp.id('011'), 'Unit');
insert into private.inventory_warehouses(id, ws_id, name) values (pg_temp.id('407'), pg_temp.id('010'), 'Desk'), (pg_temp.id('408'), pg_temp.id('011'), 'Desk');
insert into public.workspace_products(id, ws_id, name, category_id, owner_id) values (pg_temp.id('501'), pg_temp.id('010'), 'Tuition 1', pg_temp.id('401'), pg_temp.id('403')),
  (pg_temp.id('502'), pg_temp.id('010'), 'Book', pg_temp.id('401'), pg_temp.id('403')), (pg_temp.id('509'), pg_temp.id('011'), 'Other book', pg_temp.id('402'), pg_temp.id('404'));
insert into private.inventory_products(product_id, unit_id, warehouse_id, amount, price) values (pg_temp.id('501'), pg_temp.id('405'), pg_temp.id('407'), null, 150000),
  (pg_temp.id('502'), pg_temp.id('405'), pg_temp.id('407'), 10, 90000), (pg_temp.id('509'), pg_temp.id('406'), pg_temp.id('408'), 10, 90000);
insert into public.user_group_linked_products(group_id, product_id, unit_id, warehouse_id) values (pg_temp.id('201'), pg_temp.id('501'), pg_temp.id('405'), pg_temp.id('407'));

-- Shorthands: a December baseline cell; a draft save for student A; the lock id; line builders.
create function pg_temp.base(p_student text, p_group text) returns text language sql as $$
  select session_count || ' x ' || unit_price::bigint || ' = ' || baseline_amount::bigint
  from private.fee_lock_baseline(pg_temp.id('010'), '2026-12-01') where student_id = pg_temp.id(p_student) and group_id = pg_temp.id(p_group) $$;
create function pg_temp.save(p_version int, p_lines jsonb, p_student text default '101') returns public.fee_locks language sql as $$
  select private.fee_lock_save_draft(pg_temp.id('010'), pg_temp.id('001'), pg_temp.id(p_student), '2026-12-01', p_version, p_lines) $$;
create function pg_temp.lock_id() returns uuid language sql as $$ select id from public.fee_locks where student_id = pg_temp.id('101') $$;
create function pg_temp.tuition(p_qty int, p_adj numeric default 0, p_reason text default null, p_group text default '201') returns jsonb language sql as $$
  select jsonb_build_object('kind', 'tuition', 'group_id', pg_temp.id(p_group), 'quantity', p_qty, 'adjustment_amount', p_adj, 'reason', p_reason) $$;
create function pg_temp.book(p_product text default '502', p_unit text default '405', p_wh text default '407') returns jsonb language sql as $$
  select jsonb_build_object('kind', 'extra', 'product_id', pg_temp.id(p_product), 'unit_id', pg_temp.id(p_unit), 'warehouse_id', pg_temp.id(p_wh), 'quantity', 2) $$;

-- Grants.
select is((select count(*)::int from pg_proc p cross join unnest(array['anon', 'authenticated']) r
  where p.pronamespace = 'private'::regnamespace and p.proname like 'fee_lock%' and has_function_privilege(r, p.oid, 'EXECUTE')), 0, 'clients cannot execute any fee lock function');
select ok(has_function_privilege('service_role', 'private.fee_lock_save_draft(uuid, uuid, uuid, date, integer, jsonb, text, text)', 'EXECUTE')
  and has_function_privilege('service_role', 'private.fee_lock_reopen(uuid, uuid, uuid, integer, text)', 'EXECUTE'), 'service_role can execute the write functions');
select is(private.fee_lock_round(1.5, 'VND') || '/' || private.fee_lock_round(1.005, 'USD'), '2/1.01', 'amounts round half up to the currency minor unit');

-- Baseline.
select is(pg_temp.base('101', '201'), '9 x 150000 = 1350000', 'baseline counts Ho Chi Minh session days and skips cancelled ones');
select is(pg_temp.base('102', '201'), '4 x 150000 = 600000', 'baseline starts at the student join date');
select is(pg_temp.base('101', '202'), '2 x 0 = 0', 'baseline stops at the class end date and prices unlinked classes at 0');
select is((select count(*)::int from private.fee_lock_baseline(pg_temp.id('010'), '2026-12-01')), 3, 'archived students and other workspaces are excluded');
select is((select string_agg(group_id::text || ':' || session_count, ',') from private.fee_lock_baseline(pg_temp.id('010'), '2027-01-01')),
  pg_temp.id('201') || ':0,' || pg_temp.id('201') || ':0', 'a future month lists active enrolments without sessions yet');

-- Save draft.
select is((pg_temp.save(null, jsonb_build_array(pg_temp.tuition(9), pg_temp.book(),
  jsonb_build_object('kind', 'extra', 'label', 'Sự kiện cuối năm', 'unit_price', 50000.4, 'quantity', 1)))).total_amount,
  1580000::numeric, 'the server computes the draft total');
select is((select status || ':' || version || ':' || revision from public.fee_locks where id = pg_temp.lock_id()), 'draft:1:0', 'a new draft is version 1');
select is((select string_agg(kind || ':' || label || ':' || line_amount::bigint || ':' || coalesce(baseline_quantity::int, -1), ',' order by sort_order)
  from public.fee_lock_lines where fee_lock_id = pg_temp.lock_id()),
  'tuition:Class 1:1350000:9,extra:Book:180000:-1,extra:Sự kiện cuối năm:50000:-1', 'lines take catalogue prices and baseline snapshots');
select is((select actor_id::text || ':' || after_total::bigint from public.fee_lock_events where fee_lock_id = pg_temp.lock_id() and event_type = 'draft_saved'),
  pg_temp.id('001') || ':1580000', 'saving records the platform actor and the total');
select throws_ok($$select pg_temp.save(null, jsonb_build_array(pg_temp.tuition(9)))$$, 'PT409', 'FEE_LOCK_VERSION_CONFLICT', 'creating over an existing draft conflicts');
select throws_ok($$select pg_temp.save(7, jsonb_build_array(pg_temp.tuition(9)))$$, 'PT409', 'FEE_LOCK_VERSION_CONFLICT', 'a stale version conflicts');
select throws_ok($$select pg_temp.save(1, jsonb_build_array(pg_temp.tuition(8)))$$, '22023', 'FEE_LOCK_REASON_REQUIRED', 'changed sessions need a reason');
select throws_ok($$select pg_temp.save(1, jsonb_build_array(pg_temp.tuition(9, -5000)))$$, '22023', 'FEE_LOCK_REASON_REQUIRED', 'an adjustment needs a reason');
select throws_ok($$select pg_temp.save(1, jsonb_build_array(pg_temp.tuition(1, -200000, 'Too much')))$$, '22023', 'FEE_LOCK_NEGATIVE_LINE', 'a line cannot go below zero');
select throws_ok($$select pg_temp.save(1, jsonb_build_array(pg_temp.tuition(1, 0, null, '209')))$$, '22023', 'FEE_LOCK_GROUP_NOT_FOUND', 'another workspace class is rejected');
select throws_ok($$select pg_temp.save(1, jsonb_build_array(pg_temp.book('509', '406', '408')))$$, '22023', 'FEE_LOCK_PRODUCT_NOT_FOUND', 'another workspace product is rejected');
select throws_ok($$select pg_temp.save(null, '[]', '111')$$, 'PT404', 'FEE_LOCK_STUDENT_NOT_FOUND', 'another workspace student is rejected');
select is((pg_temp.save(1, jsonb_build_array(pg_temp.tuition(8, -100000, 'Achievement discount'), pg_temp.book()))).total_amount,
  1280000::numeric, 'a discounted draft saves with the new total');

-- Lock, reopen, lock again.
select throws_ok($$select private.fee_lock_lock(pg_temp.id('010'), pg_temp.id('001'), pg_temp.lock_id(), 1)$$, 'PT409', 'FEE_LOCK_VERSION_CONFLICT', 'locking with a stale version conflicts');
select throws_ok($$select private.fee_lock_lock(pg_temp.id('011'), pg_temp.id('001'), pg_temp.lock_id(), 2)$$, 'PT404', 'FEE_LOCK_NOT_FOUND', 'another workspace cannot lock it');
select is((select status || ':' || revision || ':' || version from private.fee_lock_lock(pg_temp.id('010'), pg_temp.id('001'), pg_temp.lock_id(), 2)), 'locked:1:3', 'locking writes revision 1');
select ok((select snapshot ?& array['schema_version', 'ws_id', 'locked_by', 'locked_at'] and snapshot->'lines'->0 ? 'group_name' from public.fee_lock_revisions
  where fee_lock_id = pg_temp.lock_id() and revision = 1), 'the snapshot carries the feeLockSnapshotSchema keys');
select is((select (snapshot->>'student_name') || ':' || jsonb_array_length(snapshot->'lines') || ':' || (snapshot->'lines'->0->>'reason') from public.fee_lock_revisions
  where fee_lock_id = pg_temp.lock_id() and revision = 1), 'Student A:2:Achievement discount', 'the revision snapshots names and lines');
select throws_ok($$select pg_temp.save(3, jsonb_build_array(pg_temp.tuition(9)))$$, '55000', 'FEE_LOCK_WRONG_STATUS', 'a locked fee cannot be edited');
select throws_ok($$select private.fee_lock_reopen(pg_temp.id('010'), pg_temp.id('001'), pg_temp.lock_id(), 3, '  ')$$, '22023', 'FEE_LOCK_REASON_REQUIRED', 'reopening needs a reason');
select is((select status || ':' || revision || ':' || version from private.fee_lock_reopen(pg_temp.id('010'), pg_temp.id('001'), pg_temp.lock_id(), 3, 'Parent asked')), 'draft:1:4', 'reopening returns a draft and keeps the revision');
select throws_ok($$select private.fee_lock_reopen(pg_temp.id('010'), pg_temp.id('001'), pg_temp.lock_id(), 4, 'Again')$$, '55000', 'FEE_LOCK_WRONG_STATUS', 'a draft cannot be reopened');
select is((select revision || ':' || version from private.fee_lock_lock(pg_temp.id('010'), pg_temp.id('001'), pg_temp.lock_id(), 4)), '2:5', 'locking again writes revision 2');
select is((select string_agg(revision::text, ',' order by revision) from public.fee_lock_revisions where fee_lock_id = pg_temp.lock_id()), '1,2', 'both revisions are kept');
select is((select string_agg(event_type || coalesce(':' || reason, ''), ',' order by id) from public.fee_lock_events where fee_lock_id = pg_temp.lock_id()),
  'draft_saved,draft_saved,locked,reopened:Parent asked,locked', 'every write is logged once, with the reopen reason');
-- Catalogue units and warehouses must belong to the workspace; the money limit; name caps.
insert into private.inventory_products(product_id, unit_id, warehouse_id, amount, price) values
  (pg_temp.id('502'), pg_temp.id('406'), pg_temp.id('407'), null, 1), (pg_temp.id('502'), pg_temp.id('405'), pg_temp.id('408'), null, 1);
-- Real guards cap student and class names at 128 characters; only this class fixture bypasses them, to prove the 200 cap.
insert into public.workspace_users(id, ws_id, full_name) values (pg_temp.id('104'), pg_temp.id('010'), repeat('Đ', 128));
set local session_replication_role = replica;
insert into public.workspace_user_groups(id, ws_id, name, starting_date) values (pg_temp.id('203'), pg_temp.id('010'), repeat('L', 250), '2026-01-01');
set local session_replication_role = origin;
insert into public.workspace_user_groups_users(user_id, group_id, role, created_at) values (pg_temp.id('104'), pg_temp.id('203'), 'STUDENT', '2026-06-01 00:00+07');
select throws_ok($$select pg_temp.save(null, jsonb_build_array(pg_temp.book('502', '406', '407')), '104')$$, '22023', 'FEE_LOCK_PRODUCT_NOT_FOUND', 'a catalogue unit from another workspace is rejected');
select throws_ok($$select pg_temp.save(null, jsonb_build_array(pg_temp.book('502', '405', '408')), '104')$$, '22023', 'FEE_LOCK_PRODUCT_NOT_FOUND', 'a catalogue warehouse from another workspace is rejected');
select throws_ok($$select pg_temp.save(null, jsonb_build_array(jsonb_build_object('kind', 'extra', 'label', 'Huge', 'unit_price', 99999999999999, 'quantity', 2)), '104')$$,
  '22003', 'FEE_LOCK_AMOUNT_OUT_OF_RANGE', 'a line amount over the money limit is rejected with 22003');
select throws_ok($$select pg_temp.save(null, jsonb_build_array(pg_temp.tuition(1, 100000000000000, 'Surcharge', '203')), '104')$$,
  '22003', 'FEE_LOCK_AMOUNT_OUT_OF_RANGE', 'an adjustment over the money limit is rejected with 22003');
select throws_ok($$select pg_temp.save(null, jsonb_build_array(jsonb_build_object('kind', 'extra', 'label', 'A', 'unit_price', 60000000000000, 'quantity', 1),
  jsonb_build_object('kind', 'extra', 'label', 'B', 'unit_price', 60000000000000, 'quantity', 1)), '104')$$, '22003', 'FEE_LOCK_AMOUNT_OUT_OF_RANGE', 'a total over the money limit is rejected with 22003');
do $$ begin perform private.fee_lock_lock(pg_temp.id('010'), pg_temp.id('001'), (pg_temp.save(null, jsonb_build_array(pg_temp.tuition(1, 0, 'No sessions yet', '203')), '104')).id, 1); end $$;
select is((select (snapshot->>'student_name' = repeat('Đ', 128))::text || ':' || char_length(snapshot->'lines'->0->>'label') || ':' || char_length(snapshot->'lines'->0->>'group_name')
  from public.fee_lock_revisions r join public.fee_locks l on l.id = r.fee_lock_id where l.student_id = pg_temp.id('104')), 'true:200:200', 'a 128-character multibyte student name snapshots intact; class names are capped at 200 characters');

select * from finish();
rollback;
