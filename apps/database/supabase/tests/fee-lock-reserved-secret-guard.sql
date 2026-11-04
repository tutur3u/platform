-- ENABLE_FEE_LOCK is reserved like MANAGED_CRON_ENABLED (20261104161000): API
-- roles cannot insert, update, delete, or rename to/from it, even as
-- root-workspace members with manage_workspace_secrets. The service role
-- (server code after its verified-staff check) and other names are unaffected.
-- Synthetic fixtures only.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(12);

create temp table flg_users (label text primary key, id uuid not null);
insert into flg_users values
  ('manager', '38910000-0000-4000-8000-000000000001'),
  ('creator', '38910000-0000-4000-8000-000000000002');
grant select on flg_users to authenticated, service_role;

insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
select id, 'flg-' || label || '@example.com', now(), '{}'::jsonb, '{}'::jsonb from flg_users
on conflict (id) do nothing;

create function pg_temp.uid(p_label text) returns uuid language sql stable as $$
  select id from flg_users where label = p_label
$$;

-- Runs one statement under a role; returns 'ok' or the SQLSTATE it raised.
create function pg_temp.as_role(p_user uuid, p_sql text, p_role text default 'authenticated')
returns text language plpgsql as $$
declare r text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', p_role)::text, true);
  execute format('set local role %I', p_role);
  begin
    execute p_sql;
    r := 'ok';
  exception when others then r := sqlstate;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return r;
end $$;

-- The manager is a root-workspace MEMBER holding manage_workspace_secrets,
-- which the platform-admin RLS policy admits for every workspace's secrets.
insert into public.workspaces (id, name, personal, creator_id) values
  ('00000000-0000-0000-0000-000000000000', 'Tuturuuu', false, pg_temp.uid('creator'))
on conflict (id) do nothing;
insert into public.workspaces (id, name, personal, creator_id) values
  ('38910000-0000-4000-8000-0000000000a1', 'FLG target', false, pg_temp.uid('creator'));
insert into public.workspace_members (ws_id, user_id, type)
values ('00000000-0000-0000-0000-000000000000', pg_temp.uid('manager'), 'MEMBER')
on conflict (ws_id, user_id) do update set type = 'MEMBER';
insert into public.workspace_roles (id, ws_id, name)
values ('38910000-0000-4000-8000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'FLG secrets manager');
insert into public.workspace_role_permissions (ws_id, role_id, permission, enabled)
values ('00000000-0000-0000-0000-000000000000', '38910000-0000-4000-8000-0000000000b1', 'manage_workspace_secrets', true)
on conflict (ws_id, permission, role_id) do update set enabled = excluded.enabled;
insert into public.workspace_role_members (role_id, user_id)
values ('38910000-0000-4000-8000-0000000000b1', pg_temp.uid('manager'))
on conflict (role_id, user_id) do nothing;
insert into public.workspace_secrets (ws_id, name, value) values
  ('38910000-0000-4000-8000-0000000000a1', 'ENABLE_FEE_LOCK', 'false'),
  ('38910000-0000-4000-8000-0000000000a1', 'FLG_OTHER', 'one');

select ok(
  public.has_workspace_permission('00000000-0000-0000-0000-000000000000', pg_temp.uid('manager'), 'manage_workspace_secrets'),
  'fixture: manager holds manage_workspace_secrets on the root workspace');

select is(pg_temp.as_role(pg_temp.uid('manager'), $q$insert into public.workspace_secrets (ws_id, name, value)
  values ('38910000-0000-4000-8000-0000000000a1', 'FLG_NEW', 'x')$q$), 'ok',
  'other secret names keep working for the root manager');
select is(pg_temp.as_role(pg_temp.uid('manager'), $q$update public.workspace_secrets set value = 'true'
  where ws_id = '38910000-0000-4000-8000-0000000000a1' and name = 'ENABLE_FEE_LOCK'$q$), '42501',
  'the manager cannot turn the fee-lock flag on');
select is(pg_temp.as_role(pg_temp.uid('manager'), $q$delete from public.workspace_secrets
  where ws_id = '38910000-0000-4000-8000-0000000000a1' and name = 'ENABLE_FEE_LOCK'$q$), '42501',
  'the manager cannot delete the fee-lock flag');
select is(pg_temp.as_role(pg_temp.uid('manager'), $q$update public.workspace_secrets set name = 'FLG_RENAMED'
  where ws_id = '38910000-0000-4000-8000-0000000000a1' and name = 'ENABLE_FEE_LOCK'$q$), '42501',
  'the manager cannot rename the fee-lock flag away');
select is(pg_temp.as_role(pg_temp.uid('manager'), $q$update public.workspace_secrets set name = ' enable_fee_lock '
  where ws_id = '38910000-0000-4000-8000-0000000000a1' and name = 'FLG_OTHER'$q$), '42501',
  'the manager cannot rename another secret to the flag (case and padding ignored)');
select is(pg_temp.as_role(pg_temp.uid('manager'), $q$insert into public.workspace_secrets (ws_id, name, value)
  values ('00000000-0000-0000-0000-000000000000', 'ENABLE_FEE_LOCK', 'true')$q$), '42501',
  'the manager cannot create the flag in another workspace');
select is(pg_temp.as_role(pg_temp.uid('manager'), $q$insert into public.workspace_secrets (ws_id, name, value)
  values ('00000000-0000-0000-0000-000000000000', 'MANAGED_CRON_ENABLED', 'true')$q$), '42501',
  'MANAGED_CRON_ENABLED stays reserved');
select is(pg_temp.as_role(pg_temp.uid('manager'), $q$insert into public.workspace_secrets (ws_id, name, value)
  values ('00000000-0000-0000-0000-000000000000', ' enable_board_cycles ', 'true')$q$), '42501',
  'ENABLE_BOARD_CYCLES is reserved too: the guard covers the whole staff-only list');
select is((select value from public.workspace_secrets
  where ws_id = '38910000-0000-4000-8000-0000000000a1' and name = 'ENABLE_FEE_LOCK'), 'false',
  'the refused writes left the flag off');
select is(pg_temp.as_role(pg_temp.uid('manager'), $q$update public.workspace_secrets set value = 'true'
  where ws_id = '38910000-0000-4000-8000-0000000000a1' and name = 'ENABLE_FEE_LOCK'$q$, 'service_role'), 'ok',
  'the service role (after the server staff check) can set the flag');
select is((select value from public.workspace_secrets
  where ws_id = '38910000-0000-4000-8000-0000000000a1' and name = 'ENABLE_FEE_LOCK'), 'true',
  'the service-role write took effect');

select * from finish();
rollback;
