create or replace function get_email_stats(
  filter_ws_id uuid,
  start_date timestamptz default null,
  end_date timestamptz default null
)
returns table (
  total_count bigint,
  sent_count bigint,
  failed_count bigint,
  rate_limited_count bigint
)
language plpgsql
security definer
as $$
begin
  return query
  select
    count(*)::bigint as total_count,
    count(*) filter (where status = 'sent')::bigint as sent_count,
    count(*) filter (where status = 'failed')::bigint as failed_count,
    count(*) filter (
      where status = 'failed' 
      and (
        error_message ilike '%rate limit%' 
        or (metadata->>'rateLimit') is not null
      )
    )::bigint as rate_limited_count
  from email_audit
  where
    ws_id = filter_ws_id
    and (start_date is null or created_at >= start_date)
    and (end_date is null or created_at <= end_date);
end;
$$;
