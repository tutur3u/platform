begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(2);

-- Schedulers that call HTTP belong on Cloudflare; pg_cron keeps pure SQL.
select is_empty(
  $$ select jobname from cron.job where command ~* 'net\.http_(get|post|delete)' $$,
  'no pg_cron job sends a pg_net HTTP request'
);
select is_empty(
  $$ select jobname from cron.job where command ~* 'https?://([a-z0-9-]+\.)*tuturuuu\.com' $$,
  'no pg_cron job names a production URL'
);

select * from finish();
rollback;
