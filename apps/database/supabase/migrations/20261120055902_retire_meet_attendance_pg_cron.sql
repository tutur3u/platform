-- Cloudflare owns new schedules. Keep attendance disabled until its retention job is ready.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- tuturuuu: reviewed(dynamic-sql-review): Unschedules one fixed job if present. No dynamic command text or grants.
do $$
begin
  if exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
    if exists (
      select 1 from cron.job where jobname = 'meet-attendance-retention'
    ) then
      perform cron.unschedule('meet-attendance-retention');
    end if;
  end if;
end;
$$;

commit;
