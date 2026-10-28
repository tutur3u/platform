-- Test-session helpers only; never install these in a migration.
-- The stock CLI network alias uses SCRAM; loopback uses trust and is rejected
-- by dblink for the non-superuser postgres role even with a password supplied.
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
create or replace function pg_temp.fixture_dblink_connstr() returns text
language sql as $$
  select coalesce(nullif(current_setting('test.dblink_connstr', true), ''),
    'host=db.supabase.internal port=5432 dbname=postgres user=postgres password=postgres connect_timeout=3');
$$;
create or replace function pg_temp.fixture_dblink_available() returns boolean
language plpgsql as $$
begin
  perform extensions.dblink_connect('fixture_connection_probe', pg_temp.fixture_dblink_connstr());
  perform extensions.dblink_disconnect('fixture_connection_probe');
  return true;
exception when others then
  -- Do not print connection strings or server errors that may contain secrets.
  return false;
end;
$$;
select pg_temp.fixture_dblink_available() as fixture_dblink_available \gset
\if :fixture_dblink_available
\else
  \if :{?require_dblink}
    select plan(1);
    select fail('dblink setup unavailable in CI');
    select * from finish();
    \quit 1
  \endif
\endif
