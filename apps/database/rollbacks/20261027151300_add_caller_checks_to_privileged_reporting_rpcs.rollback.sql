-- Rollback for 20261027151300_add_caller_checks_to_privileged_reporting_rpcs.sql.
-- Not a migration: release-authority approval only.
-- Restores the prior bodies of the guarded finance RPCs by removing the caller
-- check block. This reopens cross-workspace finance reads for authenticated
-- callers. Grants stay as the migration left them: anon and PUBLIC are never
-- re-granted, and the service-role-only functions keep authenticated revoked.
begin;
do $$
declare
  v_target regprocedure;
  v_definition text;
  v_start integer;
  v_end integer;
  v_marker constant text := E'\n  -- caller check (20261027151300)\n';
  v_end_marker constant text := E'  -- end caller check\n';
begin
  foreach v_target in array array[
    'public.get_daily_invoice_totals(uuid,integer,uuid[],uuid[],date,date)',
    'public.get_weekly_invoice_totals(uuid,integer,uuid[],uuid[],date,date)',
    'public.get_weekly_invoice_totals(uuid,integer,uuid[],uuid[],date,date,integer)',
    'public.get_monthly_invoice_totals(uuid,integer,uuid[],uuid[],date,date)',
    'public.get_category_breakdown(uuid,timestamptz,timestamptz,boolean,text,text)',
    'public.get_category_breakdown(uuid,timestamptz,timestamptz,boolean,text,text,boolean)',
    'public.get_monthly_category_breakdown(uuid,timestamptz,timestamptz,boolean)',
    'public.get_transaction_stats(uuid,uuid,uuid[],uuid[],uuid[],uuid[],text,text,timestamptz,timestamptz)'
  ]::regprocedure[]
  loop
    v_definition := pg_catalog.pg_get_functiondef(v_target);
    v_start := pg_catalog.strpos(v_definition, v_marker);
    v_end := pg_catalog.strpos(v_definition, v_end_marker);

    if v_start = 0 then
      continue;
    end if;
    if v_end < v_start then
      raise exception 'Unexpected caller check block in %', v_target;
    end if;

    execute pg_catalog.left(v_definition, v_start)
      || pg_catalog.substr(v_definition, v_end + pg_catalog.length(v_end_marker));
  end loop;
end;
$$;
commit;
