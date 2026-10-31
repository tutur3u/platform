-- Rollback-only actual SQL: runs the real migration file against seeded orphans.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(19);

insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
  ('2c0a0000-0000-4000-8000-000000000001', 'qorp-a@example.com', now(), '{}', '{}'),
  ('2c0a0000-0000-4000-8000-000000000002', 'qorp-b@example.com', now(), '{}', '{}');
insert into public.users (id) values
  ('2c0a0000-0000-4000-8000-000000000001'),
  ('2c0a0000-0000-4000-8000-000000000002')
on conflict (id) do nothing;
insert into public.workspaces (id, name, personal, creator_id) values
  ('2c0a0000-0000-4000-8000-0000000000a1', 'QORP A', false, '2c0a0000-0000-4000-8000-000000000001'),
  ('2c0a0000-0000-4000-8000-0000000000b1', 'QORP B', false, '2c0a0000-0000-4000-8000-000000000002');
insert into public.workspace_roles (id, ws_id, name) values
  ('2c0a0000-0000-4000-8000-0000000000c1', '2c0a0000-0000-4000-8000-0000000000a1', 'QORP Role A'),
  ('2c0a0000-0000-4000-8000-0000000000c2', '2c0a0000-0000-4000-8000-0000000000b1', 'QORP Role B');

-- Reproduce production before the composite key: the legacy key checks only
-- role_id, so a row can name a workspace other than its role's workspace.
alter table public.workspace_role_permissions
  drop constraint workspace_role_permissions_ws_role_fkey;
alter table public.workspace_role_permissions
  add constraint qorp_legacy_role_id_fkey foreign key (role_id)
  references public.workspace_roles (id) on update cascade on delete cascade;

insert into public.workspace_role_permissions (ws_id, role_id, permission, enabled, created_at) values
  -- valid rows: workspace matches the role's workspace
  ('2c0a0000-0000-4000-8000-0000000000a1', '2c0a0000-0000-4000-8000-0000000000c1', 'manage_workspace_roles', true, '2026-01-01 00:00:00+00'),
  ('2c0a0000-0000-4000-8000-0000000000b1', '2c0a0000-0000-4000-8000-0000000000c2', 'manage_workspace_members', false, '2026-01-02 00:00:00+00'),
  -- orphan: role belongs to A, row names B
  ('2c0a0000-0000-4000-8000-0000000000b1', '2c0a0000-0000-4000-8000-0000000000c1', 'manage_workspace_settings', true, '2026-01-03 00:00:00+00');

select throws_ok(
  $$ alter table public.workspace_role_permissions
       add constraint workspace_role_permissions_ws_role_fkey
       foreign key (ws_id, role_id) references public.workspace_roles (ws_id, id)
       on update cascade on delete cascade $$,
  '23503',
  null,
  'BEFORE the composite key cannot be added over an orphan row'
);
select is(
  (select count(*)::int from public.workspace_role_permissions
   where role_id in ('2c0a0000-0000-4000-8000-0000000000c1', '2c0a0000-0000-4000-8000-0000000000c2')),
  3, 'BEFORE three fixture rows are live'
);

\ir ../migrations/20261030130950_quarantine_orphan_role_permissions.sql

select is(
  (select count(*)::int from private.workspace_role_permissions_orphans_20261031),
  1, 'exactly the orphan is quarantined'
);
select results_eq(
  $$ select ws_id, role_id, permission::text, enabled, created_at, quarantined_at is not null
     from private.workspace_role_permissions_orphans_20261031 $$,
  $$ values ('2c0a0000-0000-4000-8000-0000000000b1'::uuid, '2c0a0000-0000-4000-8000-0000000000c1'::uuid,
             'manage_workspace_settings', true, '2026-01-03 00:00:00+00'::timestamptz, true) $$,
  'quarantined row keeps every original column value and gets a timestamp'
);
select is(
  (select count(*)::int from public.workspace_role_permissions
   where ws_id = '2c0a0000-0000-4000-8000-0000000000b1'
     and role_id = '2c0a0000-0000-4000-8000-0000000000c1'),
  0, 'orphan is removed from the live table'
);
select results_eq(
  $$ select ws_id, role_id, permission::text, enabled, created_at
     from public.workspace_role_permissions
     where role_id in ('2c0a0000-0000-4000-8000-0000000000c1', '2c0a0000-0000-4000-8000-0000000000c2')
     order by created_at $$,
  $$ values
     ('2c0a0000-0000-4000-8000-0000000000a1'::uuid, '2c0a0000-0000-4000-8000-0000000000c1'::uuid,
      'manage_workspace_roles', true, '2026-01-01 00:00:00+00'::timestamptz),
     ('2c0a0000-0000-4000-8000-0000000000b1'::uuid, '2c0a0000-0000-4000-8000-0000000000c2'::uuid,
      'manage_workspace_members', false, '2026-01-02 00:00:00+00'::timestamptz) $$,
  'valid rows are untouched'
);

-- Idempotent: a second run moves nothing and keeps the earlier evidence.
\ir ../migrations/20261030130950_quarantine_orphan_role_permissions.sql
select is(
  (select count(*)::int from private.workspace_role_permissions_orphans_20261031),
  1, 're-run does not duplicate or lose quarantined rows'
);
select is(
  (select count(*)::int from public.workspace_role_permissions
   where role_id in ('2c0a0000-0000-4000-8000-0000000000c1', '2c0a0000-0000-4000-8000-0000000000c2')),
  2, 're-run leaves valid rows in place'
);

-- The same statements 20261030131000 issues now validate against the data.
alter table public.workspace_role_permissions
  add constraint workspace_role_permissions_ws_role_fkey
  foreign key (ws_id, role_id) references public.workspace_roles (ws_id, id)
  on update cascade on delete cascade not valid;
select lives_ok(
  $$ alter table public.workspace_role_permissions
       validate constraint workspace_role_permissions_ws_role_fkey $$,
  'AFTER the composite key validates'
);
select is(
  (select convalidated from pg_constraint
   where conrelid = 'public.workspace_role_permissions'::regclass
     and conname = 'workspace_role_permissions_ws_role_fkey'),
  true, 'AFTER the composite key is marked validated'
);

-- Quarantine table is service_role only.
select is(
  (select relrowsecurity from pg_class
   where oid = 'private.workspace_role_permissions_orphans_20261031'::regclass),
  true, 'quarantine table has RLS enabled'
);
select is(
  (select count(*)::int from pg_policy
   where polrelid = 'private.workspace_role_permissions_orphans_20261031'::regclass),
  0, 'quarantine table has no policies'
);
select is(
  has_table_privilege('anon', 'private.workspace_role_permissions_orphans_20261031', 'SELECT,INSERT,UPDATE,DELETE'),
  false, 'anon has no table privilege'
);
select is(
  has_table_privilege('authenticated', 'private.workspace_role_permissions_orphans_20261031', 'SELECT,INSERT,UPDATE,DELETE'),
  false, 'authenticated has no table privilege'
);
select is(
  (select count(*)::int from information_schema.role_table_grants
   where table_schema = 'private'
     and table_name = 'workspace_role_permissions_orphans_20261031'
     and grantee = 'PUBLIC'),
  0, 'PUBLIC has no table privilege'
);
select is(
  has_table_privilege('service_role', 'private.workspace_role_permissions_orphans_20261031', 'SELECT,INSERT,UPDATE,DELETE'),
  true, 'service_role keeps full table privilege'
);
select columns_are(
  'private', 'workspace_role_permissions_orphans_20261031',
  array['ws_id', 'permission', 'enabled', 'created_at', 'role_id', 'quarantined_at'],
  'quarantine table mirrors the live columns plus quarantined_at'
);

-- Rollback restores the row once the composite key is removed. The statement
-- mirrors the one in the rollback file, which owns its own transaction.
alter table public.workspace_role_permissions
  drop constraint workspace_role_permissions_ws_role_fkey;
with restored as (
  insert into public.workspace_role_permissions
    (ws_id, permission, enabled, created_at, role_id)
  select q.ws_id, q.permission, q.enabled, q.created_at, q.role_id
  from private.workspace_role_permissions_orphans_20261031 q
  on conflict do nothing
  returning ws_id, permission, role_id
)
delete from private.workspace_role_permissions_orphans_20261031 q
using restored r
where q.ws_id = r.ws_id and q.permission = r.permission and q.role_id = r.role_id;
select is(
  (select count(*)::int from public.workspace_role_permissions
   where ws_id = '2c0a0000-0000-4000-8000-0000000000b1'
     and role_id = '2c0a0000-0000-4000-8000-0000000000c1'
     and permission = 'manage_workspace_settings' and enabled),
  1, 'rollback statement restores the orphan row'
);
select is(
  (select count(*)::int from private.workspace_role_permissions_orphans_20261031),
  0, 'rollback statement empties the quarantine'
);
select * from finish();
rollback;
