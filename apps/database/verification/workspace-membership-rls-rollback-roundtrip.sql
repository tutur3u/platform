-- Run with psql -v ON_ERROR_STOP=1 -f against a disposable LOCAL stack at main,
-- before applying 20261029030600. This script applies, rolls back, and reapplies it.
-- Compare complete pg_policies rows, including roles, command, permissiveness,
-- USING and WITH CHECK, plus exact table ACLs on every affected table.
\set ON_ERROR_STOP on
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(4);

create temporary view membership_policies as
select * from pg_policies
where schemaname = 'public' and tablename in (
  'notes', 'live_api_sessions', 'aurora_ml_forecast', 'aurora_ml_metrics',
  'aurora_statistical_forecast', 'aurora_statistical_metrics',
  'workspace_roles', 'calendar_auth_tokens'
);
create temporary view membership_grants as
select n.nspname, c.relname, c.relacl
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in (
  'notes', 'live_api_sessions', 'aurora_ml_forecast', 'aurora_ml_metrics',
  'aurora_statistical_forecast', 'aurora_statistical_metrics',
  'workspace_roles', 'calendar_auth_tokens'
);
create temporary table membership_policies_before as table membership_policies;
create temporary table membership_grants_before as table membership_grants;

\ir ../supabase/migrations/20261029030600_pin_workspace_membership_rls.sql
create temporary table membership_policies_applied as table membership_policies;
create temporary table membership_grants_applied as table membership_grants;

\ir ../rollbacks/20261029030600_pin_workspace_membership_rls.rollback.sql
select results_eq(
  'select * from membership_policies order by tablename, policyname',
  'select * from membership_policies_before order by tablename, policyname',
  'rollback restores every full pg_policies row on all eight tables'
);
select results_eq(
  'select * from membership_grants order by relname',
  'select * from membership_grants_before order by relname',
  'rollback restores exact table grants on all eight tables'
);

\ir ../supabase/migrations/20261029030600_pin_workspace_membership_rls.sql
select results_eq(
  'select * from membership_policies order by tablename, policyname',
  'select * from membership_policies_applied order by tablename, policyname',
  'reapply restores every full pg_policies row from the first apply'
);
select results_eq(
  'select * from membership_grants order by relname',
  'select * from membership_grants_applied order by relname',
  'reapply restores exact table grants from the first apply'
);
select * from finish();
