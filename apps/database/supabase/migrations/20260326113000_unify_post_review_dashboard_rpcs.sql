create or replace function public.get_post_review_stage(
  p_has_check boolean,
  p_approval_status public.approval_status,
  p_email_id uuid,
  p_queue_status text
)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when not coalesce(p_has_check, false) then 'missing_check'
    when p_approval_status = 'REJECTED' then 'rejected'
    when p_approval_status = 'SKIPPED' or p_queue_status = 'skipped' then 'skipped'
    when p_queue_status = 'sent' or p_email_id is not null then 'sent'
    when p_queue_status = 'processing' then 'processing'
    when p_queue_status = 'queued' and p_approval_status = 'APPROVED' then 'queued'
    when p_queue_status in ('failed', 'blocked', 'cancelled')
      and p_approval_status = 'APPROVED' then 'delivery_failed'
    when p_approval_status = 'APPROVED' then 'approved_awaiting_delivery'
    else 'pending_approval'
  end;
$$;

comment on function public.get_post_review_stage(boolean, public.approval_status, uuid, text) is
'Maps post review and queue state into one disjoint recipient pipeline stage.';

create or replace function public.get_workspace_post_review_base_rows(
  p_ws_id uuid,
  p_group_id uuid default null,
  p_post_id uuid default null,
  p_included_group_ids uuid[] default null,
  p_excluded_group_ids uuid[] default null,
  p_user_id uuid default null,
  p_cutoff timestamptz default null,
  p_q text default null
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
  approval_status public.approval_status,
  approval_rejection_reason text,
  email_id uuid,
  subject text,
  queue_status text,
  queue_attempt_count integer,
  queue_last_error text,
  queue_sent_at timestamptz,
  can_remove_approval boolean,
  review_stage text
)
language sql
stable
security definer
set search_path = public
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
      coalesce(upc.email_id, peq.sent_email_id) as email_id,
      se.subject,
      case
        when peq.status is not null then peq.status
        when coalesce(upc.email_id, peq.sent_email_id) is not null then 'sent'
        else null
      end as queue_status,
      coalesce(peq.attempt_count, 0) as queue_attempt_count,
      peq.last_error as queue_last_error,
      peq.sent_at as queue_sent_at,
      (
        upc.post_id is not null
        and upc.approval_status = 'APPROVED'
        and coalesce(upc.email_id, peq.sent_email_id) is null
        and coalesce(peq.status, '') not in ('sent', 'processing')
      ) as can_remove_approval
    from public.user_group_posts ugp
    inner join public.workspace_user_groups wug
      on wug.id = ugp.group_id
    inner join public.workspace_user_groups_users wugu
      on wugu.group_id = ugp.group_id
    inner join public.workspace_users wu
      on wu.id = wugu.user_id
    left join public.user_group_post_checks upc
      on upc.post_id = ugp.id
     and upc.user_id = wu.id
    left join public.post_email_queue peq
      on peq.post_id = ugp.id
     and peq.user_id = wu.id
    left join public.sent_emails se
      on se.id = coalesce(upc.email_id, peq.sent_email_id)
    where wug.ws_id = p_ws_id
      and wu.ws_id = p_ws_id
      and (
        p_group_id is null
        or ugp.group_id = p_group_id
      )
      and (
        p_post_id is null
        or ugp.id = p_post_id
      )
      and (
        p_cutoff is null
        or ugp.created_at >= p_cutoff
      )
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
      and (
        p_user_id is null
        or wu.id = p_user_id
      )
      and (
        wu.email is null
        or wu.email not ilike '%@easy%'
      )
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
    base.email_id,
    base.subject,
    base.queue_status,
    base.queue_attempt_count,
    base.queue_last_error,
    base.queue_sent_at,
    base.can_remove_approval,
    public.get_post_review_stage(
      base.has_check,
      base.approval_status,
      base.email_id,
      base.queue_status
    ) as review_stage
  from base;
$$;

comment on function public.get_workspace_post_review_base_rows(uuid, uuid, uuid, uuid[], uuid[], uuid, timestamptz, text) is
'Returns one current recipient review row per post recipient, including members without completion checks.';

create or replace function public.get_workspace_post_review_rows(
  p_ws_id uuid,
  p_included_group_ids uuid[] default null,
  p_excluded_group_ids uuid[] default null,
  p_user_id uuid default null,
  p_stage text[] default null,
  p_queue_status text default null,
  p_approval_status public.approval_status default null,
  p_cutoff timestamptz default null,
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

comment on function public.get_workspace_post_review_rows(uuid, uuid[], uuid[], uuid, text[], text, public.approval_status, timestamptz, integer, integer) is
'Returns paginated workspace post review rows with a unified recipient pipeline stage and optional stage, queue, and approval filters.';

create or replace function public.get_workspace_post_review_summary(
  p_ws_id uuid,
  p_included_group_ids uuid[] default null,
  p_excluded_group_ids uuid[] default null,
  p_user_id uuid default null,
  p_queue_status text default null,
  p_approval_status public.approval_status default null,
  p_cutoff timestamptz default null
)
returns table (
  total_count bigint,
  missing_check_count bigint,
  pending_approval_stage_count bigint,
  approved_awaiting_delivery_count bigint,
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
  )
  select
    count(*)::bigint as total_count,
    count(*) filter (where review_stage = 'missing_check')::bigint as missing_check_count,
    count(*) filter (where review_stage = 'pending_approval')::bigint as pending_approval_stage_count,
    count(*) filter (where review_stage = 'approved_awaiting_delivery')::bigint as approved_awaiting_delivery_count,
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

comment on function public.get_workspace_post_review_summary(uuid, uuid[], uuid[], uuid, text, public.approval_status, timestamptz) is
'Returns current-stage, approval, and raw queue counts for workspace post recipients.';

create or replace function public.get_workspace_post_review_filter_options(
  p_ws_id uuid,
  p_included_group_ids uuid[] default null,
  p_cutoff timestamptz default null
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
set search_path = public
as $$
  with base as (
    select *
    from public.get_workspace_post_review_base_rows(
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
  select * from user_options
  order by option_scope, label;
$$;

comment on function public.get_workspace_post_review_filter_options(uuid, uuid[], timestamptz) is
'Returns post-review group and user filter options sourced from the unified recipient review dataset.';

create or replace function public.get_user_group_post_recipient_rows(
  p_ws_id uuid,
  p_group_id uuid,
  p_post_id uuid,
  p_q text default null
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
  can_remove_approval boolean,
  review_stage text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    row_key,
    check_created_at,
    notes,
    user_id,
    email_id,
    is_completed,
    has_check,
    approval_status,
    approval_rejection_reason,
    ws_id,
    email,
    recipient,
    user_display_name,
    user_full_name,
    user_phone,
    user_avatar_url,
    post_id,
    post_title,
    post_content,
    post_created_at,
    group_id,
    group_name,
    subject,
    queue_status,
    queue_attempt_count,
    queue_last_error,
    queue_sent_at,
    can_remove_approval,
    review_stage
  from public.get_workspace_post_review_base_rows(
    p_ws_id => p_ws_id,
    p_group_id => p_group_id,
    p_post_id => p_post_id,
    p_q => p_q
  )
  order by recipient asc;
$$;

comment on function public.get_user_group_post_recipient_rows(uuid, uuid, uuid, text) is
'Returns all recipient review rows for one group post, including missing-check recipients.';

create or replace function public.get_user_group_post_status_summary(
  p_ws_id uuid,
  p_group_id uuid,
  p_post_id uuid
)
returns table (
  total_count bigint,
  missing_check_count bigint,
  pending_approval_stage_count bigint,
  approved_awaiting_delivery_count bigint,
  queued_stage_count bigint,
  processing_stage_count bigint,
  sent_stage_count bigint,
  delivery_failed_count bigint,
  skipped_stage_count bigint,
  rejected_stage_count bigint,
  completed_count bigint,
  incomplete_count bigint,
  unchecked_count bigint,
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
      p_group_id => p_group_id,
      p_post_id => p_post_id
    )
  )
  select
    count(*)::bigint as total_count,
    count(*) filter (where review_stage = 'missing_check')::bigint as missing_check_count,
    count(*) filter (where review_stage = 'pending_approval')::bigint as pending_approval_stage_count,
    count(*) filter (where review_stage = 'approved_awaiting_delivery')::bigint as approved_awaiting_delivery_count,
    count(*) filter (where review_stage = 'queued')::bigint as queued_stage_count,
    count(*) filter (where review_stage = 'processing')::bigint as processing_stage_count,
    count(*) filter (where review_stage = 'sent')::bigint as sent_stage_count,
    count(*) filter (where review_stage = 'delivery_failed')::bigint as delivery_failed_count,
    count(*) filter (where review_stage = 'skipped')::bigint as skipped_stage_count,
    count(*) filter (where review_stage = 'rejected')::bigint as rejected_stage_count,
    count(*) filter (where has_check and is_completed is true)::bigint as completed_count,
    count(*) filter (where has_check and is_completed is false)::bigint as incomplete_count,
    count(*) filter (where not has_check)::bigint as unchecked_count,
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

comment on function public.get_user_group_post_status_summary(uuid, uuid, uuid) is
'Returns group-post recipient counts across unified stages, completion checks, approvals, and raw queue statuses.';
