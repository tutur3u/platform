begin;
select plan(4);

create temporary table observation_context (ws_id uuid primary key, actor_id uuid not null);
insert into observation_context
select '77777777-7777-4777-8777-777777777777'::uuid, id
from public.users order by created_at limit 1;
insert into public.workspaces (id, name, personal, creator_id)
select ws_id, 'Observation replay test', false, actor_id from observation_context;
insert into public.workspace_external_project_bindings (ws_id, is_enabled, settings)
select ws_id, true, '{"chat":{"enabled":true}}'::jsonb from observation_context;

select lives_ok(
  format(
    $$select private.external_chat_upsert_observation(
      %L, 'opaque-replay', 'bucket-1', 'visitor-1', 'profile:visitor-1',
      'profile_context', '{"displayName":"Visitor"}', now()
    )$$,
    (select ws_id from observation_context)
  ),
  'a profile-only record creates a thread'
);
select lives_ok(
  format(
    $$select private.external_chat_upsert_observation(
      %L, 'opaque-replay', 'bucket-1', 'visitor-1', 'profile:visitor-1',
      'profile_context', '{"displayName":"Updated visitor"}', now()
    )$$,
    (select ws_id from observation_context)
  ),
  'a profile replay is idempotent'
);
select is(
  (
    select count(*)::integer from private.external_chat_threads t
    cross join observation_context c
    where t.ws_id = c.ws_id and t.connector_key = 'opaque-replay'
  ),
  1,
  'replay retains one thread'
);
select is(
  (
    select payload->>'displayName' from private.external_chat_observations o
    cross join observation_context c
    where o.ws_id = c.ws_id and o.connector_key = 'opaque-replay'
  ),
  'Updated visitor',
  'replay updates dynamic content'
);

select * from finish();
rollback;
