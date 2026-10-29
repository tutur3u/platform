-- MANAGED_CRON_ENABLED is reserved: API roles cannot insert, update, delete,
-- or rename to/from it directly, even as root-workspace members with
-- manage_workspace_secrets. The service role (server code after its
-- verified-staff check) and other secret names are unaffected.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(23);

create temp table wrs_users (label text primary key, id uuid not null);
insert into wrs_users values
  ('manager', '38900000-0000-4000-8000-000000000001'),
  ('creator', '38900000-0000-4000-8000-000000000002');
grant select on wrs_users to authenticated, service_role;

insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
select id, 'wrs-' || label || '@example.com', now(), '{}'::jsonb, '{}'::jsonb from wrs_users
on conflict (id) do nothing;

create function pg_temp.uid(p_label text) returns uuid language sql stable as $$
  select id from wrs_users where label = p_label
$$;

-- Runs one statement under an API role; returns its scalar result, 'ok',
-- or the SQLSTATE it raised.
create function pg_temp.as_role(p_user uuid, p_sql text, p_role text default 'authenticated')
returns text language plpgsql as $$
declare r text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', p_role)::text, true);
  execute format('set local role %I', p_role);
  begin
    if p_sql ~* '^\s*select' then execute p_sql into r; else execute p_sql; end if;
    r := coalesce(nullif(r, ''), 'ok');
  exception when others then r := sqlstate;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return r;
end $$;

create function pg_temp.secret_value(p_ws uuid, p_name text) returns text
language sql stable as $$
  select value from public.workspace_secrets where ws_id = p_ws and name = p_name
$$;

create function pg_temp.secret_count(p_ws uuid, p_name text) returns bigint
language sql stable as $$
  select count(*) from public.workspace_secrets where ws_id = p_ws and name = p_name
$$;

-- Fixtures (migration context, no JWT): the manager is a root-workspace
-- MEMBER holding manage_workspace_secrets through a root role, which the
-- platform-admin RLS policy admits for every workspace's secrets.
insert into public.workspaces (id, name, personal, creator_id) values
  ('00000000-0000-0000-0000-000000000000', 'Tuturuuu', false, pg_temp.uid('creator'))
on conflict (id) do nothing;
insert into public.workspaces (id, name, personal, creator_id) values
  ('38900000-0000-4000-8000-0000000000a1', 'WRS target', false, pg_temp.uid('creator'));

insert into public.workspace_members (ws_id, user_id, type)
values ('00000000-0000-0000-0000-000000000000', pg_temp.uid('manager'), 'MEMBER')
on conflict (ws_id, user_id) do update set type = 'MEMBER';

insert into public.workspace_roles (id, ws_id, name)
values ('38900000-0000-4000-8000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'WRS secrets manager');
insert into public.workspace_role_permissions (ws_id, role_id, permission, enabled)
values ('00000000-0000-0000-0000-000000000000', '38900000-0000-4000-8000-0000000000b1', 'manage_workspace_secrets', true)
on conflict (ws_id, permission, role_id) do update set enabled = excluded.enabled;
insert into public.workspace_role_members (role_id, user_id)
values ('38900000-0000-4000-8000-0000000000b1', pg_temp.uid('manager'))
on conflict (role_id, user_id) do nothing;

insert into public.workspace_secrets (ws_id, name, value) values
  ('38900000-0000-4000-8000-0000000000a1', 'MANAGED_CRON_ENABLED', 'false'),
  ('38900000-0000-4000-8000-0000000000a1', 'WRS_OTHER', 'one');

select has_trigger('public', 'workspace_secrets', 'workspace_secrets_guard_reserved_names',
  'workspace_secrets has the reserved-name guard trigger');

select ok(
  public.has_workspace_permission('00000000-0000-0000-0000-000000000000', pg_temp.uid('manager'), 'manage_workspace_secrets')
  and public.is_org_member(pg_temp.uid('manager'), '00000000-0000-0000-0000-000000000000'),
  'fixture: manager is a root member with manage_workspace_secrets');

-- Other secret names keep working for the root manager (RLS admits them).
select is(pg_temp.as_role(pg_temp.uid('manager'), $q$
  insert into public.workspace_secrets (ws_id, name, value)
  values ('38900000-0000-4000-8000-0000000000a1', 'WRS_NEW', 'x')
$q$), 'ok', 'root manager can insert another secret name');
select is(pg_temp.as_role(pg_temp.uid('manager'), $q$
  update public.workspace_secrets set value = 'two'
  where ws_id = '38900000-0000-4000-8000-0000000000a1' and name = 'WRS_OTHER'
$q$), 'ok', 'root manager can update another secret name');
select is(pg_temp.secret_value('38900000-0000-4000-8000-0000000000a1', 'WRS_OTHER'), 'two',
  'the other secret update is persisted');
select is(pg_temp.as_role(pg_temp.uid('manager'), $q$
  delete from public.workspace_secrets
  where ws_id = '38900000-0000-4000-8000-0000000000a1' and name = 'WRS_NEW'
$q$), 'ok', 'root manager can delete another secret name');
select is(pg_temp.secret_count('38900000-0000-4000-8000-0000000000a1', 'WRS_NEW'), 0::bigint,
  'the other secret delete is persisted');

-- The reserved name is rejected for the root manager.
select is(pg_temp.as_role(pg_temp.uid('manager'), $q$
  insert into public.workspace_secrets (ws_id, name, value)
  values ('38900000-0000-4000-8000-0000000000a1', 'MANAGED_CRON_ENABLED', 'true')
$q$), '42501', 'root manager cannot insert MANAGED_CRON_ENABLED');
select is(pg_temp.as_role(pg_temp.uid('manager'), $q$
  insert into public.workspace_secrets (ws_id, name, value)
  values ('38900000-0000-4000-8000-0000000000a1', '  managed_cron_enabled ', 'true')
$q$), '42501', 'root manager cannot insert a case/whitespace variant of the reserved name');
select is(pg_temp.as_role(pg_temp.uid('manager'), $q$
  update public.workspace_secrets set value = 'true'
  where ws_id = '38900000-0000-4000-8000-0000000000a1' and name = 'MANAGED_CRON_ENABLED'
$q$), '42501', 'root manager cannot update MANAGED_CRON_ENABLED');
select is(pg_temp.secret_value('38900000-0000-4000-8000-0000000000a1', 'MANAGED_CRON_ENABLED'), 'false',
  'MANAGED_CRON_ENABLED value is unchanged');
select is(pg_temp.as_role(pg_temp.uid('manager'), $q$
  update public.workspace_secrets set name = 'WRS_RENAMED'
  where ws_id = '38900000-0000-4000-8000-0000000000a1' and name = 'MANAGED_CRON_ENABLED'
$q$), '42501', 'root manager cannot rename MANAGED_CRON_ENABLED away');
select is(pg_temp.as_role(pg_temp.uid('manager'), $q$
  update public.workspace_secrets set name = 'MANAGED_CRON_ENABLED', value = 'true'
  where ws_id = '38900000-0000-4000-8000-0000000000a1' and name = 'WRS_OTHER'
$q$), '42501', 'root manager cannot rename another secret to MANAGED_CRON_ENABLED');
select is(pg_temp.secret_value('38900000-0000-4000-8000-0000000000a1', 'WRS_OTHER'), 'two',
  'the secret renamed toward the reserved name is unchanged');
select is(pg_temp.as_role(pg_temp.uid('manager'), $q$
  delete from public.workspace_secrets
  where ws_id = '38900000-0000-4000-8000-0000000000a1' and name = 'MANAGED_CRON_ENABLED'
$q$), '42501', 'root manager cannot delete MANAGED_CRON_ENABLED');
select is(pg_temp.secret_count('38900000-0000-4000-8000-0000000000a1', 'MANAGED_CRON_ENABLED'), 1::bigint,
  'MANAGED_CRON_ENABLED still exists');

-- The service role (server code after its verified-staff check) is allowed.
delete from public.workspace_secrets
where ws_id = '38900000-0000-4000-8000-0000000000a1' and name = 'MANAGED_CRON_ENABLED';
select is(pg_temp.as_role(null, $q$
  insert into public.workspace_secrets (ws_id, name, value)
  values ('38900000-0000-4000-8000-0000000000a1', 'MANAGED_CRON_ENABLED', 'false')
$q$, 'service_role'), 'ok', 'service role can insert MANAGED_CRON_ENABLED');
select is(pg_temp.as_role(null, $q$
  update public.workspace_secrets set value = 'true'
  where ws_id = '38900000-0000-4000-8000-0000000000a1' and name = 'MANAGED_CRON_ENABLED'
$q$, 'service_role'), 'ok', 'service role can update MANAGED_CRON_ENABLED');
select is(pg_temp.secret_value('38900000-0000-4000-8000-0000000000a1', 'MANAGED_CRON_ENABLED'), 'true',
  'service role update is persisted');
select is(pg_temp.as_role(null, $q$
  update public.workspace_secrets set name = 'WRS_PARKED'
  where ws_id = '38900000-0000-4000-8000-0000000000a1' and name = 'MANAGED_CRON_ENABLED'
$q$, 'service_role'), 'ok', 'service role can rename MANAGED_CRON_ENABLED away');
select is(pg_temp.as_role(null, $q$
  update public.workspace_secrets set name = 'MANAGED_CRON_ENABLED'
  where ws_id = '38900000-0000-4000-8000-0000000000a1' and name = 'WRS_PARKED'
$q$, 'service_role'), 'ok', 'service role can rename a secret to MANAGED_CRON_ENABLED');
select is(pg_temp.as_role(null, $q$
  delete from public.workspace_secrets
  where ws_id = '38900000-0000-4000-8000-0000000000a1' and name = 'MANAGED_CRON_ENABLED'
$q$, 'service_role'), 'ok', 'service role can delete MANAGED_CRON_ENABLED');
select is(pg_temp.secret_count('38900000-0000-4000-8000-0000000000a1', 'MANAGED_CRON_ENABLED'), 0::bigint,
  'service role delete is persisted');

select * from finish();
rollback;
