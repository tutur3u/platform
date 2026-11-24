-- Workspace secrets encryption, step 1: the config tier in Supabase Vault.
-- Dual writes, read modes, the hot-path list, credential refusal, Vault
-- cleanup on delete, and who can reach the decrypted view. Synthetic only.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(19);

insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values ('39140000-0000-4000-8000-000000000002', 'wcv-creator@example.com', now(), '{}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;
insert into public.workspaces (id, name, personal, creator_id) values
  ('39140000-0000-4000-8000-0000000000a1', 'WCV target', false, '39140000-0000-4000-8000-000000000002');
insert into public.workspace_secrets (ws_id, name, value) values
  ('39140000-0000-4000-8000-0000000000a1', 'ENABLE_WCV_LEGACY', 'true'),
  ('39140000-0000-4000-8000-0000000000a1', 'WCV_TOKEN', 'legacy-credential');

create function pg_temp.as_role(p_sql text, p_role text) returns text language plpgsql as $$
declare r text;
begin
  execute format('set local role %I', p_role);
  begin
    execute p_sql;
    r := 'ok';
  exception when others then r := sqlstate;
  end;
  execute 'reset role';
  return r;
end $$;

create function pg_temp.put_config(p_name text, p_value text) returns text language plpgsql as $$
declare r text;
begin
  set local role service_role;
  select status into r from public.put_workspace_secret_config('39140000-0000-4000-8000-0000000000a1', p_name, p_value);
  reset role;
  return r;
end $$;

create function pg_temp.vault_value(p_name text) returns text language sql as $$
  select d.decrypted_secret
  from public.workspace_secrets s
  join private.workspace_secret_payloads p on p.secret_id = s.id
  join vault.decrypted_secrets d on d.id = p.vault_secret_id
  where s.ws_id = '39140000-0000-4000-8000-0000000000a1' and s.name = p_name
$$;

-- Who can decrypt -------------------------------------------------------------

select ok(not has_table_privilege('anon', 'vault.decrypted_secrets', 'SELECT')
  and not has_table_privilege('authenticated', 'vault.decrypted_secrets', 'SELECT'),
  'anon and authenticated cannot read vault.decrypted_secrets');
select ok(has_table_privilege('workspace_secrets_definer', 'vault.decrypted_secrets', 'SELECT'),
  'the definer role reads vault.decrypted_secrets');
select ok(not exists (
  select 1 from pg_roles where rolname = 'workspace_secrets_definer' and (rolcanlogin or rolbypassrls or rolsuper)
), 'the definer role cannot log in or bypass RLS');
select ok(not has_schema_privilege('workspace_secrets_definer', 'private', 'CREATE')
  and not has_schema_privilege('workspace_secrets_definer', 'public', 'CREATE'),
  'the definer role cannot create objects');
select ok(not exists (
  select 1
  from unnest(array['anon', 'authenticated']) as r(role),
       unnest(array['public.put_workspace_secret_config(uuid,text,text)', 'public.list_workspace_secret_config(uuid)']) as f(fn)
  where has_function_privilege(r.role, f.fn, 'EXECUTE')
), 'anon and authenticated cannot execute the config RPCs');
select ok(not has_function_privilege('service_role', 'private.workspace_secret_config_value(uuid,text)', 'EXECUTE'),
  'service_role cannot call the private config readers directly');

-- Dual write ---------------------------------------------------------------------

select is(pg_temp.put_config(' ENABLE_WCV ', 'true'), 'ok', 'a config put succeeds');
select is((select value from public.workspace_secrets where ws_id = '39140000-0000-4000-8000-0000000000a1' and name = 'ENABLE_WCV'),
  'true', 'the plaintext column keeps the value until step 4');
select is(pg_temp.vault_value('ENABLE_WCV'), 'true', 'Vault holds the same value');
select is(pg_temp.put_config('ENABLE_WCV', 'false'), 'ok', 'a second put updates the row');
select is(pg_temp.vault_value('ENABLE_WCV'), 'false', 'and its Vault secret, in place');
select is(
  (select count(*)::int from public.workspace_secrets where ws_id = '39140000-0000-4000-8000-0000000000a1' and name = 'ENABLE_WCV'),
  1, 'the put reuses the row instead of adding one');
select is(pg_temp.put_config('WCV_OTHER_TOKEN', 'x'), 'not_config', 'credential names are refused');

-- Reads ------------------------------------------------------------------------

select is(private.workspace_secret_config_value('39140000-0000-4000-8000-0000000000a1', 'ENABLE_WCV'),
  'false', 'plaintext mode reads the column');
update private.workspace_secrets_migration_state set read_mode = 'dual';
update public.workspace_secrets set value = 'true'
  where ws_id = '39140000-0000-4000-8000-0000000000a1' and name = 'ENABLE_WCV';
select is(private.workspace_secret_config_value('39140000-0000-4000-8000-0000000000a1', 'ENABLE_WCV'),
  'true', 'dual mode falls back to plaintext when the payload is stale');
update private.workspace_secrets_migration_state set read_mode = 'encrypted';
select is(private.workspace_secret_config_value('39140000-0000-4000-8000-0000000000a1', 'ENABLE_WCV'),
  null, 'encrypted mode never serves an unverified plaintext value');
update private.workspace_secrets_migration_state set read_mode = 'plaintext';
select ok(private.workspace_secret_enabled('39140000-0000-4000-8000-0000000000a1', 'ENABLE_WCV_LEGACY'),
  'enabled reads a legacy flag');

set local role service_role;
select is(
  (select array_agg(name order by name) from public.list_workspace_secret_config('39140000-0000-4000-8000-0000000000a1')),
  array['ENABLE_WCV', 'ENABLE_WCV_LEGACY'], 'the list returns config rows only');
reset role;

-- Cleanup ------------------------------------------------------------------------

create temp table wcv_vault as
  select p.vault_secret_id from public.workspace_secrets s
  join private.workspace_secret_payloads p on p.secret_id = s.id
  where s.ws_id = '39140000-0000-4000-8000-0000000000a1' and s.name = 'ENABLE_WCV';
delete from public.workspace_secrets where ws_id = '39140000-0000-4000-8000-0000000000a1' and name = 'ENABLE_WCV';
select ok(not exists (select 1 from vault.secrets where id in (select vault_secret_id from wcv_vault)),
  'deleting a config secret removes its Vault secret');

select * from finish();
rollback;
