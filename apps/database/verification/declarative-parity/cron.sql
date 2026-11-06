-- requires: cron.job
-- table-read: cron_jobs
-- pg_cron jobs stay imperative (plan U-6) but are still compared: name, schedule,
-- command, database, user and active flag, hashed. The identity carries the
-- owning username so same-named jobs of different users never collide. This reads a table, and
-- pg_cron's RLS can silently hide other users' jobs, so the runner excludes it
-- from --hashes-only runs and reports it as skipped, never as an empty hash.
-- It is also skipped when cron.job is absent or unreadable.
select 'O' as kind, 'cron_jobs' as category,
  coalesce(j.username, '') || '/' || coalesce(j.jobname,
    'unnamed:' || left(encode(sha256(convert_to(j.command, 'UTF8')), 'hex'), 16))
    as identity,
  encode(sha256(convert_to(json_build_array(
    j.schedule, j.command, j.database, j.username, j.active
  )::text, 'UTF8')), 'hex') as value
from cron.job j;
