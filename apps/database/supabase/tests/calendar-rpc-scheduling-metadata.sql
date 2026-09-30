begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(28);

insert into public.users (id) values
  ('00000000-0000-4000-8000-000000009101'),
  ('00000000-0000-4000-8000-000000009102');
insert into public.workspaces (id, name, personal, creator_id) values
  ('00000000-0000-4000-8000-000000009111', 'Calendar RPC metadata fixture', false,
   '00000000-0000-4000-8000-000000009101');
insert into public.workspace_members (ws_id, user_id, type) values
  ('00000000-0000-4000-8000-000000009111', '00000000-0000-4000-8000-000000009101', 'MEMBER'),
  ('00000000-0000-4000-8000-000000009111', '00000000-0000-4000-8000-000000009102', 'MEMBER')
on conflict (ws_id, user_id) do nothing;
-- RPC imports use the existing service_role contract; no fixture grants.
insert into private.workspace_calendars (id, ws_id, name) values
  ('00000000-0000-4000-8000-000000009121',
   '00000000-0000-4000-8000-000000009111', 'Provider source');

-- A session-local payload builder avoids changing any production helper or grant.
create function pg_temp.calendar_event_payload(
  metadata jsonb default null, include_metadata boolean default true,
  event_provider text default 'google', event_id text default 'instance'
) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object(
    'ws_id', '00000000-0000-4000-8000-000000009111',
    'provider', event_provider, 'external_calendar_id', 'source',
    'external_event_id', event_id, 'google_calendar_id', 'source',
    'google_event_id', event_id, 'title', 'Incoming plaintext',
    'description', 'Incoming description', 'location', 'Incoming location',
    'start_at', '2026-10-04T09:00:00Z', 'end_at', '2026-10-04T10:00:00Z',
    'color', 'BLUE', 'sync_status', 'synced', 'is_encrypted', false
  ) || case when include_metadata then jsonb_build_object('scheduling_metadata', metadata)
       else '{}'::jsonb end);
$$;

select ok(not (select prosecdef from pg_proc where oid =
  'public.upsert_calendar_events_and_count(jsonb)'::regprocedure), 'RPC remains security invoker');
select ok((select relrowsecurity from pg_class where oid = 'public.workspace_calendar_events'::regclass), 'event table RLS remains enabled');
set local role service_role;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000009101', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select is(current_user::text, 'service_role', 'positive RPC path runs as service_role, not postgres');
select ok(has_table_privilege('service_role', 'public.workspace_calendar_events', 'INSERT'), 'production service_role retains table INSERT privilege');
select ok(not has_table_privilege('authenticated', 'public.workspace_calendar_events', 'INSERT'), 'authenticated INSERT privilege remains absent');
select ok(not has_table_privilege('anon', 'public.workspace_calendar_events', 'INSERT'), 'anonymous INSERT privilege remains absent');
select is(public.upsert_calendar_events_and_count(pg_temp.calendar_event_payload(
  '{"google_color":{"background":"#f691b2","inherited":true},"google_recurrence":{"version":1,"calendar_id":"source","auth_token_id":"verified-row","recurring_event_id":"series","original_start_time":{"date_time":"2026-10-03T09:00:00Z","date":null,"time_zone":null},"status":"confirmed"},"google_event_type":"workingLocation","google_working_location_type":"customLocation","google_working_location_label":"Home","google_custom_unowned":{"keep":true},"meeting_request":{"id":"request","nested":{"keep":true}}}'::jsonb)),
  '{"inserted":1,"updated":0}'::jsonb, 'service role invoker inserts metadata via actual production RPC contract');
select is((select scheduling_metadata->'google_color'->>'background' from public.workspace_calendar_events where external_event_id = 'instance'), '#f691b2', 'custom source RGB persists');
select is((select scheduling_metadata->'google_recurrence'->>'auth_token_id' from public.workspace_calendar_events where external_event_id = 'instance'), 'verified-row', 'verified account identity persists');
select is((select scheduling_metadata->'google_recurrence'->'original_start_time'->>'date_time' from public.workspace_calendar_events where external_event_id = 'instance'), '2026-10-03T09:00:00Z', 'moved instance original slot persists');
select is((select scheduling_metadata->>'google_working_location_label' from public.workspace_calendar_events where external_event_id = 'instance'), 'Home', 'working location persists');

reset role;
update public.workspace_calendar_events set title = 'cipher title', description = 'cipher description',
  location = 'cipher location', is_encrypted = true,
  source_calendar_id = '00000000-0000-4000-8000-000000009121'
where external_event_id = 'instance';
set local role service_role;
select is(public.upsert_calendar_events_and_count(pg_temp.calendar_event_payload(null, false)),
  '{"inserted":0,"updated":1}'::jsonb, 'omitted metadata still counts normal update');
select is((select scheduling_metadata->'google_recurrence'->>'recurring_event_id' from public.workspace_calendar_events where external_event_id = 'instance'), 'series', 'omitted metadata preserves full existing JSON');
select is(public.upsert_calendar_events_and_count(pg_temp.calendar_event_payload('null'::jsonb)),
  '{"inserted":0,"updated":1}'::jsonb, 'legacy explicit JSON null is accepted without clearing');
select is((select scheduling_metadata->>'google_working_location_label' from public.workspace_calendar_events where external_event_id = 'instance'), 'Home', 'JSON null preserves provider keys');
select is((select title || '/' || description || '/' || location from public.workspace_calendar_events where external_event_id = 'instance'), 'cipher title/cipher description/cipher location', 'plaintext import cannot overwrite encrypted sensitive fields');
select ok((select is_encrypted from public.workspace_calendar_events where external_event_id = 'instance'), 'encrypted flag remains true');
select is((select source_calendar_id::text from public.workspace_calendar_events where external_event_id = 'instance'), '00000000-0000-4000-8000-000000009121', 'missing source identity preserves existing source');

select is(public.upsert_calendar_events_and_count(pg_temp.calendar_event_payload(
  '{"google_color":{"background":"#d06b64","inherited":true},"new_custom":{"nested":{"added":true}}}'::jsonb)),
  '{"inserted":0,"updated":1}'::jsonb, 'complete ordinary Google snapshot updates metadata');
select ok((select not (scheduling_metadata ?| array['google_recurrence','google_event_type','google_working_location_type','google_working_location_label']) from public.workspace_calendar_events where external_event_id = 'instance'), 'ordinary snapshot clears stale finite recurrence and working-location keys');
select ok((select scheduling_metadata @> '{"meeting_request":{"id":"request","nested":{"keep":true}},"google_custom_unowned":{"keep":true},"new_custom":{"nested":{"added":true}}}'::jsonb from public.workspace_calendar_events where external_event_id = 'instance'), 'unrelated nested JSON and unknown google keys survive snapshot merge');
select is((select scheduling_metadata->'google_color'->>'background' from public.workspace_calendar_events where external_event_id = 'instance'), '#d06b64', 'new provider color replaces prior color');
select throws_ok($$select public.upsert_calendar_events_and_count(pg_temp.calendar_event_payload('[1]'::jsonb))$$,
  '22023', 'Calendar scheduling_metadata must be an object or null', 'malformed nonobject metadata is rejected');
select is((select scheduling_metadata->'google_color'->>'background' from public.workspace_calendar_events where external_event_id = 'instance'), '#d06b64', 'invalid payload does not mutate existing metadata');

-- Native/microsoft objects are patches, not authoritative Google snapshots.
select public.upsert_calendar_events_and_count(pg_temp.calendar_event_payload(
  '{"google_recurrence":{"recurring_event_id":"retained"},"custom":{"old":true}}'::jsonb, true, 'microsoft', 'other-provider'));
select public.upsert_calendar_events_and_count(pg_temp.calendar_event_payload(
  '{"custom":{"new":true}}'::jsonb, true, 'microsoft', 'other-provider'));
select is((select scheduling_metadata->'google_recurrence'->>'recurring_event_id' from public.workspace_calendar_events where external_event_id = 'other-provider'), 'retained', 'other provider merge does not erase Google-owned keys');
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000009102', true);
select throws_ok($$select public.upsert_calendar_events_and_count(pg_temp.calendar_event_payload('{}'::jsonb, true, 'google', 'denied-member'))$$,
  '42501', null, 'authenticated member cannot bypass table ACL/RLS through invoker RPC');
set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claim.sub', '', true);
select throws_ok($$select public.upsert_calendar_events_and_count(pg_temp.calendar_event_payload('{}'::jsonb, true, 'google', 'denied-anon'))$$,
  '42501', null, 'anonymous caller cannot bypass table ACL/RLS through invoker RPC');
reset role;
select is((select count(*) from public.workspace_calendar_events where external_event_id in ('denied-member','denied-anon')), 0::bigint, 'denied callers persisted no event or metadata');
select * from finish();
rollback;
