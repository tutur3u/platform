begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- Every merge entry point that returns a JSON denial instead of raising.
create function pg_temp.merge_entry_points() returns setof text language sql as $$
  values ('merge_workspace_users'), ('merge_workspace_users_phase1'), ('merge_workspace_users_phase1a'),
    ('merge_workspace_users_phased'), ('merge_workspace_users_batch_update'),
    ('merge_workspace_users_table_batch'), ('merge_workspace_users_phase1a_batch'),
    ('merge_workspace_users_phase1b_batch'), ('merge_workspace_users_phase1c_batch'),
    ('merge_workspace_users_phase1d_batch')
$$;
create function pg_temp.merge_signature(fn text) returns regprocedure language sql as $$
  select format('public.%s(%s)', fn, case
    when fn = 'merge_workspace_users_phased' or fn like '%\_batch' and fn <> 'merge_workspace_users_table_batch'
      then 'uuid,uuid,uuid,integer'
    when fn in ('merge_workspace_users_batch_update', 'merge_workspace_users_table_batch')
      then 'uuid,uuid,uuid,text,text,integer'
    else 'uuid,uuid,uuid' end)::regprocedure
$$;
create function pg_temp.run_merge(fn text, source_id uuid, target_id uuid, ws_id uuid)
returns jsonb language plpgsql as $$
declare result jsonb;
begin
  execute format('select public.%s($1, $2, $3%s)', fn, case
    when fn = 'merge_workspace_users_phased' then ', 1'
    when fn in ('merge_workspace_users_batch_update', 'merge_workspace_users_table_batch')
      then ', ''user_feedbacks'', ''user_id'', 10'
    when fn like '%\_batch' then ', 10'
    else '' end)
    into result using source_id, target_id, ws_id;
  return result;
end;
$$;

select ok(not has_function_privilege('anon', pg_temp.merge_signature(fn), 'execute'),
  fn || ': anon has no execute') from pg_temp.merge_entry_points() fn;
select ok(has_function_privilege('authenticated', pg_temp.merge_signature(fn), 'execute'),
  fn || ': authenticated retains execute') from pg_temp.merge_entry_points() fn;
select ok(has_function_privilege('service_role', pg_temp.merge_signature(fn), 'execute'),
  fn || ': service role retains execute') from pg_temp.merge_entry_points() fn;
select ok(not exists (
  select 1 from pg_proc p, lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
  where p.oid = pg_temp.merge_signature(fn) and acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
), fn || ': PUBLIC has no execute') from pg_temp.merge_entry_points() fn;
-- Dynamic-table helpers keep their reviewed lookup path; the rest are qualified.
select ok((select case
    when fn in ('merge_workspace_users_batch_update', 'merge_workspace_users_table_batch')
      then exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%, pg_temp')
    else 'search_path=pg_catalog, pg_temp' = any(p.proconfig) end
  from pg_proc p where p.oid = pg_temp.merge_signature(fn)),
  fn || ': search path is pinned') from pg_temp.merge_entry_points() fn;

insert into auth.users(id) values
  ('00000000-0000-4000-8000-00000000c001'),
  ('00000000-0000-4000-8000-00000000c002'),
  ('00000000-0000-4000-8000-00000000d001');
insert into public.workspaces(id, name, creator_id) values
  ('00000000-0000-4000-8000-00000000c100', 'Null guard A', '00000000-0000-4000-8000-00000000c001'),
  ('00000000-0000-4000-8000-00000000d100', 'Null guard B', '00000000-0000-4000-8000-00000000d001');
insert into public.workspace_members(ws_id, user_id, type) values
  ('00000000-0000-4000-8000-00000000c100', '00000000-0000-4000-8000-00000000c002', 'MEMBER')
on conflict do nothing;
delete from public.workspace_default_permissions where ws_id = '00000000-0000-4000-8000-00000000c100';
insert into public.workspace_users(id, ws_id, full_name) values
  ('00000000-0000-4000-8000-00000000c101', '00000000-0000-4000-8000-00000000c100', 'Source'),
  ('00000000-0000-4000-8000-00000000c102', '00000000-0000-4000-8000-00000000c100', 'Target'),
  ('00000000-0000-4000-8000-00000000c103', '00000000-0000-4000-8000-00000000c100', 'Single source'),
  ('00000000-0000-4000-8000-00000000c104', '00000000-0000-4000-8000-00000000c100', 'Single target'),
  ('00000000-0000-4000-8000-00000000c105', '00000000-0000-4000-8000-00000000c100', 'Phased source'),
  ('00000000-0000-4000-8000-00000000c106', '00000000-0000-4000-8000-00000000c100', 'Phased target');
insert into public.user_feedbacks(user_id, content) values
  ('00000000-0000-4000-8000-00000000c101', 'Source feedback');

create function pg_temp.source_intact() returns boolean language sql as $$
  select exists (select 1 from public.workspace_users where id = '00000000-0000-4000-8000-00000000c101')
    and (select count(*) from public.user_feedbacks where user_id = '00000000-0000-4000-8000-00000000c101') = 1
$$;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(format('select pg_temp.run_merge(%L, %L, %L, %L)', fn,
  '00000000-0000-4000-8000-00000000c101', '00000000-0000-4000-8000-00000000c102', '00000000-0000-4000-8000-00000000c100'),
  '42501', null, fn || ': anonymous invocation is denied') from pg_temp.merge_entry_points() fn;
reset role;

-- Call as the function owner so a NULL auth.uid() reaches the body's guard.
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select is((pg_temp.run_merge(fn, '00000000-0000-4000-8000-00000000c101', '00000000-0000-4000-8000-00000000c102',
  '00000000-0000-4000-8000-00000000c100')->>'success')::boolean,
  false, fn || ': null auth.uid() is denied') from pg_temp.merge_entry_points() fn;
select ok(pg_temp.source_intact(), 'null auth.uid() denials change nothing');

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000d001"}', true);
select is((pg_temp.run_merge(fn, '00000000-0000-4000-8000-00000000c101', '00000000-0000-4000-8000-00000000c102',
  '00000000-0000-4000-8000-00000000c100')->>'success')::boolean,
  false, fn || ': nonmember is denied') from pg_temp.merge_entry_points() fn;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000c002"}', true);
select is((pg_temp.run_merge(fn, '00000000-0000-4000-8000-00000000c101', '00000000-0000-4000-8000-00000000c102',
  '00000000-0000-4000-8000-00000000c100')->>'success')::boolean,
  false, fn || ': member without permissions is denied') from pg_temp.merge_entry_points() fn;
reset role;
select ok(pg_temp.source_intact(), 'permission denials change nothing');

-- An authorized caller still runs every qualified body end to end.
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000c001"}', true);
set local role authenticated;
select is((pg_temp.run_merge(fn, '00000000-0000-4000-8000-00000000c101', '00000000-0000-4000-8000-00000000c102',
  '00000000-0000-4000-8000-00000000c100')->>'success')::boolean,
  true, fn || ': creator can run the step') from pg_temp.merge_entry_points() fn
  where fn not in ('merge_workspace_users', 'merge_workspace_users_phased');
select is((pg_temp.run_merge('merge_workspace_users', '00000000-0000-4000-8000-00000000c103',
  '00000000-0000-4000-8000-00000000c104', '00000000-0000-4000-8000-00000000c100')->>'success')::boolean,
  true, 'merge_workspace_users: creator can merge');
select is((pg_temp.run_merge('merge_workspace_users_phased', '00000000-0000-4000-8000-00000000c105',
  '00000000-0000-4000-8000-00000000c106', '00000000-0000-4000-8000-00000000c100')->>'success')::boolean,
  true, 'merge_workspace_users_phased: creator can merge');
reset role;
select is((select count(*) from public.user_feedbacks where user_id = '00000000-0000-4000-8000-00000000c102'),
  1::bigint, 'authorized steps move source data to the target');
select is((select count(*) from public.workspace_users where id in ('00000000-0000-4000-8000-00000000c103', '00000000-0000-4000-8000-00000000c105')),
  0::bigint, 'authorized full merges delete their sources');

-- Permission evaluators must fail closed even if a future implementation returns NULL.
update public.user_feedbacks set user_id = '00000000-0000-4000-8000-00000000c101'
where user_id = '00000000-0000-4000-8000-00000000c102';
create or replace function public.has_workspace_permission(p_ws_id uuid, p_user_id uuid, p_permission text)
returns boolean language sql security definer set search_path = pg_catalog, pg_temp
as $$ select null::boolean $$;
set local role authenticated;
select is((pg_temp.run_merge(fn, '00000000-0000-4000-8000-00000000c101', '00000000-0000-4000-8000-00000000c102',
  '00000000-0000-4000-8000-00000000c100')->>'success')::boolean,
  false, fn || ': null permissions fail closed') from pg_temp.merge_entry_points() fn;
reset role;
select ok(pg_temp.source_intact(), 'null permission denials change nothing');
select * from finish();
rollback;
