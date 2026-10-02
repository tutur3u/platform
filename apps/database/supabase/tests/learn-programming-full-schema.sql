begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into public.users(id) values
 ('00000000-0000-4000-8000-000000005701'),
 ('00000000-0000-4000-8000-000000005702');
insert into public.workspaces(id,name,personal,creator_id) values
 ('00000000-0000-4000-8000-000000005711','Disposable Programming catalog',false,'00000000-0000-4000-8000-000000005701'),
 ('00000000-0000-4000-8000-000000005712','Disposable foreign catalog',false,'00000000-0000-4000-8000-000000005702');
create function pg_temp.problem_payload() returns jsonb language sql as $$
 select '{"slug":"full-schema-fixture","title":{"en":"Synthetic problem","vi":"Bài tập kiểm thử"},"prompt":{"en":"Return input","vi":"Trả đầu vào"},"difficulty":"easy","topic":"arrays","starterCode":"","status":"published","cases":[{"input":"visible-input","expected":"visible-output","visible":true},{"input":"hidden-input","expected":"hidden-output","visible":false}]}'::jsonb;
$$;
create function pg_temp.save_problem(problem uuid default null, revision bigint default null, payload jsonb default pg_temp.problem_payload()) returns jsonb language sql as $$
 select private.save_learn_programming_problem('00000000-0000-4000-8000-000000005711','00000000-0000-4000-8000-000000005701',payload,problem,revision);
$$;
create temp table fixture_identity(id uuid);
insert into fixture_identity select (pg_temp.save_problem()->>'id')::uuid;
select ok((select bool_and(relrowsecurity) from pg_class where oid in ('private.learn_programming_problems'::regclass,'private.learn_programming_problem_cases'::regclass)), 'private catalog tables enable RLS');
select ok(not has_table_privilege('anon','private.learn_programming_problem_cases','SELECT'), 'anonymous callers cannot read hidden cases');
select ok(not has_table_privilege('authenticated','private.learn_programming_problems','INSERT'), 'browser callers cannot forge catalog writes');
select ok(not has_function_privilege('authenticated','private.save_learn_programming_problem(uuid,uuid,jsonb,uuid,bigint)','EXECUTE'), 'browser callers cannot invoke author RPC');
select ok(has_function_privilege('service_role','private.save_learn_programming_problem(uuid,uuid,jsonb,uuid,bigint)','EXECUTE'), 'trusted server can invoke author RPC');
select is((select revision from private.learn_programming_problems where id=(select id from fixture_identity)),1::bigint,'created problem starts at revision one');
select is((select count(*) from private.learn_programming_problem_cases where problem_id=(select id from fixture_identity)),2::bigint,'both fixture cases persisted');
select ok(private.read_learn_programming_problem('00000000-0000-4000-8000-000000005711',(select id from fixture_identity),false)::text like '%visible-input%', 'learner receives visible input');
select ok(private.read_learn_programming_problem('00000000-0000-4000-8000-000000005711',(select id from fixture_identity),false)::text not like '%hidden-input%', 'learner DTO excludes hidden input');
select ok(private.read_learn_programming_problem('00000000-0000-4000-8000-000000005711',(select id from fixture_identity),false)::text not like '%hidden-output%', 'learner DTO excludes hidden expected output');
select ok(private.read_learn_programming_problem('00000000-0000-4000-8000-000000005711',(select id from fixture_identity),true)::text like '%hidden-input%', 'own-workspace author receives judge cases');
select is(private.read_learn_programming_problem('00000000-0000-4000-8000-000000005712',(select id from fixture_identity),true),null::jsonb,'foreign workspace cannot read private catalog');
select throws_ok($q$select private.save_learn_programming_problem('00000000-0000-4000-8000-000000005711','00000000-0000-4000-8000-000000005702',pg_temp.problem_payload())$q$,'42501','Insufficient permissions','nonmember author is denied');
select is((pg_temp.save_problem((select id from fixture_identity),1)->>'revision')::bigint,2::bigint,'revision advances exactly once');
select throws_ok($q$select pg_temp.save_problem((select id from fixture_identity),1)$q$,'40001','Problem revision conflict','stale author revision rejected');
select throws_ok($q$select pg_temp.save_problem((select id from fixture_identity),2,jsonb_set(pg_temp.problem_payload(),'{cases,1,input}',to_jsonb(repeat('x',4097))))$q$,'23514',null,'oversized judge case rejects transaction');
select is((select revision from private.learn_programming_problems where id=(select id from fixture_identity)),2::bigint,'failed case transaction preserves revision');
select is((select input from private.learn_programming_problem_cases where problem_id=(select id from fixture_identity) and position=1),'hidden-input','failed case transaction preserves private cases');
select throws_ok($q$select pg_temp.save_problem(null,null,jsonb_set(pg_temp.problem_payload(),'{cases}','[{"input":"hidden","expected":"hidden","visible":false}]'::jsonb))$q$,'22023','Invalid problem cases','catalog requires a visible case');
select throws_ok($q$select pg_temp.save_problem(null,1)$q$,'22023','Invalid create revision','create cannot supply update revision');
select * from finish();
rollback;
