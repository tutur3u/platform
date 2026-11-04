-- Workspace-user merge keeps fee locks (20261104130400): non-colliding months
-- move to the target, a shared month refuses the merge with
-- FEE_LOCK_MERGE_CONFLICT and leaves everything in place. Covers the single
-- call merge and phase 5 of the phased merge. Synthetic fixtures only; ids are
-- 00000000-0000-4000-8000-0000000fe<suffix>.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(12);

create function pg_temp.id(p text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-0000000fe' || p)::uuid $$;
insert into auth.users(id) values (pg_temp.id('001')) on conflict (id) do nothing;
insert into public.workspaces(id, name, creator_id) values (pg_temp.id('010'), 'Fee lock merge fixture', pg_temp.id('001'));
-- 101/102: phase 5 source/target; 103/104: single-call source/target.
insert into public.workspace_users(id, ws_id, full_name) values
  (pg_temp.id('101'), pg_temp.id('010'), 'Phase source'), (pg_temp.id('102'), pg_temp.id('010'), 'Phase target'),
  (pg_temp.id('103'), pg_temp.id('010'), 'Single source'), (pg_temp.id('104'), pg_temp.id('010'), 'Single target');
insert into public.fee_locks(id, ws_id, student_id, period_month, status, revision, locked_at) values
  (pg_temp.id('301'), pg_temp.id('010'), pg_temp.id('101'), '2026-12-01', 'locked', 1, now()),
  (pg_temp.id('302'), pg_temp.id('010'), pg_temp.id('101'), '2027-01-01', 'draft', 0, null),
  (pg_temp.id('303'), pg_temp.id('010'), pg_temp.id('102'), '2027-01-01', 'draft', 0, null),
  (pg_temp.id('304'), pg_temp.id('010'), pg_temp.id('103'), '2026-12-01', 'draft', 0, null),
  (pg_temp.id('305'), pg_temp.id('010'), pg_temp.id('104'), '2026-12-01', 'draft', 0, null),
  (pg_temp.id('306'), pg_temp.id('010'), pg_temp.id('103'), '2027-02-01', 'locked', 1, now());
insert into public.fee_lock_revisions(fee_lock_id, ws_id, revision, total_amount, snapshot) values
  (pg_temp.id('301'), pg_temp.id('010'), 1, 100, jsonb_build_object('student_id', pg_temp.id('101')));
-- Returns the error detail of a merge call, or 'ok'.
create function pg_temp.merge_detail(p_sql text) returns text language plpgsql as $$
declare v_detail text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics v_detail = pg_exception_detail;
  return sqlerrm || ': ' || v_detail;
end;
$$;

select ok(not has_function_privilege('authenticated', 'private.fee_lock_merge_students(uuid, uuid, uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'private.fee_lock_merge_students(uuid, uuid, uuid)', 'EXECUTE'),
  'clients cannot call the fee lock merge helper');

select set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', pg_temp.id('001'))::text, true);
set local role authenticated;

-- Phase 5: January collides.
select is(pg_temp.merge_detail(format('select public.merge_workspace_users_phase5(%L, %L, %L)', pg_temp.id('101'), pg_temp.id('102'), pg_temp.id('010'))),
  'FEE_LOCK_MERGE_CONFLICT: Both users have a fee lock for: 2027-01', 'phase 5 refuses a shared month and lists it');
select throws_ok(format('select public.merge_workspace_users_phase5(%L, %L, %L)', pg_temp.id('101'), pg_temp.id('102'), pg_temp.id('010')),
  '23505', 'FEE_LOCK_MERGE_CONFLICT', 'phase 5 raises FEE_LOCK_MERGE_CONFLICT');
reset role;
select is((select string_agg(id::text || '>' || student_id::text, ',' order by id) from public.fee_locks where id in (pg_temp.id('301'), pg_temp.id('302'))),
  pg_temp.id('301') || '>' || pg_temp.id('101') || ',' || pg_temp.id('302') || '>' || pg_temp.id('101'), 'a refused merge moves nothing');
-- Resolve the shared month, then merge.
delete from public.fee_locks where id = pg_temp.id('303');
set local role authenticated;
select is((public.merge_workspace_users_phase5(pg_temp.id('101'), pg_temp.id('102'), pg_temp.id('010'))->>'source_deleted')::boolean,
  true, 'phase 5 merges once months no longer collide');
reset role;
select is((select count(*)::int from public.fee_locks where student_id = pg_temp.id('102') and id in (pg_temp.id('301'), pg_temp.id('302'))), 2,
  'phase 5 moves the source fee locks to the target');
select is((select string_agg(version::text, ',' order by id) from public.fee_locks where id in (pg_temp.id('301'), pg_temp.id('302'))), '2,2',
  'moved fee locks get a new version so open editors reload');
select is((select snapshot->>'student_id' from public.fee_lock_revisions where fee_lock_id = pg_temp.id('301')), pg_temp.id('101')::text,
  'locked snapshots keep the old student id as history');

-- Single-call merge: December collides.
set local role authenticated;
select throws_ok(format('select public.merge_workspace_users(%L, %L, %L)', pg_temp.id('103'), pg_temp.id('104'), pg_temp.id('010')),
  '23505', 'FEE_LOCK_MERGE_CONFLICT', 'the single-call merge refuses a shared month');
reset role;
select is((select count(*)::int from public.workspace_users where id = pg_temp.id('103')), 1, 'a refused single-call merge keeps the source user');
delete from public.fee_locks where id = pg_temp.id('304');
set local role authenticated;
select is((public.merge_workspace_users(pg_temp.id('103'), pg_temp.id('104'), pg_temp.id('010'))->>'success')::boolean, true,
  'the single-call merge succeeds once months no longer collide');
reset role;
select is((select student_id from public.fee_locks where id = pg_temp.id('306')), pg_temp.id('104'), 'the single-call merge moves the locked February fee lock');

select * from finish();
rollback;
