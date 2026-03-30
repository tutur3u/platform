create index if not exists sent_emails_post_receiver_id_idx
on public.sent_emails (post_id, receiver_id);

create index if not exists workspace_user_linked_users_ws_virtual_user_id_idx
on public.workspace_user_linked_users (ws_id, virtual_user_id);

create or replace function public.get_post_email_queue_status_summary(
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
set search_path = public
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

comment on function public.get_post_email_queue_status_summary(uuid) is
'Returns aggregate post_email_queue status counts for cron snapshots without scanning rows in application code.';

create or replace function public.reconcile_orphaned_approved_post_email_queue(
  p_cutoff timestamptz default null,
  p_max_posts integer default null,
  p_ws_id uuid default null
)
returns table (
  checked bigint,
  covered_by_existing_queue bigint,
  covered_by_sent_email bigint,
  orphaned bigint,
  already_sent bigint,
  eligible_recipients bigint,
  existing_processing bigint,
  existing_queued bigint,
  existing_skipped bigint,
  missing_completion bigint,
  missing_email bigint,
  missing_sender_platform_user bigint,
  missing_user_record bigint,
  not_approved bigint,
  upserted bigint,
  enqueued bigint,
  processed_posts bigint,
  remaining_posts bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cutoff timestamptz := coalesce(
    p_cutoff,
    now() - interval '60 days'
  );
begin
  return query
  with candidate_checks as (
    select
      upc.post_id,
      upc.user_id,
      upc.approved_by,
      ugp.group_id,
      ugp.created_at as post_created_at,
      wug.ws_id,
      wu.id as workspace_user_id,
      wu.email
    from public.user_group_post_checks upc
    inner join public.user_group_posts ugp
      on ugp.id = upc.post_id
    inner join public.workspace_user_groups wug
      on wug.id = ugp.group_id
    left join public.workspace_users wu
      on wu.id = upc.user_id
     and wu.ws_id = wug.ws_id
    where upc.approval_status = 'APPROVED'
      and upc.is_completed is not null
      and ugp.created_at >= v_cutoff
      and (
        p_ws_id is null
        or wug.ws_id = p_ws_id
      )
  ),
  classified as (
    select
      c.post_id,
      c.user_id,
      c.approved_by,
      c.group_id,
      c.post_created_at,
      c.ws_id,
      c.workspace_user_id,
      c.email,
      peq.status as queue_status,
      exists(
        select 1
        from public.sent_emails se
        where se.post_id = c.post_id
          and se.receiver_id = c.user_id
      ) as has_sent_email,
      sender.platform_user_id as sender_platform_user_id,
      (
        c.workspace_user_id is not null
        and c.email is not null
        and btrim(c.email) <> ''
        and c.email ~* '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$'
      ) as has_deliverable_email
    from candidate_checks c
    left join public.post_email_queue peq
      on peq.post_id = c.post_id
     and peq.user_id = c.user_id
    left join lateral (
      select wulu.platform_user_id
      from public.workspace_user_linked_users wulu
      where wulu.ws_id = c.ws_id
        and wulu.virtual_user_id = c.approved_by
      order by wulu.platform_user_id
      limit 1
    ) sender on true
  ),
  orphaned_rows as (
    select classified.*
    from classified
    where classified.queue_status is null
      and not classified.has_sent_email
  ),
  orphaned_posts as (
    select
      orphaned_rows.post_id,
      row_number() over (
        order by min(orphaned_rows.post_created_at), orphaned_rows.post_id
      ) as row_num
    from orphaned_rows
    group by orphaned_rows.post_id
  ),
  limited_posts as (
    select orphaned_posts.post_id
    from orphaned_posts
    where (
      p_max_posts is null
      or p_max_posts <= 0
      or orphaned_posts.row_num <= p_max_posts
    )
  ),
  selected_orphaned_rows as (
    select orphaned_rows.*
    from orphaned_rows
    inner join limited_posts
      on limited_posts.post_id = orphaned_rows.post_id
  ),
  rows_to_insert as (
    select
      selected_orphaned_rows.ws_id,
      selected_orphaned_rows.group_id,
      selected_orphaned_rows.post_id,
      selected_orphaned_rows.user_id,
      selected_orphaned_rows.sender_platform_user_id,
      'queued'::text as status,
      null::uuid as batch_id,
      0::integer as attempt_count,
      null::text as last_error,
      null::text as blocked_reason,
      null::timestamptz as claimed_at,
      null::timestamptz as last_attempt_at,
      null::timestamptz as sent_at,
      null::timestamptz as cancelled_at,
      null::uuid as sent_email_id
    from selected_orphaned_rows
    where selected_orphaned_rows.workspace_user_id is not null
      and selected_orphaned_rows.has_deliverable_email
      and selected_orphaned_rows.sender_platform_user_id is not null
  ),
  inserted_rows as (
    insert into public.post_email_queue (
      ws_id,
      group_id,
      post_id,
      user_id,
      sender_platform_user_id,
      status,
      batch_id,
      attempt_count,
      last_error,
      blocked_reason,
      claimed_at,
      last_attempt_at,
      sent_at,
      cancelled_at,
      sent_email_id
    )
    select
      rows_to_insert.ws_id,
      rows_to_insert.group_id,
      rows_to_insert.post_id,
      rows_to_insert.user_id,
      rows_to_insert.sender_platform_user_id,
      rows_to_insert.status,
      rows_to_insert.batch_id,
      rows_to_insert.attempt_count,
      rows_to_insert.last_error,
      rows_to_insert.blocked_reason,
      rows_to_insert.claimed_at,
      rows_to_insert.last_attempt_at,
      rows_to_insert.sent_at,
      rows_to_insert.cancelled_at,
      rows_to_insert.sent_email_id
    from rows_to_insert
    on conflict (post_id, user_id) do nothing
    returning post_id, user_id
  ),
  diagnostics as (
    select
      count(*)::bigint as checked,
      count(*) filter (where classified.queue_status is not null)::bigint as covered_by_existing_queue,
      count(*) filter (
        where classified.queue_status is null
          and classified.has_sent_email
      )::bigint as covered_by_sent_email,
      (select count(*)::bigint from orphaned_rows) as orphaned,
      count(*) filter (
        where selected_orphaned_rows.workspace_user_id is not null
          and selected_orphaned_rows.has_deliverable_email
      )::bigint as eligible_recipients,
      count(*) filter (
        where selected_orphaned_rows.workspace_user_id is null
      )::bigint as missing_user_record,
      count(*) filter (
        where selected_orphaned_rows.workspace_user_id is not null
          and not selected_orphaned_rows.has_deliverable_email
      )::bigint as missing_email,
      count(*) filter (
        where selected_orphaned_rows.workspace_user_id is not null
          and selected_orphaned_rows.has_deliverable_email
          and selected_orphaned_rows.sender_platform_user_id is null
      )::bigint as missing_sender_platform_user,
      (select count(*)::bigint from inserted_rows) as upserted,
      (select count(*)::bigint from limited_posts) as processed_posts,
      greatest(
        (select count(*)::bigint from orphaned_posts) -
        (select count(*)::bigint from limited_posts),
        0
      ) as remaining_posts
    from classified
    left join selected_orphaned_rows
      on selected_orphaned_rows.post_id = classified.post_id
     and selected_orphaned_rows.user_id = classified.user_id
  )
  select
    diagnostics.checked,
    diagnostics.covered_by_existing_queue,
    diagnostics.covered_by_sent_email,
    diagnostics.orphaned,
    diagnostics.covered_by_sent_email as already_sent,
    diagnostics.eligible_recipients,
    0::bigint as existing_processing,
    0::bigint as existing_queued,
    0::bigint as existing_skipped,
    0::bigint as missing_completion,
    diagnostics.missing_email,
    diagnostics.missing_sender_platform_user,
    diagnostics.missing_user_record,
    0::bigint as not_approved,
    diagnostics.upserted,
    diagnostics.upserted as enqueued,
    diagnostics.processed_posts,
    diagnostics.remaining_posts
  from diagnostics;
end;
$$;

comment on function public.reconcile_orphaned_approved_post_email_queue(timestamptz, integer, uuid) is
'Finds recent approved post recipients that have no post_email_queue row and no sent_emails coverage, inserts queued rows set-wise, and returns reconciliation diagnostics for cron processing.';
