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
      coalesce(
        upc.email_id,
        peq.sent_email_id,
        direct_sent_email.id
      ) as email_id,
      coalesce(linked_sent_email.subject, direct_sent_email.subject) as subject,
      case
        when peq.status is not null then peq.status
        when coalesce(
          upc.email_id,
          peq.sent_email_id,
          direct_sent_email.id
        ) is not null then 'sent'
        else null
      end as queue_status,
      coalesce(peq.attempt_count, 0) as queue_attempt_count,
      peq.last_error as queue_last_error,
      peq.sent_at as queue_sent_at,
      (
        upc.post_id is not null
        and upc.approval_status = 'APPROVED'
        and coalesce(
          upc.email_id,
          peq.sent_email_id,
          direct_sent_email.id
        ) is null
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
