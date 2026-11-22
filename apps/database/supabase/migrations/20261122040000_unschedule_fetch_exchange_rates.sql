-- Cron Control job finance-exchange-rates refreshes web's daily exchange
-- rates. The pg_net job below posted to the production web origin from every
-- database, local resets included, so it is removed. The guard matches the
-- lookup cron.unschedule performs (name and current user), so the statement is
-- a no-op where the job does not exist.
SELECT cron.unschedule('fetch-exchange-rates')
WHERE EXISTS (
  SELECT 1
  FROM cron.job
  WHERE jobname = 'fetch-exchange-rates' AND username = current_user
);
