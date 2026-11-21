-- Deparse the canonical gate on this server so the comparison uses the same
-- search path and PostgreSQL formatting as pg_policies.
create temporary table mfa_policy_probe (id integer);

create policy canonical on mfa_policy_probe
  as restrictive for all to authenticated
  using ((select public.account_required_mfa_satisfied()))
  with check ((select public.account_required_mfa_satisfied()));

create function pg_temp.is_canonical_account_mfa_policy(policy_row pg_catalog.pg_policies)
returns boolean
language sql
stable
as $$
  select policy_row.policyname = 'account_required_mfa'
    and policy_row.permissive = 'RESTRICTIVE'
    and policy_row.cmd = 'ALL'
    and policy_row.roles = array['authenticated'::name]
    and policy_row.qual is not distinct from probe.qual
    and policy_row.with_check is not distinct from probe.with_check
  from pg_catalog.pg_policies probe
  where probe.schemaname = (select nspname from pg_catalog.pg_namespace where oid = pg_my_temp_schema())
    and probe.tablename = 'mfa_policy_probe'
    and probe.policyname = 'canonical';
$$;
