begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(348);

with tables(name) as (
  values ('workspace_members'), ('workspace_role_members'),
    ('workspace_role_permissions'), ('workspace_roles'),
    ('workspace_default_permissions'), ('workspace_invites'), ('workspace_email_invites')
), matrix as (
  select name, actor, operation,
    actor in ('service_role', 'postgres') or operation = 'SELECT' or (
      actor = 'authenticated' and (
        (name = 'workspace_members' and operation = 'INSERT') or (
          name in ('workspace_invites', 'workspace_email_invites')
          and operation in ('INSERT', 'UPDATE', 'DELETE')
        )
      )
    ) as expected
  from tables
  cross join (values ('anon'), ('authenticated'), ('service_role'), ('postgres')) roles(actor)
  cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
    ('TRUNCATE'), ('TRIGGER'), ('REFERENCES')) operations(operation)
)
select is(has_table_privilege(actor, 'public.' || name, operation), expected,
  format('%s %s privilege on %s', actor, operation, name))
from matrix
order by name, actor, operation;

select is(has_any_column_privilege(actor, relation, operation),
  has_table_privilege(actor, relation, operation),
  format('%s has no additional %s column grant on %s', actor, operation, relation))
from (values ('anon'), ('authenticated')) roles(actor)
cross join (values ('public.workspace_members'), ('public.workspace_role_members'),
  ('public.workspace_role_permissions'), ('public.workspace_roles'),
  ('public.workspace_default_permissions'), ('public.workspace_invites'),
  ('public.workspace_email_invites')) tables(relation)
cross join (values ('INSERT'), ('UPDATE'), ('REFERENCES')) operations(operation);

select gen_random_uuid() as ws, gen_random_uuid() as client_ws, gen_random_uuid() as empty_ws,
  gen_random_uuid() as creator, gen_random_uuid() as plain, gen_random_uuid() as assigned,
  gen_random_uuid() as member_manager, gen_random_uuid() as role_manager, gen_random_uuid() as outsider,
  gen_random_uuid() as member_role, gen_random_uuid() as manager_role, gen_random_uuid() as reader_role
\gset

insert into auth.users (id, email)
select id, id || '@example.test'
from unnest(array[:'creator', :'plain', :'assigned', :'member_manager', :'role_manager', :'outsider']::uuid[]) f(id);

insert into public.workspaces (id, name, creator_id, personal) values
  (:'ws', 'Client writes target', :'creator', false),
  (:'empty_ws', 'First membership target', :'creator', false);

delete from public.workspace_members where ws_id = :'empty_ws';

insert into public.workspace_members (ws_id, user_id, type)
select :'ws', id, 'MEMBER'
from unnest(array[:'plain', :'assigned', :'member_manager', :'role_manager']::uuid[]) f(id);

insert into public.workspace_roles (id, ws_id, name) values
  (:'member_role', :'ws', 'Member manager'),
  (:'manager_role', :'ws', 'Role manager'),
  (:'reader_role', :'ws', 'Reader');

insert into public.workspace_role_permissions (role_id, ws_id, permission, enabled) values
  (:'member_role', :'ws', 'manage_workspace_members', true),
  (:'manager_role', :'ws', 'manage_workspace_roles', true),
  (:'reader_role', :'ws', 'view_drive', true);

insert into public.workspace_role_members (role_id, user_id) values
  (:'member_role', :'member_manager'),
  (:'manager_role', :'role_manager'),
  (:'reader_role', :'assigned');

-- The fixture contains five members, three roles with one grant and assignment
-- each, and four MEMBER defaults. Ordinary members see only their own assignments
-- and the corresponding role grants. Role managers can see all three.
create temp table membership_readers (
  label text, actor uuid, members bigint, assignments bigint,
  permissions bigint, roles bigint, defaults bigint
);
insert into membership_readers values
  ('creator', :'creator', 5, 3, 3, 3, 4),
  ('plain member', :'plain', 5, 0, 0, 3, 4),
  ('member with a role assignment', :'assigned', 5, 1, 1, 3, 4),
  ('member manager', :'member_manager', 5, 1, 1, 3, 4),
  ('role manager', :'role_manager', 5, 3, 3, 3, 4),
  ('outsider', :'outsider', 0, 0, 0, 0, 0);

-- Execute each query in its own role context so the RLS predicates and JWT
-- claims are evaluated together.
select
  'set local role authenticated',
  format('set local request.jwt.claims = %L',
    jsonb_build_object('sub', actor, 'role', 'authenticated', 'aal', 'aal2')),
  format('select is((select count(*) from public.workspace_members where ws_id = %L), %L::bigint, %L)',
    :'ws', members, label || ' sees workspace members'),
  format('select is((select count(*) from public.workspace_role_members where role_id in (%L, %L, %L)), %L::bigint, %L)',
    :'member_role', :'manager_role', :'reader_role', assignments, label || ' sees role assignments'),
  format('select is((select count(*) from public.workspace_role_permissions where ws_id = %L), %L::bigint, %L)',
    :'ws', permissions, label || ' sees role permissions'),
  format('select is((select count(*) from public.workspace_roles where ws_id = %L), %L::bigint, %L)',
    :'ws', roles, label || ' sees workspace roles'),
  format('select is((select count(*) from public.workspace_default_permissions where ws_id = %L), %L::bigint, %L)',
    :'ws', defaults, label || ' sees default permissions'),
  'reset role'
from membership_readers
\gexec

create temp table attempted_writes (relation text, operation text, statement text);

insert into attempted_writes values
  ('workspace_members', 'update own membership', format(
    'update public.workspace_members set type = ''GUEST'' where ws_id = %L and user_id = auth.uid()', :'ws')),
  ('workspace_members', 'update another membership', format(
    'update public.workspace_members set type = ''GUEST'' where ws_id = %L and user_id = %L', :'ws', :'plain')),
  ('workspace_members', 'delete own membership', format(
    'delete from public.workspace_members where ws_id = %L and user_id = auth.uid()', :'ws')),
  ('workspace_members', 'delete another membership', format(
    'delete from public.workspace_members where ws_id = %L and user_id = %L', :'ws', :'plain')),
  ('workspace_role_members', 'insert', format(
    'insert into public.workspace_role_members (role_id, user_id) values (%L, %L)', :'reader_role', :'plain')),
  ('workspace_role_members', 'update', format(
    'update public.workspace_role_members set user_id = %L where role_id = %L', :'plain', :'reader_role')),
  ('workspace_role_members', 'delete', format(
    'delete from public.workspace_role_members where role_id = %L', :'reader_role')),
  ('workspace_role_permissions', 'insert', format(
    'insert into public.workspace_role_permissions (role_id, ws_id, permission, enabled)
     values (%L, %L, ''view_chat'', true)', :'reader_role', :'ws')),
  ('workspace_role_permissions', 'update', format(
    'update public.workspace_role_permissions set enabled = false where ws_id = %L', :'ws')),
  ('workspace_role_permissions', 'delete', format(
    'delete from public.workspace_role_permissions where ws_id = %L', :'ws')),
  ('workspace_roles', 'insert', format(
    'insert into public.workspace_roles (ws_id, name) values (%L, ''Client-created role'')', :'ws')),
  ('workspace_roles', 'update', format(
    'update public.workspace_roles set name = ''Client edit'' where id = %L', :'reader_role')),
  ('workspace_roles', 'delete', format(
    'delete from public.workspace_roles where id = %L', :'reader_role')),
  ('workspace_default_permissions', 'insert', format(
    'insert into public.workspace_default_permissions (ws_id, permission, member_type, enabled)
     values (%L, ''view_chat'', ''GUEST'', true)', :'ws')),
  ('workspace_default_permissions', 'update', format(
    'update public.workspace_default_permissions set enabled = false where ws_id = %L', :'ws')),
  ('workspace_default_permissions', 'delete', format(
    'delete from public.workspace_default_permissions where ws_id = %L', :'ws'));

grant select on attempted_writes to authenticated;

select
  'set local role authenticated',
  format('set local request.jwt.claims = %L',
    jsonb_build_object('sub', actor, 'role', 'authenticated', 'aal', 'aal2')),
  format('select ok(public.has_workspace_permission(%L, auth.uid(), %L), %L)',
    :'ws', permission, label || ' holds ' || permission),
  format($deny$
    select throws_ok(statement, '42501', 'permission denied for table ' || relation,
      %L || ' cannot ' || operation || ' on ' || relation)
    from attempted_writes
  $deny$, label),
  'reset role'
from (values
  ('creator', :'creator', 'manage_workspace_members'),
  ('member manager', :'member_manager', 'manage_workspace_members'),
  ('role manager', :'role_manager', 'manage_workspace_roles')
) managers(label, actor, permission)
\gexec

select set_config('request.jwt.claims',
  jsonb_build_object('sub', :'creator', 'role', 'authenticated', 'aal', 'aal2')::text, true);
set local role authenticated;

select lives_ok(format(
  'insert into public.workspaces (id, name, creator_id, personal) values (%L, %L, %L, false)',
  :'client_ws', 'Created directly by a client', :'creator'),
  'the signed-in creator can insert a workspace');
select results_eq(format(
  'select user_id, type::text from public.workspace_members where ws_id = %L', :'client_ws'),
  format('values (%L::uuid, ''MEMBER''::text)', :'creator'),
  'the workspace trigger inserts the creator as a full member');
select results_eq(format(
  'select permission::text, member_type::text, enabled from public.workspace_default_permissions
   where ws_id = %L order by permission::text', :'client_ws'),
  $$values ('create_chat'::text, 'MEMBER'::text, true),
    ('manage_drive_tasks_directory', 'MEMBER', true), ('view_chat', 'MEMBER', true),
    ('view_drive', 'MEMBER', true)$$,
  'the workspace trigger seeds the four enabled Drive and Chat defaults');
select ok(public.has_workspace_permission(:'client_ws', auth.uid(), 'admin'),
  'the creator has admin access on the new workspace');
select lives_ok(format(
  'insert into public.workspace_members (ws_id, user_id, type) values (%L, %L, ''MEMBER'')',
  :'empty_ws', :'creator'),
  'the creator can bootstrap membership of an empty workspace');
select is((select count(*) from public.workspace_members
  where ws_id = :'empty_ws' and user_id = :'creator'), 1::bigint, 'bootstrap creates the creator membership');

reset role;
select set_config('request.jwt.claims',
  jsonb_build_object('sub', :'member_manager', 'role', 'authenticated', 'aal', 'aal2')::text, true);
set local role authenticated;

select results_eq(format(
  'insert into public.workspace_invites (ws_id, user_id, type) values (%L, %L, ''MEMBER'') returning type::text',
  :'ws', :'outsider'), $$values ('MEMBER'::text)$$, 'member manager can insert a pending user invite');
select results_eq(format(
  'insert into public.workspace_email_invites (ws_id, email, type, invited_by)
   values (%L, ''pending@example.test'', ''MEMBER'', %L) returning type::text', :'ws', :'member_manager'),
  $$values ('MEMBER'::text)$$, 'member manager can insert a pending email invite');

reset role;
set local request.jwt.claims = '{"role":"anon"}';
set local role anon;

select is((select count(*) from public.workspace_members where ws_id = :'ws'),
  0::bigint, 'anon sees no workspace members');
select is((select count(*) from public.workspace_role_members
  where role_id in (:'member_role', :'manager_role', :'reader_role')),
  0::bigint, 'anon sees no role assignments');
select is((select count(*) from public.workspace_role_permissions where ws_id = :'ws'),
  0::bigint, 'anon sees no role permissions');
select is((select count(*) from public.workspace_roles where ws_id = :'ws'),
  0::bigint, 'anon sees no workspace roles');
select is((select count(*) from public.workspace_default_permissions where ws_id = :'ws'),
  0::bigint, 'anon sees no default permissions');
select is((select count(*) from public.workspace_invites where ws_id = :'ws'), 0::bigint, 'anon sees no pending user invite');
select is((select count(*) from public.workspace_email_invites where ws_id = :'ws'), 0::bigint, 'anon sees no pending email invite');
select throws_ok(statement, '42501', 'permission denied for table ' || table_name,
  'anon cannot ' || operation || ' on ' || table_name)
from (values
  ('workspace_invites', 'insert', format(
    'insert into public.workspace_invites (ws_id, user_id, type) values (%L, %L, ''MEMBER'')', :'ws', :'outsider')),
  ('workspace_invites', 'update', format(
    'update public.workspace_invites set type = ''GUEST'' where ws_id = %L', :'ws')),
  ('workspace_invites', 'delete', format(
    'delete from public.workspace_invites where ws_id = %L', :'ws')),
  ('workspace_email_invites', 'insert', format(
    'insert into public.workspace_email_invites (ws_id, email, type, invited_by)
     values (%L, ''anon@example.test'', ''MEMBER'', %L)', :'ws', :'member_manager')),
  ('workspace_email_invites', 'update', format(
    'update public.workspace_email_invites set type = ''GUEST'' where ws_id = %L', :'ws')),
  ('workspace_email_invites', 'delete', format(
    'delete from public.workspace_email_invites where ws_id = %L', :'ws'))
) attempts(table_name, operation, statement);

reset role;
select set_config('request.jwt.claims',
  jsonb_build_object('sub', :'member_manager', 'role', 'authenticated', 'aal', 'aal2')::text, true);
set local role authenticated;

select results_eq(format(
  'update public.workspace_invites set type = ''GUEST'' where ws_id = %L and user_id = %L returning type::text',
  :'ws', :'outsider'), $$values ('GUEST'::text)$$, 'member manager can update the pending user invite');
select results_eq(format(
  'update public.workspace_email_invites set type = ''GUEST''
   where ws_id = %L and email = ''pending@example.test'' returning type::text', :'ws'),
  $$values ('GUEST'::text)$$, 'member manager can update the pending email invite');
select results_eq(format(
  'delete from public.workspace_invites where ws_id = %L and user_id = %L returning type::text',
  :'ws', :'outsider'), $$values ('GUEST'::text)$$, 'member manager can delete the pending user invite');
select results_eq(format(
  'delete from public.workspace_email_invites where ws_id = %L and email = ''pending@example.test'' returning type::text',
  :'ws'), $$values ('GUEST'::text)$$, 'member manager can delete the pending email invite');

reset role;
set local request.jwt.claims = '{"role":"service_role"}';
set local role service_role;

select is(public.remove_workspace_member_guarded_in_mode(:'ws', :'plain', :'member_manager', 'workspace'),
  'removed', 'service role can remove a member using the guarded function');
select is((select count(*) from public.workspace_members where ws_id = :'ws' and user_id = :'plain'),
  0::bigint, 'guarded removal deletes the target membership');
select is(public.delete_workspace_role_guarded(:'ws', :'reader_role', :'role_manager', 'workspace'),
  'removed', 'service role can delete a role using the guarded function');
select is((select count(*) from public.workspace_roles where ws_id = :'ws' and id = :'reader_role'),
  0::bigint, 'guarded deletion deletes the target role');

reset role;
select * from finish();
rollback;
