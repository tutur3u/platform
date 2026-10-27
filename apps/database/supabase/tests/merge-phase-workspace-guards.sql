begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

create function pg_temp.merge_phases() returns setof text language sql as $$
  values ('1b'), ('1c'), ('1d'), ('2'), ('3'), ('4'), ('5')
$$;
create function pg_temp.run_merge_phase(phase text, source_id uuid, target_id uuid, ws_id uuid)
returns jsonb language plpgsql as $$
declare result jsonb;
begin
  execute format('select public.merge_workspace_users_phase%s($1, $2, $3)', phase)
    into result using source_id, target_id, ws_id;
  return result;
end;
$$;

select ok(not has_function_privilege('anon', format('public.merge_workspace_users_phase%s(uuid,uuid,uuid)', phase), 'execute'),
  phase || ': anon has no execute') from pg_temp.merge_phases() phase;
select ok(has_function_privilege('authenticated', format('public.merge_workspace_users_phase%s(uuid,uuid,uuid)', phase), 'execute'),
  phase || ': authenticated retains execute') from pg_temp.merge_phases() phase;
select ok(has_function_privilege('service_role', format('public.merge_workspace_users_phase%s(uuid,uuid,uuid)', phase), 'execute'),
  phase || ': service role retains execute') from pg_temp.merge_phases() phase;
select ok(not exists (
  select 1 from pg_proc p, lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
  where p.oid = format('public.merge_workspace_users_phase%s(uuid,uuid,uuid)', phase)::regprocedure
    and acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
), phase || ': PUBLIC has no execute') from pg_temp.merge_phases() phase;
select ok((select 'search_path=pg_catalog, pg_temp' = any(p.proconfig)
  from pg_proc p where p.oid = format('public.merge_workspace_users_phase%s(uuid,uuid,uuid)', phase)::regprocedure),
  phase || ': search path is pinned') from pg_temp.merge_phases() phase;
select ok(pg_get_functiondef('public.merge_workspace_users_phase5(uuid,uuid,uuid)'::regprocedure) ~* 'for update',
  '5: locks the merge rows before checking them');
select ok(pg_get_functiondef('public.merge_workspace_users_phase4(uuid,uuid,uuid)'::regprocedure) ~* 'for update',
  '4: locks the link rows before transferring them');

insert into auth.users(id) values
  ('00000000-0000-4000-8000-00000000a001'),
  ('00000000-0000-4000-8000-00000000a002'),
  ('00000000-0000-4000-8000-00000000b001');
insert into public.workspaces(id, name, creator_id) values
  ('00000000-0000-4000-8000-00000000a100', 'Merge test A', '00000000-0000-4000-8000-00000000a001'),
  ('00000000-0000-4000-8000-00000000b100', 'Merge test B', '00000000-0000-4000-8000-00000000b001');
insert into public.workspace_members(ws_id, user_id, type) values
  ('00000000-0000-4000-8000-00000000a100', '00000000-0000-4000-8000-00000000a002', 'MEMBER')
on conflict do nothing;
delete from public.workspace_default_permissions where ws_id = '00000000-0000-4000-8000-00000000a100';
insert into public.workspace_users(id, ws_id, full_name) values
  ('00000000-0000-4000-8000-00000000a101', '00000000-0000-4000-8000-00000000a100', 'Source'),
  ('00000000-0000-4000-8000-00000000a102', '00000000-0000-4000-8000-00000000a100', null),
  ('00000000-0000-4000-8000-00000000a103', '00000000-0000-4000-8000-00000000a100', 'Swap left'),
  ('00000000-0000-4000-8000-00000000a104', '00000000-0000-4000-8000-00000000a100', 'Swap right'),
  ('00000000-0000-4000-8000-00000000b101', '00000000-0000-4000-8000-00000000b100', 'Foreign source'),
  ('00000000-0000-4000-8000-00000000b102', '00000000-0000-4000-8000-00000000b100', 'Foreign');
insert into public.user_feedbacks(user_id, content) values
  ('00000000-0000-4000-8000-00000000b101', 'Foreign source feedback');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(format('select pg_temp.run_merge_phase(%L, %L, %L, %L)', phase,
  '00000000-0000-4000-8000-00000000a101', '00000000-0000-4000-8000-00000000a102', '00000000-0000-4000-8000-00000000a100'),
  '42501', null, phase || ': anonymous invocation is denied') from pg_temp.merge_phases() phase;
reset role;

-- Call as the function owner to exercise the body independently of its ACL.
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok(format('select pg_temp.run_merge_phase(%L, %L, %L, %L)', phase,
  '00000000-0000-4000-8000-00000000a101', '00000000-0000-4000-8000-00000000a102', '00000000-0000-4000-8000-00000000a100'),
  '42501', null, phase || ': subject-less invocation is denied') from pg_temp.merge_phases() phase;

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000b001"}', true);
select throws_ok(format('select pg_temp.run_merge_phase(%L, %L, %L, %L)', phase,
  '00000000-0000-4000-8000-00000000a101', '00000000-0000-4000-8000-00000000a102', '00000000-0000-4000-8000-00000000a100'),
  '42501', null, phase || ': nonmember is denied') from pg_temp.merge_phases() phase;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000a002"}', true);
select throws_ok(format('select pg_temp.run_merge_phase(%L, %L, %L, %L)', phase,
  '00000000-0000-4000-8000-00000000a101', '00000000-0000-4000-8000-00000000a102', '00000000-0000-4000-8000-00000000a100'),
  '42501', null, phase || ': member without permissions is denied') from pg_temp.merge_phases() phase;
reset role;
select is((select full_name from public.workspace_users where id = '00000000-0000-4000-8000-00000000a101'), 'Source', 'denials preserve source');
select is((select full_name from public.workspace_users where id = '00000000-0000-4000-8000-00000000a102'), null::text, 'denials preserve target');

insert into public.workspace_default_permissions(ws_id, permission, enabled, member_type)
values ('00000000-0000-4000-8000-00000000a100', 'delete_users', true, 'MEMBER');
set local role authenticated;
select throws_ok(format('select pg_temp.run_merge_phase(%L, %L, %L, %L)', phase,
  '00000000-0000-4000-8000-00000000a101', '00000000-0000-4000-8000-00000000a102', '00000000-0000-4000-8000-00000000a100'),
  '42501', null, phase || ': delete permission alone is insufficient') from pg_temp.merge_phases() phase;
reset role;
update public.workspace_default_permissions set permission = 'update_users' where ws_id = '00000000-0000-4000-8000-00000000a100';
set local role authenticated;
select throws_ok(format('select pg_temp.run_merge_phase(%L, %L, %L, %L)', phase,
  '00000000-0000-4000-8000-00000000a101', '00000000-0000-4000-8000-00000000a102', '00000000-0000-4000-8000-00000000a100'),
  '42501', null, phase || ': update permission alone is insufficient') from pg_temp.merge_phases() phase;
reset role;
insert into public.workspace_default_permissions(ws_id, permission, enabled, member_type)
values ('00000000-0000-4000-8000-00000000a100', 'delete_users', true, 'MEMBER');

set local role authenticated;
select throws_ok(format('select pg_temp.run_merge_phase(%L, %L, %L, %L)', phase,
  '00000000-0000-4000-8000-00000000a101', '00000000-0000-4000-8000-00000000b102', '00000000-0000-4000-8000-00000000a100'),
  '42501', null, phase || ': target must belong to the workspace') from pg_temp.merge_phases() phase;
select throws_ok(format('select pg_temp.run_merge_phase(%L, %L, %L, %L)', phase,
  '00000000-0000-4000-8000-00000000a101', '00000000-0000-4000-8000-00000000a101', '00000000-0000-4000-8000-00000000a100'),
  '42501', null, phase || ': self merge is denied') from pg_temp.merge_phases() phase;
select throws_ok(format('select pg_temp.run_merge_phase(%L, %L, %L, null)', phase,
  '00000000-0000-4000-8000-00000000a101', '00000000-0000-4000-8000-00000000a102'),
  '42501', null, phase || ': null workspace is denied') from pg_temp.merge_phases() phase;
reset role;

-- A privileged same-workspace merge still executes every phase, then resumes safely.
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000a001"}', true);
set local role authenticated;
select is((pg_temp.run_merge_phase(phase, '00000000-0000-4000-8000-00000000a101', '00000000-0000-4000-8000-00000000a102', '00000000-0000-4000-8000-00000000a100')->>'success')::boolean,
  true, phase || ': creator can merge') from pg_temp.merge_phases() phase;
reset role;
select is((select count(*) from public.workspace_users where id = '00000000-0000-4000-8000-00000000a101'), 0::bigint, 'final phase deletes source');
select is((select full_name from public.workspace_users where id = '00000000-0000-4000-8000-00000000a102'), 'Source', 'final phase preserves source data on target');
select is((select full_name from public.workspace_users where id = '00000000-0000-4000-8000-00000000b102'), 'Foreign', 'foreign target remains unchanged');
-- A source from another workspace is never read, moved or deleted.
set local role authenticated;
select lives_ok(format('select pg_temp.run_merge_phase(%L, %L, %L, %L)', phase,
  '00000000-0000-4000-8000-00000000b101', '00000000-0000-4000-8000-00000000a102', '00000000-0000-4000-8000-00000000a100'),
  phase || ': foreign source is treated as absent') from pg_temp.merge_phases() phase;
reset role;
select is((select ws_id || ':' || full_name from public.workspace_users where id = '00000000-0000-4000-8000-00000000b101'),
  '00000000-0000-4000-8000-00000000b100:Foreign source', 'foreign source row is untouched');
select is((select count(*) from public.user_feedbacks where user_id = '00000000-0000-4000-8000-00000000b101'),
  1::bigint, 'foreign source data stays on the foreign source');
select is((select full_name from public.workspace_users where id = '00000000-0000-4000-8000-00000000a102'), 'Source',
  'foreign source data is not merged into the target');
-- A swapped merge cannot delete both users once the first one has completed.
set local role authenticated;
select is((public.merge_workspace_users_phase5('00000000-0000-4000-8000-00000000a103',
  '00000000-0000-4000-8000-00000000a104', '00000000-0000-4000-8000-00000000a100')->>'source_deleted')::boolean,
  true, 'first merge of a swapped pair completes');
select throws_ok(format('select public.merge_workspace_users_phase5(%L, %L, %L)',
  '00000000-0000-4000-8000-00000000a104', '00000000-0000-4000-8000-00000000a103', '00000000-0000-4000-8000-00000000a100'),
  '42501', null, 'reverse merge into the deleted user is refused');
reset role;
select is((select full_name from public.workspace_users where id = '00000000-0000-4000-8000-00000000a104'), 'Swap right',
  'reverse merge keeps the surviving user');
select is((select count(*) from public.workspace_users where id in ('00000000-0000-4000-8000-00000000a103', '00000000-0000-4000-8000-00000000a104')),
  1::bigint, 'swapped merges leave exactly one user');
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000a002"}', true);
set local role authenticated;
select is((pg_temp.run_merge_phase(phase, '00000000-0000-4000-8000-00000000a101', '00000000-0000-4000-8000-00000000a102', '00000000-0000-4000-8000-00000000a100')->>'success')::boolean,
  true, phase || ': authorized member can resume completed merge') from pg_temp.merge_phases() phase;
reset role;
-- Permission evaluators must fail closed even if a future implementation returns NULL.
create or replace function public.has_workspace_permission(p_ws_id uuid, p_user_id uuid, p_permission text)
returns boolean language sql security definer set search_path = pg_catalog, pg_temp
as $$ select null::boolean $$;
set local role authenticated;
select throws_ok(format('select pg_temp.run_merge_phase(%L, %L, %L, %L)', phase,
  '00000000-0000-4000-8000-00000000a101', '00000000-0000-4000-8000-00000000a102', '00000000-0000-4000-8000-00000000a100'),
  '42501', null, phase || ': null permissions fail closed') from pg_temp.merge_phases() phase;
reset role;
select * from finish();
rollback;
