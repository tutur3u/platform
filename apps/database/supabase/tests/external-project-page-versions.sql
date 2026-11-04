-- CMS page versions per role: manager, publisher, editor, non-member, anon,
-- service role; workspace isolation, the atomic audited publish, content
-- rollback and the delivery read. Also runs on the PGlite stand-in in
-- apps/database/scripts/external-project-page-versions.test.mjs.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- Users: a1 creates (manages) A, b1 creates B, c1 publishes in A, e1 edits in
-- A, d1 belongs to neither. Only A has a CMS binding.
insert into auth.users (id) select ('7a9e0000-0000-4000-8000-0000000000' || u)::uuid
from unnest(array['a1', 'b1', 'c1', 'd1', 'e1']) u on conflict (id) do nothing;
insert into public.users (id) select ('7a9e0000-0000-4000-8000-0000000000' || u)::uuid
from unnest(array['a1', 'b1', 'c1', 'd1', 'e1']) u on conflict (id) do nothing;
insert into public.workspaces (id, name, personal, creator_id) values
  ('7a9e0000-0000-4000-8000-00000000000a', 'Pages A', false, '7a9e0000-0000-4000-8000-0000000000a1'),
  ('7a9e0000-0000-4000-8000-00000000000b', 'Pages B', false, '7a9e0000-0000-4000-8000-0000000000b1');
insert into public.workspace_members (ws_id, user_id, type) values
  ('7a9e0000-0000-4000-8000-00000000000a', '7a9e0000-0000-4000-8000-0000000000c1', 'MEMBER'),
  ('7a9e0000-0000-4000-8000-00000000000a', '7a9e0000-0000-4000-8000-0000000000e1', 'MEMBER')
on conflict (ws_id, user_id) do update set type = excluded.type;
-- Only the roles below grant access, never a member default.
update public.workspace_default_permissions set enabled = false
where ws_id = '7a9e0000-0000-4000-8000-00000000000a' and permission in
  ('admin', 'manage_external_projects', 'publish_external_projects', 'edit_external_projects');
insert into public.workspace_roles (id, ws_id, name) values
  ('7a9e0000-0000-4000-8000-0000000000c2', '7a9e0000-0000-4000-8000-00000000000a', 'Publisher'),
  ('7a9e0000-0000-4000-8000-0000000000e2', '7a9e0000-0000-4000-8000-00000000000a', 'Editor');
insert into public.workspace_role_permissions (ws_id, role_id, permission, enabled) values
  ('7a9e0000-0000-4000-8000-00000000000a', '7a9e0000-0000-4000-8000-0000000000c2', 'publish_external_projects', true),
  ('7a9e0000-0000-4000-8000-00000000000a', '7a9e0000-0000-4000-8000-0000000000e2', 'edit_external_projects', true);
insert into public.workspace_role_members (role_id, user_id) values
  ('7a9e0000-0000-4000-8000-0000000000c2', '7a9e0000-0000-4000-8000-0000000000c1'),
  ('7a9e0000-0000-4000-8000-0000000000e2', '7a9e0000-0000-4000-8000-0000000000e1');
insert into public.canonical_external_projects (id, display_name, adapter)
values ('page-versions-test', 'Page versions test', 'custom');
insert into public.workspace_external_project_bindings (ws_id, canonical_project_id, is_enabled)
values ('7a9e0000-0000-4000-8000-00000000000a', 'page-versions-test', true);
insert into public.workspace_external_project_collections (id, ws_id, slug, title, collection_type) values
  ('7a9e0000-0000-4000-8000-0000000001aa', '7a9e0000-0000-4000-8000-00000000000a', 'pages', 'Pages', 'page'),
  ('7a9e0000-0000-4000-8000-0000000001bb', '7a9e0000-0000-4000-8000-00000000000b', 'pages', 'Pages', 'page');
insert into public.workspace_external_project_entries (id, ws_id, collection_id, slug, title) values
  ('7a9e0000-0000-4000-8000-0000000002aa', '7a9e0000-0000-4000-8000-00000000000a', '7a9e0000-0000-4000-8000-0000000001aa', 'home', 'Home'),
  ('7a9e0000-0000-4000-8000-0000000002bb', '7a9e0000-0000-4000-8000-00000000000b', '7a9e0000-0000-4000-8000-0000000001bb', 'home', 'Home');

set local role authenticated;

-- Owner B saves a draft in B; B has no binding, so it cannot publish.
set local request.jwt.claims = '{"role":"authenticated","sub":"7a9e0000-0000-4000-8000-0000000000b1"}';
insert into public.workspace_external_project_page_versions (id, ws_id, entry_id, schema_version, data) values
  ('7a9e0000-0000-4000-8000-0000000003bb', '7a9e0000-0000-4000-8000-00000000000b', '7a9e0000-0000-4000-8000-0000000002bb', 1, '{}');
select throws_ok($$select public.publish_workspace_external_project_page_version('7a9e0000-0000-4000-8000-00000000000b', '7a9e0000-0000-4000-8000-0000000003bb')$$,
  '55000', null, 'error-deny: no publishing without an enabled binding');

-- Manager: saves drafts (client number and status ignored), stays in A.
set local request.jwt.claims = '{"role":"authenticated","sub":"7a9e0000-0000-4000-8000-0000000000a1"}';
insert into public.workspace_external_project_page_versions (id, ws_id, entry_id, version_number, schema_version, data, status, published_at) values
  ('7a9e0000-0000-4000-8000-0000000003a1', '7a9e0000-0000-4000-8000-00000000000a', '7a9e0000-0000-4000-8000-0000000002aa', 9, 1, '{"v":1}', 'published', now());
insert into public.workspace_external_project_page_versions (id, ws_id, entry_id, schema_version, data) values
  ('7a9e0000-0000-4000-8000-0000000003a2', '7a9e0000-0000-4000-8000-00000000000a', '7a9e0000-0000-4000-8000-0000000002aa', 1, '{"v":2}'),
  ('7a9e0000-0000-4000-8000-0000000003a3', '7a9e0000-0000-4000-8000-00000000000a', '7a9e0000-0000-4000-8000-0000000002aa', 1, '{"v":3}');
select results_eq($$select version_number, status from public.workspace_external_project_page_versions order by version_number$$,
  $$values (1, 'draft'), (2, 'draft'), (3, 'draft')$$, 'manager: sees only A versions, numbered in order, saved as drafts');
select throws_ok($$insert into public.workspace_external_project_page_versions (ws_id, entry_id, schema_version, data) values ('7a9e0000-0000-4000-8000-00000000000b', '7a9e0000-0000-4000-8000-0000000002bb', 1, '{}')$$,
  '42501', null, 'manager: cannot save in workspace B');
select throws_ok($$insert into public.workspace_external_project_page_versions (ws_id, entry_id, schema_version, data) values ('7a9e0000-0000-4000-8000-00000000000a', '7a9e0000-0000-4000-8000-0000000002bb', 1, '{}')$$,
  '23503', null, 'error-deny: a version cannot attach to an entry in another workspace');
select throws_ok($$select public.publish_workspace_external_project_page_version('7a9e0000-0000-4000-8000-00000000000b', '7a9e0000-0000-4000-8000-0000000003bb')$$,
  '42501', null, 'manager: cannot publish in workspace B');
select throws_ok($$select public.publish_workspace_external_project_page_version('7a9e0000-0000-4000-8000-00000000000a', '7a9e0000-0000-4000-8000-0000000003bb')$$,
  'P0002', null, 'error-deny: a B version cannot be published through A');
select throws_ok($$update public.workspace_external_project_page_versions set data = '{}' where id = '7a9e0000-0000-4000-8000-0000000003a1'$$,
  '42501', null, 'manager: versions are immutable');
select throws_ok($$update public.workspace_external_project_entries set published_page_version_id = '7a9e0000-0000-4000-8000-0000000003a1' where id = '7a9e0000-0000-4000-8000-0000000002aa'$$,
  '42501', null, 'manager: cannot move the pointer without the publish function');

-- Editor: reads and saves drafts in A only; never publishes.
set local request.jwt.claims = '{"role":"authenticated","sub":"7a9e0000-0000-4000-8000-0000000000e1"}';
select is((select count(*)::int from public.workspace_external_project_page_versions), 3, 'editor: reads A versions only');
select lives_ok($$insert into public.workspace_external_project_page_versions (id, ws_id, entry_id, schema_version, data) values ('7a9e0000-0000-4000-8000-0000000003a4', '7a9e0000-0000-4000-8000-00000000000a', '7a9e0000-0000-4000-8000-0000000002aa', 1, '{"v":4}')$$,
  'editor: saves a draft');
select throws_ok($$select public.publish_workspace_external_project_page_version('7a9e0000-0000-4000-8000-00000000000a', '7a9e0000-0000-4000-8000-0000000003a1')$$,
  '42501', null, 'editor: cannot publish');
select is(public.can_edit_workspace_external_projects('7a9e0000-0000-4000-8000-00000000000a', '7a9e0000-0000-4000-8000-0000000000a1'), false,
  'editor: the edit helper cannot impersonate the owner');

-- Non-member: nothing.
set local request.jwt.claims = '{"role":"authenticated","sub":"7a9e0000-0000-4000-8000-0000000000d1"}';
select is((select count(*)::int from public.workspace_external_project_page_versions), 0, 'non-member: sees no versions');
select throws_ok($$insert into public.workspace_external_project_page_versions (ws_id, entry_id, schema_version, data) values ('7a9e0000-0000-4000-8000-00000000000a', '7a9e0000-0000-4000-8000-0000000002aa', 1, '{}')$$,
  '42501', null, 'non-member: cannot save');
select throws_ok($$select public.publish_workspace_external_project_page_version('7a9e0000-0000-4000-8000-00000000000a', '7a9e0000-0000-4000-8000-0000000003a1', '7a9e0000-0000-4000-8000-0000000000a1')$$,
  '42501', null, 'non-member: cannot publish, even naming the owner');

-- Publisher: edits too, publishes atomically with one public audit event.
set local request.jwt.claims = '{"role":"authenticated","sub":"7a9e0000-0000-4000-8000-0000000000c1"}';
select lives_ok($$insert into public.workspace_external_project_page_versions (ws_id, entry_id, schema_version, data) values ('7a9e0000-0000-4000-8000-00000000000a', '7a9e0000-0000-4000-8000-0000000002aa', 1, '{"v":5}')$$,
  'publisher: saves a draft');
select is((public.publish_workspace_external_project_page_version('7a9e0000-0000-4000-8000-00000000000a', '7a9e0000-0000-4000-8000-0000000003a1')).status,
  'published', 'publisher: publishing marks the version published');
select results_eq($$select e.published_page_version_id, v.published_by, p.event_kind::text, p.visibility_scope, p.triggered_by
    from public.workspace_external_project_entries e
    join public.workspace_external_project_page_versions v on v.id = e.published_page_version_id
    join public.workspace_external_project_publish_events p on p.entry_id = e.id
     and p.payload ->> 'page_version_id' = v.id::text
    where e.id = '7a9e0000-0000-4000-8000-0000000002aa'$$,
  $$values ('7a9e0000-0000-4000-8000-0000000003a1'::uuid, '7a9e0000-0000-4000-8000-0000000000c1'::uuid, 'publish', 'public', '7a9e0000-0000-4000-8000-0000000000c1'::uuid)$$,
  'publisher: the pointer, status and public audit event land together');
-- A preview event never moves public state.
insert into public.workspace_external_project_publish_events (ws_id, canonical_external_project_id, entry_id, event_kind, visibility_scope, payload)
values ('7a9e0000-0000-4000-8000-00000000000a', 'page-versions-test', '7a9e0000-0000-4000-8000-0000000002aa', 'preview', 'preview',
  '{"page_version_id":"7a9e0000-0000-4000-8000-0000000003a4"}');
update public.workspace_external_project_entries set published_page_version_id = '7a9e0000-0000-4000-8000-0000000003a4'
where id = '7a9e0000-0000-4000-8000-0000000002aa';
select results_eq($$select published_page_version_id from public.workspace_external_project_entries where id = '7a9e0000-0000-4000-8000-0000000002aa'$$,
  $$values ('7a9e0000-0000-4000-8000-0000000003a1'::uuid)$$, 'publisher: a preview event or direct update cannot move the pointer');
-- Content rollback: publish v2, then republish v1.
select lives_ok($$select public.publish_workspace_external_project_page_version('7a9e0000-0000-4000-8000-00000000000a', '7a9e0000-0000-4000-8000-0000000003a2')$$, 'publisher: publishes v2');
select lives_ok($$select public.publish_workspace_external_project_page_version('7a9e0000-0000-4000-8000-00000000000a', '7a9e0000-0000-4000-8000-0000000003a1')$$, 'publisher: rolls back to v1');
select results_eq($$select published_page_version_id from public.workspace_external_project_entries where id = '7a9e0000-0000-4000-8000-0000000002aa'$$,
  $$values ('7a9e0000-0000-4000-8000-0000000003a1'::uuid)$$, 'rollback: the pointer is back on v1');
select results_eq($$select version_number, status from public.workspace_external_project_page_versions order by version_number$$,
  $$values (1, 'published'), (2, 'published'), (3, 'draft'), (4, 'draft'), (5, 'draft')$$, 'rollback: every version is kept');
select is((select count(*)::int from public.workspace_external_project_publish_events where event_kind = 'publish'), 3,
  'rollback: every publish is audited');

-- Service role (API admin client): publishes only for an allowed actor and
-- delivers only the published version.
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select throws_ok($$select public.publish_workspace_external_project_page_version('7a9e0000-0000-4000-8000-00000000000a', '7a9e0000-0000-4000-8000-0000000003a2', '7a9e0000-0000-4000-8000-0000000000e1')$$,
  '42501', null, 'service role: cannot publish for an editor');
select throws_ok($$select public.publish_workspace_external_project_page_version('7a9e0000-0000-4000-8000-00000000000a', '7a9e0000-0000-4000-8000-0000000003a2', null)$$,
  '42501', null, 'service role: cannot publish without an actor');
select throws_ok($$update public.workspace_external_project_entries set published_page_version_id = null where id = '7a9e0000-0000-4000-8000-0000000002aa'$$,
  '42501', null, 'service role: cannot move the pointer directly');
select results_eq($$select id, data from public.get_published_workspace_external_project_page_version('7a9e0000-0000-4000-8000-00000000000a', '7a9e0000-0000-4000-8000-0000000002aa')$$,
  $$values ('7a9e0000-0000-4000-8000-0000000003a1'::uuid, '{"v":1}'::jsonb)$$, 'delivery: only the published version, never newer drafts');
select is_empty($$select 1 from public.get_published_workspace_external_project_page_version('7a9e0000-0000-4000-8000-00000000000b', '7a9e0000-0000-4000-8000-0000000002bb')$$,
  'delivery: an unpublished page returns nothing');

-- Anonymous callers have no access.
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok($$select 1 from public.workspace_external_project_page_versions$$, '42501', null, 'anon: cannot read versions');
select throws_ok($$select public.publish_workspace_external_project_page_version('7a9e0000-0000-4000-8000-00000000000a', '7a9e0000-0000-4000-8000-0000000003a1', '7a9e0000-0000-4000-8000-0000000000a1')$$,
  '42501', null, 'anon: cannot publish');
select throws_ok($$select 1 from public.get_published_workspace_external_project_page_version('7a9e0000-0000-4000-8000-00000000000a', '7a9e0000-0000-4000-8000-0000000002aa')$$,
  '42501', null, 'anon: cannot call the delivery read directly');

-- Deleting an entry still cascades through the pointer.
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"7a9e0000-0000-4000-8000-0000000000a1"}';
select lives_ok($$delete from public.workspace_external_project_entries where id = '7a9e0000-0000-4000-8000-0000000002aa'$$, 'manager: deletes a published entry');
reset role;
select is((select count(*)::int from public.workspace_external_project_page_versions where ws_id = '7a9e0000-0000-4000-8000-00000000000a'), 0,
  'entry deletion removes its versions');

select * from finish();
rollback;
