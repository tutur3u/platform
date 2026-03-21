create or replace function public.get_workspace_post_email_status_summary(
  p_ws_id uuid,
  p_included_group_ids uuid[] default null,
  p_excluded_group_ids uuid[] default null,
  p_user_id uuid default null,
  p_cutoff timestamptz default null,
  p_queue_status text default null
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
      and (
        p_queue_status is null
        or coalesce(
          peq.status,
          case
            when upc.email_id is not null then 'sent'
            else 'queued'
          end
        ) = p_queue_status
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

comment on function public.get_workspace_post_email_status_summary(uuid, uuid[], uuid[], uuid, timestamptz, text) is
'Returns workspace-wide post email delivery counts filtered by optional queue status so dashboard summary accurately reflects active filters.';
