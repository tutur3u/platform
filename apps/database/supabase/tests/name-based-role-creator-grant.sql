begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

create temp table name_role_users (label text primary key, id uuid not null);
insert into name_role_users values
  ('creator_b', '1ac00000-0000-4000-8000-000000000001'),
  ('actor', '1ac00000-0000-4000-8000-000000000002');
grant select on name_role_users to authenticated, service_role;

create temp table name_role_workspaces (label text primary key, id uuid not null);
insert into name_role_workspaces values
  ('b', '1ac00000-0000-4000-8000-0000000000b1');
grant select on name_role_workspaces to authenticated, service_role;

insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
select id, 'name-role-' || label || '@example.com', now(), '{}'::jsonb, '{}'::jsonb
from name_role_users;
insert into public.users (id)
select id from name_role_users on conflict (id) do nothing;

create function pg_temp.uid(p_label text) returns uuid language sql stable as $$
  select id from name_role_users where label = p_label
$$;
create function pg_temp.w(p_label text) returns uuid language sql stable as $$
  select id from name_role_workspaces where label = p_label
$$;
create function pg_temp.as_role(p_user uuid, p_sql text, p_role text default 'authenticated')
returns text language plpgsql as $$
declare result text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', p_role)::text, true);
  execute format('set local role %I', p_role);
  perform set_config('name_role.last_error', '', true);
  begin
    execute p_sql;
    result := 'ok';
  exception when others then
    result := sqlstate;
    perform set_config('name_role.last_error', sqlerrm, true);
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return result;
end $$;
create function pg_temp.as_err(p_user uuid, p_sql text, p_role text default 'authenticated')
returns text language plpgsql as $$
declare result text := pg_temp.as_role(p_user, p_sql, p_role);
begin
  if coalesce(current_setting('name_role.last_error', true), '') <> '' then
    return result || ': ' || current_setting('name_role.last_error', true);
  end if;
  return result;
end $$;

insert into public.workspaces (id, name, personal, creator_id)
values (pg_temp.w('b'), 'Name Path B', false, pg_temp.uid('creator_b'));
insert into public.workspace_members (ws_id, user_id, type)
values (pg_temp.w('b'), pg_temp.uid('actor'), 'MEMBER');
insert into public.workspace_roles (id, ws_id, name) values
  ('1ac00000-0000-4000-8000-0000000000c1', pg_temp.w('b'), 'Name Path Manager'),
  ('1ac00000-0000-4000-8000-0000000000c4', pg_temp.w('b'), 'Billing Admin'),
  ('1ac00000-0000-4000-8000-0000000000c5', pg_temp.w('b'), 'Billing POS');
insert into public.workspace_role_permissions (ws_id, role_id, permission, enabled) values
  (pg_temp.w('b'), '1ac00000-0000-4000-8000-0000000000c1', 'manage_workspace_members', true),
  (pg_temp.w('b'), '1ac00000-0000-4000-8000-0000000000c1', 'manage_workspace_roles', true),
  (pg_temp.w('b'), '1ac00000-0000-4000-8000-0000000000c4', 'manage_subscription', false),
  (pg_temp.w('b'), '1ac00000-0000-4000-8000-0000000000c5', 'manage_subscription', false);
insert into public.workspace_role_members (role_id, user_id)
values ('1ac00000-0000-4000-8000-0000000000c1', pg_temp.uid('actor'));
insert into public.workspace_default_permissions (ws_id, member_type, permission, enabled)
values (pg_temp.w('b'), 'MEMBER', 'admin', true)
on conflict (ws_id, permission, member_type) do update set enabled = excluded.enabled;

-- Internal renames model legacy/system paths that bypass the API guard.
update public.workspace_roles
set name = 'Workspace Admin (preserved)'
where id = '1ac00000-0000-4000-8000-0000000000c4';

select is(pg_temp.as_err(pg_temp.uid('actor'), format(
  'select private.prepare_inventory_pos_operator_access(%L, %L)',
  pg_temp.w('b'), pg_temp.uid('creator_b')), 'service_role'),
  '42501: name-selected preserved admin role has a creator-grant permission',
  'even the creator cannot prepare members through a renamed billing role');
select is((select count(*)::integer from public.workspace_role_members
  where role_id = '1ac00000-0000-4000-8000-0000000000c4'),
  0, 'the rejected name-selected admin role receives no members');

update public.workspace_default_permissions
set enabled = false
where ws_id = pg_temp.w('b') and member_type = 'MEMBER' and permission = 'admin';
update public.workspace_roles
set name = 'POS Operator'
where id = '1ac00000-0000-4000-8000-0000000000c5';
select is(pg_temp.as_err(pg_temp.uid('creator_b'), format(
  'select private.prepare_inventory_pos_operator_access(%L, %L)',
  pg_temp.w('b'), pg_temp.uid('creator_b')), 'service_role'),
  '42501: name-selected POS operator role has a creator-grant permission',
  'even the creator POS setup refuses a renamed billing role');
select is((select count(*)::integer from public.workspace_role_members
  where role_id = '1ac00000-0000-4000-8000-0000000000c5'),
  0, 'the rejected name-selected POS role receives no members');

select * from finish();
rollback;
