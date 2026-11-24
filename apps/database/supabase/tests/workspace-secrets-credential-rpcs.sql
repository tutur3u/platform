-- Workspace secrets encryption, step 1: the credential RPCs the
-- tuturuuu-workspace-secrets Worker calls. Grants, create and replace with
-- compare-and-swap on value_rev, replays, conflicts, tier and workspace
-- checks, reads, key status, and the payload rename guard. Ciphertext here is
-- synthetic bytes; the Worker's crypto has its own tests.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(26);

insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values ('39130000-0000-4000-8000-000000000002', 'wsc-creator@example.com', now(), '{}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;
insert into public.workspaces (id, name, personal, creator_id) values
  ('39130000-0000-4000-8000-0000000000a1', 'WSC target', false, '39130000-0000-4000-8000-000000000002'),
  ('39130000-0000-4000-8000-0000000000a2', 'WSC other', false, '39130000-0000-4000-8000-000000000002');
insert into public.workspace_secrets (id, ws_id, name, value) values
  ('39130000-0000-4000-8000-0000000000c9', '39130000-0000-4000-8000-0000000000a1', 'DRIVE_R2_ACCESS_KEY_ID', 'legacy-synthetic'),
  ('39130000-0000-4000-8000-0000000000ca', '39130000-0000-4000-8000-0000000000a1', 'ENABLE_WSC', 'true');

-- Runs one statement under a role; returns 'ok' or the SQLSTATE it raised.
create function pg_temp.as_role(p_sql text, p_role text) returns text language plpgsql as $$
declare r text;
begin
  perform set_config('request.jwt.claims', json_build_object('role', p_role)::text, true);
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

-- put_workspace_secret_credential as service_role, returning its status.
create function pg_temp.put(
  p_ws uuid, p_id uuid, p_name text, p_expected bigint, p_request uuid
) returns text language plpgsql as $$
declare r text;
begin
  set local role service_role;
  select status into r from public.put_workspace_secret_credential(
    p_ws, p_id, p_name, p_expected, p_request, 1::smallint,
    '\x0102'::bytea, '\x0304'::bytea, 'abcd');
  reset role;
  return r;
end $$;

select ok(not exists (
  select 1
  from unnest(array['anon', 'authenticated']) as r(role),
       unnest(array[
         'public.put_workspace_secret_credential(uuid,uuid,text,bigint,uuid,smallint,bytea,bytea,text)',
         'public.get_workspace_secret_credential(uuid,text)',
         'public.workspace_secret_credential_status(uuid,uuid)'
       ]) as f(fn)
  where has_function_privilege(r.role, f.fn, 'EXECUTE')
), 'anon and authenticated cannot execute the credential RPCs');
select ok(has_function_privilege('service_role',
  'public.put_workspace_secret_credential(uuid,uuid,text,bigint,uuid,smallint,bytea,bytea,text)', 'EXECUTE'),
  'service_role can execute put');
select ok(not has_table_privilege('authenticated', 'vault.decrypted_secrets', 'SELECT')
  and not has_table_privilege('anon', 'vault.decrypted_secrets', 'SELECT'),
  'anon and authenticated cannot read vault.decrypted_secrets');

-- Create ---------------------------------------------------------------------

select is(pg_temp.put('39130000-0000-4000-8000-0000000000a1', '39130000-0000-4000-8000-0000000000c1',
  ' X_TOKEN ', null, '39130000-0000-4000-8000-0000000000e1'), 'ok', 'create writes a credential');
select is(
  (select row(name, value, value_rev)::text from public.workspace_secrets where id = '39130000-0000-4000-8000-0000000000c1'),
  row('X_TOKEN', null::text, 0::bigint)::text, 'the row has a trimmed name, no plaintext and revision 0');
select is(
  (select row(source_rev, verified_rev, last4, put_request_id)::text from private.workspace_secret_payloads
   where secret_id = '39130000-0000-4000-8000-0000000000c1'),
  row(0::bigint, 0::bigint, 'abcd', '39130000-0000-4000-8000-0000000000e1'::uuid)::text,
  'the payload is verified at revision 0 and records the request');
select is(pg_temp.put('39130000-0000-4000-8000-0000000000a1', '39130000-0000-4000-8000-0000000000c1',
  'X_TOKEN', null, '39130000-0000-4000-8000-0000000000e1'), 'replayed', 'a retried create replays');
select is(pg_temp.put('39130000-0000-4000-8000-0000000000a1', '39130000-0000-4000-8000-0000000000c2',
  'X_TOKEN', null, '39130000-0000-4000-8000-0000000000e2'), 'conflict', 'a second row with the same name conflicts');
select is(pg_temp.put('39130000-0000-4000-8000-0000000000a1', '39130000-0000-4000-8000-0000000000c3',
  'ENABLE_CHAT', null, '39130000-0000-4000-8000-0000000000e3'), 'not_credential', 'config names are refused');
select is(
  (select count(*)::int from public.workspace_secrets where id in ('39130000-0000-4000-8000-0000000000c2', '39130000-0000-4000-8000-0000000000c3')),
  0, 'refused puts write nothing');

-- Replace ---------------------------------------------------------------------

select is(pg_temp.put('39130000-0000-4000-8000-0000000000a1', '39130000-0000-4000-8000-0000000000c1',
  'X_TOKEN', 0, '39130000-0000-4000-8000-0000000000e4'), 'ok', 'a replace at the current revision succeeds');
select is((select value_rev from public.workspace_secrets where id = '39130000-0000-4000-8000-0000000000c1'),
  1::bigint, 'the replace bumps the revision although the value stays NULL');
select is(pg_temp.put('39130000-0000-4000-8000-0000000000a1', '39130000-0000-4000-8000-0000000000c1',
  'X_TOKEN', 0, '39130000-0000-4000-8000-0000000000e5'), 'conflict', 'a stale revision conflicts');
select is(pg_temp.put('39130000-0000-4000-8000-0000000000a2', '39130000-0000-4000-8000-0000000000c1',
  'X_TOKEN', 1, '39130000-0000-4000-8000-0000000000e6'), 'not_found', 'another workspace cannot replace the row');
select is((select pg_temp.as_role($q$select * from public.put_workspace_secret_credential(
  '39130000-0000-4000-8000-0000000000a1', '39130000-0000-4000-8000-0000000000c1', 'X_TOKEN', -1,
  '39130000-0000-4000-8000-0000000000e7', 1::smallint, '\x01'::bytea, '\x02'::bytea, null)$q$, 'service_role')),
  '22023', 'invalid arguments are refused');

select is(pg_temp.put('39130000-0000-4000-8000-0000000000a1', '39130000-0000-4000-8000-0000000000ca',
  'WSC_TAKEOVER_TOKEN', 0, '39130000-0000-4000-8000-0000000000e9'), 'not_credential',
  'a config row cannot be taken over by id under a credential name');
select is((select row(name, value)::text from public.workspace_secrets where id = '39130000-0000-4000-8000-0000000000ca'),
  row('ENABLE_WSC', 'true')::text, 'the config row is unchanged');

-- Rename guard ------------------------------------------------------------------

select is(pg_temp.as_role($q$update public.workspace_secrets set name = 'Y_TOKEN'
  where id = '39130000-0000-4000-8000-0000000000c1'$q$, 'service_role'), '42501',
  'a direct rename of a payload row is refused');
select is(pg_temp.put('39130000-0000-4000-8000-0000000000a1', '39130000-0000-4000-8000-0000000000c1',
  'Y_TOKEN', 1, '39130000-0000-4000-8000-0000000000e8'), 'ok', 'a rename through put succeeds');
select is((select name from public.workspace_secrets where id = '39130000-0000-4000-8000-0000000000c1'),
  'Y_TOKEN', 'the put rename applied');
select is(pg_temp.as_role($q$update public.workspace_secrets set name = 'DRIVE_R2_ACCESS_KEY_ID_OLD'
  where id = '39130000-0000-4000-8000-0000000000c9'$q$, 'service_role'), 'ok',
  'a legacy row without a payload can still be renamed directly');

-- Reads and status ------------------------------------------------------------------

set local role service_role;
select is(
  (select row(name, value_rev, kek_version, legacy_value)::text
   from public.get_workspace_secret_credential('39130000-0000-4000-8000-0000000000a1', 'Y_TOKEN')),
  row('Y_TOKEN', 2::bigint, 1::smallint, null::text)::text,
  'get returns the verified payload and no plaintext');
select is(
  (select legacy_value from public.get_workspace_secret_credential('39130000-0000-4000-8000-0000000000a1', 'DRIVE_R2_ACCESS_KEY_ID_OLD')),
  'legacy-synthetic', 'get returns legacy plaintext only for a row without a payload');
select is(
  (select count(*)::int from public.get_workspace_secret_credential('39130000-0000-4000-8000-0000000000a1', 'ENABLE_CHAT')),
  0, 'get never returns config rows');
select is(public.workspace_secret_credential_status('39130000-0000-4000-8000-0000000000a1', '39130000-0000-4000-8000-0000000000c1'),
  'active', 'status is active for a verified payload');
select is(public.workspace_secret_credential_status('39130000-0000-4000-8000-0000000000a2', '39130000-0000-4000-8000-0000000000c1'),
  'missing', 'status from another workspace is missing');
reset role;

select * from finish();
rollback;
