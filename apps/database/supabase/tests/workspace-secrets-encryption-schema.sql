-- Workspace secrets encryption, step 1 schema: grants and RLS, the tier
-- mirror, value revisions, the credential-plaintext trigger in both
-- enforcement states and for every role, and the enforcement switch.
-- Synthetic fixtures only.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(46);

create temp table wse_users (label text primary key, id uuid not null);
insert into wse_users values
  ('manager', '39120000-0000-4000-8000-000000000001'),
  ('creator', '39120000-0000-4000-8000-000000000002');
grant select on wse_users to authenticated, service_role;

insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
select id, 'wse-' || label || '@example.com', now(), '{}'::jsonb, '{}'::jsonb from wse_users
on conflict (id) do nothing;

create function pg_temp.uid(p_label text) returns uuid language sql stable as $$
  select id from wse_users where label = p_label
$$;

-- Runs one statement under a role; returns 'ok' or the SQLSTATE it raised.
create function pg_temp.as_role(p_sql text, p_role text, p_user uuid default null)
returns text language plpgsql as $$
declare r text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', p_role)::text, true);
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

-- Runs one statement as the database owner; returns 'ok' or the SQLSTATE.
create function pg_temp.as_owner(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then return sqlstate;
end $$;

-- The manager is a root-workspace member with manage_workspace_secrets,
-- which the platform-admin RLS policy admits for every workspace's secrets.
insert into public.workspaces (id, name, personal, creator_id) values
  ('00000000-0000-0000-0000-000000000000', 'Tuturuuu', false, pg_temp.uid('creator'))
on conflict (id) do nothing;
insert into public.workspaces (id, name, personal, creator_id) values
  ('39120000-0000-4000-8000-0000000000a1', 'WSE target', false, pg_temp.uid('creator'));
insert into public.workspace_members (ws_id, user_id, type)
values ('00000000-0000-0000-0000-000000000000', pg_temp.uid('manager'), 'MEMBER')
on conflict (ws_id, user_id) do update set type = 'MEMBER';
insert into public.workspace_roles (id, ws_id, name)
values ('39120000-0000-4000-8000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'WSE secrets manager');
insert into public.workspace_role_permissions (ws_id, role_id, permission, enabled)
values ('00000000-0000-0000-0000-000000000000', '39120000-0000-4000-8000-0000000000b1', 'manage_workspace_secrets', true)
on conflict (ws_id, permission, role_id) do update set enabled = excluded.enabled;
insert into public.workspace_role_members (role_id, user_id)
values ('39120000-0000-4000-8000-0000000000b1', pg_temp.uid('manager'))
on conflict (role_id, user_id) do nothing;

-- Legacy rows written before enforcement.
insert into public.workspace_secrets (id, ws_id, name, value) values
  ('39120000-0000-4000-8000-0000000000c1', '39120000-0000-4000-8000-0000000000a1', 'DRIVE_R2_SECRET_ACCESS_KEY', 'legacy-credential'),
  ('39120000-0000-4000-8000-0000000000c2', '39120000-0000-4000-8000-0000000000a1', 'ENABLE_WSE', 'true'),
  ('39120000-0000-4000-8000-0000000000c3', '39120000-0000-4000-8000-0000000000a1', 'DRIVE_R2_ACCESS_KEY_ID', 'legacy-key-id'),
  ('39120000-0000-4000-8000-0000000000c4', '39120000-0000-4000-8000-0000000000a1', 'WSE_ENCRYPTED_TOKEN', null);
insert into private.workspace_secret_payloads
  (secret_id, ws_id, tier, kek_version, wrapped_dek, ciphertext, last4, source_rev, verified_rev)
values
  ('39120000-0000-4000-8000-0000000000c4', '39120000-0000-4000-8000-0000000000a1', 'credential', 1,
   '\x00'::bytea, '\x00'::bytea, 'abcd', 0, 0);

-- Grants and RLS ----------------------------------------------------------

select ok(
  (select bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'private' and c.relname in (
     'workspace_secret_name_tiers', 'workspace_secret_payloads',
     'workspace_secret_backfill_status', 'workspace_secrets_migration_state')),
  'RLS is on for every new private table');

select ok(not exists (
  select 1
  from unnest(array['anon', 'authenticated', 'service_role']) as r(role),
       unnest(array[
         'private.workspace_secret_name_tiers', 'private.workspace_secret_payloads',
         'private.workspace_secret_backfill_status', 'private.workspace_secrets_migration_state'
       ]) as t(tbl),
       unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) as p(priv)
  where has_table_privilege(r.role, t.tbl, p.priv)
), 'anon, authenticated and service_role hold no privilege on the new tables');

select ok(not exists (
  select 1
  from unnest(array['anon', 'authenticated', 'service_role']) as r(role),
       unnest(array[
         'private.set_workspace_secrets_credential_enforcement(boolean,text)',
         'private.workspace_secret_name_tier(text)',
         'private.workspace_secrets_reject_credential_plaintext()',
         'private.workspace_secrets_bump_value_rev()'
       ]) as f(fn)
  where has_function_privilege(r.role, f.fn, 'EXECUTE')
), 'no API role can execute the new functions');

select is(pg_temp.as_role(
  $q$update private.workspace_secrets_migration_state set enforce_credential_encryption = true$q$,
  'service_role'), '42501', 'service_role cannot flip enforcement directly');
select is(pg_temp.as_role(
  $q$select private.set_workspace_secrets_credential_enforcement(true, 'wse')$q$,
  'service_role'), '42501', 'service_role cannot call the enforcement switch');
select is(pg_temp.as_role(
  $q$select private.set_workspace_secrets_credential_enforcement(true, 'wse')$q$,
  'authenticated', pg_temp.uid('manager')), '42501',
  'a root secrets manager cannot call the enforcement switch');
select is(pg_temp.as_role(
  $q$select count(*) from private.workspace_secret_payloads$q$,
  'service_role'), '42501', 'service_role cannot read payloads');
select is(
  (select enforce_credential_encryption from private.workspace_secrets_migration_state),
  false, 'enforcement starts off');

-- Tier mirror ---------------------------------------------------------------

select is(private.workspace_secret_name_tier('DRIVE_R2_SECRET_ACCESS_KEY'), 'credential', 'known credential name');
select is(private.workspace_secret_name_tier('  ENABLE_CHAT  '), 'config', 'flag prefix, surrounding space ignored');
select is(private.workspace_secret_name_tier('EXTERNAL_APP_MANAGED_CRON_TOKEN'), 'config', 'server-only config');
select is(private.workspace_secret_name_tier('AI_AGENT_REGISTRY:a:instructions:3'), 'config', 'registry instructions chunk');
select is(private.workspace_secret_name_tier('AI_AGENT_REGISTRY:a:channel:c:secret:botToken'), 'credential', 'channel secret');
select is(private.workspace_secret_name_tier('EXTERNAL_APP_REGISTRY:cms:secretHash'), 'credential', 'external app secret hash');
select is(private.workspace_secret_name_tier('EXTERNAL_APP_REGISTRY:cms:origins'), 'config', 'external app config field');
select is(private.workspace_secret_name_tier('TUTURUUU_CLI_ACCESS_TTL_SECONDS'), 'config', 'session TTL pattern');
select is(private.workspace_secret_name_tier('UNREGISTERED_NAME'), 'credential', 'unknown names are credential');
select is(private.workspace_secret_name_tier(''), 'credential', 'an empty name is credential');
select is(private.workspace_secret_name_tier(null), 'credential', 'a null name is credential');

-- Value revisions -------------------------------------------------------------

select is((select value_rev from public.workspace_secrets where id = '39120000-0000-4000-8000-0000000000c2'),
  0::bigint, 'inserted rows start at revision 0');
update public.workspace_secrets set value = 'false' where id = '39120000-0000-4000-8000-0000000000c2';
select is((select value_rev from public.workspace_secrets where id = '39120000-0000-4000-8000-0000000000c2'),
  1::bigint, 'a value change bumps the revision');
update public.workspace_secrets set name = 'ENABLE_WSE_RENAMED' where id = '39120000-0000-4000-8000-0000000000c2';
select is((select value_rev from public.workspace_secrets where id = '39120000-0000-4000-8000-0000000000c2'),
  1::bigint, 'a rename keeps the revision');
update public.workspace_secrets set value_rev = 5 where id = '39120000-0000-4000-8000-0000000000c4';
select is((select value_rev from public.workspace_secrets where id = '39120000-0000-4000-8000-0000000000c4'),
  5::bigint, 'an explicit increment is kept (credential puts write NULL over NULL)');
select is(pg_temp.as_owner(
  $q$update public.workspace_secrets set value_rev = 4 where id = '39120000-0000-4000-8000-0000000000c4'$q$),
  '22023', 'a revision never moves backwards');

-- Enforcement off: the trigger is a no-op -----------------------------------

select is(pg_temp.as_role(
  $q$insert into public.workspace_secrets (ws_id, name, value)
     values ('39120000-0000-4000-8000-0000000000a1', 'WSE_OFF_TOKEN', 'plain')$q$,
  'service_role'), 'ok', 'off: service_role can still write credential plaintext');
select is(pg_temp.as_role(
  $q$update public.workspace_secrets set value = 'rotated'
     where id = '39120000-0000-4000-8000-0000000000c3'$q$,
  'service_role'), 'ok', 'off: service_role can still replace a plaintext credential');

-- Enforcement on ---------------------------------------------------------------

do $$ begin perform private.set_workspace_secrets_credential_enforcement(true, 'wse-test'); end $$;
select is(
  (select enforcement_changed_by from private.workspace_secrets_migration_state),
  'wse-test', 'the switch records who changed enforcement');
select is(pg_temp.as_owner(
  $q$select private.set_workspace_secrets_credential_enforcement(false, ' ')$q$),
  '22023', 'the switch requires an actor');

select is(pg_temp.as_role(
  $q$insert into public.workspace_secrets (ws_id, name, value)
     values ('39120000-0000-4000-8000-0000000000a1', 'WSE_NEW_TOKEN', 'plain')$q$,
  'service_role'), '42501', 'on: service_role cannot insert credential plaintext');
select is(pg_temp.as_role(
  $q$insert into public.workspace_secrets (ws_id, name, value)
     values ('39120000-0000-4000-8000-0000000000a1', 'DRIVE_R2_ACCESS_KEY_ID', 'plain')$q$,
  'authenticated', pg_temp.uid('manager')), '42501',
  'on: a root secrets manager cannot insert credential plaintext');
select is(pg_temp.as_role(
  $q$insert into public.workspace_secrets (ws_id, name, value)
     values ('39120000-0000-4000-8000-0000000000a1', 'ENABLE_WSE_MANAGER', 'true')$q$,
  'authenticated', pg_temp.uid('manager')), 'ok',
  'on: the same manager can still insert config (the refusal is the trigger, not RLS)');
select is(pg_temp.as_owner(
  $q$insert into public.workspace_secrets (ws_id, name, value)
     values ('39120000-0000-4000-8000-0000000000a1', ' mobile_calendar_gateway:v1 ', 'plain')$q$),
  '42501', 'on: the database owner cannot insert credential plaintext either');
select is(pg_temp.as_role(
  $q$insert into public.workspace_secrets (ws_id, name, value)
     values ('39120000-0000-4000-8000-0000000000a1', 'WSE_NULL_TOKEN', null)$q$,
  'service_role'), 'ok', 'on: a credential row without plaintext is allowed');
select is(pg_temp.as_role(
  $q$insert into public.workspace_secrets (ws_id, name, value)
     values ('39120000-0000-4000-8000-0000000000a1', 'ENABLE_WSE_NEW', 'true')$q$,
  'service_role'), 'ok', 'on: config values are still written as plaintext');
select is(pg_temp.as_role(
  $q$update public.workspace_secrets set value = 'rotated-again'
     where id = '39120000-0000-4000-8000-0000000000c3'$q$,
  'service_role'), '42501', 'on: replacing a legacy plaintext credential is refused');
select is(pg_temp.as_role(
  $q$update public.workspace_secrets set name = 'ENABLE_LEAK'
     where id = '39120000-0000-4000-8000-0000000000c1'$q$,
  'service_role'), '42501', 'on: a plaintext credential cannot be renamed into a config name');
select is(pg_temp.as_role(
  $q$update public.workspace_secrets set name = 'WSE_FROM_CONFIG_TOKEN'
     where id = '39120000-0000-4000-8000-0000000000c2'$q$,
  'service_role'), '42501', 'on: a plaintext config row cannot be renamed into a credential name');
select is(pg_temp.as_role(
  $q$update public.workspace_secrets set value = 'plain'
     where id = '39120000-0000-4000-8000-0000000000c4'$q$,
  'service_role'), '42501', 'on: a row with a credential payload cannot gain plaintext');
select is(pg_temp.as_role(
  $q$update public.workspace_secrets set name = 'ENABLE_WSE_PAYLOAD', value = 'true'
     where id = '39120000-0000-4000-8000-0000000000c4'$q$,
  'service_role'), '42501', 'on: a payload row cannot be renamed to config with plaintext');
select is(pg_temp.as_role(
  $q$update public.workspace_secrets set name = 'DRIVE_R2_SECRET_ACCESS_KEY_OLD'
     where id = '39120000-0000-4000-8000-0000000000c1'$q$,
  'service_role'), 'ok', 'on: a legacy credential can move between credential names');
select is(pg_temp.as_role(
  $q$update public.workspace_secrets set value = null
     where id = '39120000-0000-4000-8000-0000000000c3'$q$,
  'service_role'), 'ok', 'on: clearing a legacy plaintext credential is allowed');
select is(pg_temp.as_role(
  $q$delete from public.workspace_secrets where id = '39120000-0000-4000-8000-0000000000c1'$q$,
  'service_role'), 'ok', 'on: a legacy plaintext credential can be deleted');
select ok(not exists (
  select 1 from public.workspace_secrets
  where ws_id = '39120000-0000-4000-8000-0000000000a1'
    and value is not null
    and private.workspace_secret_name_tier(name) = 'credential'
    and name not in ('WSE_OFF_TOKEN')
), 'on: no credential plaintext was written while enforced');

-- Turning enforcement off restores the previous behavior (rollback).
do $$ begin perform private.set_workspace_secrets_credential_enforcement(false, 'wse-test'); end $$;
select is(pg_temp.as_role(
  $q$insert into public.workspace_secrets (ws_id, name, value)
     values ('39120000-0000-4000-8000-0000000000a1', 'WSE_ROLLBACK_TOKEN', 'plain')$q$,
  'service_role'), 'ok', 'off again: the trigger is a no-op');

-- Cascades ------------------------------------------------------------------------

insert into private.workspace_secret_backfill_status (secret_id, source_rev, attempts, last_error_class)
values ('39120000-0000-4000-8000-0000000000c4', 5, 1, 'provider_unavailable');
select is(pg_temp.as_owner(
  $q$insert into private.workspace_secret_backfill_status (secret_id, source_rev, last_error_class)
     values ('39120000-0000-4000-8000-0000000000c2', 1, 'Message with spaces')$q$),
  '23514', 'backfill errors are error classes, never messages');
delete from public.workspace_secrets where id = '39120000-0000-4000-8000-0000000000c4';
select ok(
  not exists (select 1 from private.workspace_secret_payloads where secret_id = '39120000-0000-4000-8000-0000000000c4')
  and not exists (select 1 from private.workspace_secret_backfill_status where secret_id = '39120000-0000-4000-8000-0000000000c4'),
  'deleting a secret cascades its payload and backfill status');

select * from finish();
rollback;
