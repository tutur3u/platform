drop function if exists private.get_workspace_post_review_filter_options(uuid, uuid[], timestamptz);
drop function if exists private.get_workspace_post_review_summary(
  uuid, uuid[], uuid[], uuid, text, approval_status, timestamptz, timestamptz, timestamptz
);
drop function if exists private.get_workspace_post_review_rows(
  uuid, uuid[], uuid[], uuid, text[], text, approval_status, timestamptz, timestamptz, timestamptz, integer, integer
);
drop function if exists private.get_workspace_post_review_base_rows(
  uuid, uuid, uuid, uuid[], uuid[], uuid, timestamptz, text, timestamptz, timestamptz
);

create or replace function private.get_workspace_post_review_base_rows(
  p_ws_id uuid,
  p_group_id uuid default null::uuid,
  p_post_id uuid default null::uuid,
  p_included_group_ids uuid[] default null::uuid[],
  p_excluded_group_ids uuid[] default null::uuid[],
  p_user_id uuid default null::uuid,
  p_cutoff timestamptz default null::timestamptz,
  p_q text default null::text,
  p_start_date timestamptz default null::timestamptz,
  p_end_date timestamptz default null::timestamptz
)
returns table (
  row_key text,
  ws_id uuid,
  group_id uuid,
  group_name text,
  post_id uuid,
  post_title text,
  post_content text,
  post_created_at timestamptz,
  user_id uuid,
  email text,
  recipient text,
  user_display_name text,
  user_full_name text,
  user_phone text,
  user_avatar_url text,
  has_check boolean,
  check_created_at timestamptz,
  notes text,
  is_completed boolean,
  approval_status approval_status,
  approval_rejection_reason text,
  approval_approved_at timestamptz,
  approval_rejected_at timestamptz,
  email_id uuid,
  subject text,
  queue_status text,
  queue_attempt_count integer,
  queue_last_error text,
  queue_created_at timestamptz,
  queue_updated_at timestamptz,
  queue_last_attempt_at timestamptz,
  queue_claimed_at timestamptz,
  queue_cancelled_at timestamptz,
  queue_sent_at timestamptz,
  queue_skipped_at timestamptz,
  delivery_issue_reason text,
  can_remove_approval boolean,
  review_stage text
)
language sql
stable
security definer
set search_path to private, public, pg_temp
as $$
  with base as (
    select
      concat(ugp.id::text, ':', wu.id::text) as row_key,
      wug.ws_id,
      wug.id as group_id,
      wug.name as group_name,
      ugp.id as post_id,
      ugp.title as post_title,
      ugp.content as post_content,
      ugp.created_at as post_created_at,
      wu.id as user_id,
      wu.email,
      coalesce(wu.full_name, wu.display_name) as recipient,
      wu.display_name as user_display_name,
      wu.full_name as user_full_name,
      wu.phone as user_phone,
      wu.avatar_url as user_avatar_url,
      upc.post_id is not null as has_check,
      upc.created_at as check_created_at,
      upc.notes,
      upc.is_completed,
      upc.approval_status,
      upc.rejection_reason as approval_rejection_reason,
      upc.approved_at as approval_approved_at,
      upc.rejected_at as approval_rejected_at,
      coalesce(upc.email_id, peq.sent_email_id, direct_sent_email.id) as email_id,
      coalesce(linked_sent_email.subject, direct_sent_email.subject) as subject,
      case
        when peq.status is not null then peq.status
        when coalesce(upc.email_id, peq.sent_email_id, direct_sent_email.id) is not null then 'sent'
        else null
      end as queue_status,
      coalesce(peq.attempt_count, 0) as queue_attempt_count,
      peq.last_error as queue_last_error,
      peq.created_at as queue_created_at,
      peq.updated_at as queue_updated_at,
      peq.last_attempt_at as queue_last_attempt_at,
      peq.claimed_at as queue_claimed_at,
      peq.cancelled_at as queue_cancelled_at,
      peq.sent_at as queue_sent_at,
      case when peq.status = 'skipped' then peq.updated_at else null end as queue_skipped_at,
      case
        when public.check_email_blocked(wu.email) then 'blacklisted_email_or_domain'
        when upc.post_id is null or upc.approval_status <> 'APPROVED' then null
        when coalesce(upc.email_id, peq.sent_email_id, direct_sent_email.id) is not null then null
        when peq.status is not null then null
        when coalesce(nullif(trim(wu.email), ''), '') = '' then 'missing_email'
        when sender_link.platform_user_id is null then 'missing_sender_platform_user'
        else null
      end as delivery_issue_reason,
      (
        upc.post_id is not null
        and upc.approval_status = 'APPROVED'
        and coalesce(upc.email_id, peq.sent_email_id, direct_sent_email.id) is null
        and coalesce(peq.status, '') not in ('sent', 'processing')
      ) as can_remove_approval
    from private.user_group_posts ugp
    inner join public.workspace_user_groups wug
      on wug.id = ugp.group_id
    inner join public.workspace_user_groups_users wugu
      on wugu.group_id = ugp.group_id
    inner join public.workspace_users wu
      on wu.id = wugu.user_id
    left join private.user_group_post_checks upc
      on upc.post_id = ugp.id
     and upc.user_id = wu.id
    left join lateral (
      select wulu.platform_user_id
      from public.workspace_user_linked_users wulu
      where wulu.ws_id = wug.ws_id
        and wulu.virtual_user_id = upc.approved_by
      order by wulu.created_at desc, wulu.platform_user_id asc
      limit 1
    ) as sender_link
      on true
    left join public.post_email_queue peq
      on peq.post_id = ugp.id
     and peq.user_id = wu.id
    left join public.sent_emails linked_sent_email
      on linked_sent_email.id = coalesce(upc.email_id, peq.sent_email_id)
    left join lateral (
      select
        se.id,
        se.subject
      from public.sent_emails se
      where se.post_id = ugp.id
        and se.receiver_id = wu.id
      order by se.created_at desc, se.id desc
      limit 1
    ) as direct_sent_email
      on true
    where wug.ws_id = p_ws_id
      and wu.ws_id = p_ws_id
      and (p_group_id is null or ugp.group_id = p_group_id)
      and (p_post_id is null or ugp.id = p_post_id)
      and (p_cutoff is null or ugp.created_at >= p_cutoff)
      and (p_start_date is null or ugp.created_at >= p_start_date)
      and (p_end_date is null or ugp.created_at < p_end_date)
      and (
        p_included_group_ids is null
        or array_length(p_included_group_ids, 1) is null
        or ugp.group_id = any(p_included_group_ids)
      )
      and (
        p_excluded_group_ids is null
        or array_length(p_excluded_group_ids, 1) is null
        or not (ugp.group_id = any(p_excluded_group_ids))
      )
      and (p_user_id is null or wu.id = p_user_id)
      and (
        p_q is null
        or p_q = ''
        or coalesce(wu.full_name, wu.display_name, '') ilike '%' || p_q || '%'
        or coalesce(wu.email, '') ilike '%' || p_q || '%'
      )
  )
  select
    base.row_key,
    base.ws_id,
    base.group_id,
    base.group_name,
    base.post_id,
    base.post_title,
    base.post_content,
    base.post_created_at,
    base.user_id,
    base.email,
    base.recipient,
    base.user_display_name,
    base.user_full_name,
    base.user_phone,
    base.user_avatar_url,
    base.has_check,
    base.check_created_at,
    base.notes,
    base.is_completed,
    base.approval_status,
    base.approval_rejection_reason,
    base.approval_approved_at,
    base.approval_rejected_at,
    base.email_id,
    base.subject,
    base.queue_status,
    base.queue_attempt_count,
    base.queue_last_error,
    base.queue_created_at,
    base.queue_updated_at,
    base.queue_last_attempt_at,
    base.queue_claimed_at,
    base.queue_cancelled_at,
    base.queue_sent_at,
    base.queue_skipped_at,
    base.delivery_issue_reason,
    base.can_remove_approval,
    public.get_post_review_stage(
      base.has_check,
      base.approval_status,
      base.email_id,
      base.queue_status,
      base.delivery_issue_reason
    ) as review_stage
  from base;
$$;

create or replace function private.get_workspace_post_review_rows(
  p_ws_id uuid,
  p_included_group_ids uuid[] default null::uuid[],
  p_excluded_group_ids uuid[] default null::uuid[],
  p_user_id uuid default null::uuid,
  p_stage text[] default null::text[],
  p_queue_status text default null::text,
  p_approval_status approval_status default null::approval_status,
  p_cutoff timestamptz default null::timestamptz,
  p_start_date timestamptz default null::timestamptz,
  p_end_date timestamptz default null::timestamptz,
  p_limit integer default 10,
  p_offset integer default 0
)
returns table (
  row_key text,
  check_created_at timestamptz,
  notes text,
  user_id uuid,
  email_id uuid,
  is_completed boolean,
  has_check boolean,
  approval_status approval_status,
  approval_rejection_reason text,
  approval_approved_at timestamptz,
  approval_rejected_at timestamptz,
  ws_id uuid,
  email text,
  recipient text,
  user_display_name text,
  user_full_name text,
  user_phone text,
  user_avatar_url text,
  post_id uuid,
  post_title text,
  post_content text,
  post_created_at timestamptz,
  group_id uuid,
  group_name text,
  subject text,
  queue_status text,
  queue_attempt_count integer,
  queue_last_error text,
  queue_created_at timestamptz,
  queue_updated_at timestamptz,
  queue_last_attempt_at timestamptz,
  queue_claimed_at timestamptz,
  queue_cancelled_at timestamptz,
  queue_sent_at timestamptz,
  queue_skipped_at timestamptz,
  delivery_issue_reason text,
  can_remove_approval boolean,
  review_stage text,
  total_count bigint
)
language sql
stable
security definer
set search_path to private, public, pg_temp
as $$
  with filtered as (
    select *
    from private.get_workspace_post_review_base_rows(
      p_ws_id => p_ws_id,
      p_included_group_ids => p_included_group_ids,
      p_excluded_group_ids => p_excluded_group_ids,
      p_user_id => p_user_id,
      p_cutoff => p_cutoff,
      p_start_date => p_start_date,
      p_end_date => p_end_date
    )
    where (
      p_stage is null
      or array_length(p_stage, 1) is null
      or review_stage = any(p_stage)
    )
      and (p_queue_status is null or queue_status = p_queue_status)
      and (p_approval_status is null or approval_status = p_approval_status)
  )
  select
    filtered.row_key,
    filtered.check_created_at,
    filtered.notes,
    filtered.user_id,
    filtered.email_id,
    filtered.is_completed,
    filtered.has_check,
    filtered.approval_status,
    filtered.approval_rejection_reason,
    filtered.approval_approved_at,
    filtered.approval_rejected_at,
    filtered.ws_id,
    filtered.email,
    filtered.recipient,
    filtered.user_display_name,
    filtered.user_full_name,
    filtered.user_phone,
    filtered.user_avatar_url,
    filtered.post_id,
    filtered.post_title,
    filtered.post_content,
    filtered.post_created_at,
    filtered.group_id,
    filtered.group_name,
    filtered.subject,
    filtered.queue_status,
    filtered.queue_attempt_count,
    filtered.queue_last_error,
    filtered.queue_created_at,
    filtered.queue_updated_at,
    filtered.queue_last_attempt_at,
    filtered.queue_claimed_at,
    filtered.queue_cancelled_at,
    filtered.queue_sent_at,
    filtered.queue_skipped_at,
    filtered.delivery_issue_reason,
    filtered.can_remove_approval,
    filtered.review_stage,
    count(*) over()::bigint as total_count
  from filtered
  order by coalesce(filtered.check_created_at, filtered.post_created_at) desc,
    filtered.post_created_at desc,
    filtered.recipient asc
  limit greatest(coalesce(p_limit, 10), 1)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

create or replace function private.get_workspace_post_review_summary(
  p_ws_id uuid,
  p_included_group_ids uuid[] default null::uuid[],
  p_excluded_group_ids uuid[] default null::uuid[],
  p_user_id uuid default null::uuid,
  p_queue_status text default null::text,
  p_approval_status approval_status default null::approval_status,
  p_cutoff timestamptz default null::timestamptz,
  p_start_date timestamptz default null::timestamptz,
  p_end_date timestamptz default null::timestamptz
)
returns table (
  total_count bigint,
  missing_check_count bigint,
  pending_approval_stage_count bigint,
  approved_awaiting_delivery_count bigint,
  undeliverable_count bigint,
  queued_stage_count bigint,
  processing_stage_count bigint,
  sent_stage_count bigint,
  delivery_failed_count bigint,
  skipped_stage_count bigint,
  rejected_stage_count bigint,
  pending_approval_count bigint,
  approved_count bigint,
  rejected_count bigint,
  skipped_approval_count bigint,
  queued_count bigint,
  processing_count bigint,
  sent_count bigint,
  failed_count bigint,
  blocked_count bigint,
  cancelled_count bigint,
  queue_skipped_count bigint
)
language sql
stable
security definer
set search_path to private, public, pg_temp
as $$
  with filtered as (
    select *
    from private.get_workspace_post_review_base_rows(
      p_ws_id => p_ws_id,
      p_included_group_ids => p_included_group_ids,
      p_excluded_group_ids => p_excluded_group_ids,
      p_user_id => p_user_id,
      p_cutoff => p_cutoff,
      p_start_date => p_start_date,
      p_end_date => p_end_date
    )
    where (p_queue_status is null or queue_status = p_queue_status)
      and (p_approval_status is null or approval_status = p_approval_status)
  )
  select
    count(*)::bigint as total_count,
    count(*) filter (where review_stage = 'missing_check')::bigint as missing_check_count,
    count(*) filter (where review_stage = 'pending_approval')::bigint as pending_approval_stage_count,
    count(*) filter (where review_stage = 'approved_awaiting_delivery')::bigint as approved_awaiting_delivery_count,
    count(*) filter (where review_stage = 'undeliverable')::bigint as undeliverable_count,
    count(*) filter (where review_stage = 'queued')::bigint as queued_stage_count,
    count(*) filter (where review_stage = 'processing')::bigint as processing_stage_count,
    count(*) filter (where review_stage = 'sent')::bigint as sent_stage_count,
    count(*) filter (where review_stage = 'delivery_failed')::bigint as delivery_failed_count,
    count(*) filter (where review_stage = 'skipped')::bigint as skipped_stage_count,
    count(*) filter (where review_stage = 'rejected')::bigint as rejected_stage_count,
    count(*) filter (where approval_status = 'PENDING')::bigint as pending_approval_count,
    count(*) filter (where approval_status = 'APPROVED')::bigint as approved_count,
    count(*) filter (where approval_status = 'REJECTED')::bigint as rejected_count,
    count(*) filter (where approval_status = 'SKIPPED')::bigint as skipped_approval_count,
    count(*) filter (where queue_status = 'queued')::bigint as queued_count,
    count(*) filter (where queue_status = 'processing')::bigint as processing_count,
    count(*) filter (where queue_status = 'sent')::bigint as sent_count,
    count(*) filter (where queue_status = 'failed')::bigint as failed_count,
    count(*) filter (where queue_status = 'blocked')::bigint as blocked_count,
    count(*) filter (where queue_status = 'cancelled')::bigint as cancelled_count,
    count(*) filter (where queue_status = 'skipped')::bigint as queue_skipped_count
  from filtered;
$$;

create or replace function private.get_workspace_post_review_filter_options(
  p_ws_id uuid,
  p_included_group_ids uuid[] default null::uuid[],
  p_cutoff timestamptz default null::timestamptz
)
returns table (
  option_scope text,
  id uuid,
  label text,
  amount bigint
)
language sql
stable
security definer
set search_path to private, public, pg_temp
as $$
  with base as (
    select *
    from private.get_workspace_post_review_base_rows(
      p_ws_id => p_ws_id,
      p_cutoff => p_cutoff
    )
  ),
  included_group_options as (
    select
      'include_group'::text as option_scope,
      group_id as id,
      max(group_name) as label,
      count(*)::bigint as amount
    from base
    group by group_id
  ),
  excluded_group_options as (
    select
      'exclude_group'::text as option_scope,
      group_id as id,
      max(group_name) as label,
      count(*)::bigint as amount
    from base
    where (
      p_included_group_ids is null
      or array_length(p_included_group_ids, 1) is null
      or not (group_id = any(p_included_group_ids))
    )
    group by group_id
  ),
  user_options as (
    select
      'user'::text as option_scope,
      user_id as id,
      max(recipient) as label,
      count(*)::bigint as amount
    from base
    where (
      p_included_group_ids is null
      or array_length(p_included_group_ids, 1) is null
      or group_id = any(p_included_group_ids)
    )
    group by user_id
  )
  select * from included_group_options
  union all
  select * from excluded_group_options
  union all
  select * from user_options;
$$;

drop function if exists private.get_post_email_queue_workspace_breakdown(integer, timestamptz);
drop function if exists private.get_post_email_queue_age_buckets(timestamptz);
drop function if exists private.get_post_email_queue_failure_reasons(integer);
drop function if exists private.get_post_email_queue_recent_batches(integer);
drop function if exists private.get_post_email_queue_throughput(timestamptz);

create or replace function private.get_post_email_queue_workspace_breakdown(
  p_limit integer default 20,
  p_now timestamptz default now()
)
returns table (
  ws_id uuid,
  workspace_name text,
  blocked bigint,
  cancelled bigint,
  failed bigint,
  processing bigint,
  queued bigint,
  sent bigint,
  skipped bigint,
  total bigint,
  stale_queued_1h bigint,
  stale_queued_24h bigint,
  oldest_queued_at timestamptz
)
language sql
stable
security definer
set search_path to private, public, pg_temp
as $$
  select
    peq.ws_id,
    max(workspaces.name) as workspace_name,
    count(*) filter (where peq.status = 'blocked')::bigint as blocked,
    count(*) filter (where peq.status = 'cancelled')::bigint as cancelled,
    count(*) filter (where peq.status = 'failed')::bigint as failed,
    count(*) filter (where peq.status = 'processing')::bigint as processing,
    count(*) filter (where peq.status = 'queued')::bigint as queued,
    count(*) filter (where peq.status = 'sent')::bigint as sent,
    count(*) filter (where peq.status = 'skipped')::bigint as skipped,
    count(*)::bigint as total,
    count(*) filter (
      where peq.status = 'queued'
        and peq.created_at < p_now - interval '1 hour'
    )::bigint as stale_queued_1h,
    count(*) filter (
      where peq.status = 'queued'
        and peq.created_at < p_now - interval '24 hours'
    )::bigint as stale_queued_24h,
    min(peq.created_at) filter (where peq.status = 'queued') as oldest_queued_at
  from public.post_email_queue peq
  left join public.workspaces
    on workspaces.id = peq.ws_id
  group by peq.ws_id
  order by
    count(*) filter (where peq.status in ('queued', 'processing', 'failed', 'blocked')) desc,
    count(*) desc
  limit greatest(coalesce(p_limit, 20), 1);
$$;

create or replace function private.get_post_email_queue_age_buckets(
  p_now timestamptz default now()
)
returns table (
  bucket_key text,
  queued bigint,
  processing bigint,
  failed bigint,
  total bigint
)
language sql
stable
security definer
set search_path to private, public, pg_temp
as $$
  with bucket_order as (
    select *
    from (
      values
        ('under_1h'::text, 1),
        ('1h_6h'::text, 2),
        ('6h_24h'::text, 3),
        ('over_24h'::text, 4)
    ) as bucket_values(bucket_key, sort_order)
  ),
  bucketed as (
    select
      case
        when peq.created_at >= p_now - interval '1 hour' then 'under_1h'
        when peq.created_at >= p_now - interval '6 hours' then '1h_6h'
        when peq.created_at >= p_now - interval '24 hours' then '6h_24h'
        else 'over_24h'
      end as bucket_key,
      peq.status
    from public.post_email_queue peq
    where peq.status in ('queued', 'processing', 'failed')
  )
  select
    bucket_order.bucket_key,
    count(*) filter (where bucketed.status = 'queued')::bigint as queued,
    count(*) filter (where bucketed.status = 'processing')::bigint as processing,
    count(*) filter (where bucketed.status = 'failed')::bigint as failed,
    count(bucketed.status)::bigint as total
  from bucket_order
  left join bucketed
    on bucketed.bucket_key = bucket_order.bucket_key
  group by bucket_order.bucket_key, bucket_order.sort_order
  order by bucket_order.sort_order;
$$;

create or replace function private.get_post_email_queue_failure_reasons(
  p_limit integer default 10
)
returns table (
  reason text,
  failed bigint,
  blocked bigint,
  total bigint,
  last_seen_at timestamptz
)
language sql
stable
security definer
set search_path to private, public, pg_temp
as $$
  with categorized as (
    select
      case
        when peq.status = 'blocked' or nullif(peq.blocked_reason, '') is not null then 'blocked_recipient'
        when peq.last_error ilike '%rate%' or peq.last_error ilike '%limit%' then 'rate_limited'
        when peq.last_error ilike '%timeout%' or peq.last_error ilike '%timed out%' then 'timeout'
        when peq.last_error ilike '%missing%' then 'missing_delivery_data'
        when nullif(peq.last_error, '') is null then 'unknown'
        else 'provider_or_delivery_error'
      end as reason,
      peq.status,
      coalesce(peq.last_attempt_at, peq.updated_at, peq.created_at) as last_seen_at
    from public.post_email_queue peq
    where peq.status in ('failed', 'blocked')
  )
  select
    categorized.reason,
    count(*) filter (where categorized.status = 'failed')::bigint as failed,
    count(*) filter (where categorized.status = 'blocked')::bigint as blocked,
    count(*)::bigint as total,
    max(categorized.last_seen_at) as last_seen_at
  from categorized
  group by categorized.reason
  order by count(*) desc, max(categorized.last_seen_at) desc
  limit greatest(coalesce(p_limit, 10), 1);
$$;

create or replace function private.get_post_email_queue_recent_batches(
  p_limit integer default 10
)
returns table (
  batch_id uuid,
  claimed bigint,
  sent bigint,
  failed bigint,
  queued bigint,
  processing bigint,
  skipped bigint,
  blocked bigint,
  cancelled bigint,
  first_attempt_at timestamptz,
  last_attempt_at timestamptz,
  duration_seconds integer
)
language sql
stable
security definer
set search_path to private, public, pg_temp
as $$
  with grouped as (
    select
      peq.batch_id,
      count(*)::bigint as claimed,
      count(*) filter (where peq.status = 'sent')::bigint as sent,
      count(*) filter (where peq.status = 'failed')::bigint as failed,
      count(*) filter (where peq.status = 'queued')::bigint as queued,
      count(*) filter (where peq.status = 'processing')::bigint as processing,
      count(*) filter (where peq.status = 'skipped')::bigint as skipped,
      count(*) filter (where peq.status = 'blocked')::bigint as blocked,
      count(*) filter (where peq.status = 'cancelled')::bigint as cancelled,
      min(coalesce(peq.last_attempt_at, peq.claimed_at, peq.created_at)) as first_attempt_at,
      max(coalesce(peq.last_attempt_at, peq.updated_at, peq.created_at)) as last_attempt_at
    from public.post_email_queue peq
    where peq.batch_id is not null
    group by peq.batch_id
  )
  select
    grouped.batch_id,
    grouped.claimed,
    grouped.sent,
    grouped.failed,
    grouped.queued,
    grouped.processing,
    grouped.skipped,
    grouped.blocked,
    grouped.cancelled,
    grouped.first_attempt_at,
    grouped.last_attempt_at,
    greatest(
      extract(epoch from grouped.last_attempt_at - grouped.first_attempt_at)::integer,
      0
    ) as duration_seconds
  from grouped
  order by grouped.last_attempt_at desc
  limit greatest(coalesce(p_limit, 10), 1);
$$;

create or replace function private.get_post_email_queue_throughput(
  p_now timestamptz default now()
)
returns table (
  sent_last_1h bigint,
  sent_last_24h bigint,
  failed_last_1h bigint,
  failed_last_24h bigint,
  queued_last_1h bigint,
  queued_last_24h bigint,
  stale_approved_queued_1h bigint,
  stale_approved_queued_24h bigint,
  oldest_queued_at timestamptz
)
language sql
stable
security definer
set search_path to private, public, pg_temp
as $$
  select
    count(*) filter (where peq.sent_at >= p_now - interval '1 hour')::bigint as sent_last_1h,
    count(*) filter (where peq.sent_at >= p_now - interval '24 hours')::bigint as sent_last_24h,
    count(*) filter (
      where peq.status = 'failed'
        and coalesce(peq.last_attempt_at, peq.updated_at) >= p_now - interval '1 hour'
    )::bigint as failed_last_1h,
    count(*) filter (
      where peq.status = 'failed'
        and coalesce(peq.last_attempt_at, peq.updated_at) >= p_now - interval '24 hours'
    )::bigint as failed_last_24h,
    count(*) filter (where peq.created_at >= p_now - interval '1 hour')::bigint as queued_last_1h,
    count(*) filter (where peq.created_at >= p_now - interval '24 hours')::bigint as queued_last_24h,
    count(*) filter (
      where peq.status = 'queued'
        and peq.created_at < p_now - interval '1 hour'
        and upc.approval_status = 'APPROVED'
    )::bigint as stale_approved_queued_1h,
    count(*) filter (
      where peq.status = 'queued'
        and peq.created_at < p_now - interval '24 hours'
        and upc.approval_status = 'APPROVED'
    )::bigint as stale_approved_queued_24h,
    min(peq.created_at) filter (where peq.status = 'queued') as oldest_queued_at
  from public.post_email_queue peq
  left join private.user_group_post_checks upc
    on upc.post_id = peq.post_id
   and upc.user_id = peq.user_id;
$$;

comment on function private.get_workspace_post_review_base_rows(
  uuid, uuid, uuid, uuid[], uuid[], uuid, timestamptz, text, timestamptz, timestamptz
) is
'Returns private post review rows with approval and delivery queue timeline fields for the workspace posts dashboard.';
comment on function private.get_post_email_queue_workspace_breakdown(integer, timestamptz) is
'Returns workspace-level post email queue aggregates for infrastructure observability without row-level recipient data.';
comment on function private.get_post_email_queue_age_buckets(timestamptz) is
'Returns age buckets for active post email queue rows.';
comment on function private.get_post_email_queue_failure_reasons(integer) is
'Returns sanitized failure categories for post email queue diagnostics.';
comment on function private.get_post_email_queue_recent_batches(integer) is
'Returns recent post email queue batch aggregates.';
comment on function private.get_post_email_queue_throughput(timestamptz) is
'Returns post email queue throughput and stale approved queued counts.';

revoke all on function private.get_workspace_post_review_base_rows(
  uuid, uuid, uuid, uuid[], uuid[], uuid, timestamptz, text, timestamptz, timestamptz
) from public, anon, authenticated;
revoke all on function private.get_workspace_post_review_rows(
  uuid, uuid[], uuid[], uuid, text[], text, approval_status, timestamptz, timestamptz, timestamptz, integer, integer
) from public, anon, authenticated;
revoke all on function private.get_workspace_post_review_summary(
  uuid, uuid[], uuid[], uuid, text, approval_status, timestamptz, timestamptz, timestamptz
) from public, anon, authenticated;
revoke all on function private.get_workspace_post_review_filter_options(uuid, uuid[], timestamptz)
  from public, anon, authenticated;
revoke all on function private.get_post_email_queue_workspace_breakdown(integer, timestamptz)
  from public, anon, authenticated;
revoke all on function private.get_post_email_queue_age_buckets(timestamptz)
  from public, anon, authenticated;
revoke all on function private.get_post_email_queue_failure_reasons(integer)
  from public, anon, authenticated;
revoke all on function private.get_post_email_queue_recent_batches(integer)
  from public, anon, authenticated;
revoke all on function private.get_post_email_queue_throughput(timestamptz)
  from public, anon, authenticated;

grant execute on function private.get_workspace_post_review_base_rows(
  uuid, uuid, uuid, uuid[], uuid[], uuid, timestamptz, text, timestamptz, timestamptz
) to service_role;
grant execute on function private.get_workspace_post_review_rows(
  uuid, uuid[], uuid[], uuid, text[], text, approval_status, timestamptz, timestamptz, timestamptz, integer, integer
) to service_role;
grant execute on function private.get_workspace_post_review_summary(
  uuid, uuid[], uuid[], uuid, text, approval_status, timestamptz, timestamptz, timestamptz
) to service_role;
grant execute on function private.get_workspace_post_review_filter_options(uuid, uuid[], timestamptz)
  to service_role;
grant execute on function private.get_post_email_queue_workspace_breakdown(integer, timestamptz)
  to service_role;
grant execute on function private.get_post_email_queue_age_buckets(timestamptz)
  to service_role;
grant execute on function private.get_post_email_queue_failure_reasons(integer)
  to service_role;
grant execute on function private.get_post_email_queue_recent_batches(integer)
  to service_role;
grant execute on function private.get_post_email_queue_throughput(timestamptz)
  to service_role;

notify pgrst, 'reload schema';
