begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
set local timezone = 'UTC';
select plan(18);

select ok(has_function_privilege('service_role',
  'public.publish_external_project_entry(uuid,text,uuid,uuid,timestamptz,timestamptz,uuid,jsonb,jsonb)', 'execute'),
  'service role may execute');
select ok(not has_function_privilege('anon',
  'public.publish_external_project_entry(uuid,text,uuid,uuid,timestamptz,timestamptz,uuid,jsonb,jsonb)', 'execute'),
  'anon cannot execute');
select ok(not has_function_privilege('authenticated',
  'public.publish_external_project_entry(uuid,text,uuid,uuid,timestamptz,timestamptz,uuid,jsonb,jsonb)', 'execute'),
  'authenticated cannot execute');

insert into auth.users (id) values ('7a9e0000-0000-4000-8000-0000000000a1') on conflict do nothing;
insert into public.users (id) values ('7a9e0000-0000-4000-8000-0000000000a1') on conflict do nothing;
insert into public.workspaces (id, name, personal, creator_id)
values ('7a9e0000-0000-4000-8000-00000000000a', 'Atomic CMS', false, '7a9e0000-0000-4000-8000-0000000000a1');
insert into public.canonical_external_projects (id, display_name, adapter)
values ('atomic-cms-test', 'Atomic CMS', 'custom');
insert into public.workspace_external_project_bindings (ws_id, canonical_project_id, is_enabled)
values ('7a9e0000-0000-4000-8000-00000000000a', 'atomic-cms-test', true);
insert into public.workspace_external_project_collections (id, ws_id, slug, title, collection_type)
values ('7a9e0000-0000-4000-8000-0000000001aa', '7a9e0000-0000-4000-8000-00000000000a', 'pages', 'Pages', 'page');
insert into public.workspace_external_project_entries (id, ws_id, collection_id, slug, title, updated_at)
values
  ('7a9e0000-0000-4000-8000-0000000002aa', '7a9e0000-0000-4000-8000-00000000000a',
   '7a9e0000-0000-4000-8000-0000000001aa', 'home', 'Home', '2026-11-20T01:00:00Z'),
  ('7a9e0000-0000-4000-8000-0000000002bb', '7a9e0000-0000-4000-8000-00000000000a',
   '7a9e0000-0000-4000-8000-0000000001aa', 'other', 'Other', '2026-11-20T01:00:00Z');
-- Production stamps asset inserts; freeze the fixture revisions instead.
create function pg_temp.pin_asset_revision() returns trigger language plpgsql as $$
begin
  new.updated_at := '2026-11-20T02:00:00Z';
  return new;
end;
$$;
create trigger zz_fixture_asset_revision before insert on public.workspace_external_project_assets
for each row execute function pg_temp.pin_asset_revision();

insert into public.workspace_external_project_assets (id, ws_id, entry_id, asset_type, updated_at)
values
  ('7a9e0000-0000-4000-8000-0000000003aa', '7a9e0000-0000-4000-8000-00000000000a',
   '7a9e0000-0000-4000-8000-0000000002aa', 'image', '2026-11-20T02:00:00Z'),
  ('7a9e0000-0000-4000-8000-0000000003bb', '7a9e0000-0000-4000-8000-00000000000a',
   '7a9e0000-0000-4000-8000-0000000002bb', 'image', '2026-11-20T02:00:00Z');

insert into auth.users (id) values ('7a9e0000-0000-4000-8000-0000000000b1') on conflict do nothing;
insert into public.users (id) values ('7a9e0000-0000-4000-8000-0000000000b1') on conflict do nothing;
insert into public.workspaces (id, name, personal) values ('00000000-0000-0000-0000-000000000000', 'Root', false)
on conflict do nothing;
insert into public.workspace_members (ws_id, user_id, type) values ('00000000-0000-0000-0000-000000000000', '7a9e0000-0000-4000-8000-0000000000b1', 'MEMBER')
on conflict do nothing;
update public.workspace_default_permissions set enabled = false
where ws_id = '00000000-0000-0000-0000-000000000000' and permission in ('admin', 'manage_external_projects', 'manage_workspace_roles');
insert into public.workspace_roles (id, ws_id, name)
values ('7a9e0000-0000-4000-8000-0000000000b2', '00000000-0000-0000-0000-000000000000', 'Root CMS role manager');
insert into public.workspace_role_permissions (ws_id, role_id, permission, enabled)
values ('00000000-0000-0000-0000-000000000000', '7a9e0000-0000-4000-8000-0000000000b2', 'manage_workspace_roles', true);
insert into public.workspace_role_members (role_id, user_id) values ('7a9e0000-0000-4000-8000-0000000000b2', '7a9e0000-0000-4000-8000-0000000000b1');

create function pg_temp.publish_fixture(
  revision timestamptz default '2026-11-20T02:00:00Z',
  asset uuid default '7a9e0000-0000-4000-8000-0000000003aa',
  expected timestamptz default '2026-11-20T01:00:00Z',
  actor uuid default '7a9e0000-0000-4000-8000-0000000000a1',
  project text default 'atomic-cms-test'
) returns public.workspace_external_project_entries language sql as $$
  select public.publish_external_project_entry(
    '7a9e0000-0000-4000-8000-00000000000a', project,
    '7a9e0000-0000-4000-8000-0000000002aa', actor, expected,
    '2026-11-20T03:00:00Z', '7a9e0000-0000-4000-8000-0000000004aa',
    jsonb_build_object(asset::text, jsonb_build_object('revision', revision, 'sha256', repeat('a', 64))),
    '{"profileData": {"tagline": "audited"}}'
  )
$$;

set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select throws_ok($$select pg_temp.publish_fixture(actor => '7a9e0000-0000-4000-8000-0000000000ff')$$,
  '42501', null, 'publisher permission is rechecked');
select throws_ok($$select pg_temp.publish_fixture(actor => '7a9e0000-0000-4000-8000-0000000000b1', expected => '2026-11-20T01:01:00Z')$$,
  'PT409', 'Entry changed before publication', 'root role managers reach the same scoped publication CAS');
select throws_ok($$select pg_temp.publish_fixture(project => 'other-project')$$,
  'PT409', null, 'workspace binding must match');
select throws_ok($$select pg_temp.publish_fixture(expected => '2026-11-20T01:01:00Z')$$,
  'PT409', null, 'entry compare-and-swap rejects a stale revision');
select throws_ok($$select pg_temp.publish_fixture(revision => '2026-11-20T02:01:00Z')$$,
  'PT422', null, 'changed asset revision aborts');
select throws_ok($$select pg_temp.publish_fixture(asset => '7a9e0000-0000-4000-8000-0000000003bb')$$,
  'PT422', null, 'another entry asset cannot be published');
reset role;

create function pg_temp.fail_publication_write() returns trigger language plpgsql as $$
begin
  raise exception 'fixture write failed' using errcode = '23514';
end;
$$;

create trigger fixture_proof_failure before insert on private.external_project_asset_publication_proofs
for each row execute function pg_temp.fail_publication_write();
set local role service_role;
select throws_ok($$select pg_temp.publish_fixture()$$, '23514', 'fixture write failed', 'proof failure rolls back publication');
reset role;
drop trigger fixture_proof_failure on private.external_project_asset_publication_proofs;
create trigger fixture_audit_failure before insert on public.workspace_external_project_publish_events
for each row execute function pg_temp.fail_publication_write();
set local role service_role;
select throws_ok($$select pg_temp.publish_fixture()$$, '23514', 'fixture write failed', 'audit failure rolls back publication');
reset role;
drop trigger fixture_audit_failure on public.workspace_external_project_publish_events;

select ok((select status = 'draft' and published_at is null and updated_at = '2026-11-20T01:00:00Z'
  from public.workspace_external_project_entries where id = '7a9e0000-0000-4000-8000-0000000002aa'),
  'failed attempts preserve the old entry revision');
select is((select count(*) from private.external_project_asset_publication_proofs
  where entry_id = '7a9e0000-0000-4000-8000-0000000002aa'), 0::bigint, 'failed attempts expose no proof');

delete from public.workspace_external_project_bindings where ws_id = '7a9e0000-0000-4000-8000-00000000000a';
insert into public.workspace_secrets (ws_id, name, value) values
  ('7a9e0000-0000-4000-8000-00000000000a', 'EXTERNAL_PROJECT_ENABLED', 'true'),
  ('7a9e0000-0000-4000-8000-00000000000a', 'EXTERNAL_PROJECT_ENABLED', 'true');
set local role service_role;
select throws_ok($$select pg_temp.publish_fixture()$$, 'PT409', 'Workspace project binding changed',
  'duplicate legacy enabled flags cannot substitute for the project binding');
reset role;
delete from public.workspace_secrets where ws_id = '7a9e0000-0000-4000-8000-00000000000a';
insert into public.workspace_secrets (ws_id, name, value) values
  ('7a9e0000-0000-4000-8000-00000000000a', 'EXTERNAL_PROJECT_ENABLED', 'true'),
  ('7a9e0000-0000-4000-8000-00000000000a', 'EXTERNAL_PROJECT_CANONICAL_ID', 'atomic-cms-test');
set local role service_role;
select throws_ok($$select pg_temp.publish_fixture(expected => '2026-11-20T01:01:00Z')$$,
  'PT409', 'Entry changed before publication', 'a complete legacy binding reaches the entry CAS');
reset role;
insert into public.workspace_external_project_bindings (ws_id, canonical_project_id, is_enabled)
values ('7a9e0000-0000-4000-8000-00000000000a', 'atomic-cms-test', true);

-- Pin the committed timestamp to a value independently hashed by the existing
-- TypeScript proof ID codec, including its six PostgREST fractional digits.
create function pg_temp.pin_published_revision() returns trigger language plpgsql as $$
begin
  new.updated_at := '2026-11-20T03:00:01.123456Z';
  return new;
end;
$$;
create trigger zz_fixture_publish_revision before update on public.workspace_external_project_entries
for each row execute function pg_temp.pin_published_revision();

set local role service_role;
select lives_ok($$select pg_temp.publish_fixture()$$, 'the publisher commits the entry, proof and audit');
reset role;
select ok(exists(
  select 1 from public.workspace_external_project_entries e
  join private.external_project_asset_publication_proofs p on p.entry_id = e.id
  where e.id = '7a9e0000-0000-4000-8000-0000000002aa' and e.status = 'published'
    and p.id = '5ab59a0a-5c5b-8a2d-9d68-5155cee32b2a'
    and p.published_at = e.published_at and p.entry_updated_at = e.updated_at
    and p.asset_revisions->'7a9e0000-0000-4000-8000-0000000003aa'->>'sha256' = repeat('a', 64)
), 'proof binds the committed versions and preserves the delivery proof ID');
select ok(exists(
  select 1 from public.workspace_external_project_publish_events
  where id = '7a9e0000-0000-4000-8000-0000000004aa'
    and event_kind = 'publish' and visibility_scope = 'public'
    and triggered_by = '7a9e0000-0000-4000-8000-0000000000a1'
    and profile_data->>'tagline' = 'audited'
), 'the committed audit records the publisher and snapshot');

select * from finish();
rollback;
