-- CMS page versions: workspace isolation, non-member denial, publish pointer
-- and content rollback. Also runs on the PGlite stand-in in
-- apps/database/scripts/external-project-page-versions.test.mjs.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- Owner A and owner B create their workspaces; P publishes in A through a
-- role; X belongs to neither.
insert into auth.users (id) values
  ('7a9e0000-0000-4000-8000-0000000000a1'),
  ('7a9e0000-0000-4000-8000-0000000000b1'),
  ('7a9e0000-0000-4000-8000-0000000000c1'),
  ('7a9e0000-0000-4000-8000-0000000000d1')
on conflict (id) do nothing;
insert into public.users (id) values
  ('7a9e0000-0000-4000-8000-0000000000a1'),
  ('7a9e0000-0000-4000-8000-0000000000b1'),
  ('7a9e0000-0000-4000-8000-0000000000c1'),
  ('7a9e0000-0000-4000-8000-0000000000d1')
on conflict (id) do nothing;
insert into public.workspaces (id, name, personal, creator_id) values
  ('7a9e0000-0000-4000-8000-00000000000a', 'Pages A', false, '7a9e0000-0000-4000-8000-0000000000a1'),
  ('7a9e0000-0000-4000-8000-00000000000b', 'Pages B', false, '7a9e0000-0000-4000-8000-0000000000b1');
insert into public.workspace_members (ws_id, user_id, type) values
  ('7a9e0000-0000-4000-8000-00000000000a', '7a9e0000-0000-4000-8000-0000000000c1', 'MEMBER')
on conflict (ws_id, user_id) do update set type = excluded.type;
-- Only the publisher role below grants P access, never a member default.
update public.workspace_default_permissions set enabled = false
where ws_id = '7a9e0000-0000-4000-8000-00000000000a'
  and permission in ('admin', 'manage_external_projects', 'publish_external_projects');
insert into public.workspace_roles (id, ws_id, name) values
  ('7a9e0000-0000-4000-8000-0000000000e1', '7a9e0000-0000-4000-8000-00000000000a', 'Publisher');
insert into public.workspace_role_permissions (ws_id, role_id, permission, enabled) values
  ('7a9e0000-0000-4000-8000-00000000000a', '7a9e0000-0000-4000-8000-0000000000e1', 'publish_external_projects', true);
insert into public.workspace_role_members (role_id, user_id) values
  ('7a9e0000-0000-4000-8000-0000000000e1', '7a9e0000-0000-4000-8000-0000000000c1');
insert into public.workspace_external_project_collections (id, ws_id, slug, title, collection_type) values
  ('7a9e0000-0000-4000-8000-0000000001aa', '7a9e0000-0000-4000-8000-00000000000a', 'pages', 'Pages', 'page'),
  ('7a9e0000-0000-4000-8000-0000000001bb', '7a9e0000-0000-4000-8000-00000000000b', 'pages', 'Pages', 'page');
insert into public.workspace_external_project_entries (id, ws_id, collection_id, slug, title) values
  ('7a9e0000-0000-4000-8000-0000000002aa', '7a9e0000-0000-4000-8000-00000000000a', '7a9e0000-0000-4000-8000-0000000001aa', 'home', 'Home'),
  ('7a9e0000-0000-4000-8000-0000000002bb', '7a9e0000-0000-4000-8000-00000000000b', '7a9e0000-0000-4000-8000-0000000001bb', 'home', 'Home');

set local role authenticated;

-- Owner B saves a draft in B.
set local request.jwt.claims = '{"role":"authenticated","sub":"7a9e0000-0000-4000-8000-0000000000b1"}';
insert into public.workspace_external_project_page_versions (id, ws_id, entry_id, schema_version, data) values
  ('7a9e0000-0000-4000-8000-0000000003bb', '7a9e0000-0000-4000-8000-00000000000b', '7a9e0000-0000-4000-8000-0000000002bb', 1, '{"content":[]}');

-- Owner A saves drafts in A; a client cannot pick the number or status.
set local request.jwt.claims = '{"role":"authenticated","sub":"7a9e0000-0000-4000-8000-0000000000a1"}';
insert into public.workspace_external_project_page_versions (id, ws_id, entry_id, version_number, schema_version, data, status, published_at) values
  ('7a9e0000-0000-4000-8000-0000000003a1', '7a9e0000-0000-4000-8000-00000000000a', '7a9e0000-0000-4000-8000-0000000002aa', 9, 1, '{"content":[1]}', 'published', now());
insert into public.workspace_external_project_page_versions (id, ws_id, entry_id, schema_version, data) values
  ('7a9e0000-0000-4000-8000-0000000003a2', '7a9e0000-0000-4000-8000-00000000000a', '7a9e0000-0000-4000-8000-0000000002aa', 1, '{"content":[2]}'),
  ('7a9e0000-0000-4000-8000-0000000003a3', '7a9e0000-0000-4000-8000-00000000000a', '7a9e0000-0000-4000-8000-0000000002aa', 1, '{"content":[3]}');
select results_eq(
  $$select version_number, status from public.workspace_external_project_page_versions order by version_number$$,
  $$values (1, 'draft'), (2, 'draft'), (3, 'draft')$$,
  'owner A sees only A versions, numbered in order and saved as drafts'
);
select throws_ok(
  $$insert into public.workspace_external_project_page_versions (ws_id, entry_id, schema_version, data) values ('7a9e0000-0000-4000-8000-00000000000b', '7a9e0000-0000-4000-8000-0000000002bb', 1, '{}')$$,
  '42501', null, 'owner A cannot save a version in workspace B'
);
select throws_ok(
  $$insert into public.workspace_external_project_page_versions (ws_id, entry_id, schema_version, data) values ('7a9e0000-0000-4000-8000-00000000000a', '7a9e0000-0000-4000-8000-0000000002bb', 1, '{}')$$,
  '23502', null, 'a version cannot attach to an entry in another workspace'
);
select throws_ok(
  $$select public.publish_workspace_external_project_page_version('7a9e0000-0000-4000-8000-00000000000b', '7a9e0000-0000-4000-8000-0000000003bb')$$,
  '42501', null, 'owner A cannot publish in workspace B'
);
select throws_ok(
  $$select public.publish_workspace_external_project_page_version('7a9e0000-0000-4000-8000-00000000000a', '7a9e0000-0000-4000-8000-0000000003bb')$$,
  'P0002', null, 'owner A cannot publish a B version through workspace A'
);
select throws_ok(
  $$update public.workspace_external_project_page_versions set data = '{}' where id = '7a9e0000-0000-4000-8000-0000000003a1'$$,
  '42501', null, 'versions are immutable for clients'
);
select throws_ok(
  $$update public.workspace_external_project_entries set published_page_version_id = '7a9e0000-0000-4000-8000-0000000003a1' where id = '7a9e0000-0000-4000-8000-0000000002aa'$$,
  '23514', null, 'the entry cannot point at a draft version'
);

-- A non-member reads nothing, saves nothing, publishes nothing, and cannot
-- publish as owner A.
set local request.jwt.claims = '{"role":"authenticated","sub":"7a9e0000-0000-4000-8000-0000000000d1"}';
select is((select count(*)::int from public.workspace_external_project_page_versions), 0, 'a non-member sees no versions');
select throws_ok(
  $$insert into public.workspace_external_project_page_versions (ws_id, entry_id, schema_version, data) values ('7a9e0000-0000-4000-8000-00000000000a', '7a9e0000-0000-4000-8000-0000000002aa', 1, '{}')$$,
  '42501', null, 'a non-member cannot save a version'
);
select throws_ok(
  $$select public.publish_workspace_external_project_page_version('7a9e0000-0000-4000-8000-00000000000a', '7a9e0000-0000-4000-8000-0000000003a1')$$,
  '42501', null, 'a non-member cannot publish'
);
select throws_ok(
  $$select public.publish_workspace_external_project_page_version('7a9e0000-0000-4000-8000-00000000000a', '7a9e0000-0000-4000-8000-0000000003a1', '7a9e0000-0000-4000-8000-0000000000a1')$$,
  '42501', null, 'a non-member cannot publish as owner A'
);

-- The publisher reads and publishes but cannot save drafts.
set local request.jwt.claims = '{"role":"authenticated","sub":"7a9e0000-0000-4000-8000-0000000000c1"}';
select is((select count(*)::int from public.workspace_external_project_page_versions), 3, 'the publisher reads A versions only');
select throws_ok(
  $$insert into public.workspace_external_project_page_versions (ws_id, entry_id, schema_version, data) values ('7a9e0000-0000-4000-8000-00000000000a', '7a9e0000-0000-4000-8000-0000000002aa', 1, '{}')$$,
  '42501', null, 'the publisher cannot save a draft'
);
select is(
  (public.publish_workspace_external_project_page_version('7a9e0000-0000-4000-8000-00000000000a', '7a9e0000-0000-4000-8000-0000000003a1')).status,
  'published', 'publishing marks the version published'
);
select is(
  (select published_page_version_id from public.workspace_external_project_entries where id = '7a9e0000-0000-4000-8000-0000000002aa'),
  '7a9e0000-0000-4000-8000-0000000003a1'::uuid, 'publishing sets the entry pointer'
);
select is(
  (select published_by from public.workspace_external_project_page_versions where id = '7a9e0000-0000-4000-8000-0000000003a1'),
  '7a9e0000-0000-4000-8000-0000000000c1'::uuid, 'publishing records the publisher'
);

-- Content rollback: publish v2, then republish v1.
select lives_ok(
  $$select public.publish_workspace_external_project_page_version('7a9e0000-0000-4000-8000-00000000000a', '7a9e0000-0000-4000-8000-0000000003a2')$$,
  'the publisher publishes v2'
);
select lives_ok(
  $$select public.publish_workspace_external_project_page_version('7a9e0000-0000-4000-8000-00000000000a', '7a9e0000-0000-4000-8000-0000000003a1')$$,
  'the publisher rolls back to v1'
);
select results_eq(
  $$select published_page_version_id from public.workspace_external_project_entries where id = '7a9e0000-0000-4000-8000-0000000002aa'$$,
  $$values ('7a9e0000-0000-4000-8000-0000000003a1'::uuid)$$,
  'rollback moves the pointer back to v1'
);
select results_eq(
  $$select version_number, status from public.workspace_external_project_page_versions order by version_number$$,
  $$values (1, 'published'), (2, 'published'), (3, 'draft')$$,
  'rollback keeps every version'
);

-- The service role (API admin client) publishes only for an allowed actor.
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select throws_ok(
  $$select public.publish_workspace_external_project_page_version('7a9e0000-0000-4000-8000-00000000000a', '7a9e0000-0000-4000-8000-0000000003a2', '7a9e0000-0000-4000-8000-0000000000d1')$$,
  '42501', null, 'the service role cannot publish for a non-member'
);
select throws_ok(
  $$select public.publish_workspace_external_project_page_version('7a9e0000-0000-4000-8000-00000000000a', '7a9e0000-0000-4000-8000-0000000003a2', null)$$,
  '42501', null, 'the service role cannot publish without an actor'
);

-- Workspace B is untouched.
reset role;
select results_eq(
  $$select e.published_page_version_id, v.status from public.workspace_external_project_entries e join public.workspace_external_project_page_versions v on v.entry_id = e.id where e.id = '7a9e0000-0000-4000-8000-0000000002bb'$$,
  $$values (null::uuid, 'draft')$$,
  'workspace B stays unpublished'
);

-- Anonymous callers have no access.
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok($$select 1 from public.workspace_external_project_page_versions$$, '42501', null, 'anon cannot read versions');
select throws_ok(
  $$select public.publish_workspace_external_project_page_version('7a9e0000-0000-4000-8000-00000000000a', '7a9e0000-0000-4000-8000-0000000003a1', '7a9e0000-0000-4000-8000-0000000000a1')$$,
  '42501', null, 'anon cannot publish'
);
reset role;

select * from finish();
rollback;
