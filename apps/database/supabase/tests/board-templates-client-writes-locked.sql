-- Regression contract: members never write public.board_templates directly.
-- 20260312113000_lock_description_tables_to_server_apis.sql enabled RLS on the
-- table, dropped every policy and revoked all privileges from anon and
-- authenticated; only the service-role template APIs may set background_path
-- (see workspace_storage.object_access, which trusts a template's pointer).
-- If a later migration re-grants client writes, this file must fail.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(10);

select ok(
  (select relrowsecurity from pg_catalog.pg_class
   where oid = 'public.board_templates'::regclass),
  'row level security is enabled on board_templates'
);
select ok(
  not has_table_privilege('authenticated', 'public.board_templates', 'INSERT')
    and not has_table_privilege('authenticated', 'public.board_templates', 'UPDATE'),
  'authenticated has no table-wide INSERT or UPDATE on board_templates'
);
select ok(
  not has_table_privilege('anon', 'public.board_templates', 'INSERT')
    and not has_table_privilege('anon', 'public.board_templates', 'UPDATE'),
  'anon has no INSERT or UPDATE on board_templates'
);
select ok(
  not has_column_privilege('authenticated', 'public.board_templates', 'background_path', 'INSERT')
    and not has_column_privilege('authenticated', 'public.board_templates', 'background_path', 'UPDATE'),
  'authenticated has no column-level write privilege on background_path'
);
select ok(
  not has_column_privilege('anon', 'public.board_templates', 'background_path', 'INSERT')
    and not has_column_privilege('anon', 'public.board_templates', 'background_path', 'UPDATE'),
  'anon has no column-level write privilege on background_path'
);
select ok(
  not has_table_privilege('authenticated', 'public.board_templates', 'DELETE'),
  'authenticated cannot delete board_templates rows either'
);
-- The account_required_mfa policy is RESTRICTIVE: it can only narrow access.
select is(
  (select count(*)::int from pg_catalog.pg_policies
   where schemaname = 'public' and tablename = 'board_templates'
     and permissive = 'PERMISSIVE'
     and cmd in ('INSERT', 'UPDATE', 'ALL')
     and (roles && array['authenticated', 'anon', 'public']::name[])),
  0, 'no permissive client-role write policy exists on board_templates'
);
select ok(
  has_table_privilege('service_role', 'public.board_templates', 'INSERT')
    and has_table_privilege('service_role', 'public.board_templates', 'UPDATE')
    and has_column_privilege('service_role', 'public.board_templates', 'background_path', 'UPDATE'),
  'service_role keeps the write privileges the template APIs use'
);

insert into auth.users (id) values ('5707a6e0-0000-4000-8000-000000009a01');
insert into public.users (id) values ('5707a6e0-0000-4000-8000-000000009a01')
on conflict do nothing;
insert into public.workspaces (id, name, personal, creator_id)
values ('5707a6e0-0000-4000-8000-000000009a11', 'Template lock', false,
  '5707a6e0-0000-4000-8000-000000009a01');
insert into public.workspace_members (ws_id, user_id, type)
values ('5707a6e0-0000-4000-8000-000000009a11', '5707a6e0-0000-4000-8000-000000009a01', 'MEMBER')
on conflict do nothing;
insert into public.board_templates (id, ws_id, created_by, name, content) values
  ('5707a6e0-0000-4000-8000-000000009a21', '5707a6e0-0000-4000-8000-000000009a11',
   '5707a6e0-0000-4000-8000-000000009a01', 'owner template', '{}');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"5707a6e0-0000-4000-8000-000000009a01"}', true);
select throws_ok(
  $$update public.board_templates
    set background_path = '5707a6e0-0000-4000-8000-000000009a11/template-backgrounds/x.png'
    where id = '5707a6e0-0000-4000-8000-000000009a21'$$,
  '42501', null, 'a member cannot repoint their own template background'
);
select throws_ok(
  $$insert into public.board_templates (ws_id, created_by, name, content, background_path) values
    ('5707a6e0-0000-4000-8000-000000009a11', '5707a6e0-0000-4000-8000-000000009a01', 'pointer', '{}',
     '5707a6e0-0000-4000-8000-000000009a11/template-backgrounds/x.png')$$,
  '42501', null, 'a member cannot create a template with a background_path'
);
reset role;

select * from finish();
rollback;
