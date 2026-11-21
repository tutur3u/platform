begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(8);

insert into auth.users (id) values ('7a9e0000-0000-4000-8000-000000009001') on conflict do nothing;
insert into public.users (id) values ('7a9e0000-0000-4000-8000-000000009001') on conflict do nothing;
insert into public.workspaces (id, name, personal, creator_id)
values ('7a9e0000-0000-4000-8000-000000009002', 'Publication payload fixture', false,
        '7a9e0000-0000-4000-8000-000000009001');
insert into public.canonical_external_projects (id, display_name, adapter)
values ('publish-payload-limit-test', 'Publication payload fixture', 'custom');

create function pg_temp.insert_event(event_id uuid, snapshot jsonb)
returns void language sql as $$
  insert into public.workspace_external_project_publish_events (
    id, ws_id, canonical_external_project_id, payload
  ) values (
    event_id, '7a9e0000-0000-4000-8000-000000009002', 'publish-payload-limit-test', snapshot
  )
$$;

create function pg_temp.devos_sized_snapshot() returns jsonb language sql as $$
  select jsonb_build_object(
    'adapter', 'custom',
    'profileData', '{}'::jsonb,
    'collections', jsonb_build_array(jsonb_build_object(
      'slug', 'characters',
      'entries', jsonb_build_array(jsonb_build_object(
        'slug', 'sample-character',
        'blocks', jsonb_build_array(jsonb_build_object('text', repeat('Character lore. ', 600))),
        'assets', jsonb_build_array(jsonb_build_object(
          'assetUrl', '/api/v1/workspaces/example/external-projects/assets/portrait?v=1',
          'alt_text', 'Character portrait'
        ))
      ))
    ))
  )
$$;

select is(public.strict_payload_field_byte_limit('workspace_external_project_publish_events', 'payload'),
  262144, 'publish-event payload has an explicit 256 KiB limit');
select is(public.strict_payload_field_byte_limit('workspace_external_project_publish_events', 'profile_data'),
  16384, 'profile data keeps the existing limit');
select is(public.strict_payload_field_byte_limit('workspace_external_project_entries', 'payload'),
  8192, 'other tables keep the payload default');
select ok(octet_length(pg_temp.devos_sized_snapshot()::text) > 8192,
  'the Devos-sized delivery fixture exceeds the old bound');
select lives_ok($$select pg_temp.insert_event(
  '7a9e0000-0000-4000-8000-000000009003', pg_temp.devos_sized_snapshot())$$,
  'a Devos-sized delivery snapshot is accepted');
-- JSON string quotes add two bytes to the stored representation.
select lives_ok($$select pg_temp.insert_event(
  '7a9e0000-0000-4000-8000-000000009004', to_jsonb(repeat('x', 262142)))$$,
  'exactly 262144 stored bytes are accepted');
select throws_ok($$update public.workspace_external_project_publish_events
  set payload = to_jsonb(repeat('x', 262143))
  where id = '7a9e0000-0000-4000-8000-000000009004'$$,
  '22001', 'PAYLOAD_FIELD_BYTES_EXCEEDED: workspace_external_project_publish_events.payload exceeds 262144 bytes',
  'one byte above the limit is rejected');
select is((select octet_length(payload::text)
  from public.workspace_external_project_publish_events
  where id = '7a9e0000-0000-4000-8000-000000009004'), 262144,
  'the rejected write preserves the boundary payload');

select * from finish();
rollback;
