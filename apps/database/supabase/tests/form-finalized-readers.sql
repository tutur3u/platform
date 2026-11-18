begin;

create extension if not exists pgtap with schema extensions;
select plan(8);

do $$
declare
  actor_id uuid := gen_random_uuid();
  workspace_id uuid := gen_random_uuid();
  target_form constant uuid := 'ba1c08ba-9123-47ac-85a6-654b21d356a2';
  pending_session uuid := gen_random_uuid();
  completed_session uuid := gen_random_uuid();
begin
  insert into auth.users (id, email)
    values (actor_id, actor_id || '@example.test');
  insert into public.users (id)
    values (actor_id) on conflict (id) do nothing;
  insert into public.workspaces (id, name, personal, creator_id)
    values (workspace_id, 'Forms reader fixture', false, actor_id);
  insert into private.forms (id, ws_id, creator_id, status)
    values (target_form, workspace_id, actor_id, 'published');
  insert into private.form_sessions (id, form_id, session_token, submitted_at)
    values
      (pending_session, target_form, pending_session::text, null),
      (completed_session, target_form, completed_session::text, clock_timestamp());
  insert into private.form_responses (form_id, session_id, respondent_email)
    values
      (target_form, pending_session, 'pending@example.test'),
      (target_form, completed_session, 'submitted@example.test'),
      (target_form, null, 'historical@example.test');
end;
$$;

select ok(
  not has_table_privilege('anon', 'private.form_committed_responses', 'SELECT')
    and not has_table_privilege('authenticated', 'private.form_committed_responses', 'SELECT'),
  'Committed responses are available only through the authorized server'
);

select ok(
  has_function_privilege('service_role', 'private.get_form_matched_response_ids(uuid, text)', 'EXECUTE')
    and not has_function_privilege('anon', 'private.get_form_matched_response_ids(uuid, text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'private.get_form_matched_response_ids(uuid, text)', 'EXECUTE')
    and not exists (
      select 1
      from pg_proc as proc
      cross join lateral aclexplode(coalesce(proc.proacl, acldefault('f', proc.proowner))) acl
      where proc.oid = 'private.get_form_matched_response_ids(uuid, text)'::regprocedure
        and acl.grantee = 0
        and acl.privilege_type = 'EXECUTE'
    ),
  'get_form_matched_response_ids is service-only'
);

select ok(
  has_function_privilege('service_role', 'private.get_form_analytics_overview(uuid)', 'EXECUTE')
    and not has_function_privilege('anon', 'private.get_form_analytics_overview(uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'private.get_form_analytics_overview(uuid)', 'EXECUTE')
    and not exists (
      select 1
      from pg_proc as proc
      cross join lateral aclexplode(coalesce(proc.proacl, acldefault('f', proc.proowner))) acl
      where proc.oid = 'private.get_form_analytics_overview(uuid)'::regprocedure
        and acl.grantee = 0
        and acl.privilege_type = 'EXECUTE'
    ),
  'get_form_analytics_overview is service-only'
);

set local role service_role;

select is(
  (
    select count(*)::integer
    from private.form_committed_responses
    where form_id = 'ba1c08ba-9123-47ac-85a6-654b21d356a2'
  ),
  2,
  'Direct reads see one completed session and one sessionless historical response'
);

select is(
  (select count(*)::integer from private.get_form_matched_response_ids(
    'ba1c08ba-9123-47ac-85a6-654b21d356a2', 'pending@example.test'
  )),
  0,
  'Search does not expose a pending session'
);

select is(
  (select count(*)::integer from private.get_form_response_page(
    'ba1c08ba-9123-47ac-85a6-654b21d356a2', null, 10, 1
  )),
  2,
  'Response pagination starts from the committed set'
);

select is(
  (private.get_form_analytics_overview('ba1c08ba-9123-47ac-85a6-654b21d356a2')
    ->> 'totalSubmissions')::integer,
  2,
  'Analytics count only committed responses'
);

select is(
  (select count(*)::integer from private.get_form_matched_response_ids(
    'ba1c08ba-9123-47ac-85a6-654b21d356a2', 'historical@example.test'
  )),
  1,
  'Search still includes historical responses without a session'
);

reset role;
select * from finish();
rollback;
