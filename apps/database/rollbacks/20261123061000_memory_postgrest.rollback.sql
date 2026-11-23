-- Apply as a separately reviewed forward migration through the gated database workflow.
-- Preserve the exact public ACL and restore the hook while retaining memory data and receipts.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- tuturuuu: reviewed(dynamic-sql-review): apps/database/supabase/tests/memory-postgrest-role-boundary.sql
do $$
declare
  baseline memory_storage.gateway_baseline%rowtype;
  live_acl aclitem[];
begin
  select * into strict baseline from memory_storage.gateway_baseline;
  select coalesce(nspacl, acldefault('n', nspowner)) into strict live_acl
    from pg_namespace where nspname = 'public';
  if baseline.prior_hook <> 'public.check_account_request'
    or not exists (select from pg_roles where rolname = 'authenticator'
      and 'pgrst.db_pre_request=memory_gateway.check_request' = any(rolconfig))
    or exists (
      select from pg_db_role_setting s, unnest(s.setconfig) as setting
      where s.setdatabase = (select oid from pg_database where datname = current_database())
        and s.setrole in (0, 'authenticator'::regrole) and setting like 'pgrst.db_pre_request=%'
    )
    or exists (
      (select * from aclexplode(live_acl) except select * from aclexplode(baseline.prior_acl))
      union all
      (select * from aclexplode(baseline.prior_acl) except select * from aclexplode(live_acl))
    ) then
    raise exception 'Memory gateway settings have changed since apply';
  end if;

end
$$;

update memory_storage.admission set stopped = true, remaining = 0;
revoke memory_rpc from authenticator;
-- tuturuuu: reviewed(dynamic-sql-review): apps/database/verification/memory-postgrest-http-boundary.mjs
do $$
begin
  if pg_has_role('authenticator', 'memory_rpc', 'SET') then
    raise exception 'The authenticator can still assume the memory role';
  end if;
end
$$;
alter role authenticator set pgrst.db_pre_request = 'public.check_account_request';
notify pgrst, 'reload config';
notify pgrst, 'reload schema';
commit;
