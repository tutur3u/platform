\set ON_ERROR_STOP on
create function public.fixture_assert(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',message; end if; end $$;
select public.fixture_assert((select count(*)=3 from private.learn_programming_problems where ws_id is null), 'three audited imported fixtures');
select public.fixture_assert((select problem_id is null and problem_revision is null and not problem_bound from private.learn_coding_submissions where id='55555555-5555-4555-8555-555555555555'), 'no invented backfill');
select public.fixture_assert((select bool_and(relrowsecurity) from pg_class where oid in ('private.learn_programming_problems'::regclass,'private.learn_programming_problem_cases'::regclass)), 'RLS enabled');
do $$ declare role_name text; rpc regprocedure; tbl regclass; privilege text; begin
 foreach role_name in array array['anon','authenticated'] loop
  foreach tbl in array array['private.learn_programming_problems'::regclass,'private.learn_programming_problem_cases'::regclass] loop
   foreach privilege in array array['SELECT','INSERT','UPDATE','DELETE'] loop
    perform public.fixture_assert(not has_table_privilege(role_name,tbl,privilege),role_name||' table '||privilege||' denied');
   end loop;
  end loop;
  for rpc in select oid::regprocedure from pg_proc where pronamespace='private'::regnamespace and proname like '%learn_programming%' loop
   perform public.fixture_assert(not has_function_privilege(role_name,rpc,'EXECUTE'),role_name||' RPC denied');
  end loop;
 end loop;
end $$;
-- Exercise actual browser-role calls, not only ACL introspection.
set role authenticated;
do $$ begin
 begin perform count(*) from private.learn_programming_problem_cases; raise exception 'unexpected table read'; exception when insufficient_privilege then null; end;
 begin perform private.read_learn_programming_problem('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','ca13cfe6-4e26-4dc0-908a-d5c0b37dc7f1',false); raise exception 'unexpected RPC'; exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Global author response stays public-only, while execution snapshot stays private.
select public.fixture_assert(not private.read_learn_programming_problem('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','ca13cfe6-4e26-4dc0-908a-d5c0b37dc7f1',true)::text like '%"visible": false%', 'global author hidden cases absent');
select public.fixture_assert(private.read_learn_programming_execution('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','ca13cfe6-4e26-4dc0-908a-d5c0b37dc7f1')::text like '%"visible": false%', 'execution snapshot has private cases');
create table public.fixture_state(id uuid);
insert into public.fixture_state select (private.save_learn_programming_problem('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111', '{"slug":"synthetic","title":{"en":"Example","vi":"Ví dụ"},"prompt":{"en":"Add","vi":"Cộng"},"difficulty":"easy","topic":"arrays","starterCode":"","status":"published","cases":[{"input":"1","expected":"1","visible":true},{"input":"PRIVATE","expected":"PRIVATE","visible":false}]}')->>'id')::uuid;
do $$ declare v_problem_id uuid; payload jsonb; begin
 select fixture_state.id into v_problem_id from public.fixture_state;
 select jsonb_build_object('slug','synthetic','title',title,'prompt',prompt,'difficulty',difficulty,'topic',topic,'starterCode',starter_code,'status',status,'cases',jsonb_build_array(jsonb_build_object('input',repeat('x',4097),'expected','1','visible',true))) into payload from private.learn_programming_problems where learn_programming_problems.id=v_problem_id;
 begin perform private.save_learn_programming_problem('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',payload,v_problem_id,1); raise exception 'unexpected oversized case'; exception when check_violation then null; end;
 payload := jsonb_set(payload, '{cases}', (select jsonb_agg(jsonb_build_object('input','1','expected','1','visible',true)) from generate_series(1,10)));
 begin perform private.save_learn_programming_problem('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',payload,v_problem_id,1); raise exception 'unexpected ten catalog cases'; exception when invalid_parameter_value then null; end;
 perform public.fixture_assert((select revision=1 from private.learn_programming_problems where learn_programming_problems.id=v_problem_id),'failed-case row rollback');
 perform public.fixture_assert((select count(*)=2 from private.learn_programming_problem_cases where problem_id=v_problem_id),'failed-case replacement rollback');
 payload := jsonb_set(payload,'{cases}','[{"input":"2","expected":"2","visible":true}]');
 perform private.save_learn_programming_problem('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',payload,v_problem_id,1);
 begin perform private.save_learn_programming_problem('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',payload,v_problem_id,1); raise exception 'unexpected stale edit'; exception when serialization_failure then null; end;
 begin perform private.enqueue_learn_programming_execution('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111',v_problem_id,1,'x',array['__ttr_judge_v1__','eA'],'python','submit'); raise exception 'unexpected stale enqueue'; exception when serialization_failure then null; end;
 begin perform private.enqueue_learn_programming_execution('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111',v_problem_id,2,'x',array['__ttr_judge_v1__','eA'],'python','submit'); raise exception 'unexpected parent enqueue'; exception when insufficient_privilege then null; end;
 -- No ready runner exists. A valid current enqueue must retain the original readiness guard.
 begin perform private.enqueue_learn_programming_execution('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111',v_problem_id,2,'x',array['__ttr_judge_v1__','eA'],'python','submit'); raise exception 'unexpected runner'; exception when raise_exception then
  if sqlerrm <> 'No ready Judge runner is available' then raise; end if;
 end;
end $$;
-- A synthetic previously-bound historical record proves workspace deletion preserves history.
insert into private.devbox_runs(id) values ('66666666-6666-4666-8666-666666666666');
insert into private.learn_coding_submissions(id,ws_id,user_id,challenge_slug,source,run_id,problem_id,problem_revision,problem_bound)
 select '77777777-7777-4777-8777-777777777777','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','synthetic','synthetic bound source','66666666-6666-4666-8666-666666666666',fixture_state.id,2,true from public.fixture_state;
delete from public.workspaces where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select public.fixture_assert((select problem_id is null and problem_bound and problem_revision=2 from private.learn_coding_submissions where id='77777777-7777-4777-8777-777777777777'),'workspace deletion preserves bound history');
do $$ begin
 begin update private.learn_coding_submissions set problem_bound=false where id='77777777-7777-4777-8777-777777777777'; raise exception 'unexpected unbinding'; exception when invalid_parameter_value then null; end;
end $$;
select public.fixture_assert((select count(*)=2 from private.learn_coding_submissions),'history survives workspace deletion');
select 'Programming synthetic SQL assertions passed' as result;
