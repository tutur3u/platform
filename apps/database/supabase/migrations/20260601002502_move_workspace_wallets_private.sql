-- Move finance workspace wallets off the public Data API surface.
--
-- Wallet rows are now owned by app/API routes that verify workspace finance
-- permissions before using service-role private schema access. Public finance
-- transaction tables keep their existing foreign keys, but the parent wallet
-- metadata table is no longer directly exposed from the public schema.

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;
grant usage on schema private to service_role;

alter table if exists public.workspace_wallets
  set schema private;

revoke all on table private.workspace_wallets
from public, anon, authenticated;

grant all on table private.workspace_wallets to service_role;

alter table private.workspace_wallets enable row level security;

drop policy if exists "Enable all access for workspace members"
  on private.workspace_wallets;

drop policy if exists "Service role can manage private workspace wallets"
  on private.workspace_wallets;

create policy "Service role can manage private workspace wallets"
  on private.workspace_wallets
  for all
  to service_role
  using (true)
  with check (true);

do $$
declare
  function_record record;
  function_definition text;
begin
  for function_record in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.prokind <> 'a'
      and pg_get_functiondef(p.oid) ilike '%public.workspace_wallets%'
    order by n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)
  loop
    function_definition := replace(
      pg_get_functiondef(function_record.oid),
      'public.workspace_wallets',
      'private.workspace_wallets'
    );

    execute function_definition;
  end loop;
end;
$$;

do $$
declare
  function_record record;
begin
  for function_record in
    select
      n.nspname as schema_name,
      p.proname as function_name,
      pg_get_function_identity_arguments(p.oid) as identity_arguments
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.prokind <> 'a'
      and pg_get_functiondef(p.oid) ilike '%workspace_wallets%'
    order by n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)
  loop
    execute format(
      'alter function %I.%I(%s) set search_path = private, public, pg_temp',
      function_record.schema_name,
      function_record.function_name,
      function_record.identity_arguments
    );
  end loop;
end;
$$;
