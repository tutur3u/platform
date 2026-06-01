create or replace function private.get_post_email_queue_status_summary(
  p_ws_id uuid default null
)
returns table (
  blocked bigint,
  cancelled bigint,
  failed bigint,
  processing bigint,
  queued bigint,
  sent bigint,
  skipped bigint,
  total bigint
)
language sql
stable
security definer
set search_path to private, public, pg_temp
as $$
  select
    count(*) filter (where peq.status = 'blocked')::bigint as blocked,
    count(*) filter (where peq.status = 'cancelled')::bigint as cancelled,
    count(*) filter (where peq.status = 'failed')::bigint as failed,
    count(*) filter (where peq.status = 'processing')::bigint as processing,
    count(*) filter (where peq.status = 'queued')::bigint as queued,
    count(*) filter (where peq.status = 'sent')::bigint as sent,
    count(*) filter (where peq.status = 'skipped')::bigint as skipped,
    count(*)::bigint as total
  from public.post_email_queue peq
  where (
    p_ws_id is null
    or peq.ws_id = p_ws_id
  );
$$;

comment on function private.get_post_email_queue_status_summary(uuid) is
'Returns aggregate post_email_queue status counts for server-owned cron snapshots without exposing queue diagnostics through public RPCs.';

revoke all on function private.get_post_email_queue_status_summary(uuid)
  from public, anon, authenticated;
grant execute on function private.get_post_email_queue_status_summary(uuid)
  to service_role;

drop function if exists public.get_post_email_queue_status_summary(uuid);

notify pgrst, 'reload schema';
