-- Push dispatch latency: the time from notification creation until FCM
-- accepted an immediate send, when the delivery log is marked sent. Skips carry a reason in error_message and digest sends batch
-- many notifications into one payload, so both are excluded. Aggregates only;
-- no recipient, token or content leaves the database.
create or replace function private.push_delivery_latency_summary(
  p_since timestamptz
)
returns table (
  channel text,
  sent_count bigint,
  p50_ms double precision,
  p95_ms double precision,
  max_ms double precision
)
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  with accepted as (
    select
      case
        when n.type like 'mail\_%' then 'mail'
        when n.type like 'chat\_%' then 'chat'
        when n.type like 'task\_%' or n.type = 'deadline_reminder' then 'tasks'
        when n.type like 'time\_tracking\_%' then 'time_tracking'
        when n.type like 'meet\_%' or n.type like 'meeting\_%' then 'meet'
        when n.type like 'finance\_%' or n.type like 'bill\_split\_%' then 'finance'
        when n.type like 'workspace\_%' then 'workspace'
        when n.type in ('security_alert', 'account_update') then 'account'
        else 'other'
      end as channel,
      greatest(0, extract(epoch from (l.sent_at - n.created_at)) * 1000)
        ::double precision as ms
    from private.notification_delivery_log l
    join private.notification_batches b on b.id = l.batch_id
    join public.notifications n on n.id = l.notification_id
    where l.channel = 'push'
      and l.status = 'sent'
      and l.error_message is null
      and b.delivery_mode = 'immediate'
      and l.sent_at >= greatest(p_since, now() - interval '7 days')
  )
  select
    channel,
    count(*) as sent_count,
    percentile_cont(0.5) within group (order by ms) as p50_ms,
    percentile_cont(0.95) within group (order by ms) as p95_ms,
    max(ms) as max_ms
  from accepted
  group by channel
$$;

revoke execute on function private.push_delivery_latency_summary(timestamptz)
  from public, anon, authenticated;
grant execute on function private.push_delivery_latency_summary(timestamptz)
  to service_role;

comment on function private.push_delivery_latency_summary(timestamptz) is
  'Per-channel dispatch latency for immediate push sends accepted by FCM since p_since, bounded to the last 7 days.';
