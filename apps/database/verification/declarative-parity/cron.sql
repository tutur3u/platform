-- requires: cron.job
-- pg_cron jobs stay imperative (plan U-6) but are still compared: name, schedule,
-- command, database, user and active flag, hashed. The runner skips this file
-- when cron.job is absent or unreadable and reports the category as skipped.
select 'O' as kind, 'cron_jobs' as category,
  coalesce(j.jobname,
    'unnamed:' || left(encode(sha256(convert_to(j.command, 'UTF8')), 'hex'), 16))
    as identity,
  encode(sha256(convert_to(json_build_array(
    j.schedule, j.command, j.database, j.username, j.active
  )::text, 'UTF8')), 'hex') as value
from cron.job j;
