-- Proof for the INCIDENT rollback of
-- 20261026100000_least_privilege_workspace_storage_rls.sql.
-- Run ONLY against a disposable local stack, after applying
-- apps/database/rollbacks/20261026100000_least_privilege_workspace_storage_rls.incident-rollback.sql:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f apps/database/verification/workspace-storage-rls-incident-rollback.sql
-- Expected: member-only Drive access is back, private roots and non-member
-- writes stay closed, service_role keeps full access.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(14);

select is((select count(*)::int from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and policyname like 'workspace_storage_incident_%'), 6,
  'incident rollback installs four member policies and two write guards');
select is((select count(*)::int from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and (policyname like 'Allow workspace members to % workspace folder'
      or policyname in ('workspace_storage_select', 'workspace_storage_insert',
        'workspace_storage_update', 'workspace_storage_delete')
      or policyname like 'workspace_storage_guard_%')), 0,
  'incident rollback leaves neither the 2023 nor the path-scoped policies');
select ok(to_regnamespace('workspace_storage') is null,
  'incident rollback drops the helper schema');

insert into auth.users (id) values
  ('5707a6e0-0000-4000-8000-00000000c801'),
  ('5707a6e0-0000-4000-8000-00000000c802'),
  ('5707a6e0-0000-4000-8000-00000000c803');
insert into public.users (id)
select id from auth.users where id::text like '5707a6e0-0000-4000-8000-00000000c8__'
on conflict do nothing;
insert into public.workspaces (id, name, personal, creator_id)
values ('5707a6e0-0000-4000-8000-00000000c811', 'Storage RLS incident', false,
  '5707a6e0-0000-4000-8000-00000000c801');
insert into public.workspace_members (ws_id, user_id, type) values
  ('5707a6e0-0000-4000-8000-00000000c811', '5707a6e0-0000-4000-8000-00000000c802', 'MEMBER')
on conflict do nothing;
delete from public.workspace_default_permissions
where ws_id = '5707a6e0-0000-4000-8000-00000000c811';
insert into storage.objects (bucket_id, name) values
  ('workspaces', '5707a6e0-0000-4000-8000-00000000c811/docs/a.pdf'),
  ('workspaces', '5707a6e0-0000-4000-8000-00000000c811/chats/ai/resources/temp/5707a6e0-0000-4000-8000-00000000c802/b.pdf'),
  ('workspaces', '5707a6e0-0000-4000-8000-00000000c811/AI Agent Imports/x/c.png'),
  ('workspaces', '5707a6e0-0000-4000-8000-00000000c811/mira/images/d.png');

-- Member without any Drive permission.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"5707a6e0-0000-4000-8000-00000000c802","role":"authenticated"}', true);
select is((select count(*)::int from storage.objects
  where name = '5707a6e0-0000-4000-8000-00000000c811/docs/a.pdf'), 1,
  'member reads Drive objects without view_drive (2023 semantics)');
select lives_ok($$insert into storage.objects (bucket_id, name) values
  ('workspaces', '5707a6e0-0000-4000-8000-00000000c811/docs/new.pdf')$$,
  'member writes Drive objects');
select is((select count(*)::int from storage.objects
  where name like '5707a6e0-0000-4000-8000-00000000c811/chats/%'), 0,
  'even the uploader cannot read private chat attachments directly');
select is((select count(*)::int from storage.objects
  where name like '5707a6e0-0000-4000-8000-00000000c811/AI Agent Imports/%'
     or name like '5707a6e0-0000-4000-8000-00000000c811/mira/images/%'), 0,
  'member cannot read AI Agent Imports or mira/images');
select throws_ok($$insert into storage.objects (bucket_id, name) values
  ('workspaces', '5707a6e0-0000-4000-8000-00000000c811/external-apps/app/x')$$,
  '42501', null, 'member cannot write application-owned roots');
select throws_ok($$insert into storage.objects (bucket_id, name) values
  ('workspaces', '5707a6e0-0000-4000-8000-00000000c811/Recordings/m/s/x.webm')$$,
  '42501', null, 'private roots match case-insensitively');
select throws_ok($$update storage.objects
  set name = '5707a6e0-0000-4000-8000-00000000c811/chats/moved.pdf'
  where name = '5707a6e0-0000-4000-8000-00000000c811/docs/a.pdf'$$,
  '42501', null, 'member cannot move a Drive object into a private root');

-- Non-member: the legacy WITH CHECK (true) insert policy must not apply.
select set_config('request.jwt.claims',
  '{"sub":"5707a6e0-0000-4000-8000-00000000c803","role":"authenticated"}', true);
select throws_ok($$insert into storage.objects (bucket_id, name) values
  ('workspaces', '5707a6e0-0000-4000-8000-00000000c811/docs/intruder.pdf')$$,
  '42501', null, 'non-member cannot insert into the workspace folder');
select is((select count(*)::int from storage.objects
  where name like '5707a6e0-0000-4000-8000-00000000c811/%'), 0,
  'non-member reads nothing');

-- service_role keeps full access.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select is((select count(*)::int from storage.objects
  where name like '5707a6e0-0000-4000-8000-00000000c811/%'), 5,
  'service_role reads every object');
select lives_ok($$insert into storage.objects (bucket_id, name) values
  ('workspaces', '5707a6e0-0000-4000-8000-00000000c811/external-apps/app/y')$$,
  'service_role writes application-owned roots');
reset role;

select * from finish();
rollback;
