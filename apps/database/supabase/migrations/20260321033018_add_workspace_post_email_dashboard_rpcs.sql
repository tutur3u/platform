create or replace function public.get_workspace_post_email_status_summary(
  p_ws_id uuid,
  p_included_group_ids uuid[] default null,
  p_excluded_group_ids uuid[] default null,
  p_user_id uuid default null,
  p_cutoff timestamptz default null
)
returns table (
  total_count bigint,
  queued_count bigint,
  processing_count bigint,
  sent_count bigint,
  failed_count bigint,
  blocked_count bigint,
  cancelled_count bigint,
  skipped_count bigint,
  pending_approval_count bigint,
  approved_count bigint,
  rejected_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with filtered as (
    select
      upc.approval_status,
      coalesce(
        peq.status,
        case
          when upc.email_id is not null then 'sent'
          else 'queued'
        end
      ) as queue_status
    from public.user_group_post_checks upc
    inner join public.workspace_users wu
      on wu.id = upc.user_id
    inner join public.user_group_posts ugp
      on ugp.id = upc.post_id
    inner join public.workspace_user_groups wug
      on wug.id = ugp.group_id
    left join public.post_email_queue peq
      on peq.post_id = upc.post_id
     and peq.user_id = upc.user_id
    where wu.ws_id = p_ws_id
      and wug.ws_id = p_ws_id
      and (wu.email is null or wu.email not ilike '%@easy%')
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
        or upc.user_id = p_user_id
      )
  )
  select
    count(*)::bigint as total_count,
    count(*) filter (where queue_status = 'queued')::bigint as queued_count,
    count(*) filter (where queue_status = 'processing')::bigint as processing_count,
    count(*) filter (where queue_status = 'sent')::bigint as sent_count,
    count(*) filter (where queue_status = 'failed')::bigint as failed_count,
    count(*) filter (where queue_status = 'blocked')::bigint as blocked_count,
    count(*) filter (where queue_status = 'cancelled')::bigint as cancelled_count,
    count(*) filter (where queue_status = 'skipped')::bigint as skipped_count,
    count(*) filter (where approval_status = 'PENDING')::bigint as pending_approval_count,
    count(*) filter (where approval_status = 'APPROVED')::bigint as approved_count,
    count(*) filter (where approval_status = 'REJECTED')::bigint as rejected_count
  from filtered;
$$;

comment on function public.get_workspace_post_email_status_summary(uuid, uuid[], uuid[], uuid, timestamptz) is
'Returns workspace-wide post email delivery counts for the current filters. Queue status prefers post_email_queue rows and falls back to sent/queued when legacy rows have no queue record.';

create or replace function public.get_workspace_post_email_rows(
  p_ws_id uuid,
  p_included_group_ids uuid[] default null,
  p_excluded_group_ids uuid[] default null,
  p_user_id uuid default null,
  p_queue_status text default null,
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
  approval_status public.approval_status,
  approval_rejection_reason text,
  ws_id uuid,
  email text,
  recipient text,
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
  total_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with filtered as (
    select
      concat(upc.post_id::text, ':', upc.user_id::text) as row_key,
      upc.created_at as check_created_at,
      upc.notes,
      upc.user_id,
      upc.email_id,
      upc.is_completed,
      upc.approval_status,
      upc.rejection_reason as approval_rejection_reason,
      wu.ws_id,
      wu.email,
      coalesce(wu.full_name, wu.display_name) as recipient,
      ugp.id as post_id,
      ugp.title as post_title,
      ugp.content as post_content,
      ugp.created_at as post_created_at,
      ugp.group_id,
      wug.name as group_name,
      se.subject,
      coalesce(
        peq.status,
        case
          when upc.email_id is not null then 'sent'
          else 'queued'
        end
      ) as queue_status,
      coalesce(peq.attempt_count, 0) as queue_attempt_count,
      peq.last_error as queue_last_error,
      peq.sent_at as queue_sent_at,
      (
        upc.approval_status = 'APPROVED'
        and coalesce(
          peq.status,
          case
            when upc.email_id is not null then 'sent'
            else 'queued'
          end
        ) <> 'sent'
        and upc.email_id is null
      ) as can_remove_approval
    from public.user_group_post_checks upc
    inner join public.workspace_users wu
      on wu.id = upc.user_id
    inner join public.user_group_posts ugp
      on ugp.id = upc.post_id
    inner join public.workspace_user_groups wug
      on wug.id = ugp.group_id
    left join public.post_email_queue peq
      on peq.post_id = upc.post_id
     and peq.user_id = upc.user_id
    left join public.sent_emails se
      on se.id = coalesce(upc.email_id, peq.sent_email_id)
    where wu.ws_id = p_ws_id
      and wug.ws_id = p_ws_id
      and (wu.email is null or wu.email not ilike '%@easy%')
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
        or upc.user_id = p_user_id
      )
  )
  select
    filtered.row_key,
    filtered.check_created_at,
    filtered.notes,
    filtered.user_id,
    filtered.email_id,
    filtered.is_completed,
    filtered.approval_status,
    filtered.approval_rejection_reason,
    filtered.ws_id,
    filtered.email,
    filtered.recipient,
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
    count(*) over()::bigint as total_count
  from filtered
  where (
    p_queue_status is null
    or filtered.queue_status = p_queue_status
  )
  order by filtered.check_created_at desc
  limit greatest(coalesce(p_limit, 10), 1)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

comment on function public.get_workspace_post_email_rows(uuid, uuid[], uuid[], uuid, text, timestamptz, integer, integer) is
'Returns paginated workspace post email deliveries with a computed queue_status so server-side filtering and pagination stay consistent with the queue summary.';
