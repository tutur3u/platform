drop function if exists public.get_workspace_post_review_summary(uuid, uuid[], uuid[], uuid, text, public.approval_status, timestamptz);
drop function if exists public.get_workspace_post_review_summary(uuid, uuid[], uuid[], uuid, text, public.approval_status, timestamptz, timestamptz, timestamptz);

drop function if exists public.get_workspace_post_review_rows(
  uuid,
  uuid[],
  uuid[],
  uuid,
  text[],
  text,
  public.approval_status,
  timestamptz,
  integer,
  integer
);
drop function if exists public.get_workspace_post_review_rows(
  uuid,
  uuid[],
  uuid[],
  uuid,
  text[],
  text,
  public.approval_status,
  timestamptz,
  timestamptz,
  timestamptz,
  integer,
  integer
);

create or replace function public.get_workspace_post_review_rows(
  p_ws_id uuid,
  p_included_group_ids uuid[] default null,
  p_excluded_group_ids uuid[] default null,
  p_user_id uuid default null,
  p_stage text[] default null,
  p_queue_status text default null,
  p_approval_status public.approval_status default null,
  p_cutoff timestamptz default null,
  p_start_date timestamptz default null,
  p_end_date timestamptz default null,
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
  approval_status public.approval_status,
  approval_rejection_reason text,
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
  queue_sent_at timestamptz,
  delivery_issue_reason text,
  can_remove_approval boolean,
  review_stage text,
  total_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with filtered as (
    select *
    from public.get_workspace_post_review_base_rows(
      p_ws_id => p_ws_id,
      p_included_group_ids => p_included_group_ids,
      p_excluded_group_ids => p_excluded_group_ids,
      p_user_id => p_user_id,
      p_cutoff => p_cutoff
    )
    where (
      p_stage is null
      or array_length(p_stage, 1) is null
      or review_stage = any(p_stage)
    )
      and (
        p_queue_status is null
        or queue_status = p_queue_status
      )
      and (
        p_approval_status is null
        or approval_status = p_approval_status
      )
      and (
        p_start_date is null
        or post_created_at >= p_start_date
      )
      and (
        p_end_date is null
        or post_created_at <= p_end_date
      )
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
    filtered.queue_sent_at,
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

comment on function public.get_workspace_post_review_rows(uuid, uuid[], uuid[], uuid, text[], text, public.approval_status, timestamptz, timestamptz, timestamptz, integer, integer) is
'Returns paginated workspace post review rows with a unified recipient pipeline stage, delivery issue metadata, and optional stage, queue, approval, and post-date filters.';

create or replace function public.get_workspace_post_review_summary(
  p_ws_id uuid,
  p_included_group_ids uuid[] default null,
  p_excluded_group_ids uuid[] default null,
  p_user_id uuid default null,
  p_queue_status text default null,
  p_approval_status public.approval_status default null,
  p_cutoff timestamptz default null,
  p_start_date timestamptz default null,
  p_end_date timestamptz default null
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
set search_path = public
as $$
  with filtered as (
    select *
    from public.get_workspace_post_review_base_rows(
      p_ws_id => p_ws_id,
      p_included_group_ids => p_included_group_ids,
      p_excluded_group_ids => p_excluded_group_ids,
      p_user_id => p_user_id,
      p_cutoff => p_cutoff
    )
    where (
      p_queue_status is null
      or queue_status = p_queue_status
    )
      and (
        p_approval_status is null
        or approval_status = p_approval_status
      )
      and (
        p_start_date is null
        or post_created_at >= p_start_date
      )
      and (
        p_end_date is null
        or post_created_at <= p_end_date
      )
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

comment on function public.get_workspace_post_review_summary(uuid, uuid[], uuid[], uuid, text, public.approval_status, timestamptz, timestamptz, timestamptz) is
'Returns current-stage, approval, and raw queue counts for workspace post recipients with optional queue, approval, and post-date filters.';
