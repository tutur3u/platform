create schema if not exists private;

drop materialized view if exists public.posts_dashboard_view;
drop materialized view if exists private.posts_dashboard_view;

alter table if exists public.user_group_post_logs
  set schema private;

alter table if exists public.user_group_post_checks
  set schema private;

alter table if exists public.user_group_posts
  set schema private;

drop policy if exists "Enable all access for workspace users"
  on private.user_group_post_checks;

alter table private.user_group_posts enable row level security;
alter table private.user_group_post_checks enable row level security;
alter table private.user_group_post_logs enable row level security;

revoke all on table private.user_group_posts from anon, authenticated;
revoke all on table private.user_group_post_checks from anon, authenticated;
revoke all on table private.user_group_post_logs from anon, authenticated;

grant all on table private.user_group_posts to service_role;
grant all on table private.user_group_post_checks to service_role;
grant all on table private.user_group_post_logs to service_role;

drop policy if exists "service role can manage user group posts"
  on private.user_group_posts;
create policy "service role can manage user group posts"
  on private.user_group_posts
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "service role can manage user group post checks"
  on private.user_group_post_checks;
create policy "service role can manage user group post checks"
  on private.user_group_post_checks
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "service role can manage user group post logs"
  on private.user_group_post_logs;
create policy "service role can manage user group post logs"
  on private.user_group_post_logs
  for all
  to service_role
  using (true)
  with check (true);

create or replace function private.get_post_workspace_id(p_post_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path to private, public, pg_temp
as $$
declare
  v_ws_id uuid;
begin
  select workspace_user_groups.ws_id
    into v_ws_id
  from private.user_group_posts
  join public.workspace_user_groups
    on workspace_user_groups.id = user_group_posts.group_id
  where user_group_posts.id = p_post_id;

  return v_ws_id;
end;
$$;

create or replace function private.workspace_user_groups(private.user_group_posts)
returns setof public.workspace_user_groups
rows 1
stable
security definer
set search_path = public, private, pg_temp
language sql
as $$
  select workspace_user_groups.*
  from public.workspace_user_groups
  where workspace_user_groups.id = $1.group_id;
$$;

create or replace function private.workspace_users(private.user_group_post_checks)
returns setof public.workspace_users
rows 1
stable
security definer
set search_path = public, private, pg_temp
language sql
as $$
  select workspace_users.*
  from public.workspace_users
  where workspace_users.id = $1.user_id;
$$;

create or replace function private.workspace_users(private.user_group_posts)
returns setof public.workspace_users
rows 1
stable
security definer
set search_path = public, private, pg_temp
language sql
as $$
  select workspace_users.*
  from public.workspace_users
  where workspace_users.id = $1.updated_by;
$$;

create or replace function private.log_post_change()
returns trigger
language plpgsql
security definer
set search_path to private, public, pg_temp
as $$
declare
  v_ws_id uuid;
  v_modifier_id uuid;
begin
  select ws_id
    into v_ws_id
  from public.workspace_user_groups
  where id = new.group_id;

  if auth.uid() is not null then
    v_modifier_id := public.get_workspace_user_id(auth.uid(), v_ws_id);
  end if;

  insert into private.user_group_post_logs (
    post_id,
    group_id,
    title,
    content,
    notes,
    created_at,
    post_approval_status,
    approved_by,
    approved_at,
    rejected_by,
    rejected_at,
    rejection_reason,
    creator_id
  )
  values (
    new.id,
    new.group_id,
    new.title,
    new.content,
    new.notes,
    now(),
    new.post_approval_status,
    new.approved_by,
    new.approved_at,
    new.rejected_by,
    new.rejected_at,
    new.rejection_reason,
    coalesce(v_modifier_id, new.creator_id)
  );

  return new;
end;
$$;

create or replace function private.handle_post_approval()
returns trigger
language plpgsql
security definer
set search_path to private, public, pg_temp
as $$
declare
  v_ws_id uuid;
  v_user_id uuid;
  v_has_approve_permission boolean;
  v_has_create_permission boolean;
  v_enable_approval boolean;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    v_ws_id := private.get_post_workspace_id(new.id);
  else
    select ws_id
      into v_ws_id
    from public.workspace_user_groups
    where id = new.group_id;
  end if;

  select coalesce(value = 'true', true)
    into v_enable_approval
  from public.workspace_configs
  where ws_id = v_ws_id
    and id = 'ENABLE_POST_APPROVAL';

  v_has_approve_permission :=
    public.has_workspace_permission(v_ws_id, v_user_id, 'approve_posts');
  v_has_create_permission :=
    public.has_workspace_permission(v_ws_id, v_user_id, 'create_user_groups_posts');

  if not v_enable_approval then
    if v_has_create_permission then
      new.post_approval_status := 'APPROVED';
      new.approved_by := v_user_id;
      new.approved_at := now();
      new.rejected_by := null;
      new.rejected_at := null;
      new.rejection_reason := null;
    end if;

    return new;
  end if;

  if v_has_approve_permission then
    if new.post_approval_status = 'PENDING' and v_has_create_permission then
      new.post_approval_status := 'APPROVED';
    end if;

    if new.post_approval_status = 'REJECTED' then
      if new.rejection_reason is null or new.rejection_reason = '' then
        raise exception 'rejection_reason is required when rejecting a post';
      end if;

      if new.rejected_by is null then
        new.rejected_by := v_user_id;
      end if;

      if new.rejected_at is null then
        new.rejected_at := now();
      end if;

      new.approved_by := null;
      new.approved_at := null;
    elsif new.post_approval_status = 'APPROVED' then
      if new.approved_by is null then
        new.approved_by := v_user_id;
      end if;

      if new.approved_at is null then
        new.approved_at := now();
      end if;

      new.rejected_by := null;
      new.rejected_at := null;
      new.rejection_reason := null;
    end if;
  else
    if tg_op = 'UPDATE' and (
      new.post_approval_status is distinct from old.post_approval_status or
      new.approved_by is distinct from old.approved_by or
      new.approved_at is distinct from old.approved_at or
      new.rejected_by is distinct from old.rejected_by or
      new.rejected_at is distinct from old.rejected_at or
      new.rejection_reason is distinct from old.rejection_reason
    ) then
      raise exception 'You do not have permission to modify approval fields';
    end if;

    new.post_approval_status := 'PENDING';
    new.approved_by := null;
    new.approved_at := null;
    new.rejected_by := null;
    new.rejected_at := null;
    new.rejection_reason := null;
  end if;

  return new;
end;
$$;

create or replace function private.notify_post_approval_change()
returns trigger
language plpgsql
security definer
set search_path to private, public, pg_temp
as $$
declare
  v_ws_id uuid;
  v_reviewer_name text;
  v_reviewer_platform_user_id uuid;
  v_post_title text;
  v_notification_type text;
  v_notification_title text;
  v_notification_description text;
  v_data jsonb;
  v_teacher record;
begin
  if old.post_approval_status is not distinct from new.post_approval_status then
    return new;
  end if;

  if new.post_approval_status not in ('APPROVED', 'REJECTED') then
    return new;
  end if;

  v_ws_id := private.get_post_workspace_id(new.id);
  if v_ws_id is null then
    return new;
  end if;

  if new.post_approval_status = 'APPROVED' then
    select full_name
      into v_reviewer_name
    from public.workspace_users
    where id = new.approved_by;

    select platform_user_id
      into v_reviewer_platform_user_id
    from public.workspace_user_linked_users
    where virtual_user_id = new.approved_by
      and ws_id = v_ws_id
    limit 1;
  else
    select full_name
      into v_reviewer_name
    from public.workspace_users
    where id = new.rejected_by;

    select platform_user_id
      into v_reviewer_platform_user_id
    from public.workspace_user_linked_users
    where virtual_user_id = new.rejected_by
      and ws_id = v_ws_id
    limit 1;
  end if;

  v_post_title := coalesce(nullif(new.title, ''), 'Untitled Post');

  if new.post_approval_status = 'APPROVED' then
    v_notification_type := 'post_approved';
    v_notification_title := 'Post approved';
    v_notification_description :=
      coalesce(v_reviewer_name, 'Someone') || ' approved "' || v_post_title || '"';
    v_data := jsonb_build_object(
      'post_id', new.id,
      'post_title', v_post_title,
      'group_id', new.group_id,
      'reviewer_name', v_reviewer_name
    );
  else
    v_notification_type := 'post_rejected';
    v_notification_title := 'Post rejected';
    v_notification_description :=
      coalesce(v_reviewer_name, 'Someone') || ' rejected "' || v_post_title || '"';
    v_data := jsonb_build_object(
      'post_id', new.id,
      'post_title', v_post_title,
      'group_id', new.group_id,
      'reviewer_name', v_reviewer_name,
      'rejection_reason', new.rejection_reason
    );
  end if;

  for v_teacher in
    select wulu.platform_user_id
    from public.workspace_user_groups_users wugu
    join public.workspace_user_linked_users wulu
      on wulu.virtual_user_id = wugu.user_id
      and wulu.ws_id = v_ws_id
    where wugu.group_id = new.group_id
      and wugu.role = 'TEACHER'
      and wulu.platform_user_id is not null
      and wugu.user_id != coalesce(
        case
          when new.post_approval_status = 'APPROVED' then new.approved_by
          else new.rejected_by
        end,
        '00000000-0000-0000-0000-000000000000'::uuid
      )
  loop
    perform public.create_notification(
      p_ws_id := v_ws_id,
      p_user_id := v_teacher.platform_user_id,
      p_type := v_notification_type,
      p_title := v_notification_title,
      p_description := v_notification_description,
      p_data := v_data,
      p_entity_type := 'post',
      p_entity_id := new.id,
      p_created_by := v_reviewer_platform_user_id
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_post_approval on private.user_group_posts;
create trigger trg_post_approval
  before insert or update on private.user_group_posts
  for each row
  execute function private.handle_post_approval();

drop trigger if exists trg_post_change_log on private.user_group_posts;
create trigger trg_post_change_log
  after insert or update on private.user_group_posts
  for each row
  when (new.post_approval_status = 'APPROVED'::approval_status)
  execute function private.log_post_change();

drop trigger if exists trg_notify_post_approval on private.user_group_posts;
create trigger trg_notify_post_approval
  after update on private.user_group_posts
  for each row
  when (old.post_approval_status is distinct from new.post_approval_status)
  execute function private.notify_post_approval_change();

drop function if exists public.notify_post_approval_change();
drop function if exists public.handle_post_approval();
drop function if exists public.log_post_change();
drop function if exists public.get_post_workspace_id(uuid);

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
  email_id uuid,
  subject text,
  queue_status text,
  queue_attempt_count integer,
  queue_last_error text,
  queue_sent_at timestamptz,
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
      coalesce(upc.email_id, peq.sent_email_id, direct_sent_email.id) as email_id,
      coalesce(linked_sent_email.subject, direct_sent_email.subject) as subject,
      case
        when peq.status is not null then peq.status
        when coalesce(upc.email_id, peq.sent_email_id, direct_sent_email.id) is not null then 'sent'
        else null
      end as queue_status,
      coalesce(peq.attempt_count, 0) as queue_attempt_count,
      peq.last_error as queue_last_error,
      peq.sent_at as queue_sent_at,
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
    base.email_id,
    base.subject,
    base.queue_status,
    base.queue_attempt_count,
    base.queue_last_error,
    base.queue_sent_at,
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
  select * from user_options
  order by option_scope, label;
$$;

create or replace function private.get_user_group_post_status_summary(
  p_ws_id uuid,
  p_group_id uuid,
  p_post_id uuid
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
set search_path to private, public, pg_temp
as $$
  with filtered as (
    select *
    from private.get_workspace_post_review_base_rows(
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
    count(*) filter (where review_stage = 'undeliverable')::bigint as undeliverable_count,
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

create or replace function private.get_user_group_post_recipient_rows(
  p_ws_id uuid,
  p_group_id uuid,
  p_post_id uuid,
  p_q text default null::text
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
  review_stage text
)
language sql
stable
security definer
set search_path to private, public, pg_temp
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
    delivery_issue_reason,
    can_remove_approval,
    review_stage
  from private.get_workspace_post_review_base_rows(
    p_ws_id => p_ws_id,
    p_group_id => p_group_id,
    p_post_id => p_post_id,
    p_q => p_q
  )
  order by recipient asc;
$$;

create or replace function private.get_workspace_post_email_rows(
  p_ws_id uuid,
  p_included_group_ids uuid[] default null::uuid[],
  p_excluded_group_ids uuid[] default null::uuid[],
  p_user_id uuid default null::uuid,
  p_queue_status text default null::text,
  p_approval_status approval_status default null::approval_status,
  p_cutoff timestamptz default null::timestamptz,
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
  approval_status approval_status,
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
set search_path to private, public, pg_temp
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
      case
        when peq.status is not null then peq.status
        when upc.email_id is not null then 'sent'
        else null
      end as queue_status,
      coalesce(peq.attempt_count, 0) as queue_attempt_count,
      peq.last_error as queue_last_error,
      peq.sent_at as queue_sent_at,
      (
        upc.approval_status = 'APPROVED'
        and upc.email_id is null
        and coalesce(peq.status, '') <> 'sent'
      ) as can_remove_approval
    from private.user_group_post_checks upc
    inner join public.workspace_users wu
      on wu.id = upc.user_id
    inner join private.user_group_posts ugp
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
      and (p_cutoff is null or ugp.created_at >= p_cutoff)
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
      and (p_user_id is null or upc.user_id = p_user_id)
      and (p_approval_status is null or upc.approval_status = p_approval_status)
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
  where (p_queue_status is null or filtered.queue_status = p_queue_status)
  order by filtered.check_created_at desc
  limit greatest(coalesce(p_limit, 10), 1)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

create or replace function private.get_workspace_post_email_status_summary(
  p_ws_id uuid,
  p_included_group_ids uuid[] default null::uuid[],
  p_excluded_group_ids uuid[] default null::uuid[],
  p_user_id uuid default null::uuid,
  p_cutoff timestamptz default null::timestamptz,
  p_queue_status text default null::text
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
set search_path to private, public, pg_temp
as $$
  with filtered as (
    select
      upc.approval_status,
      case
        when peq.status is not null then peq.status
        when upc.email_id is not null then 'sent'
        else null
      end as queue_status
    from private.user_group_post_checks upc
    inner join public.workspace_users wu
      on wu.id = upc.user_id
    inner join private.user_group_posts ugp
      on ugp.id = upc.post_id
    inner join public.workspace_user_groups wug
      on wug.id = ugp.group_id
    left join public.post_email_queue peq
      on peq.post_id = upc.post_id
     and peq.user_id = upc.user_id
    where wu.ws_id = p_ws_id
      and wug.ws_id = p_ws_id
      and (wu.email is null or wu.email not ilike '%@easy%')
      and (p_cutoff is null or ugp.created_at >= p_cutoff)
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
      and (p_user_id is null or upc.user_id = p_user_id)
      and (
        p_queue_status is null
        or case
          when peq.status is not null then peq.status
          when upc.email_id is not null then 'sent'
          else null
        end = p_queue_status
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

create or replace function private.reconcile_orphaned_approved_post_email_queue(
  p_cutoff timestamptz default null::timestamptz,
  p_max_posts integer default null::integer,
  p_skip_posts integer default 0,
  p_ws_id uuid default null::uuid
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
set search_path to private, public, pg_temp
as $$
declare
  v_cutoff timestamptz := coalesce(p_cutoff, now() - interval '60 days');
  v_skip_posts integer := greatest(coalesce(p_skip_posts, 0), 0);
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
    from private.user_group_post_checks upc
    inner join private.user_group_posts ugp
      on ugp.id = upc.post_id
    inner join public.workspace_user_groups wug
      on wug.id = ugp.group_id
    left join public.workspace_users wu
      on wu.id = upc.user_id
     and wu.ws_id = wug.ws_id
    where upc.approval_status = 'APPROVED'
      and upc.is_completed is not null
      and ugp.created_at >= v_cutoff
      and (p_ws_id is null or wug.ws_id = p_ws_id)
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
        and c.email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
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
  orphaned_post_stats as (
    select
      orphaned_rows.post_id,
      min(orphaned_rows.post_created_at) as first_post_created_at,
      bool_or(
        orphaned_rows.workspace_user_id is not null
        and orphaned_rows.has_deliverable_email
        and orphaned_rows.sender_platform_user_id is not null
      ) as has_enqueueable_rows
    from orphaned_rows
    group by orphaned_rows.post_id
  ),
  ranked_orphaned_posts as (
    select
      orphaned_post_stats.post_id,
      row_number() over (
        order by
          orphaned_post_stats.has_enqueueable_rows desc,
          orphaned_post_stats.first_post_created_at,
          orphaned_post_stats.post_id
      ) as row_num
    from orphaned_post_stats
  ),
  limited_posts as (
    select ranked_orphaned_posts.post_id
    from ranked_orphaned_posts
    where ranked_orphaned_posts.row_num > v_skip_posts
      and (
        p_max_posts is null
        or p_max_posts <= 0
        or ranked_orphaned_posts.row_num <= v_skip_posts + p_max_posts
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
      (select count(*)::bigint from classified) as checked,
      (
        select count(*)::bigint
        from classified
        where classified.queue_status is not null
      ) as covered_by_existing_queue,
      (
        select count(*)::bigint
        from classified
        where classified.queue_status is null
          and classified.has_sent_email
      ) as covered_by_sent_email,
      (select count(*)::bigint from orphaned_rows) as orphaned,
      (
        select count(*)::bigint
        from selected_orphaned_rows
        where selected_orphaned_rows.workspace_user_id is not null
          and selected_orphaned_rows.has_deliverable_email
      ) as eligible_recipients,
      (
        select count(*)::bigint
        from selected_orphaned_rows
        where selected_orphaned_rows.workspace_user_id is null
      ) as missing_user_record,
      (
        select count(*)::bigint
        from selected_orphaned_rows
        where selected_orphaned_rows.workspace_user_id is not null
          and not selected_orphaned_rows.has_deliverable_email
      ) as missing_email,
      (
        select count(*)::bigint
        from selected_orphaned_rows
        where selected_orphaned_rows.workspace_user_id is not null
          and selected_orphaned_rows.has_deliverable_email
          and selected_orphaned_rows.sender_platform_user_id is null
      ) as missing_sender_platform_user,
      (select count(*)::bigint from inserted_rows) as upserted,
      (select count(*)::bigint from limited_posts) as processed_posts,
      greatest(
        (select count(*)::bigint from orphaned_post_stats) -
        v_skip_posts -
        (select count(*)::bigint from limited_posts),
        0
      ) as remaining_posts
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

drop function if exists public.get_workspace_post_review_rows(
  uuid,
  uuid[],
  uuid[],
  uuid,
  text[],
  text,
  approval_status,
  timestamptz,
  timestamptz,
  timestamptz,
  integer,
  integer
);
drop function if exists public.get_workspace_post_review_summary(
  uuid,
  uuid[],
  uuid[],
  uuid,
  text,
  approval_status,
  timestamptz,
  timestamptz,
  timestamptz
);
drop function if exists public.get_workspace_post_review_filter_options(uuid, uuid[], timestamptz);
drop function if exists public.get_user_group_post_status_summary(uuid, uuid, uuid);
drop function if exists public.get_user_group_post_recipient_rows(uuid, uuid, uuid, text);
drop function if exists public.get_workspace_post_email_rows(
  uuid,
  uuid[],
  uuid[],
  uuid,
  text,
  approval_status,
  timestamptz,
  integer,
  integer
);
drop function if exists public.get_workspace_post_email_status_summary(
  uuid,
  uuid[],
  uuid[],
  uuid,
  timestamptz,
  text
);
drop function if exists public.reconcile_orphaned_approved_post_email_queue(
  timestamptz,
  integer,
  integer,
  uuid
);
drop function if exists public.get_workspace_post_review_base_rows(
  uuid,
  uuid,
  uuid,
  uuid[],
  uuid[],
  uuid,
  timestamptz,
  text,
  timestamptz,
  timestamptz
);

create materialized view private.posts_dashboard_view as
select
  ugpc.post_id,
  ugpc.user_id,
  ugpc.email_id,
  ugpc.is_completed,
  ugpc.notes,
  ugpc.created_at,
  wu.ws_id,
  wu.email as user_email,
  wu.display_name,
  wu.full_name,
  ugp.id as post_id_full,
  ugp.title as post_title,
  ugp.content as post_content,
  ugp.created_at as post_created_at,
  wug.id as group_id,
  wug.name as group_name,
  se.subject as email_subject,
  se.created_at as email_sent_at,
  coalesce(wu.full_name, wu.display_name) as recipient
from private.user_group_post_checks ugpc
join public.workspace_users wu
  on wu.id = ugpc.user_id
join private.user_group_posts ugp
  on ugp.id = ugpc.post_id
left join public.workspace_user_groups wug
  on wug.id = ugp.group_id
left join public.sent_emails se
  on se.id = ugpc.email_id
where wu.email !~~* '%@easy%'::text;

create unique index if not exists posts_dashboard_view_post_user_idx
  on private.posts_dashboard_view (post_id, user_id);
create index if not exists posts_dashboard_view_ws_id_idx
  on private.posts_dashboard_view (ws_id);
create index if not exists posts_dashboard_view_created_at_idx
  on private.posts_dashboard_view (created_at desc);
create index if not exists posts_dashboard_view_user_id_idx
  on private.posts_dashboard_view (user_id);
create index if not exists posts_dashboard_view_group_id_idx
  on private.posts_dashboard_view (group_id);
create index if not exists posts_dashboard_view_email_id_idx
  on private.posts_dashboard_view (email_id);
create index if not exists posts_dashboard_view_ws_id_created_at_idx
  on private.posts_dashboard_view (ws_id, created_at desc);
create index if not exists posts_dashboard_view_ws_id_user_id_idx
  on private.posts_dashboard_view (ws_id, user_id);
create index if not exists posts_dashboard_view_ws_id_group_id_idx
  on private.posts_dashboard_view (ws_id, group_id);

revoke all on private.posts_dashboard_view from anon, authenticated;
grant select on private.posts_dashboard_view to service_role;

create or replace function private.refresh_posts_dashboard_view()
returns void
language plpgsql
security definer
set search_path to private, public, pg_temp
as $$
begin
  refresh materialized view concurrently private.posts_dashboard_view;
end;
$$;

revoke all on function private.refresh_posts_dashboard_view()
  from public, anon, authenticated;
grant execute on function private.refresh_posts_dashboard_view() to service_role;

drop function if exists public.trigger_refresh_posts_dashboard_view();
drop function if exists public.refresh_posts_dashboard_view();

do $$
declare
  activity_feed_ddl text;
begin
  if to_regprocedure('private.user_group_activity_feed(uuid,timestamptz,timestamptz)') is not null then
    select pg_get_functiondef(
      'private.user_group_activity_feed(uuid,timestamptz,timestamptz)'::regprocedure
    )
      into activity_feed_ddl;

    activity_feed_ddl := replace(
      activity_feed_ddl,
      'left join public.user_group_posts post_record',
      'left join private.user_group_posts post_record'
    );
    activity_feed_ddl := replace(
      activity_feed_ddl,
      'audit_log.table_name in (
            ''external_user_monthly_reports'',',
      'audit_log.table_name in (
            ''user_group_posts'',
            ''user_group_post_logs'',
            ''user_group_post_checks'',
            ''external_user_monthly_reports'','
    );

    execute activity_feed_ddl;
  end if;
end $$;

alter function public.merge_workspace_users(uuid, uuid, uuid)
  set search_path to public, private, pg_temp;
alter function public.merge_workspace_users_phase1(uuid, uuid, uuid)
  set search_path to public, private, pg_temp;
alter function public.merge_workspace_users_phase1d(uuid, uuid, uuid)
  set search_path to public, private, pg_temp;
alter function public.merge_workspace_users_phase1d_batch(uuid, uuid, uuid, integer)
  set search_path to public, private, pg_temp;
alter function public.merge_workspace_users_phase2(uuid, uuid, uuid)
  set search_path to public, private, pg_temp;
alter function public.update_workspace_configs_with_approval_transitions(uuid, jsonb, uuid)
  set search_path to public, private, pg_temp;

revoke all on function private.get_post_workspace_id(uuid) from public, anon, authenticated;
revoke all on function private.workspace_user_groups(private.user_group_posts)
  from public, anon, authenticated;
revoke all on function private.workspace_users(private.user_group_post_checks)
  from public, anon, authenticated;
revoke all on function private.workspace_users(private.user_group_posts)
  from public, anon, authenticated;
revoke all on function private.log_post_change() from public, anon, authenticated;
revoke all on function private.handle_post_approval() from public, anon, authenticated;
revoke all on function private.notify_post_approval_change() from public, anon, authenticated;
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
revoke all on function private.get_user_group_post_status_summary(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function private.get_user_group_post_recipient_rows(uuid, uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function private.get_workspace_post_email_rows(
  uuid, uuid[], uuid[], uuid, text, approval_status, timestamptz, integer, integer
) from public, anon, authenticated;
revoke all on function private.get_workspace_post_email_status_summary(
  uuid, uuid[], uuid[], uuid, timestamptz, text
) from public, anon, authenticated;
revoke all on function private.reconcile_orphaned_approved_post_email_queue(
  timestamptz, integer, integer, uuid
) from public, anon, authenticated;

grant execute on function private.get_post_workspace_id(uuid) to service_role;
grant execute on function private.workspace_user_groups(private.user_group_posts)
  to service_role;
grant execute on function private.workspace_users(private.user_group_post_checks)
  to service_role;
grant execute on function private.workspace_users(private.user_group_posts)
  to service_role;
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
grant execute on function private.get_user_group_post_status_summary(uuid, uuid, uuid)
  to service_role;
grant execute on function private.get_user_group_post_recipient_rows(uuid, uuid, uuid, text)
  to service_role;
grant execute on function private.get_workspace_post_email_rows(
  uuid, uuid[], uuid[], uuid, text, approval_status, timestamptz, integer, integer
) to service_role;
grant execute on function private.get_workspace_post_email_status_summary(
  uuid, uuid[], uuid[], uuid, timestamptz, text
) to service_role;
grant execute on function private.reconcile_orphaned_approved_post_email_queue(
  timestamptz, integer, integer, uuid
) to service_role;

notify pgrst, 'reload schema';
