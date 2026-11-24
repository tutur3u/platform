-- CMS delivery version counter: every table that feeds the published delivery
-- payload bumps its own workspace's counter on insert, update and hard delete
-- (one bump per statement), a second workspace is untouched, the publish RPCs
-- bump, and the table and functions are service-role only.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

create function pg_temp.u(p_suffix text) returns uuid language sql immutable as $$
  select ('7a9e0000-0000-4000-8000-' || lpad(p_suffix, 12, '0'))::uuid
$$;
create function pg_temp.v(p_ws uuid) returns bigint language sql security definer as $$
  select coalesce((select version from private.workspace_external_project_delivery_versions
    where ws_id = p_ws), 0)
$$;
-- Runs one statement and returns "bumps of A,bumps of B".
create function pg_temp.delta(p_stmt text) returns text language plpgsql as $$
declare a0 bigint := pg_temp.v(pg_temp.u('a')); b0 bigint := pg_temp.v(pg_temp.u('b'));
begin
  execute p_stmt;
  return (pg_temp.v(pg_temp.u('a')) - a0) || ',' || (pg_temp.v(pg_temp.u('b')) - b0);
end;
$$;

-- Writes to blocks and entry relations also touch the parent entry in the same
-- transaction, so they bump more than once; they must move A and never B.
create function pg_temp.moved(p_stmt text) returns text language plpgsql as $$
declare a0 bigint := pg_temp.v(pg_temp.u('a')); b0 bigint := pg_temp.v(pg_temp.u('b'));
begin
  execute p_stmt;
  return (pg_temp.v(pg_temp.u('a')) > a0) || ',' || (pg_temp.v(pg_temp.u('b')) > b0);
end;
$$;

-- Fixtures: A and B each have a binding, collections and entries. C only has
-- the legacy secrets pair.
insert into auth.users (id) select pg_temp.u(x) from unnest(array['a1', 'b1']) x on conflict (id) do nothing;
insert into public.users (id) select pg_temp.u(x) from unnest(array['a1', 'b1']) x on conflict (id) do nothing;
insert into public.workspaces (id, name, personal, creator_id) values
  (pg_temp.u('a'), 'Versions A', false, pg_temp.u('a1')),
  (pg_temp.u('b'), 'Versions B', false, pg_temp.u('b1')),
  (pg_temp.u('c'), 'Versions C', false, pg_temp.u('a1'));
insert into public.canonical_external_projects (id, display_name, adapter) values
  ('versions-a', 'Versions A', 'custom'),
  ('versions-b', 'Versions B', 'custom');
insert into public.workspace_external_project_bindings (ws_id, canonical_project_id, is_enabled) values
  (pg_temp.u('a'), 'versions-a', true),
  (pg_temp.u('b'), 'versions-b', true);
insert into public.workspace_external_project_collections (id, ws_id, slug, title, collection_type) values
  (pg_temp.u('c1a'), pg_temp.u('a'), 'pages', 'Pages', 'page'),
  (pg_temp.u('c2a'), pg_temp.u('a'), 'posts', 'Posts', 'page'),
  (pg_temp.u('c1b'), pg_temp.u('b'), 'pages', 'Pages', 'page');
insert into public.workspace_external_project_entries (id, ws_id, collection_id, slug, title) values
  (pg_temp.u('e1a'), pg_temp.u('a'), pg_temp.u('c1a'), 'home', 'Home'),
  (pg_temp.u('e2a'), pg_temp.u('a'), pg_temp.u('c1a'), 'about', 'About'),
  (pg_temp.u('e1b'), pg_temp.u('b'), pg_temp.u('c1b'), 'home', 'Home');
insert into public.workspace_external_project_blocks (id, ws_id, entry_id, block_type) values
  (pg_temp.u('b1a'), pg_temp.u('a'), pg_temp.u('e1a'), 'markdown');
insert into public.workspace_external_project_assets (id, ws_id, entry_id, asset_type) values
  (pg_temp.u('a1a'), pg_temp.u('a'), pg_temp.u('e1a'), 'image');
insert into public.workspace_external_project_relation_definitions (id, ws_id, key, label, source_collection_id) values
  (pg_temp.u('d1a'), pg_temp.u('a'), 'related', 'Related', pg_temp.u('c1a'));
insert into public.workspace_external_project_relation_definition_targets (id, ws_id, relation_definition_id, target_collection_id) values
  (pg_temp.u('71a'), pg_temp.u('a'), pg_temp.u('d1a'), pg_temp.u('c2a'));
insert into public.workspace_external_project_entry_relations (id, ws_id, from_entry_id, to_entry_id, relation_type) values
  (pg_temp.u('81a'), pg_temp.u('a'), pg_temp.u('e1a'), pg_temp.u('e2a'), 'related');
insert into public.workspace_external_project_field_definitions (id, ws_id, key, field_scope, field_type) values
  (pg_temp.u('f1a'), pg_temp.u('a'), 'subtitle', 'profile_data', 'string');
insert into public.workspace_external_project_page_versions (id, ws_id, entry_id, schema_version, data) values
  (pg_temp.u('91a'), pg_temp.u('a'), pg_temp.u('e1a'), 1, '{}');
insert into public.workspace_external_project_publish_events (id, ws_id, canonical_external_project_id) values
  (pg_temp.u('61a'), pg_temp.u('a'), 'versions-a');
insert into private.external_project_asset_publication_proofs
  (id, ws_id, canonical_external_project_id, entry_id, published_at, entry_updated_at, asset_revisions) values
  (pg_temp.u('51a'), pg_temp.u('a'), 'versions-a', pg_temp.u('e1a'), now(), now(), '{}');

select is(pg_temp.v(pg_temp.u('a')) > 0 and pg_temp.v(pg_temp.u('b')) > 0, true,
  'fixture writes already bumped both workspaces');
select is(pg_temp.v(pg_temp.u('c')), 0::bigint, 'a workspace without CMS writes has no counter row');

-- One bump per table and event, on the writing workspace only.
select is(pg_temp.delta($$insert into public.workspace_external_project_collections (id, ws_id, slug, title, collection_type) values (pg_temp.u('c9a'), pg_temp.u('a'), 'extra', 'Extra', 'page')$$), '1,0', 'collections: insert bumps its workspace only');
select is(pg_temp.delta($$update public.workspace_external_project_collections set title = 'Extra 2' where id = pg_temp.u('c9a')$$), '1,0', 'collections: update bumps its workspace only');
select is(pg_temp.delta($$delete from public.workspace_external_project_collections where id = pg_temp.u('c9a')$$), '1,0', 'collections: hard delete bumps its workspace only');

select is(pg_temp.delta($$insert into public.workspace_external_project_entries (id, ws_id, collection_id, slug, title) values (pg_temp.u('e9a'), pg_temp.u('a'), pg_temp.u('c1a'), 'extra', 'Extra')$$), '1,0', 'entries: insert bumps its workspace only');
select is(pg_temp.delta($$update public.workspace_external_project_entries set title = 'Extra 2' where id = pg_temp.u('e9a')$$), '1,0', 'entries: update bumps its workspace only');
select is(pg_temp.delta($$delete from public.workspace_external_project_entries where id = pg_temp.u('e9a')$$), '1,0', 'entries: hard delete bumps its workspace only');

select is(pg_temp.moved($$insert into public.workspace_external_project_blocks (id, ws_id, entry_id, block_type, sort_order) values (pg_temp.u('b9a'), pg_temp.u('a'), pg_temp.u('e1a'), 'markdown', 9)$$), 'true,false', 'blocks: insert bumps its workspace only');
select is(pg_temp.moved($$update public.workspace_external_project_blocks set title = 'T' where id = pg_temp.u('b9a')$$), 'true,false', 'blocks: update bumps its workspace only');
select is(pg_temp.moved($$delete from public.workspace_external_project_blocks where id = pg_temp.u('b9a')$$), 'true,false', 'blocks: hard delete bumps its workspace only');

select is(pg_temp.delta($$insert into public.workspace_external_project_assets (id, ws_id, entry_id, asset_type) values (pg_temp.u('a9a'), pg_temp.u('a'), pg_temp.u('e1a'), 'image')$$), '1,0', 'assets: insert bumps its workspace only');
select is(pg_temp.delta($$update public.workspace_external_project_assets set alt_text = 'x' where id = pg_temp.u('a9a')$$), '1,0', 'assets: update bumps its workspace only');
select is(pg_temp.delta($$delete from public.workspace_external_project_assets where id = pg_temp.u('a9a')$$), '1,0', 'assets: hard delete bumps its workspace only');

select is(pg_temp.moved($$insert into public.workspace_external_project_entry_relations (id, ws_id, from_entry_id, to_entry_id, relation_type) values (pg_temp.u('89a'), pg_temp.u('a'), pg_temp.u('e2a'), pg_temp.u('e1a'), 'related')$$), 'true,false', 'entry relations: insert bumps its workspace only');
select is(pg_temp.moved($$update public.workspace_external_project_entry_relations set sort_order = 3 where id = pg_temp.u('89a')$$), 'true,false', 'entry relations: update bumps its workspace only');
select is(pg_temp.moved($$delete from public.workspace_external_project_entry_relations where id = pg_temp.u('89a')$$), 'true,false', 'entry relations: hard delete bumps its workspace only');

select is(pg_temp.delta($$insert into public.workspace_external_project_relation_definitions (id, ws_id, key, label, source_collection_id) values (pg_temp.u('d9a'), pg_temp.u('a'), 'extra', 'Extra', pg_temp.u('c1a'))$$), '1,0', 'relation definitions: insert bumps its workspace only');
select is(pg_temp.delta($$update public.workspace_external_project_relation_definitions set label = 'Extra 2' where id = pg_temp.u('d9a')$$), '1,0', 'relation definitions: update bumps its workspace only');
select is(pg_temp.delta($$delete from public.workspace_external_project_relation_definitions where id = pg_temp.u('d9a')$$), '1,0', 'relation definitions: hard delete bumps its workspace only');

select is(pg_temp.delta($$insert into public.workspace_external_project_relation_definition_targets (id, ws_id, relation_definition_id, target_collection_id) values (pg_temp.u('79a'), pg_temp.u('a'), pg_temp.u('d1a'), pg_temp.u('c1a'))$$), '1,0', 'relation targets: insert bumps its workspace only');
select is(pg_temp.delta($$update public.workspace_external_project_relation_definition_targets set created_at = now() where id = pg_temp.u('79a')$$), '1,0', 'relation targets: update bumps its workspace only');
select is(pg_temp.delta($$delete from public.workspace_external_project_relation_definition_targets where id = pg_temp.u('79a')$$), '1,0', 'relation targets: hard delete bumps its workspace only');

select is(pg_temp.delta($$insert into public.workspace_external_project_field_definitions (id, ws_id, key, field_scope, field_type) values (pg_temp.u('f9a'), pg_temp.u('a'), 'extra', 'profile_data', 'string')$$), '1,0', 'field definitions: insert bumps its workspace only');
select is(pg_temp.delta($$update public.workspace_external_project_field_definitions set label = 'Extra' where id = pg_temp.u('f9a')$$), '1,0', 'field definitions: update bumps its workspace only');
select is(pg_temp.delta($$delete from public.workspace_external_project_field_definitions where id = pg_temp.u('f9a')$$), '1,0', 'field definitions: hard delete bumps its workspace only');

select is(pg_temp.delta($$insert into public.workspace_external_project_page_versions (id, ws_id, entry_id, schema_version, data) values (pg_temp.u('99a'), pg_temp.u('a'), pg_temp.u('e1a'), 1, '{}')$$), '1,0', 'page versions: insert bumps its workspace only');
select is(pg_temp.delta($$update public.workspace_external_project_page_versions set note = 'n' where id = pg_temp.u('99a')$$), '1,0', 'page versions: update bumps its workspace only');
select is(pg_temp.delta($$delete from public.workspace_external_project_page_versions where id = pg_temp.u('99a')$$), '1,0', 'page versions: hard delete bumps its workspace only');

select is(pg_temp.delta($$insert into public.workspace_external_project_publish_events (id, ws_id, canonical_external_project_id) values (pg_temp.u('69a'), pg_temp.u('a'), 'versions-a')$$), '1,0', 'publish events: insert bumps its workspace only');
select is(pg_temp.delta($$update public.workspace_external_project_publish_events set event_kind = 'unpublish' where id = pg_temp.u('69a')$$), '1,0', 'publish events: update bumps its workspace only');
select is(pg_temp.delta($$delete from public.workspace_external_project_publish_events where id = pg_temp.u('69a')$$), '1,0', 'publish events: hard delete bumps its workspace only');

select is(pg_temp.delta($$insert into private.external_project_asset_publication_proofs (id, ws_id, canonical_external_project_id, entry_id, published_at, entry_updated_at, asset_revisions) values (pg_temp.u('59a'), pg_temp.u('a'), 'versions-a', pg_temp.u('e1a'), now(), now(), '{}')$$), '1,0', 'publication proofs: insert bumps its workspace only');
select is(pg_temp.delta($$update private.external_project_asset_publication_proofs set asset_revisions = '{"k":1}' where id = pg_temp.u('59a')$$), '1,0', 'publication proofs: update bumps its workspace only');
select is(pg_temp.delta($$delete from private.external_project_asset_publication_proofs where id = pg_temp.u('59a')$$), '1,0', 'publication proofs: hard delete bumps its workspace only');

select is(pg_temp.delta($$update public.workspace_external_project_bindings set settings = '{"cmsSite":{"template":"x"}}' where ws_id = pg_temp.u('a')$$), '1,0', 'bindings: update bumps its workspace only');
select is(pg_temp.delta($$delete from public.workspace_external_project_bindings where ws_id = pg_temp.u('a')$$), '1,0', 'bindings: hard delete bumps its workspace only');
select is(pg_temp.delta($$insert into public.workspace_external_project_bindings (ws_id, canonical_project_id, is_enabled) values (pg_temp.u('a'), 'versions-a', true)$$), '1,0', 'bindings: insert bumps its workspace only');

-- Legacy binding secrets and the canonical project row.
select is(pg_temp.delta($$insert into public.workspace_secrets (ws_id, name, value) values (pg_temp.u('a'), 'EXTERNAL_PROJECT_ENABLED', 'true')$$), '1,0', 'secrets: the enabled flag bumps its workspace only');
select is(pg_temp.delta($$update public.workspace_secrets set value = 'false' where ws_id = pg_temp.u('a') and name = 'EXTERNAL_PROJECT_ENABLED'$$), '1,0', 'secrets: updating the enabled flag bumps');
select is(pg_temp.delta($$delete from public.workspace_secrets where ws_id = pg_temp.u('a') and name = 'EXTERNAL_PROJECT_ENABLED'$$), '1,0', 'secrets: deleting the enabled flag bumps');
select is(pg_temp.delta($$insert into public.workspace_secrets (ws_id, name, value) values (pg_temp.u('a'), 'UNRELATED_SECRET', 'x')$$), '0,0', 'secrets: an unrelated secret does not bump');
select is(pg_temp.delta($$update public.canonical_external_projects set delivery_profile = '{"template":"y"}' where id = 'versions-a'$$), '1,0', 'canonical project update bumps only the workspaces bound to it');

-- Statement semantics.
select is(pg_temp.delta($$update public.workspace_external_project_entries set title = 'Both' where ws_id = pg_temp.u('a')$$), '1,0', 'a multi-row statement bumps once');
select is(pg_temp.delta($$update public.workspace_external_project_entries set title = 'Tenants' where id in (pg_temp.u('e1a'), pg_temp.u('e1b'))$$), '1,1', 'a statement across two workspaces bumps each once');
select is(pg_temp.delta($$update public.workspace_external_project_entries set title = 'None' where id = pg_temp.u('ffff')$$), '0,0', 'a statement that matches no row does not bump');
select is(pg_temp.delta($t$do $inner$ begin
  begin
    update public.workspace_external_project_entries set title = 'Rolled back' where id = pg_temp.u('e1a');
    raise exception 'abort';
  exception when raise_exception then null;
  end;
end $inner$$t$), '0,0', 'a rolled-back write does not bump');

-- Publish RPCs bump through the entry, proof, event and version writes.
create temp table marks (k text primary key, a bigint, b bigint);
grant all on marks to public;
insert into marks values ('entry', pg_temp.v(pg_temp.u('a')), pg_temp.v(pg_temp.u('b')));
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select lives_ok($$select public.publish_external_project_entry(
  pg_temp.u('a'), 'versions-a', pg_temp.u('e2a'), pg_temp.u('a1'),
  (select updated_at from public.workspace_external_project_entries where id = pg_temp.u('e2a')),
  now(), pg_temp.u('62a'), '{}'::jsonb, '{"profileData": {"k": "v"}}'::jsonb)$$,
  'publish_external_project_entry runs');
reset role;
select ok(pg_temp.v(pg_temp.u('a')) > (select a from marks where k = 'entry'),
  'publish_external_project_entry bumps the workspace');
select is(pg_temp.v(pg_temp.u('b')), (select b from marks where k = 'entry'),
  'the entry publish leaves the other workspace unchanged');

insert into marks values ('page', pg_temp.v(pg_temp.u('a')), pg_temp.v(pg_temp.u('b')));
set local role service_role;
select lives_ok($$select public.publish_workspace_external_project_page_version(pg_temp.u('a'), pg_temp.u('91a'), pg_temp.u('a1'))$$,
  'publish_workspace_external_project_page_version runs');
reset role;
select ok(pg_temp.v(pg_temp.u('a')) > (select a from marks where k = 'page'),
  'publish_workspace_external_project_page_version bumps the workspace');
select is(pg_temp.v(pg_temp.u('b')), (select b from marks where k = 'page'),
  'the page publish leaves the other workspace unchanged');

-- The one-round-trip read for the delivery route.
insert into marks values ('state', pg_temp.v(pg_temp.u('a')), 0);
create temp table fingerprints (k text primary key, f text);
grant all on fingerprints to public;
set local role service_role;
select results_eq($$select enabled, canonical_id, adapter, canonical_project->>'id', version
  from private.get_external_project_delivery_state(pg_temp.u('a'))$$,
  $$select true, 'versions-a', 'custom', 'versions-a', a from marks where k = 'state'$$,
  'delivery state returns the binding, canonical project and version');
select is((select length(binding_fingerprint) from private.get_external_project_delivery_state(pg_temp.u('a'))),
  16, 'the fingerprint is 16 characters');
insert into fingerprints select 'before', binding_fingerprint from private.get_external_project_delivery_state(pg_temp.u('a'));
select results_eq($$select enabled, canonical_id, canonical_project is null, version
  from private.get_external_project_delivery_state(pg_temp.u('ffff'))$$,
  $$values (false, null::text, true, 0::bigint)$$, 'an unknown workspace is disabled at version 0');
reset role;
update public.canonical_external_projects set delivery_profile = '{"template":"z"}' where id = 'versions-a';
set local role service_role;
select isnt((select binding_fingerprint from private.get_external_project_delivery_state(pg_temp.u('a'))),
  (select f from fingerprints where k = 'before'), 'a delivery profile change moves the fingerprint');
reset role;
insert into public.workspace_secrets (ws_id, name, value) values
  (pg_temp.u('c'), 'EXTERNAL_PROJECT_ENABLED', 'true'),
  (pg_temp.u('c'), 'EXTERNAL_PROJECT_CANONICAL_ID', 'versions-b');
set local role service_role;
select results_eq($$select enabled, canonical_id, version > 0
  from private.get_external_project_delivery_state(pg_temp.u('c'))$$,
  $$values (true, 'versions-b', true)$$, 'legacy secrets resolve when no binding row exists');
reset role;
update public.workspace_external_project_bindings set is_enabled = false where ws_id = pg_temp.u('b');
set local role service_role;
select results_eq($$select enabled, canonical_project is null
  from private.get_external_project_delivery_state(pg_temp.u('b'))$$,
  $$values (false, true)$$, 'a disabled binding hides the canonical project');
reset role;

-- Access: RLS on, no policies, service role reads only, definers locked down.
select is((select relrowsecurity from pg_class
  where oid = 'private.workspace_external_project_delivery_versions'::regclass), true, 'row level security is on');
select is((select count(*) from pg_policies
  where schemaname = 'private' and tablename = 'workspace_external_project_delivery_versions'),
  0::bigint, 'the table has no policies');
select is(has_table_privilege(r, 'private.workspace_external_project_delivery_versions', p), (r = 'service_role' and p = 'SELECT'),
  r || ' ' || p || ' on the version table')
from unnest(array['anon', 'authenticated', 'service_role']) r
cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p;
select is(has_function_privilege(r, 'private.get_external_project_delivery_state(uuid)', 'EXECUTE'), r = 'service_role',
  r || ' execute on the state read')
from unnest(array['anon', 'authenticated', 'service_role']) r;
select is(has_function_privilege(r, f, 'EXECUTE'), false, r || ' cannot execute ' || f)
from unnest(array['anon', 'authenticated', 'service_role']) r
cross join unnest(array[
  'private.bump_workspace_external_project_delivery_versions(uuid[])',
  'private.bump_external_project_delivery_versions()',
  'private.bump_external_project_delivery_versions_for_secrets()',
  'private.bump_external_project_delivery_versions_for_canonical()']) f;
select is((select count(*) from pg_trigger
  where tgname like 'cms_delivery_version_%' and not tgisinternal and tgenabled = 'O'), 40::bigint,
  'three triggers on each of 12 content tables, three on secrets, one on canonical projects');

set local role anon;
select throws_ok($$select * from private.workspace_external_project_delivery_versions$$, '42501', null, 'anon cannot read the table');
select throws_ok($$select * from private.get_external_project_delivery_state(pg_temp.u('a'))$$, '42501', null, 'anon cannot call the state read');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"7a9e0000-0000-4000-8000-0000000000a1"}';
select throws_ok($$select * from private.workspace_external_project_delivery_versions$$, '42501', null, 'authenticated cannot read the table');
select throws_ok($$select * from private.get_external_project_delivery_state(pg_temp.u('a'))$$, '42501', null, 'authenticated cannot call the state read');
reset role;
set local role service_role;
select throws_ok($$insert into private.workspace_external_project_delivery_versions (ws_id, version) values (pg_temp.u('c'), 99)$$, '42501', null, 'service role cannot write the counter directly');
reset role;

-- Deleting a workspace removes its counter and never fails on the bump.
insert into marks values ('delete', pg_temp.v(pg_temp.u('a')), pg_temp.v(pg_temp.u('b')));
select lives_ok($$delete from public.workspaces where id = pg_temp.u('a')$$, 'deleting a workspace with CMS rows succeeds');
select is((select count(*) from private.workspace_external_project_delivery_versions where ws_id = pg_temp.u('a')),
  0::bigint, 'the deleted workspace has no counter row');
select is(pg_temp.v(pg_temp.u('b')), (select b from marks where k = 'delete'), 'the other workspace keeps its version');

select ok(to_regclass(i) is not null and (select indisvalid from pg_index where indexrelid = to_regclass(i)), i || ' exists')
from unnest(array[
  'public.workspace_external_project_assets_entry_idx',
  'public.workspace_external_project_assets_block_idx',
  'public.workspace_secrets_ws_id_name_idx',
  'public.workspace_external_project_entry_relations_definition_idx']) i;

select * from finish();
rollback;
