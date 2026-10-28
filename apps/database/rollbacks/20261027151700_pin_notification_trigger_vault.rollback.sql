-- Containment rollback for 20261027151700_pin_notification_trigger_vault.sql.
-- Not a migration: apply manually only with release-authority approval.
-- Disable trigger HTTP delivery without restoring the legacy GUC destination
-- or bearer. cron-control recovers pending immediate notification batches.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function public.trigger_immediate_notification_send()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if new.delivery_mode is distinct from 'immediate' then
    return new;
  end if;

  return new;
end;
$$;

revoke execute on function public.trigger_immediate_notification_send()
  from public, anon, authenticated;
grant execute on function public.trigger_immediate_notification_send()
  to service_role;

comment on function public.trigger_immediate_notification_send() is
  'Containment: no HTTP request is queued; cron-control recovers pending immediate notification batches.';

commit;
