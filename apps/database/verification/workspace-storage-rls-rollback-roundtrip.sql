-- Rollback proof for 20261026170000_least_privilege_workspace_storage_rls.sql.
-- Run ONLY against a disposable local stack, after applying
-- apps/database/rollbacks/20261026170000_least_privilege_workspace_storage_rls.rollback.sql:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f apps/database/rollbacks/20261026170000_least_privilege_workspace_storage_rls.rollback.sql
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f apps/database/verification/workspace-storage-rls-rollback-roundtrip.sql
-- then re-apply the forward migration and re-run
-- supabase/tests/workspace-storage-least-privilege-rls.sql (370 assertions).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(7);

select is((select count(*)::int from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and policyname like 'Allow workspace members to % workspace folder'), 4,
  'rollback restores the four 20231004102905 policies');
select is((select count(*)::int from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and policyname like 'workspace_storage_%'), 0,
  'rollback removes the path-scoped, guard and incident policies');
select ok(to_regnamespace('workspace_storage') is null,
  'rollback removes the storage access helpers and schema');

insert into auth.users (id) values
  ('5707a6e0-0000-4000-8000-000000009801'),
  ('5707a6e0-0000-4000-8000-000000009802'),
  ('5707a6e0-0000-4000-8000-000000009803');
insert into public.users (id)
select id from auth.users where id::text like '5707a6e0-0000-4000-8000-0000000098__'
on conflict do nothing;
insert into public.workspaces (id, name, personal, creator_id)
values ('5707a6e0-0000-4000-8000-000000009811', 'Storage RLS rollback', false,
  '5707a6e0-0000-4000-8000-000000009801');
insert into public.workspace_members (ws_id, user_id, type) values
  ('5707a6e0-0000-4000-8000-000000009811', '5707a6e0-0000-4000-8000-000000009802', 'MEMBER')
on conflict do nothing;
delete from public.workspace_default_permissions
where ws_id = '5707a6e0-0000-4000-8000-000000009811';
insert into storage.objects (bucket_id, name) values
  ('workspaces', '5707a6e0-0000-4000-8000-000000009811/chats/ai/resources/5707a6e0-0000-4000-8000-000000009821/a.pdf');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"5707a6e0-0000-4000-8000-000000009802","role":"authenticated"}', true);
select is((select count(*)::int from storage.objects
  where name like '5707a6e0-0000-4000-8000-000000009811/chats/%'), 1,
  'prior semantics: any member reads another member''s chat attachment');
select lives_ok($$insert into storage.objects (bucket_id, name) values
  ('workspaces', '5707a6e0-0000-4000-8000-000000009811/external-apps/x')$$,
  'prior semantics: any member writes application-owned roots');
select set_config('request.jwt.claims',
  '{"sub":"5707a6e0-0000-4000-8000-000000009803","role":"authenticated"}', true);
select is((select count(*)::int from storage.objects
  where name like '5707a6e0-0000-4000-8000-000000009811/%'), 0,
  'prior semantics: non-members still read nothing');
reset role;
select ok(exists (select 1 from storage.objects
  where name = '5707a6e0-0000-4000-8000-000000009811/external-apps/x'),
  'rollback does not touch stored objects');

select * from finish();
rollback;
