-- Deferred erasure for the feature flag rule store (20261125085000): deleting
-- an account or workspace records one constant-work intent; the leased drain
-- erases it; rule writes naming a pending subject are refused. The lock
-- contention path is in feature-flag-erasure-lock.sql.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(32);

-- Earlier suites and seed deletes leave intents; start from an empty queue.
delete from private.feature_flag_erasure_intents;

insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
  ('5ff10000-0000-4000-8000-000000000001', 'ff-erase-a@example.com', now(), '{}', '{}'),
  ('5ff10000-0000-4000-8000-000000000002', 'ff-erase-b@example.com', now(), '{}', '{}'),
  ('5ff10000-0000-4000-8000-000000000003', 'ff-erase-c@example.com', now(), '{}', '{}'),
  ('5ff10000-0000-4000-8000-000000000004', 'ff-erase-actor@example.com', now(), '{}', '{}');
insert into public.workspaces (id, name, personal, creator_id) values
  ('5ff10000-0000-4000-8000-0000000000a1', 'Erase one', false, '5ff10000-0000-4000-8000-000000000004'),
  ('5ff10000-0000-4000-8000-0000000000a2', 'Erase two', false, '5ff10000-0000-4000-8000-000000000004');

create function pg_temp.as_role(p_sql text, p_role text) returns text language plpgsql as $$
declare r text;
begin
  perform set_config('request.jwt.claims', json_build_object('role', p_role)::text, true);
  execute format('set local role %I', p_role);
  begin
    execute p_sql;
    r := 'ok';
  exception when others then r := sqlstate;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return r;
end $$;

create function pg_temp.rpc(p_sql text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  execute 'set local role service_role';
  begin
    execute 'select ' || p_sql into r;
  exception when others then r := jsonb_build_object('error', sqlerrm, 'state', sqlstate);
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return r;
end $$;

-- Privileges ----------------------------------------------------------------

select ok(not exists (
  select 1
  from unnest(array['anon', 'authenticated', 'service_role']) as r(role),
       unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) as p(priv)
  where has_table_privilege(r.role, 'private.feature_flag_erasure_intents', p.priv)
), 'no client or service role has table privileges on the erasure intents');
select ok(not exists (
  select 1
  from unnest(array['anon', 'authenticated']) as r(role),
       unnest(array[
         'private.feature_flag_erasure_claim(integer)',
         'private.feature_flag_erasure_complete(bigint)',
         'private.feature_flag_erasure_status()'
       ]) as f(fn)
  where has_function_privilege(r.role, f.fn, 'EXECUTE')
), 'anon and authenticated cannot execute the erasure drain RPCs');
select ok((
  select bool_and(has_function_privilege('service_role', f.fn, 'EXECUTE'))
  from unnest(array[
    'private.feature_flag_erasure_claim(integer)',
    'private.feature_flag_erasure_complete(bigint)',
    'private.feature_flag_erasure_status()'
  ]) as f(fn)
), 'service_role can execute the erasure drain RPCs');
select ok(not has_function_privilege('service_role',
  'private.feature_flag_record_erasure_intent()', 'EXECUTE'),
  'the intent trigger function has no client or service grant');
select is(pg_temp.as_role($q$select private.feature_flag_erasure_claim(5)$q$, 'authenticated'),
  '42501', 'an authenticated client cannot claim intents');
select is(pg_temp.as_role($q$select private.feature_flag_erasure_status()$q$, 'anon'),
  '42501', 'an anonymous client cannot read the queue status');

-- Deleting a subject with no rules records one intent --------------------------

select is((select count(*)::int from private.feature_flag_erasure_intents), 0, 'the queue starts empty');
delete from auth.users where id = '5ff10000-0000-4000-8000-000000000003';
select is((select scope || ':' || subject_id from private.feature_flag_erasure_intents),
  'user:5ff10000-0000-4000-8000-000000000003', 'deleting an account with no rules records a user intent');
delete from public.workspaces where id = '5ff10000-0000-4000-8000-0000000000a2';
select is((select scope || ':' || subject_id from private.feature_flag_erasure_intents
  where scope = 'workspace'),
  'workspace:5ff10000-0000-4000-8000-0000000000a2', 'deleting a workspace records a workspace intent');
select is((select count(*)::int from private.feature_flag_erasure_intents), 2,
  'each delete adds exactly one intent');

insert into private.feature_flag_erasure_intents (scope, subject_id)
values ('user', '5ff10000-0000-4000-8000-000000000002');
delete from auth.users where id = '5ff10000-0000-4000-8000-000000000002';
select is((select count(*)::int from private.feature_flag_erasure_intents
  where subject_id = '5ff10000-0000-4000-8000-000000000002'), 1,
  'a repeated intent for the same subject collapses to one row');

-- Drain: no rules to erase ----------------------------------------------------------

select is(pg_temp.rpc($q$private.feature_flag_erasure_status()$q$) ->> 'pending', '3', 'status counts pending intents');
select is(pg_temp.rpc($q$private.feature_flag_erasure_claim(0)$q$) ->> 'error',
  'feature_flag_invalid_limit', 'a claim of zero is refused');
select is(pg_temp.rpc($q$private.feature_flag_erasure_claim(21)$q$) ->> 'error',
  'feature_flag_invalid_limit', 'a claim above twenty is refused');
select is(jsonb_array_length(pg_temp.rpc($q$private.feature_flag_erasure_claim(2)$q$) -> 'claims'), 2,
  'a claim leases at most the requested number of intents');
select is((select min(attempts)::int from private.feature_flag_erasure_intents
  where attempts > 0), 1, 'a claim counts the attempt');
select is(jsonb_array_length(pg_temp.rpc($q$private.feature_flag_erasure_claim(5)$q$) -> 'claims'), 1,
  'leased intents are not claimed again while their lease runs');
select is(jsonb_array_length(pg_temp.rpc($q$private.feature_flag_erasure_claim(5)$q$) -> 'claims'), 0,
  'a drained queue claims nothing');
select ok((select bool_and(next_attempt_at > clock_timestamp() + interval '30 seconds')
  from private.feature_flag_erasure_intents), 'a lease pushes the next attempt out');

select is(pg_temp.rpc(format($q$private.feature_flag_erasure_complete(%s)$q$,
  (select id from private.feature_flag_erasure_intents where scope = 'workspace'))) ->> 'status',
  'erased', 'completing a workspace intent with no rules erases it');
select is((select count(*)::int from private.feature_flag_erasure_intents), 2,
  'completing removes the intent');
select is(pg_temp.rpc($q$private.feature_flag_erasure_complete(-1)$q$) ->> 'status', 'gone',
  'completing an unknown intent reports gone');
select is(coalesce(current_setting('feature_flags.entrypoint', true), ''), '',
  'the erasure entrypoint is cleared after completion');

-- Rules naming a deleted user are erased by the drain ----------------------------------

select is(pg_temp.rpc($q$private.feature_flag_sync_definitions('[
  {"key":"FF_ERASE_TEST","kind":"release","scopes":["platform","workspace","user"],
   "controllers":{"platform":"platform-admin","workspace":"platform-admin","user":"platform-admin"},
   "delegate":null}
]'::jsonb)$q$) ->> 'definitions', '1', 'the erasure fixture flag is registered');
select set_config('feature_flags.entrypoint', 'mutate_rule', true);
insert into private.feature_flag_rules (flag_key, scope, subject_id, environment, mode, revision, updated_by)
values ('FF_ERASE_TEST', 'user', '5ff10000-0000-4000-8000-000000000002', 'production', 'on', 1,
  '5ff10000-0000-4000-8000-000000000004');
select set_config('feature_flags.entrypoint', '', true);

select is(pg_temp.rpc(format($q$private.feature_flag_erasure_complete(%s)$q$,
  (select id from private.feature_flag_erasure_intents
   where subject_id = '5ff10000-0000-4000-8000-000000000002'))) ->> 'deletedRules', '1',
  'completing a user intent deletes the user''s rules');
select ok(not exists (select 1 from private.feature_flag_rules
  where subject_id = '5ff10000-0000-4000-8000-000000000002'), 'no rule names the erased user');
select is((select count(*)::int from private.feature_flag_audit
  where client = 'erasure' and flag_key = 'FF_ERASE_TEST' and actor_id is null), 1,
  'the erasure write has an audit row with no actor');

-- Pending subjects refuse rule writes -------------------------------------------------------

create function pg_temp.write_rule(
  p_scope text, p_subject uuid, p_mode text, p_ws uuid[], p_users uuid[]
) returns text language plpgsql as $$
begin
  perform private.feature_flag_mutate_rule('5ff10000-0000-4000-8000-000000000004',
    gen_random_uuid(), 'FF_ERASE_TEST', 'production', p_scope, p_subject, p_mode,
    case when p_mode = 'rollout' then 10 end, p_ws, p_users, 0, 'Fixture write', 'ttr');
  return 'applied';
exception when others then return sqlerrm;
end $$;

insert into private.feature_flag_erasure_intents (scope, subject_id)
values ('workspace', '5ff10000-0000-4000-8000-0000000000a2');

select is(pg_temp.write_rule('user', '5ff10000-0000-4000-8000-000000000003', 'on', null, null),
  'feature_flag_subject_erasing', 'a rule for a user pending erasure is refused');
select is(pg_temp.write_rule('user', '5ff10000-0000-4000-8000-000000000003', null, null, null),
  'feature_flag_subject_erasing', 'unsetting a rule for a pending user is refused too');
select is(pg_temp.write_rule('platform', null, 'rollout', null,
  array['5ff10000-0000-4000-8000-000000000003']::uuid[]),
  'feature_flag_subject_erasing', 'an allow-list naming a pending user is refused');
select is(pg_temp.write_rule('platform', null, 'rollout',
  array['5ff10000-0000-4000-8000-0000000000a2']::uuid[], null),
  'feature_flag_subject_erasing', 'an allow-list naming a workspace pending erasure is refused');
select isnt(pg_temp.write_rule('user', '5ff10000-0000-4000-8000-000000000001', 'on', null, null),
  'feature_flag_subject_erasing', 'a subject with no intent passes the erasure check');

select * from finish();
rollback;
