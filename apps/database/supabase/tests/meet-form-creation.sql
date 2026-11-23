-- private.meet_form_creation: reserve, materialize and publish one Meet inline
-- form per (meeting, request). Runs every call as service_role, the only
-- grantee, so the invoker function proves its own table privileges.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(43);

insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
  ('7f000000-0000-4000-8000-000000000001', 'meet-form-host@example.com', now(), '{}', '{}'),
  ('7f000000-0000-4000-8000-000000000002', 'meet-form-member@example.com', now(), '{}', '{}'),
  ('7f000000-0000-4000-8000-000000000003', 'meet-form-outsider@example.com', now(), '{}', '{}');
insert into public.workspaces (id, name, personal, creator_id) values
  ('7f000000-0000-4000-8000-0000000000a1', 'Meet forms', false, '7f000000-0000-4000-8000-000000000001'),
  ('7f000000-0000-4000-8000-0000000000a2', 'Other', false, '7f000000-0000-4000-8000-000000000003');
insert into public.workspace_members (ws_id, user_id, type) values
  ('7f000000-0000-4000-8000-0000000000a1', '7f000000-0000-4000-8000-000000000002', 'MEMBER')
  on conflict do nothing;
-- The member only holds explicit grants; the seeded member admin default is off.
update public.workspace_default_permissions set enabled = false
  where ws_id = '7f000000-0000-4000-8000-0000000000a1';
insert into public.workspace_meetings (id, ws_id, creator_id, name, time) values
  ('7f000000-0000-4000-8000-0000000000c1', '7f000000-0000-4000-8000-0000000000a1',
   '7f000000-0000-4000-8000-000000000001', 'Class', now()),
  ('7f000000-0000-4000-8000-0000000000c2', '7f000000-0000-4000-8000-0000000000a2',
   '7f000000-0000-4000-8000-000000000003', 'Elsewhere', now()),
  ('7f000000-0000-4000-8000-0000000000c3', '7f000000-0000-4000-8000-0000000000a1',
   '7f000000-0000-4000-8000-000000000001', 'Busy class', now());

create function pg_temp.scope(
  p_request text, p_actor text default '7f000000-0000-4000-8000-000000000001',
  p_meeting text default '7f000000-0000-4000-8000-0000000000c1',
  p_commitment text default repeat('a', 64)
) returns jsonb language sql as $$
  select jsonb_build_object('workspace_id', '7f000000-0000-4000-8000-0000000000a1',
    'meeting_id', p_meeting, 'actor_id', p_actor, 'request_id', p_request,
    'commitment', p_commitment);
$$;

-- Calls the RPC as service_role, returning the reply or the raised SQLSTATE.
create function pg_temp.rpc(p_scope jsonb, p_operation text, p_value jsonb default null)
returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  execute 'set local role service_role';
  begin
    r := private.meet_form_creation(p_scope, p_operation, p_value);
  exception when others then r := jsonb_build_object('sqlstate', sqlstate);
  end;
  execute 'reset role';
  return r;
end $$;

create function pg_temp.candidate(p_reserved jsonb, p_target text default null)
returns jsonb language sql as $$
  select jsonb_build_object(
    'launchId', p_reserved->>'launchId', 'formId', p_reserved->>'formId',
    'versionId', '7f000000-0000-4000-8000-0000000000f1',
    'form', jsonb_build_object(
      'id', p_reserved->>'formId', 'wsId', '7f000000-0000-4000-8000-0000000000a1',
      'creatorId', '7f000000-0000-4000-8000-000000000001',
      'createdAt', p_reserved->>'createdAt', 'updatedAt', p_reserved->>'createdAt',
      'title', 'Exit ticket', 'description', '', 'status', 'published',
      'accessMode', 'authenticated', 'openAt', null, 'closeAt', null, 'maxResponses', 30,
      'theme', '{}'::jsonb, 'seo', '{}'::jsonb,
      'settings', '{"requireTurnstile": true, "allowMultipleSubmissions": true}'::jsonb,
      'sections', jsonb_build_array(
        jsonb_build_object('id', '7f000000-0000-4000-8000-0000000000e1', 'title', 'One',
          'description', '', 'questions', jsonb_build_array(
            jsonb_build_object('id', '7f000000-0000-4000-8000-0000000000d1',
              'sectionId', '7f000000-0000-4000-8000-0000000000e1', 'type', 'single_choice',
              'title', 'Pick', 'description', '', 'required', true, 'image', null,
              'settings', '{}'::jsonb, 'options', jsonb_build_array(
                jsonb_build_object('id', '7f000000-0000-4000-8000-0000000000b1', 'label', 'A', 'value', 'a', 'image', null),
                jsonb_build_object('id', '7f000000-0000-4000-8000-0000000000b2', 'label', 'B', 'value', 'b', 'image', null))))),
        jsonb_build_object('id', '7f000000-0000-4000-8000-0000000000e2', 'title', 'Two',
          'description', '', 'questions', jsonb_build_array(
            jsonb_build_object('id', '7f000000-0000-4000-8000-0000000000d2',
              'sectionId', '7f000000-0000-4000-8000-0000000000e2', 'type', 'short_text',
              'title', 'Why', 'description', '', 'required', false, 'image', null,
              'settings', '{}'::jsonb, 'options', '[]'::jsonb)))),
      'logicRules', jsonb_build_array(jsonb_build_object(
        'id', '7f000000-0000-4000-8000-0000000000a9', 'triggerType', 'question',
        'sourceQuestionId', '7f000000-0000-4000-8000-0000000000d1',
        'sourceSectionId', '7f000000-0000-4000-8000-0000000000e1',
        'operator', 'equals', 'comparisonValue', 'b', 'actionType', 'go_to_section',
        'targetSectionId', coalesce(p_target, '7f000000-0000-4000-8000-0000000000e2')))));
$$;

-- Grants and table isolation.
select ok(not has_function_privilege('anon', 'private.meet_form_creation(jsonb,text,jsonb)', 'execute'), 'anon cannot execute');
select ok(not has_function_privilege('authenticated', 'private.meet_form_creation(jsonb,text,jsonb)', 'execute'), 'authenticated cannot execute');
select ok(has_function_privilege('service_role', 'private.meet_form_creation(jsonb,text,jsonb)', 'execute'), 'service_role can execute');
select ok(not has_table_privilege('authenticated', 'private.meet_form_creation_intents', 'select'), 'authenticated cannot read intents');
select ok(not has_table_privilege('service_role', 'private.meet_form_creation_intents', 'delete'), 'service_role cannot delete intents');
select ok((select relrowsecurity from pg_class where oid = 'private.meet_form_creation_intents'::regclass), 'intents enforce RLS');
select is((select prosecdef from pg_proc where oid = 'private.meet_form_creation(jsonb,text,jsonb)'::regprocedure), false, 'runs as the invoker');
select is((select proconfig from pg_proc where oid = 'private.meet_form_creation(jsonb,text,jsonb)'::regprocedure), array['search_path=""'], 'pins an empty search_path');

-- Input bounds and authorization.
select is(pg_temp.rpc(pg_temp.scope('7f000000-0000-4000-8000-000000000101'), 'drop')->>'kind', 'invalid', 'unknown operation');
select is(pg_temp.rpc(pg_temp.scope('not-a-uuid'), 'reserve')->>'kind', 'invalid', 'malformed request id');
select is(pg_temp.rpc(pg_temp.scope('7f000000-0000-4000-8000-000000000101', p_commitment => 'short'), 'reserve')->>'kind', 'invalid', 'malformed commitment');
select is(pg_temp.rpc(pg_temp.scope('7f000000-0000-4000-8000-000000000101', p_meeting => '7f000000-0000-4000-8000-0000000000c2'), 'reserve')->>'kind', 'not_found', 'meeting from another workspace');
select is(pg_temp.rpc(pg_temp.scope('7f000000-0000-4000-8000-000000000101', '7f000000-0000-4000-8000-000000000003'), 'reserve')->>'kind', 'forbidden', 'non-member');
select is(pg_temp.rpc(pg_temp.scope('7f000000-0000-4000-8000-000000000101', '7f000000-0000-4000-8000-000000000002'), 'reserve')->>'kind', 'forbidden', 'member without manage_forms');
select is((select count(*) from private.meet_form_creation_intents)::integer, 0, 'refusals store nothing');

-- Reserve and replay.
create temp table reserved on commit drop as
  select pg_temp.rpc(pg_temp.scope('7f000000-0000-4000-8000-000000000101'), 'reserve') as reply;
select is((select reply->>'kind' from reserved), 'reserved', 'reserves ids');
select is(pg_temp.rpc(pg_temp.scope('7f000000-0000-4000-8000-000000000101'), 'reserve'), (select reply from reserved), 'reserve replays the same ids');
select is(pg_temp.rpc(pg_temp.scope('7f000000-0000-4000-8000-000000000101', p_commitment => repeat('b', 64)), 'reserve')->>'kind', 'conflict', 'another definition cannot reuse the request');
select is(pg_temp.rpc(pg_temp.scope('7f000000-0000-4000-8000-000000000101'), 'finalize')->>'kind', 'not_found', 'finalize needs a materialized form');
select is(pg_temp.rpc(pg_temp.scope('7f000000-0000-4000-8000-000000000199'), 'materialize', '{}')->>'kind', 'not_found', 'materialize needs a reservation');

-- Materialize rejects candidates that do not match the reservation.
select is(pg_temp.rpc(pg_temp.scope('7f000000-0000-4000-8000-000000000101'), 'materialize',
  jsonb_set(pg_temp.candidate((select reply from reserved)), '{formId}', '"7f000000-0000-4000-8000-0000000000f9"'))->>'kind',
  'invalid', 'foreign form id');
select is(pg_temp.rpc(pg_temp.scope('7f000000-0000-4000-8000-000000000101'), 'materialize',
  jsonb_set(pg_temp.candidate((select reply from reserved)), '{form,creatorId}', '"7f000000-0000-4000-8000-000000000003"'))->>'kind',
  'invalid', 'another creator');
select is(pg_temp.rpc(pg_temp.scope('7f000000-0000-4000-8000-000000000101'), 'materialize',
  jsonb_set(pg_temp.candidate((select reply from reserved)), '{form,sections,0,questions,0,sectionId}', '"7f000000-0000-4000-8000-0000000000e2"'))->>'kind',
  'invalid', 'question outside its section');
select is(pg_temp.rpc(pg_temp.scope('7f000000-0000-4000-8000-000000000101'), 'materialize',
  jsonb_set(pg_temp.candidate((select reply from reserved)), '{form,title}', to_jsonb(repeat('x', 4001))))->>'kind',
  'invalid', 'title over the strict limit');
select is(pg_temp.rpc(pg_temp.scope('7f000000-0000-4000-8000-000000000101'), 'materialize',
  jsonb_set(pg_temp.candidate((select reply from reserved)), '{form,settings,requireTurnstile}', 'false'))->>'kind',
  'invalid', 'a launch that skips Turnstile');
select is(pg_temp.rpc(pg_temp.scope('7f000000-0000-4000-8000-000000000101'), 'materialize',
  jsonb_set(pg_temp.candidate((select reply from reserved)), '{form,description}', to_jsonb(repeat('x', 98304))))->>'kind',
  'invalid', 'a candidate over the size bound');

-- A branch into another form's section is refused with no partial rows.
insert into private.forms (id, ws_id, creator_id, title) values
  ('7f000000-0000-4000-8000-0000000000f8', '7f000000-0000-4000-8000-0000000000a2', '7f000000-0000-4000-8000-000000000003', 'Theirs');
insert into private.form_sections (id, form_id, title) values
  ('7f000000-0000-4000-8000-0000000000e9', '7f000000-0000-4000-8000-0000000000f8', 'Theirs');
select is(pg_temp.rpc(pg_temp.scope('7f000000-0000-4000-8000-000000000101'), 'materialize',
  pg_temp.candidate((select reply from reserved), '7f000000-0000-4000-8000-0000000000e9'))->>'kind',
  'invalid', 'branch into another form');
select is((select count(*) from private.forms where id = ((select reply from reserved)->>'formId')::uuid)::integer, 0, 'a refused candidate leaves no form');

-- Materialize stores a draft with the exact definition.
create temp table staged on commit drop as
  select pg_temp.rpc(pg_temp.scope('7f000000-0000-4000-8000-000000000101'), 'materialize',
    pg_temp.candidate((select reply from reserved))) as reply;
select is((select reply->>'kind' from staged), 'staged', 'materializes');
select is((select reply->'launch' from staged), pg_temp.candidate((select reply from reserved)), 'returns the stored launch');
select results_eq(
  format($q$select status, creator_id::text, access_mode, max_responses, (settings->>'requireTurnstile')::boolean
    from private.forms where id = %L$q$, (select reply from reserved)->>'formId'),
  $q$values ('draft', '7f000000-0000-4000-8000-000000000001', 'authenticated', 30, true)$q$,
  'a staged form is a draft owned by the actor that requires Turnstile');
select is((select count(*) from private.form_sections where form_id = ((select reply from reserved)->>'formId')::uuid)::integer, 2, 'sections');
select is((select count(*) from private.form_questions where form_id = ((select reply from reserved)->>'formId')::uuid)::integer, 2, 'questions');
select is((select count(*) from private.form_question_options where question_id = '7f000000-0000-4000-8000-0000000000d1')::integer, 2, 'options');
select is((select target_section_id::text from private.form_logic_rules where form_id = ((select reply from reserved)->>'formId')::uuid), '7f000000-0000-4000-8000-0000000000e2', 'branch');
select is(pg_temp.rpc(pg_temp.scope('7f000000-0000-4000-8000-000000000101'), 'materialize',
  jsonb_set(pg_temp.candidate((select reply from reserved)), '{versionId}', '"7f000000-0000-4000-8000-0000000000f2"')),
  (select reply from staged), 'materialize replays the first candidate');
select is(pg_temp.rpc(pg_temp.scope('7f000000-0000-4000-8000-000000000101'), 'reserve'), (select reply from staged), 'reserve recovers a lost materialize reply');

-- Authorization runs before any replay of an existing intent.
select is(pg_temp.rpc(pg_temp.scope('7f000000-0000-4000-8000-000000000101', '7f000000-0000-4000-8000-000000000002'), 'finalize')->>'kind', 'forbidden', 'a non-manager cannot finalize');

-- Finalize publishes once.
select is(pg_temp.rpc(pg_temp.scope('7f000000-0000-4000-8000-000000000101'), 'finalize'),
  jsonb_build_object('kind', 'published', 'launch', (select reply->'launch' from staged)), 'finalize publishes');
select ok((select status = 'published' and published_at is not null from private.forms where id = ((select reply from reserved)->>'formId')::uuid), 'the form accepts responses');
select is(pg_temp.rpc(pg_temp.scope('7f000000-0000-4000-8000-000000000101'), 'finalize')->>'kind', 'published', 'finalize replays');

-- Fifty intents per room.
insert into private.meet_form_creation_intents
  (meeting_id, request_id, ws_id, actor_id, commitment, form_id, launch_id, created_at)
  select '7f000000-0000-4000-8000-0000000000c3', gen_random_uuid(), '7f000000-0000-4000-8000-0000000000a1',
    '7f000000-0000-4000-8000-000000000001', repeat('c', 64), gen_random_uuid(), gen_random_uuid(), now()
  from generate_series(1, 50);
select is(pg_temp.rpc(pg_temp.scope('7f000000-0000-4000-8000-000000000102', p_meeting => '7f000000-0000-4000-8000-0000000000c3'), 'reserve')->>'kind', 'limit', 'room creation cap');

-- Deleting the form makes its intent unrecoverable instead of resurrecting it.
delete from private.forms where id = ((select reply from reserved)->>'formId')::uuid;
select is(pg_temp.rpc(pg_temp.scope('7f000000-0000-4000-8000-000000000101'), 'reserve')->>'kind', 'not_found', 'deleted form');

select * from finish();
rollback;
