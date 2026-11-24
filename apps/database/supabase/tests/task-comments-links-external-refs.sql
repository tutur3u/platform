-- Contract for the task comments, links and external references migration.
-- The tables are private and reached only by service_role; product servers
-- enforce task access and edit rights. W1 holds board B1 with tasks T1 and T2;
-- W2 holds board B9 with task T9 for cross-workspace probes. U1 and U2 are
-- native authors; U3 authors a comment that is orphaned at the end to prove a
-- removed author never violates a comment constraint.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(102);

insert into auth.users (id) values
  ('7c110000-0000-4000-8000-000000000001'),
  ('7c110000-0000-4000-8000-000000000002'),
  ('7c110000-0000-4000-8000-000000000003')
on conflict do nothing;
insert into public.users (id) values
  ('7c110000-0000-4000-8000-000000000001'),
  ('7c110000-0000-4000-8000-000000000002'),
  ('7c110000-0000-4000-8000-000000000003')
on conflict do nothing;

insert into public.workspaces (id, name, personal, creator_id) values
  ('7c110000-0000-4000-8000-000000000101', 'Comments W1', false,
    '7c110000-0000-4000-8000-000000000001'),
  ('7c110000-0000-4000-8000-000000000102', 'Comments W2', false,
    '7c110000-0000-4000-8000-000000000001');
insert into public.workspace_boards (id, ws_id, name) values
  ('7c110000-0000-4000-8000-000000000601', '7c110000-0000-4000-8000-000000000101', 'B1'),
  ('7c110000-0000-4000-8000-000000000609', '7c110000-0000-4000-8000-000000000102', 'B9');
insert into public.task_lists (id, board_id, name) values
  ('7c110000-0000-4000-8000-000000000701', '7c110000-0000-4000-8000-000000000601', 'L1'),
  ('7c110000-0000-4000-8000-000000000709', '7c110000-0000-4000-8000-000000000609', 'L9');
insert into public.tasks (id, list_id, name, creator_id) values
  ('7c110000-0000-4000-8000-000000000801', '7c110000-0000-4000-8000-000000000701', 'T1',
    '7c110000-0000-4000-8000-000000000001'),
  ('7c110000-0000-4000-8000-000000000802', '7c110000-0000-4000-8000-000000000701', 'T2',
    '7c110000-0000-4000-8000-000000000001'),
  ('7c110000-0000-4000-8000-000000000809', '7c110000-0000-4000-8000-000000000709', 'T9',
    '7c110000-0000-4000-8000-000000000001');

-- Shape and privileges ------------------------------------------------------
select has_table('private', 'task_comments', 'task_comments is private');
select has_table('private', 'task_links', 'task_links is private');
select has_table('private', 'task_external_refs', 'task_external_refs is private');
select hasnt_table('public', 'task_comments', 'no public comment table');
select ok((select bool_and(relrowsecurity) from pg_class
  where oid in ('private.task_comments'::regclass, 'private.task_links'::regclass,
    'private.task_external_refs'::regclass)), 'RLS is enabled on every new table');
select ok(not exists (
  select 1 from pg_policy
  where polrelid in ('private.task_comments'::regclass, 'private.task_links'::regclass,
    'private.task_external_refs'::regclass)), 'no policy exposes a new table');
select ok(not exists (
  select 1
  from unnest(array['anon', 'authenticated', 'public']) r(role)
  cross join unnest(array['private.task_comments', 'private.task_links',
    'private.task_external_refs']) t(rel)
  cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
    'REFERENCES', 'TRIGGER']) p(priv)
  where has_table_privilege(r.role, t.rel, p.priv)),
  'client roles hold no privilege on the new tables');
select ok(not exists (
  select 1
  from unnest(array['anon', 'authenticated', 'public', 'service_role']) r(role)
  cross join unnest(array['private.validate_task_child_workspace()',
    'private.validate_task_external_ref_workspace()',
    'private.record_task_comment_history()',
    'private.record_task_link_history()']) f(fn)
  where has_function_privilege(r.role, f.fn, 'EXECUTE')),
  'no role can execute the private trigger functions directly');
select ok(not has_schema_privilege('anon', 'private', 'USAGE')
  and not has_schema_privilege('authenticated', 'private', 'USAGE'),
  'client roles cannot use the private schema');
select ok((select bool_and(has_table_privilege('service_role', t.rel, p.priv))
  from unnest(array['private.task_comments', 'private.task_links',
    'private.task_external_refs']) t(rel)
  cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p(priv)),
  'service_role reads and writes the new tables');
select ok(not exists (
  select 1
  from unnest(array['private.task_comments', 'private.task_links',
    'private.task_external_refs']) t(rel)
  cross join unnest(array['TRUNCATE', 'REFERENCES', 'TRIGGER']) p(priv)
  where has_table_privilege('service_role', t.rel, p.priv)),
  'service_role holds only the scoped privileges');
select ok((select bool_and(confdeltype = 'c') from pg_constraint
  where conrelid in ('private.task_comments'::regclass, 'private.task_links'::regclass,
      'private.task_external_refs'::regclass)
    and confrelid in ('public.workspaces'::regclass, 'public.tasks'::regclass)),
  'deleting a task or workspace cascades to every new table');

-- Client roles are refused outright ----------------------------------------
set local role anon;
select throws_ok($$select 1 from private.task_comments$$, '42501', null,
  'anon cannot read comments');
select throws_ok($$select 1 from private.task_links$$, '42501', null,
  'anon cannot read links');
select throws_ok($$select 1 from private.task_external_refs$$, '42501', null,
  'anon cannot read external refs');
select throws_ok($$insert into private.task_comments (task_id, ws_id, external_author, body)
  values ('7c110000-0000-4000-8000-000000000801', '7c110000-0000-4000-8000-000000000101', 'a', 'x')$$,
  '42501', null, 'anon cannot write comments');
reset role;
set local role authenticated;
select throws_ok($$select 1 from private.task_comments$$, '42501', null,
  'authenticated cannot read comments');
select throws_ok($$select 1 from private.task_links$$, '42501', null,
  'authenticated cannot read links');
select throws_ok($$select 1 from private.task_external_refs$$, '42501', null,
  'authenticated cannot read external refs');
select throws_ok($$insert into private.task_links (task_id, ws_id, kind, url)
  values ('7c110000-0000-4000-8000-000000000801', '7c110000-0000-4000-8000-000000000101',
    'url', 'https://example.com')$$,
  '42501', null, 'authenticated cannot write links');
reset role;

-- Comments as service_role --------------------------------------------------
set local role service_role;
select lives_ok($$insert into private.task_comments (id, task_id, ws_id, author_id, body)
  values ('7c110000-0000-4000-8000-000000000a01', '7c110000-0000-4000-8000-000000000801',
    '7c110000-0000-4000-8000-000000000101', '7c110000-0000-4000-8000-000000000001', 'First note')$$,
  'a member comments on a task in its workspace');
select lives_ok($$insert into private.task_comments (id, task_id, ws_id, external_author, external_url, body, created_at)
  values ('7c110000-0000-4000-8000-000000000a02', '7c110000-0000-4000-8000-000000000801',
    '7c110000-0000-4000-8000-000000000101', 'octocat',
    'https://github.com/o/r/issues/1#issuecomment-1', 'Imported note', '2023-05-01 08:00:00+00')$$,
  'an imported comment keeps its external author and original timestamp');
select throws_ok($$insert into private.task_comments (task_id, ws_id, author_id, body)
  values ('7c110000-0000-4000-8000-000000000809', '7c110000-0000-4000-8000-000000000101',
    '7c110000-0000-4000-8000-000000000001', 'Wrong task')$$,
  '23503', null, 'a task from another workspace cannot take the comment');
select throws_ok($$insert into private.task_comments (task_id, ws_id, author_id, body)
  values ('7c110000-0000-4000-8000-000000000801', '7c110000-0000-4000-8000-000000000102',
    '7c110000-0000-4000-8000-000000000001', 'Wrong workspace')$$,
  '23503', null, 'the comment workspace must match the task workspace');
select throws_ok($$insert into private.task_comments (task_id, ws_id, author_id, body)
  values ('7c110000-0000-4000-8000-0000000008ff', '7c110000-0000-4000-8000-000000000101',
    '7c110000-0000-4000-8000-000000000001', 'No such task')$$,
  '23503', null, 'a missing task cannot take a comment');
select throws_ok($$insert into private.task_comments (task_id, ws_id, author_id, body)
  values ('7c110000-0000-4000-8000-000000000801', '7c110000-0000-4000-8000-000000000101',
    '7c110000-0000-4000-8000-000000000001', '   ')$$,
  '23514', null, 'a blank comment is rejected');
select throws_ok($$insert into private.task_comments (task_id, ws_id, external_author, external_url, body)
  values ('7c110000-0000-4000-8000-000000000801', '7c110000-0000-4000-8000-000000000101',
    'octocat', 'http://github.com/o/r/issues/1#issuecomment-2', 'Plain http')$$,
  '23514', null, 'an external comment URL must be https');
select throws_ok($$insert into private.task_comments (task_id, ws_id, external_author, external_url, body)
  values ('7c110000-0000-4000-8000-000000000801', '7c110000-0000-4000-8000-000000000101',
    'octocat', 'https://github.com/o/r/issues/1#issuecomment-1', 'Imported twice')$$,
  '23505', null, 'the external comment URL is unique per task');
select lives_ok($$insert into private.task_comments (task_id, ws_id, external_author, external_url, body)
  values ('7c110000-0000-4000-8000-000000000802', '7c110000-0000-4000-8000-000000000101',
    'octocat', 'https://github.com/o/r/issues/1#issuecomment-1', 'Same URL, other task')$$,
  'the same external URL may appear on a different task');
select lives_ok($$insert into private.task_comments (task_id, ws_id, external_author, external_url, body)
  values ('7c110000-0000-4000-8000-000000000801', '7c110000-0000-4000-8000-000000000101',
    'octocat', 'https://github.com/o/r/issues/1#issuecomment-1', 'Re-imported')
  on conflict (task_id, external_url) do update
    set body = excluded.body$$,
  'a re-import upserts on the external comment URL');
select is((select count(*)::int from private.task_comments
  where task_id = '7c110000-0000-4000-8000-000000000801'
    and external_url = 'https://github.com/o/r/issues/1#issuecomment-1'), 1,
  'the re-import left one comment, not two');
select is((select body from private.task_comments
  where id = '7c110000-0000-4000-8000-000000000a02'), 'Re-imported',
  'the re-import refreshed the body');

-- Immutability --------------------------------------------------------------
select throws_ok($$update private.task_comments
  set ws_id = '7c110000-0000-4000-8000-000000000102'
  where id = '7c110000-0000-4000-8000-000000000a01'$$,
  '55000', null, 'a comment cannot move to another workspace');
select throws_ok($$update private.task_comments
  set task_id = '7c110000-0000-4000-8000-000000000802'
  where id = '7c110000-0000-4000-8000-000000000a01'$$,
  '55000', null, 'a comment cannot move to another task in the workspace');
select throws_ok($$update private.task_comments
  set task_id = '7c110000-0000-4000-8000-000000000809'
  where id = '7c110000-0000-4000-8000-000000000a01'$$,
  '55000', null, 'a comment cannot move to a task in another workspace');

-- Comment history -----------------------------------------------------------
select is((select count(*)::int from public.task_history
  where task_id = '7c110000-0000-4000-8000-000000000801' and change_type = 'comment_added'), 2,
  'each comment insert wrote one comment_added row (the re-import wrote none)');
select is((select changed_by from public.task_history
  where metadata ->> 'comment_id' = '7c110000-0000-4000-8000-000000000a01'
    and change_type = 'comment_added'), '7c110000-0000-4000-8000-000000000001'::uuid,
  'a native comment records its author as the actor');
select is((select changed_by from public.task_history
  where metadata ->> 'comment_id' = '7c110000-0000-4000-8000-000000000a02'
    and change_type = 'comment_added'), null,
  'an imported comment has no workspace actor');
select is((select metadata ->> 'external_author' from public.task_history
  where metadata ->> 'comment_id' = '7c110000-0000-4000-8000-000000000a02'
    and change_type = 'comment_added'), 'octocat',
  'an imported comment names its external author in the history');
select is((select changed_at from public.task_history
  where metadata ->> 'comment_id' = '7c110000-0000-4000-8000-000000000a02'
    and change_type = 'comment_added'), '2023-05-01 08:00:00+00'::timestamptz,
  'an imported comment keeps its original timestamp in the history');
select is((select field_name from public.task_history
  where metadata ->> 'comment_id' = '7c110000-0000-4000-8000-000000000a01'
    and change_type = 'comment_added'), 'comment',
  'comment history rows use the comment field');
select ok(not exists (select 1 from public.task_history
  where change_type like 'comment_%' and (metadata ? 'body'
    or old_value is not null or new_value is not null)),
  'comment history never carries the comment body');

select lives_ok($$update private.task_comments
  set body = 'First note, edited', edited_at = now(),
    updated_by = '7c110000-0000-4000-8000-000000000002'
  where id = '7c110000-0000-4000-8000-000000000a01'$$,
  'a comment body is editable');
select is((select changed_by from public.task_history
  where metadata ->> 'comment_id' = '7c110000-0000-4000-8000-000000000a01'
    and change_type = 'comment_updated'), '7c110000-0000-4000-8000-000000000002'::uuid,
  'an edit records the editor as the actor');
select lives_ok($$update private.task_comments set edited_at = now()
  where id = '7c110000-0000-4000-8000-000000000a01'$$,
  'a body-neutral update succeeds');
select is((select count(*)::int from public.task_history
  where metadata ->> 'comment_id' = '7c110000-0000-4000-8000-000000000a01'
    and change_type = 'comment_updated'), 1,
  'a body-neutral update writes no history');
select lives_ok($$update private.task_comments
  set deleted_at = now(), updated_by = '7c110000-0000-4000-8000-000000000001'
  where id = '7c110000-0000-4000-8000-000000000a01'$$,
  'a comment soft-deletes');
select is((select changed_by from public.task_history
  where metadata ->> 'comment_id' = '7c110000-0000-4000-8000-000000000a01'
    and change_type = 'comment_deleted'), '7c110000-0000-4000-8000-000000000001'::uuid,
  'a soft delete records the remover as the actor');
select is((select count(*)::int from private.task_comments
  where id = '7c110000-0000-4000-8000-000000000a01'), 1,
  'a soft-deleted comment stays in the table');
select lives_ok($$update private.task_comments set body = 'Edited after delete'
  where id = '7c110000-0000-4000-8000-000000000a01'$$,
  'a deleted comment can still be touched by the service');
select throws_ok($$update private.task_comments
  set deleted_at = '2000-01-01 00:00:00+00'
  where id = '7c110000-0000-4000-8000-000000000a01'$$,
  '23514', null, 'a comment cannot be deleted before it was created');

-- Links ---------------------------------------------------------------------
select lives_ok($$insert into private.task_links (id, task_id, ws_id, kind, provider, url, external_id, title, state, created_by)
  values ('7c110000-0000-4000-8000-000000000b01', '7c110000-0000-4000-8000-000000000801',
    '7c110000-0000-4000-8000-000000000101', 'pull_request', 'github',
    'https://github.com/o/r/pull/7', '7', 'Fix it', 'merged',
    '7c110000-0000-4000-8000-000000000001')$$,
  'a pull request links to a task');
select lives_ok($$insert into private.task_links (task_id, ws_id, kind, url)
  values ('7c110000-0000-4000-8000-000000000801', '7c110000-0000-4000-8000-000000000101',
    'url', 'https://example.com/spec')$$,
  'a plain URL links to a task with the web defaults');
select is((select provider from private.task_links where url = 'https://example.com/spec'),
  'web', 'a link defaults to the web provider');
select throws_ok($$insert into private.task_links (task_id, ws_id, kind, url)
  values ('7c110000-0000-4000-8000-000000000801', '7c110000-0000-4000-8000-000000000101',
    'pull_request', 'https://github.com/o/r/pull/7')$$,
  '23505', null, 'an active link URL is unique per task');
select throws_ok($$insert into private.task_links (task_id, ws_id, kind, url)
  values ('7c110000-0000-4000-8000-000000000809', '7c110000-0000-4000-8000-000000000101',
    'url', 'https://example.com/other')$$,
  '23503', null, 'a task from another workspace cannot take the link');
select throws_ok($$insert into private.task_links (task_id, ws_id, kind, url)
  values ('7c110000-0000-4000-8000-000000000801', '7c110000-0000-4000-8000-000000000102',
    'url', 'https://example.com/other')$$,
  '23503', null, 'the link workspace must match the task workspace');
select throws_ok($$insert into private.task_links (task_id, ws_id, kind, url)
  values ('7c110000-0000-4000-8000-000000000801', '7c110000-0000-4000-8000-000000000101',
    'url', 'http://example.com/insecure')$$,
  '23514', null, 'a link URL must be https');
select throws_ok($$insert into private.task_links (task_id, ws_id, kind, url)
  values ('7c110000-0000-4000-8000-000000000801', '7c110000-0000-4000-8000-000000000101',
    'wiki', 'https://example.com/wiki')$$,
  '23514', null, 'a link kind outside the catalog is rejected');
select throws_ok($$insert into private.task_links (task_id, ws_id, kind, provider, url)
  values ('7c110000-0000-4000-8000-000000000801', '7c110000-0000-4000-8000-000000000101',
    'url', 'gitlab', 'https://example.com/gl')$$,
  '23514', null, 'a link provider outside the catalog is rejected');
select throws_ok($$insert into private.task_links (task_id, ws_id, kind, url, state)
  values ('7c110000-0000-4000-8000-000000000801', '7c110000-0000-4000-8000-000000000101',
    'url', 'https://example.com/state', 'merging')$$,
  '23514', null, 'a link state outside the catalog is rejected');
select throws_ok($$insert into private.task_links (task_id, ws_id, kind, url, metadata)
  values ('7c110000-0000-4000-8000-000000000801', '7c110000-0000-4000-8000-000000000101',
    'url', 'https://example.com/meta', '[]'::jsonb)$$,
  '23514', null, 'link metadata must be an object');
select throws_ok($$update private.task_links
  set ws_id = '7c110000-0000-4000-8000-000000000102'
  where id = '7c110000-0000-4000-8000-000000000b01'$$,
  '55000', null, 'a link cannot move to another workspace');
select throws_ok($$update private.task_links
  set task_id = '7c110000-0000-4000-8000-000000000802'
  where id = '7c110000-0000-4000-8000-000000000b01'$$,
  '55000', null, 'a link cannot move to another task');
select is((select changed_by from public.task_history
  where metadata ->> 'link_id' = '7c110000-0000-4000-8000-000000000b01'
    and change_type = 'link_added'), '7c110000-0000-4000-8000-000000000001'::uuid,
  'adding a link records its creator as the actor');
select is((select metadata ->> 'url' from public.task_history
  where metadata ->> 'link_id' = '7c110000-0000-4000-8000-000000000b01'
    and change_type = 'link_added'), 'https://github.com/o/r/pull/7',
  'the link history carries the URL');
select lives_ok($$update private.task_links
  set removed_at = now(), removed_by = '7c110000-0000-4000-8000-000000000002'
  where id = '7c110000-0000-4000-8000-000000000b01'$$,
  'a link soft-removes');
select is((select changed_by from public.task_history
  where metadata ->> 'link_id' = '7c110000-0000-4000-8000-000000000b01'
    and change_type = 'link_removed'), '7c110000-0000-4000-8000-000000000002'::uuid,
  'removing a link records the remover as the actor');
select lives_ok($$update private.task_links set title = 'Fix it now'
  where id = '7c110000-0000-4000-8000-000000000b01'$$,
  'a removed link stays editable by the service');
select is((select count(*)::int from public.task_history
  where metadata ->> 'link_id' = '7c110000-0000-4000-8000-000000000b01'
    and change_type = 'link_removed'), 1,
  'only the removal transition writes link_removed');
select lives_ok($$insert into private.task_links (task_id, ws_id, kind, provider, url)
  values ('7c110000-0000-4000-8000-000000000801', '7c110000-0000-4000-8000-000000000101',
    'pull_request', 'github', 'https://github.com/o/r/pull/7')$$,
  'a removed URL can be linked again');
select is((select count(*)::int from private.task_links
  where url = 'https://github.com/o/r/pull/7' and removed_at is null), 1,
  'exactly one link per URL is active after re-linking');
select ok(not exists (select 1 from public.task_history
  where change_type like 'link_%' and (metadata ? 'body'
    or old_value is not null or new_value is not null)),
  'link history carries metadata only');

-- External references -------------------------------------------------------
select lives_ok($$insert into private.task_external_refs (id, task_id, ws_id, provider, external_url, external_repo, external_number, external_author, external_state, external_state_reason, external_created_at, external_closed_at, external_labels, external_assignees)
  values ('7c110000-0000-4000-8000-000000000c01', '7c110000-0000-4000-8000-000000000801',
    '7c110000-0000-4000-8000-000000000101', 'github', 'https://github.com/o/r/issues/1',
    'o/r', 1, 'octocat', 'closed', 'completed', '2023-05-01 07:00:00+00',
    '2023-05-02 07:00:00+00', array['bug', 'nova'], array['unmapped-login'])$$,
  'an imported issue maps to a task');
select throws_ok($$insert into private.task_external_refs (task_id, ws_id, provider, external_url)
  values ('7c110000-0000-4000-8000-000000000802', '7c110000-0000-4000-8000-000000000101',
    'github', 'https://github.com/o/r/issues/1')$$,
  '23505', null, 'an external URL maps to one task per workspace');
select throws_ok($$insert into private.task_external_refs (task_id, ws_id, provider, external_url)
  values ('7c110000-0000-4000-8000-000000000801', '7c110000-0000-4000-8000-000000000101',
    'github', 'https://github.com/o/r/issues/2')$$,
  '23505', null, 'a task carries one external reference');
select throws_ok($$insert into private.task_external_refs (task_id, ws_id, provider, external_url)
  values ('7c110000-0000-4000-8000-000000000809', '7c110000-0000-4000-8000-000000000101',
    'github', 'https://github.com/o/r/issues/3')$$,
  '23503', null, 'a task from another workspace cannot take the reference');
select throws_ok($$insert into private.task_external_refs (task_id, ws_id, provider, external_url)
  values ('7c110000-0000-4000-8000-000000000802', '7c110000-0000-4000-8000-000000000102',
    'github', 'https://github.com/o/r/issues/3')$$,
  '23503', null, 'the reference workspace must match the task workspace');
select lives_ok($$insert into private.task_external_refs (task_id, ws_id, provider, external_url)
  values ('7c110000-0000-4000-8000-000000000809', '7c110000-0000-4000-8000-000000000102',
    'github', 'https://github.com/o/r/issues/1')$$,
  'another workspace may import the same issue');
select throws_ok($$insert into private.task_external_refs (task_id, ws_id, provider, external_url)
  values ('7c110000-0000-4000-8000-000000000802', '7c110000-0000-4000-8000-000000000101',
    'jira', 'https://example.com/browse/X-1')$$,
  '23514', null, 'a provider outside the catalog is rejected');
select throws_ok($$insert into private.task_external_refs (task_id, ws_id, provider, external_url, external_repo)
  values ('7c110000-0000-4000-8000-000000000802', '7c110000-0000-4000-8000-000000000101',
    'github', 'https://github.com/o/r/issues/4', 'not a repo')$$,
  '23514', null, 'a malformed repository name is rejected');
select throws_ok($$insert into private.task_external_refs (task_id, ws_id, provider, external_url, external_state)
  values ('7c110000-0000-4000-8000-000000000802', '7c110000-0000-4000-8000-000000000101',
    'github', 'https://github.com/o/r/issues/4', 'merged')$$,
  '23514', null, 'an external state outside the catalog is rejected');
select throws_ok($$update private.task_external_refs
  set external_url = 'https://github.com/o/r/issues/99'
  where id = '7c110000-0000-4000-8000-000000000c01'$$,
  '55000', null, 'the external URL is immutable');
select throws_ok($$update private.task_external_refs
  set ws_id = '7c110000-0000-4000-8000-000000000102'
  where id = '7c110000-0000-4000-8000-000000000c01'$$,
  '55000', null, 'the reference workspace is immutable');
select throws_ok($$update private.task_external_refs
  set task_id = '7c110000-0000-4000-8000-000000000802'
  where id = '7c110000-0000-4000-8000-000000000c01'$$,
  '55000', null, 'the reference task is immutable');
select lives_ok($$update private.task_external_refs
  set external_state = 'open', external_state_reason = 'reopened'
  where id = '7c110000-0000-4000-8000-000000000c01'$$,
  'the mutable issue fields refresh on re-import');
select lives_ok($$insert into private.task_external_refs (task_id, ws_id, provider, external_url, external_state)
  values ('7c110000-0000-4000-8000-000000000801', '7c110000-0000-4000-8000-000000000101',
    'github', 'https://github.com/o/r/issues/1', 'closed')
  on conflict (ws_id, provider, external_url) do update
    set external_state = excluded.external_state$$,
  'a re-import upserts on the idempotency key');
select is((select count(*)::int from private.task_external_refs
  where ws_id = '7c110000-0000-4000-8000-000000000101'
    and external_url = 'https://github.com/o/r/issues/1'), 1,
  'the re-import left one reference, not two');
select is((select external_state from private.task_external_refs
  where id = '7c110000-0000-4000-8000-000000000c01'), 'closed',
  'the re-import refreshed the state');
select is((select external_assignees from private.task_external_refs
  where id = '7c110000-0000-4000-8000-000000000c01'), array['unmapped-login'],
  'an unmapped assignee login is recorded on the reference');
reset role;

-- History change types ------------------------------------------------------
select ok((select convalidated from pg_constraint
  where conrelid = 'public.task_history'::regclass
    and conname = 'task_history_change_type_check'),
  'the history change type constraint is validated for existing rows');
select lives_ok($$insert into public.task_history (task_id, change_type)
  select '7c110000-0000-4000-8000-000000000802', t
  from unnest(array['task_created', 'field_updated', 'assignee_added', 'assignee_removed',
    'label_added', 'label_removed', 'project_linked', 'project_unlinked']) t$$,
  'every earlier change type still inserts');
select lives_ok($$insert into public.task_history (task_id, change_type, changed_at, metadata)
  select '7c110000-0000-4000-8000-000000000802', t, '2023-05-02 07:00:00+00',
    '{"url": "https://github.com/o/r/issues/1"}'::jsonb
  from unnest(array['comment_added', 'comment_updated', 'comment_deleted', 'link_added',
    'link_removed', 'external_imported', 'external_event']) t$$,
  'every new change type inserts');
set local role service_role;
select lives_ok($$insert into public.task_history (task_id, changed_by, change_type, field_name, metadata)
  values ('7c110000-0000-4000-8000-000000000802', '7c110000-0000-4000-8000-000000000001',
    'external_imported', 'external', '{"number": 1}'::jsonb)$$,
  'the import server records its history rows as service_role');
reset role;
select throws_ok($$insert into public.task_history (task_id, change_type)
  values ('7c110000-0000-4000-8000-000000000802', 'comment_pinned')$$,
  '23514', null, 'an unknown change type is still rejected');

-- Cascades ------------------------------------------------------------------
delete from public.tasks where id = '7c110000-0000-4000-8000-000000000801';
select is((select count(*)::int from private.task_comments
  where task_id = '7c110000-0000-4000-8000-000000000801'), 0,
  'deleting a task removes its comments');
select is((select count(*)::int from private.task_links
  where task_id = '7c110000-0000-4000-8000-000000000801'), 0,
  'deleting a task removes its links');
select is((select count(*)::int from private.task_external_refs
  where task_id = '7c110000-0000-4000-8000-000000000801'), 0,
  'deleting a task removes its external reference');

-- A removed author leaves the comment in place --------------------------------
select ok((select bool_and(confdeltype = 'n') from pg_constraint
  where conrelid = 'private.task_comments'::regclass
    and confrelid = 'public.users'::regclass),
  'user references on comments are cleared, not cascaded');
set local role service_role;
insert into private.task_comments (id, task_id, ws_id, author_id, body)
values ('7c110000-0000-4000-8000-000000000a09', '7c110000-0000-4000-8000-000000000802',
  '7c110000-0000-4000-8000-000000000101', '7c110000-0000-4000-8000-000000000003', 'Soon orphaned');
select lives_ok($$update private.task_comments set author_id = null
  where id = '7c110000-0000-4000-8000-000000000a09'$$,
  'clearing the author, as a deleted user does, passes every constraint');
select is((select author_id from private.task_comments
  where id = '7c110000-0000-4000-8000-000000000a09'), null,
  'the comment survives with no author');
reset role;

-- Workspace deletion removes everything ------------------------------------
delete from public.workspaces where id = '7c110000-0000-4000-8000-000000000102';
select is((select count(*)::int from private.task_external_refs
  where ws_id = '7c110000-0000-4000-8000-000000000102'), 0,
  'deleting a workspace removes its external references');

select * from finish();
rollback;
