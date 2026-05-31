begin;

drop view if exists public.time_tracking_request_activity_with_users;

drop policy if exists "Allow creators and managers to view images from their time trac"
on storage.objects;

drop policy if exists "Allow creators to upload to their time tracking request folder"
on storage.objects;

alter table if exists public.time_tracking_request_activity
  set schema private;

alter table if exists public.time_tracking_request_comments
  set schema private;

alter table if exists public.time_tracking_requests
  set schema private;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'private'
      and tablename in (
        'time_tracking_request_activity',
        'time_tracking_request_comments',
        'time_tracking_requests'
      )
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end $$;

alter table private.time_tracking_requests enable row level security;
alter table private.time_tracking_request_comments enable row level security;
alter table private.time_tracking_request_activity enable row level security;

revoke all on table private.time_tracking_requests from anon, authenticated, public;
revoke all on table private.time_tracking_request_comments from anon, authenticated, public;
revoke all on table private.time_tracking_request_activity from anon, authenticated, public;

grant all on table private.time_tracking_requests to service_role;
grant all on table private.time_tracking_request_comments to service_role;
grant all on table private.time_tracking_request_activity to service_role;

create policy "Service role can manage private time tracking requests"
on private.time_tracking_requests
for all
to service_role
using (true)
with check (true);

create policy "Service role can manage private time tracking request comments"
on private.time_tracking_request_comments
for all
to service_role
using (true)
with check (true);

create policy "Service role can manage private time tracking request activity"
on private.time_tracking_request_activity
for all
to service_role
using (true)
with check (true);

create or replace function private.can_view_request_comments(
  p_request_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = private, public, pg_temp
as $function$
declare
  v_request record;
begin
  select user_id, workspace_id
  into v_request
  from private.time_tracking_requests
  where id = p_request_id;

  if v_request is null then
    return false;
  end if;

  if v_request.user_id = p_user_id then
    return true;
  end if;

  if public.has_workspace_permission(
    v_request.workspace_id,
    p_user_id,
    'manage_time_tracking_requests'::text
  ) then
    return true;
  end if;

  return false;
end;
$function$;

create or replace function private.check_time_tracking_request_update()
returns trigger
language plpgsql
set search_path = private, public, pg_temp
as $function$
declare
  v_actor_override text := nullif(
    current_setting('time_tracking.override_auth_uid', true),
    ''
  );
  v_actor_id uuid := coalesce(v_actor_override::uuid, auth.uid());
  v_has_manage_permission boolean;
  v_content_changed boolean;
  v_status_changed boolean;
  v_status_change_grace_period_minutes integer := 0;
  v_can_reject_approved boolean := false;
  v_can_approve_rejected boolean := false;
begin
  if current_setting('time_tracking.bypass_approval_rules', true) = 'on' then
    return new;
  end if;

  if v_actor_id is null then
    raise exception 'User authentication required for time tracking request updates';
  end if;

  v_has_manage_permission := public.has_workspace_permission(
    new.workspace_id,
    v_actor_id,
    'manage_time_tracking_requests'::text
  );

  v_content_changed := (
    new.title <> old.title
    or new.description is distinct from old.description
    or new.start_time <> old.start_time
    or new.end_time <> old.end_time
    or new.task_id is distinct from old.task_id
    or new.category_id is distinct from old.category_id
    or new.images is distinct from old.images
  );

  v_status_changed := (new.approval_status <> old.approval_status);

  if not v_status_changed then
    if new.linked_session_id is distinct from old.linked_session_id
      or new.approved_by is distinct from old.approved_by
      or new.approved_at is distinct from old.approved_at
      or new.rejected_by is distinct from old.rejected_by
      or new.rejected_at is distinct from old.rejected_at
      or new.rejection_reason is distinct from old.rejection_reason
      or new.needs_info_requested_by is distinct from old.needs_info_requested_by
      or new.needs_info_requested_at is distinct from old.needs_info_requested_at
      or new.needs_info_reason is distinct from old.needs_info_reason then
      raise exception 'Cannot modify system-managed request fields without an approval status transition';
    end if;
  else
    if new.approved_by is distinct from old.approved_by
      or new.approved_at is distinct from old.approved_at then
      if not (
        new.approval_status = 'APPROVED'
        or (
          old.approval_status = 'APPROVED'
          and new.approval_status = 'REJECTED'
          and new.approved_by is null
          and new.approved_at is null
        )
      ) then
        raise exception 'Approval audit fields can only change when transitioning to APPROVED or clearing APPROVED -> REJECTED';
      end if;
    end if;

    if new.rejected_by is distinct from old.rejected_by
      or new.rejected_at is distinct from old.rejected_at
      or new.rejection_reason is distinct from old.rejection_reason then
      if not (
        new.approval_status = 'REJECTED'
        or (
          old.approval_status = 'REJECTED'
          and new.approval_status = 'APPROVED'
          and new.rejected_by is null
          and new.rejected_at is null
          and new.rejection_reason is null
        )
      ) then
        raise exception 'Rejection audit fields can only change when transitioning to REJECTED or clearing REJECTED -> APPROVED';
      end if;
    end if;

    if new.needs_info_requested_by is distinct from old.needs_info_requested_by
      or new.needs_info_requested_at is distinct from old.needs_info_requested_at
      or new.needs_info_reason is distinct from old.needs_info_reason then
      if not (
        new.approval_status = 'NEEDS_INFO'
        or (
          old.approval_status = 'NEEDS_INFO'
          and new.approval_status = 'PENDING'
          and new.needs_info_requested_by is null
          and new.needs_info_requested_at is null
          and new.needs_info_reason is null
        )
      ) then
        raise exception 'Needs-info audit fields can only change when transitioning to NEEDS_INFO or clearing NEEDS_INFO -> PENDING';
      end if;
    end if;

    if new.linked_session_id is distinct from old.linked_session_id then
      if not (
        new.approval_status = 'APPROVED'
        or (
          old.approval_status = 'APPROVED'
          and new.approval_status = 'REJECTED'
          and new.linked_session_id is null
        )
      ) then
        raise exception 'linked_session_id can only change when approving or when reverting APPROVED to REJECTED';
      end if;
    end if;
  end if;

  if v_status_changed
    and (
      (new.approval_status = 'REJECTED' and old.approval_status = 'APPROVED')
      or (new.approval_status = 'APPROVED' and old.approval_status = 'REJECTED')
    ) then
    select coalesce(
      (
        select value::integer
        from public.workspace_configs
        where ws_id = new.workspace_id
          and id = 'TIME_TRACKING_REQUEST_STATUS_CHANGE_GRACE_PERIOD_MINUTES'
          and value ~ '^[0-9]+$'
        limit 1
      ),
      0
    )
    into v_status_change_grace_period_minutes;

    v_can_reject_approved := (
      new.approval_status = 'REJECTED'
      and old.approval_status = 'APPROVED'
      and v_status_change_grace_period_minutes > 0
      and old.approved_at is not null
      and now() <= (old.approved_at + make_interval(mins => v_status_change_grace_period_minutes))
    );

    v_can_approve_rejected := (
      new.approval_status = 'APPROVED'
      and old.approval_status = 'REJECTED'
      and v_status_change_grace_period_minutes > 0
      and old.rejected_at is not null
      and now() <= (old.rejected_at + make_interval(mins => v_status_change_grace_period_minutes))
    );
  end if;

  if new.user_id <> old.user_id
    or new.workspace_id <> old.workspace_id
    or new.created_at <> old.created_at then
    raise exception 'Cannot modify ownership or creation fields';
  end if;

  if new.user_id <> v_actor_id and not v_has_manage_permission then
    raise exception 'Only approvers can update requests submitted by other users';
  end if;

  if v_has_manage_permission then
    if new.user_id <> v_actor_id and v_content_changed then
      raise exception 'Approvers cannot modify request content fields';
    end if;

    if new.user_id = v_actor_id and v_content_changed and v_status_changed then
      raise exception 'Cannot modify content and change approval status in the same update';
    end if;

    if v_status_changed then
      if new.approval_status = 'APPROVED' then
        if old.approval_status <> 'PENDING' and not v_can_approve_rejected then
          raise exception 'Can only approve from PENDING status';
        end if;
        if new.approved_by <> v_actor_id or new.approved_at is null then
          raise exception 'Invalid approval data';
        end if;
        if new.rejected_by is not null
          or new.rejected_at is not null
          or new.rejection_reason is not null then
          raise exception 'Cannot have rejection data when approving';
        end if;
        if new.needs_info_requested_by is not null
          or new.needs_info_requested_at is not null
          or new.needs_info_reason is not null then
          raise exception 'Cannot have needs_info data when approving';
        end if;
      elsif new.approval_status = 'REJECTED' then
        if old.approval_status = 'APPROVED' then
          if not v_can_reject_approved then
            raise exception 'Can only reject approved requests within the configured grace period';
          end if;
        elsif old.approval_status <> 'PENDING' then
          raise exception 'Can only reject from PENDING status';
        end if;
        if new.rejected_by <> v_actor_id
          or new.rejected_at is null
          or new.rejection_reason is null then
          raise exception 'Invalid rejection data';
        end if;
        if new.approved_by is not null or new.approved_at is not null then
          raise exception 'Cannot have approval data when rejecting';
        end if;
        if new.needs_info_requested_by is not null
          or new.needs_info_requested_at is not null
          or new.needs_info_reason is not null then
          raise exception 'Cannot have needs_info data when rejecting';
        end if;
      elsif new.approval_status = 'NEEDS_INFO' then
        if old.approval_status <> 'PENDING' then
          raise exception 'Can only request more info from PENDING status';
        end if;
        if new.needs_info_requested_by <> v_actor_id
          or new.needs_info_requested_at is null
          or new.needs_info_reason is null then
          raise exception 'Invalid needs_info data';
        end if;
        if new.approved_by is not null or new.approved_at is not null then
          raise exception 'Cannot have approval data when requesting info';
        end if;
        if new.rejected_by is not null
          or new.rejected_at is not null
          or new.rejection_reason is not null then
          raise exception 'Cannot have rejection data when requesting info';
        end if;
      elsif new.approval_status = 'PENDING' then
        if old.approval_status <> 'NEEDS_INFO' then
          raise exception 'Can only resubmit to PENDING from NEEDS_INFO status';
        end if;
        if new.needs_info_requested_by is not null
          or new.needs_info_requested_at is not null
          or new.needs_info_reason is not null then
          raise exception 'Needs info fields must be cleared when resubmitting';
        end if;
        if new.approved_by is not null or new.approved_at is not null then
          raise exception 'Cannot have approval data when resubmitting';
        end if;
        if new.rejected_by is not null
          or new.rejected_at is not null
          or new.rejection_reason is not null then
          raise exception 'Cannot have rejection data when resubmitting';
        end if;
      else
        raise exception 'Invalid approval status transition';
      end if;
    end if;

    return new;
  end if;

  if v_status_changed then
    raise exception 'Request owners cannot change approval status';
  end if;

  if not v_content_changed then
    raise exception 'No editable request fields changed';
  end if;

  if old.approval_status <> 'PENDING'
    and old.approval_status <> 'NEEDS_INFO' then
    raise exception 'Only pending or needs-info requests can be edited';
  end if;

  if new.approved_by is distinct from old.approved_by
    or new.approved_at is distinct from old.approved_at
    or new.rejected_by is distinct from old.rejected_by
    or new.rejected_at is distinct from old.rejected_at
    or new.rejection_reason is distinct from old.rejection_reason
    or new.needs_info_requested_by is distinct from old.needs_info_requested_by
    or new.needs_info_requested_at is distinct from old.needs_info_requested_at
    or new.needs_info_reason is distinct from old.needs_info_reason
    or new.linked_session_id is distinct from old.linked_session_id then
    raise exception 'Request owners cannot modify approval metadata';
  end if;

  return new;
end;
$function$;

create or replace function private.handle_request_status_change()
returns trigger
language plpgsql
security definer
set search_path = private, public, pg_temp
as $function$
begin
  if old.approval_status = new.approval_status then
    return new;
  end if;

  if new.linked_session_id is not null then
    if new.approval_status = 'APPROVED' then
      update public.time_tracking_sessions
      set pending_approval = false,
          updated_at = now()
      where id = new.linked_session_id;
    elsif new.approval_status = 'REJECTED' then
      delete from public.time_tracking_sessions
      where id = new.linked_session_id;

      new.linked_session_id := null;
    end if;
  end if;

  return new;
end;
$function$;

create or replace function private.log_time_tracking_comment_activity()
returns trigger
language plpgsql
security definer
set search_path = private, public, pg_temp
as $function$
declare
  v_actor_override text := nullif(
    current_setting('time_tracking.override_auth_uid', true),
    ''
  );
  v_actor_id uuid;
begin
  if tg_op = 'INSERT' then
    v_actor_id := coalesce(v_actor_override::uuid, auth.uid(), new.user_id);

    insert into private.time_tracking_request_activity (
      request_id,
      action_type,
      actor_id,
      comment_id,
      comment_content
    ) values (
      new.request_id,
      'COMMENT_ADDED',
      v_actor_id,
      new.id,
      new.content
    );
  elsif tg_op = 'UPDATE' then
    v_actor_id := coalesce(v_actor_override::uuid, auth.uid(), new.user_id);

    if old.content is distinct from new.content then
      insert into private.time_tracking_request_activity (
        request_id,
        action_type,
        actor_id,
        comment_id,
        comment_content,
        changed_fields
      ) values (
        new.request_id,
        'COMMENT_UPDATED',
        v_actor_id,
        new.id,
        new.content,
        jsonb_build_object(
          'content',
          jsonb_build_object('old', old.content, 'new', new.content)
        )
      );
    end if;
  elsif tg_op = 'DELETE' then
    v_actor_id := coalesce(v_actor_override::uuid, auth.uid(), old.user_id);

    insert into private.time_tracking_request_activity (
      request_id,
      action_type,
      actor_id,
      comment_id,
      comment_content
    ) values (
      old.request_id,
      'COMMENT_DELETED',
      v_actor_id,
      null,
      old.content
    );
  end if;

  return coalesce(new, old);
end;
$function$;

create or replace function private.log_time_tracking_request_creation()
returns trigger
language plpgsql
security definer
set search_path = private, public, pg_temp
as $function$
begin
  insert into private.time_tracking_request_activity (
    request_id,
    action_type,
    actor_id,
    new_status,
    metadata
  ) values (
    new.id,
    'CREATED',
    new.user_id,
    new.approval_status::text,
    jsonb_build_object(
      'title', new.title,
      'start_time', new.start_time,
      'end_time', new.end_time
    )
  );

  return new;
end;
$function$;

create or replace function private.log_time_tracking_request_update()
returns trigger
language plpgsql
security definer
set search_path = private, public, pg_temp
as $function$
declare
  v_changed_fields jsonb := '{}'::jsonb;
  v_status_changed boolean := false;
  v_content_changed boolean := false;
  v_actor_override text := nullif(
    current_setting('time_tracking.override_auth_uid', true),
    ''
  );
  v_actor_id uuid := coalesce(v_actor_override::uuid, auth.uid());
begin
  if old.approval_status is distinct from new.approval_status then
    v_status_changed := true;
  end if;

  if old.title is distinct from new.title then
    v_changed_fields := jsonb_set(
      v_changed_fields,
      '{title}',
      jsonb_build_object('old', old.title, 'new', new.title)
    );
    v_content_changed := true;
  end if;

  if old.description is distinct from new.description then
    v_changed_fields := jsonb_set(
      v_changed_fields,
      '{description}',
      jsonb_build_object('old', old.description, 'new', new.description)
    );
    v_content_changed := true;
  end if;

  if old.start_time is distinct from new.start_time then
    v_changed_fields := jsonb_set(
      v_changed_fields,
      '{start_time}',
      jsonb_build_object('old', old.start_time, 'new', new.start_time)
    );
    v_content_changed := true;
  end if;

  if old.end_time is distinct from new.end_time then
    v_changed_fields := jsonb_set(
      v_changed_fields,
      '{end_time}',
      jsonb_build_object('old', old.end_time, 'new', new.end_time)
    );
    v_content_changed := true;
  end if;

  if old.task_id is distinct from new.task_id then
    v_changed_fields := jsonb_set(
      v_changed_fields,
      '{task_id}',
      jsonb_build_object('old', old.task_id, 'new', new.task_id)
    );
    v_content_changed := true;
  end if;

  if old.category_id is distinct from new.category_id then
    v_changed_fields := jsonb_set(
      v_changed_fields,
      '{category_id}',
      jsonb_build_object('old', old.category_id, 'new', new.category_id)
    );
    v_content_changed := true;
  end if;

  if old.images is distinct from new.images then
    v_changed_fields := jsonb_set(
      v_changed_fields,
      '{images}',
      jsonb_build_object('old', old.images, 'new', new.images)
    );
    v_content_changed := true;
  end if;

  if (v_status_changed or v_content_changed) and v_actor_id is null then
    raise exception 'User authentication required for time tracking request activity updates';
  end if;

  if v_status_changed then
    insert into private.time_tracking_request_activity (
      request_id,
      action_type,
      actor_id,
      previous_status,
      new_status,
      feedback_reason,
      metadata
    ) values (
      new.id,
      'STATUS_CHANGED',
      v_actor_id,
      old.approval_status::text,
      new.approval_status::text,
      case
        when new.approval_status::text = 'NEEDS_INFO'
          and new.needs_info_reason is not null then new.needs_info_reason
        when new.approval_status::text = 'REJECTED'
          and new.rejection_reason is not null then new.rejection_reason
        else null
      end,
      jsonb_build_object(
        'approved_by', new.approved_by,
        'rejected_by', new.rejected_by,
        'needs_info_requested_by', new.needs_info_requested_by
      )
    );
  end if;

  if v_content_changed then
    insert into private.time_tracking_request_activity (
      request_id,
      action_type,
      actor_id,
      changed_fields
    ) values (
      new.id,
      'CONTENT_UPDATED',
      v_actor_id,
      v_changed_fields
    );
  end if;

  return new;
end;
$function$;

create or replace function private.notify_time_tracking_request_status_change()
returns trigger
language plpgsql
security definer
set search_path = private, public, pg_temp
as $function$
declare
  v_request_title text;
  v_actor_override text := nullif(
    current_setting('time_tracking.override_auth_uid', true),
    ''
  );
  v_actor_id uuid;
  v_actor_name text;
  v_data jsonb;
  v_recipient record;
begin
  if old.approval_status is not distinct from new.approval_status then
    return new;
  end if;

  v_request_title := coalesce(nullif(new.title, ''), 'Untitled Request');
  v_actor_id := coalesce(
    v_actor_override::uuid,
    auth.uid(),
    new.approved_by,
    new.rejected_by,
    new.needs_info_requested_by,
    new.user_id
  );

  select coalesce(nullif(display_name, ''), 'Someone')
  into v_actor_name
  from public.users
  where id = v_actor_id;

  v_actor_name := coalesce(v_actor_name, 'Someone');

  if old.approval_status = 'NEEDS_INFO'
    and new.approval_status = 'PENDING' then
    v_data := jsonb_build_object(
      'request_id', new.id,
      'request_title', v_request_title,
      'approval_status', new.approval_status,
      'previous_status', old.approval_status,
      'start_time', new.start_time,
      'end_time', new.end_time,
      'requester_name', v_actor_name
    );

    for v_recipient in
      select wm.user_id
      from public.workspace_members wm
      where wm.ws_id = new.workspace_id
        and wm.user_id <> new.user_id
        and public.has_workspace_permission(
          new.workspace_id,
          wm.user_id,
          'manage_time_tracking_requests'
        )
    loop
      perform public.create_notification(
        p_ws_id := new.workspace_id,
        p_user_id := v_recipient.user_id,
        p_type := 'time_tracking_request_resubmitted',
        p_title := 'Time tracking request resubmitted',
        p_description := v_actor_name || ' resubmitted "' || v_request_title || '" for approval',
        p_data := v_data,
        p_entity_type := 'time_tracking_request',
        p_entity_id := new.id,
        p_created_by := new.user_id
      );
    end loop;

    return new;
  end if;

  if new.user_id = v_actor_id then
    return new;
  end if;

  if new.approval_status = 'APPROVED' then
    v_data := jsonb_build_object(
      'request_id', new.id,
      'request_title', v_request_title,
      'approval_status', new.approval_status,
      'approved_at', new.approved_at,
      'reviewer_name', v_actor_name
    );

    perform public.create_notification(
      p_ws_id := new.workspace_id,
      p_user_id := new.user_id,
      p_type := 'time_tracking_request_approved',
      p_title := 'Time tracking request approved',
      p_description := v_actor_name || ' approved "' || v_request_title || '"',
      p_data := v_data,
      p_entity_type := 'time_tracking_request',
      p_entity_id := new.id,
      p_created_by := v_actor_id
    );
  elsif new.approval_status = 'REJECTED' then
    v_data := jsonb_build_object(
      'request_id', new.id,
      'request_title', v_request_title,
      'approval_status', new.approval_status,
      'rejected_at', new.rejected_at,
      'reviewer_name', v_actor_name,
      'rejection_reason', new.rejection_reason
    );

    perform public.create_notification(
      p_ws_id := new.workspace_id,
      p_user_id := new.user_id,
      p_type := 'time_tracking_request_rejected',
      p_title := 'Time tracking request rejected',
      p_description := v_actor_name || ' rejected "' || v_request_title || '"',
      p_data := v_data,
      p_entity_type := 'time_tracking_request',
      p_entity_id := new.id,
      p_created_by := v_actor_id
    );
  elsif new.approval_status = 'NEEDS_INFO' then
    v_data := jsonb_build_object(
      'request_id', new.id,
      'request_title', v_request_title,
      'approval_status', new.approval_status,
      'needs_info_requested_at', new.needs_info_requested_at,
      'reviewer_name', v_actor_name,
      'needs_info_reason', new.needs_info_reason
    );

    perform public.create_notification(
      p_ws_id := new.workspace_id,
      p_user_id := new.user_id,
      p_type := 'time_tracking_request_needs_info',
      p_title := 'Time tracking request needs more information',
      p_description := v_actor_name || ' requested more information for "' || v_request_title || '"',
      p_data := v_data,
      p_entity_type := 'time_tracking_request',
      p_entity_id := new.id,
      p_created_by := v_actor_id
    );
  end if;

  return new;
end;
$function$;

create or replace function private.notify_time_tracking_request_submitted()
returns trigger
language plpgsql
security definer
set search_path = private, public, pg_temp
as $function$
declare
  v_requester_name text;
  v_request_title text;
  v_recipient record;
  v_data jsonb;
begin
  v_request_title := coalesce(nullif(new.title, ''), 'Untitled Request');

  select coalesce(nullif(display_name, ''), 'Someone')
  into v_requester_name
  from public.users
  where id = new.user_id;

  v_requester_name := coalesce(v_requester_name, 'Someone');

  v_data := jsonb_build_object(
    'request_id', new.id,
    'request_title', v_request_title,
    'approval_status', new.approval_status,
    'start_time', new.start_time,
    'end_time', new.end_time,
    'requester_name', v_requester_name
  );

  for v_recipient in
    select wm.user_id
    from public.workspace_members wm
    where wm.ws_id = new.workspace_id
      and wm.user_id <> new.user_id
      and public.has_workspace_permission(
        new.workspace_id,
        wm.user_id,
        'manage_time_tracking_requests'
      )
  loop
    perform public.create_notification(
      p_ws_id := new.workspace_id,
      p_user_id := v_recipient.user_id,
      p_type := 'time_tracking_request_submitted',
      p_title := 'Time tracking request submitted',
      p_description := v_requester_name || ' submitted "' || v_request_title || '" for approval',
      p_data := v_data,
      p_entity_type := 'time_tracking_request',
      p_entity_id := new.id,
      p_created_by := new.user_id
    );
  end loop;

  return new;
end;
$function$;

create or replace function private.update_time_tracking_request(
  p_request_id uuid,
  p_action text,
  p_workspace_id uuid,
  p_actor_auth_uid uuid,
  p_rejection_reason text default null::text,
  p_needs_info_reason text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
as $function$
declare
  v_request private.time_tracking_requests%rowtype;
  v_session_id uuid;
  v_duration_seconds integer;
  v_actor_id uuid := p_actor_auth_uid;
  v_is_workspace_member boolean := false;
  v_has_manage_permission boolean := false;
  v_can_bypass boolean := false;
  v_status_change_grace_period_minutes integer := 0;
  v_approved_to_rejected_allowed boolean := false;
  v_rejected_to_approved_allowed boolean := false;
begin
  if v_actor_id is null then
    raise exception 'Unauthorized';
  end if;

  select exists (
    select 1
    from public.workspace_members
    where ws_id = p_workspace_id
      and user_id = v_actor_id
  )
  into v_is_workspace_member;

  if not v_is_workspace_member then
    raise exception 'Workspace access denied';
  end if;

  v_has_manage_permission := public.has_workspace_permission(
    p_workspace_id,
    v_actor_id,
    'manage_time_tracking_requests'
  );

  v_can_bypass := public.has_workspace_permission(
    p_workspace_id,
    v_actor_id,
    'bypass_time_tracking_request_approval'
  );

  select coalesce(
    (
      select value::integer
      from public.workspace_configs
      where ws_id = p_workspace_id
        and id = 'TIME_TRACKING_REQUEST_STATUS_CHANGE_GRACE_PERIOD_MINUTES'
        and value ~ '^[0-9]+$'
      limit 1
    ),
    0
  )
  into v_status_change_grace_period_minutes;

  select *
  into v_request
  from private.time_tracking_requests
  where id = p_request_id
    and workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'Time tracking request not found';
  end if;

  if p_action in ('approve', 'reject', 'needs_info')
    and not v_has_manage_permission then
    raise exception 'You do not have permission to manage time tracking requests';
  end if;

  v_approved_to_rejected_allowed := (
    v_request.approval_status = 'APPROVED'
    and v_status_change_grace_period_minutes > 0
    and v_request.approved_at is not null
    and now() <= (
      v_request.approved_at
      + make_interval(mins => v_status_change_grace_period_minutes)
    )
  );

  v_rejected_to_approved_allowed := (
    v_request.approval_status = 'REJECTED'
    and v_status_change_grace_period_minutes > 0
    and v_request.rejected_at is not null
    and now() <= (
      v_request.rejected_at
      + make_interval(mins => v_status_change_grace_period_minutes)
    )
  );

  perform set_config('time_tracking.override_auth_uid', v_actor_id::text, true);

  if p_action = 'approve' then
    if v_request.approval_status <> 'PENDING'
      and not v_rejected_to_approved_allowed then
      if v_request.approval_status = 'REJECTED' then
        raise exception 'Status change grace period has expired';
      end if;

      raise exception 'Request has already been %', lower(v_request.approval_status);
    end if;

    if not v_can_bypass and v_request.user_id = v_actor_id then
      raise exception 'Request owner cannot approve their own request';
    end if;

    perform set_config('time_tracking.bypass_approval_rules', 'on', true);

    v_duration_seconds := extract(
      epoch from (v_request.end_time - v_request.start_time)
    )::integer;

    perform set_config('time_tracking.bypass_insert_limit', 'on', true);

    if v_request.linked_session_id is not null then
      v_session_id := v_request.linked_session_id;
    else
      insert into public.time_tracking_sessions (
        ws_id,
        user_id,
        title,
        description,
        category_id,
        task_id,
        start_time,
        end_time,
        duration_seconds
      ) values (
        v_request.workspace_id,
        v_request.user_id,
        v_request.title,
        v_request.description,
        v_request.category_id,
        v_request.task_id,
        v_request.start_time,
        v_request.end_time,
        v_duration_seconds
      )
      returning id into v_session_id;
    end if;

    update private.time_tracking_requests
    set approval_status = 'APPROVED',
        approved_by = v_actor_id,
        approved_at = now(),
        rejected_by = null,
        rejected_at = null,
        rejection_reason = null,
        linked_session_id = coalesce(linked_session_id, v_session_id),
        needs_info_requested_by = null,
        needs_info_requested_at = null,
        needs_info_reason = null,
        updated_at = now()
    where id = p_request_id
      and workspace_id = p_workspace_id;

    return jsonb_build_object(
      'success', true,
      'message', 'Request approved and time tracking session created',
      'session_id', v_session_id
    );
  elsif p_action = 'reject' then
    if v_request.approval_status <> 'PENDING'
      and not v_approved_to_rejected_allowed then
      if v_request.approval_status = 'APPROVED' then
        raise exception 'Status change grace period has expired';
      end if;

      raise exception 'Request has already been %', lower(v_request.approval_status);
    end if;

    if p_rejection_reason is null or trim(p_rejection_reason) = '' then
      raise exception 'Rejection reason is required';
    end if;

    if not v_can_bypass and v_request.user_id = v_actor_id then
      raise exception 'Request owner cannot reject their own request';
    end if;

    perform set_config('time_tracking.bypass_approval_rules', 'on', true);

    v_session_id := v_request.linked_session_id;

    if v_session_id is not null then
      delete from public.time_tracking_sessions
      where id = v_session_id
        and ws_id = p_workspace_id;
    end if;

    update private.time_tracking_requests
    set approval_status = 'REJECTED',
        approved_by = null,
        approved_at = null,
        rejected_by = v_actor_id,
        rejected_at = now(),
        rejection_reason = p_rejection_reason,
        linked_session_id = null,
        needs_info_requested_by = null,
        needs_info_requested_at = null,
        needs_info_reason = null,
        updated_at = now()
    where id = p_request_id
      and workspace_id = p_workspace_id;

    return jsonb_build_object(
      'success', true,
      'message', 'Request rejected'
    );
  elsif p_action = 'needs_info' then
    if v_request.approval_status <> 'PENDING' then
      raise exception 'Can only request more info from PENDING status, current status: %',
        v_request.approval_status;
    end if;

    if p_needs_info_reason is null or trim(p_needs_info_reason) = '' then
      raise exception 'Reason for requesting more information is required';
    end if;

    if not v_can_bypass and v_request.user_id = v_actor_id then
      raise exception 'Request owner cannot request info on their own request';
    end if;

    perform set_config('time_tracking.bypass_approval_rules', 'on', true);

    update private.time_tracking_requests
    set approval_status = 'NEEDS_INFO',
        needs_info_requested_by = v_actor_id,
        needs_info_requested_at = now(),
        needs_info_reason = p_needs_info_reason,
        updated_at = now()
    where id = p_request_id
      and workspace_id = p_workspace_id;

    return jsonb_build_object(
      'success', true,
      'message', 'Request marked as needing more information'
    );
  elsif p_action = 'resubmit' then
    if v_request.approval_status <> 'NEEDS_INFO' then
      raise exception 'Can only resubmit from NEEDS_INFO status, current status: %',
        v_request.approval_status;
    end if;

    if v_request.user_id <> v_actor_id then
      raise exception 'Only the request owner can resubmit the request';
    end if;

    perform set_config('time_tracking.bypass_approval_rules', 'on', true);

    update private.time_tracking_requests
    set approval_status = 'PENDING',
        needs_info_requested_by = null,
        needs_info_requested_at = null,
        needs_info_reason = null,
        updated_at = now()
    where id = p_request_id
      and workspace_id = p_workspace_id;

    return jsonb_build_object(
      'success', true,
      'message', 'Request resubmitted for approval'
    );
  else
    raise exception 'Invalid action. Must be "approve", "reject", "needs_info", or "resubmit"';
  end if;
end;
$function$;

create or replace function private.update_time_tracking_request_content(
  p_request_id uuid,
  p_workspace_id uuid,
  p_actor_auth_uid uuid,
  p_title text,
  p_description text default null::text,
  p_start_time timestamptz default null::timestamptz,
  p_end_time timestamptz default null::timestamptz,
  p_images text[] default null::text[]
)
returns private.time_tracking_requests
language plpgsql
security definer
set search_path = private, public, pg_temp
as $function$
declare
  v_request private.time_tracking_requests%rowtype;
  v_updated_request private.time_tracking_requests%rowtype;
  v_is_workspace_member boolean := false;
begin
  if p_actor_auth_uid is null then
    raise exception 'Unauthorized';
  end if;

  select exists (
    select 1
    from public.workspace_members
    where ws_id = p_workspace_id
      and user_id = p_actor_auth_uid
  )
  into v_is_workspace_member;

  if not v_is_workspace_member then
    raise exception 'Workspace access denied';
  end if;

  select *
  into v_request
  from private.time_tracking_requests
  where id = p_request_id
    and workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'Time tracking request not found';
  end if;

  if v_request.user_id <> p_actor_auth_uid then
    raise exception 'Only the request owner can edit this request';
  end if;

  if v_request.approval_status not in ('PENDING', 'NEEDS_INFO') then
    raise exception 'Request can only be edited when status is Pending or Needs Info';
  end if;

  perform set_config(
    'time_tracking.override_auth_uid',
    p_actor_auth_uid::text,
    true
  );

  update private.time_tracking_requests
  set title = p_title,
      description = p_description,
      start_time = p_start_time,
      end_time = p_end_time,
      images = case
        when p_images is null or cardinality(p_images) = 0 then null
        else p_images
      end,
      updated_at = now()
  where id = p_request_id
    and workspace_id = p_workspace_id
  returning *
  into v_updated_request;

  return v_updated_request;
end;
$function$;

drop trigger if exists enforce_time_tracking_request_update
on private.time_tracking_requests;

drop trigger if exists trg_notify_time_tracking_request_status_change
on private.time_tracking_requests;

drop trigger if exists trg_notify_time_tracking_request_submitted
on private.time_tracking_requests;

drop trigger if exists trigger_handle_request_status_change
on private.time_tracking_requests;

drop trigger if exists trigger_log_request_creation
on private.time_tracking_requests;

drop trigger if exists trigger_log_request_update
on private.time_tracking_requests;

drop trigger if exists trigger_log_comment_activity
on private.time_tracking_request_comments;

create trigger enforce_time_tracking_request_update
before update on private.time_tracking_requests
for each row
execute function private.check_time_tracking_request_update();

create trigger trigger_handle_request_status_change
before update on private.time_tracking_requests
for each row
execute function private.handle_request_status_change();

create trigger trg_notify_time_tracking_request_status_change
after update on private.time_tracking_requests
for each row
when (old.approval_status is distinct from new.approval_status)
execute function private.notify_time_tracking_request_status_change();

create trigger trg_notify_time_tracking_request_submitted
after insert on private.time_tracking_requests
for each row
execute function private.notify_time_tracking_request_submitted();

create trigger trigger_log_request_creation
after insert on private.time_tracking_requests
for each row
execute function private.log_time_tracking_request_creation();

create trigger trigger_log_request_update
after update on private.time_tracking_requests
for each row
execute function private.log_time_tracking_request_update();

create trigger trigger_log_comment_activity
after insert or update or delete on private.time_tracking_request_comments
for each row
execute function private.log_time_tracking_comment_activity();

create or replace view private.time_tracking_requests_with_details
with (security_invoker = true)
as
select
  requests.*,
  case
    when requester.id is null then null
    else jsonb_build_object(
      'id', requester.id,
      'display_name', requester.display_name,
      'avatar_url', requester.avatar_url,
      'user_private_details', coalesce(
        (
          select jsonb_agg(jsonb_build_object('email', details.email))
          from public.user_private_details details
          where details.user_id = requester.id
        ),
        '[]'::jsonb
      )
    )
  end as "user",
  case
    when categories.id is null then null
    else jsonb_build_object(
      'id', categories.id,
      'name', categories.name,
      'color', categories.color
    )
  end as category,
  case
    when tasks.id is null then null
    else jsonb_build_object(
      'id', tasks.id,
      'name', tasks.name
    )
  end as task,
  case
    when approvers.id is null then null
    else jsonb_build_object(
      'id', approvers.id,
      'display_name', approvers.display_name
    )
  end as approved_by_user,
  case
    when rejecters.id is null then null
    else jsonb_build_object(
      'id', rejecters.id,
      'display_name', rejecters.display_name
    )
  end as rejected_by_user,
  case
    when needs_info_requesters.id is null then null
    else jsonb_build_object(
      'id', needs_info_requesters.id,
      'display_name', needs_info_requesters.display_name
    )
  end as needs_info_requested_by_user
from private.time_tracking_requests requests
left join public.users requester
  on requester.id = requests.user_id
left join public.time_tracking_categories categories
  on categories.id = requests.category_id
left join public.tasks tasks
  on tasks.id = requests.task_id
left join public.users approvers
  on approvers.id = requests.approved_by
left join public.users rejecters
  on rejecters.id = requests.rejected_by
left join public.users needs_info_requesters
  on needs_info_requesters.id = requests.needs_info_requested_by;

create or replace view private.time_tracking_request_comments_with_users
with (security_invoker = true)
as
select
  comments.*,
  case
    when users.id is null then null
    else jsonb_build_object(
      'id', users.id,
      'display_name', users.display_name,
      'avatar_url', users.avatar_url
    )
  end as "user"
from private.time_tracking_request_comments comments
left join public.users users
  on users.id = comments.user_id;

create or replace view private.time_tracking_request_activity_with_users
with (security_invoker = true)
as
select
  activity.id,
  activity.request_id,
  activity.action_type,
  activity.actor_id,
  activity.previous_status,
  activity.new_status,
  activity.feedback_reason,
  activity.changed_fields,
  activity.comment_id,
  activity.comment_content,
  activity.metadata,
  activity.created_at,
  users.display_name as actor_display_name,
  users.handle as actor_handle,
  users.avatar_url as actor_avatar_url
from private.time_tracking_request_activity activity
left join public.users users
  on activity.actor_id = users.id;

revoke all on table private.time_tracking_requests_with_details
from anon, authenticated, public;

revoke all on table private.time_tracking_request_comments_with_users
from anon, authenticated, public;

revoke all on table private.time_tracking_request_activity_with_users
from anon, authenticated, public;

grant select on table private.time_tracking_requests_with_details to service_role;
grant select on table private.time_tracking_request_comments_with_users to service_role;
grant select on table private.time_tracking_request_activity_with_users to service_role;

revoke all on function private.can_view_request_comments(uuid, uuid)
from anon, authenticated, public;

revoke all on function private.check_time_tracking_request_update()
from anon, authenticated, public;

revoke all on function private.handle_request_status_change()
from anon, authenticated, public;

revoke all on function private.log_time_tracking_comment_activity()
from anon, authenticated, public;

revoke all on function private.log_time_tracking_request_creation()
from anon, authenticated, public;

revoke all on function private.log_time_tracking_request_update()
from anon, authenticated, public;

revoke all on function private.notify_time_tracking_request_status_change()
from anon, authenticated, public;

revoke all on function private.notify_time_tracking_request_submitted()
from anon, authenticated, public;

revoke all on function private.update_time_tracking_request(
  uuid,
  text,
  uuid,
  uuid,
  text,
  text
) from anon, authenticated, public;

revoke all on function private.update_time_tracking_request_content(
  uuid,
  uuid,
  uuid,
  text,
  text,
  timestamptz,
  timestamptz,
  text[]
) from anon, authenticated, public;

grant execute on function private.can_view_request_comments(uuid, uuid)
to service_role;

grant execute on function private.check_time_tracking_request_update()
to service_role;

grant execute on function private.handle_request_status_change()
to service_role;

grant execute on function private.log_time_tracking_comment_activity()
to service_role;

grant execute on function private.log_time_tracking_request_creation()
to service_role;

grant execute on function private.log_time_tracking_request_update()
to service_role;

grant execute on function private.notify_time_tracking_request_status_change()
to service_role;

grant execute on function private.notify_time_tracking_request_submitted()
to service_role;

grant execute on function private.update_time_tracking_request(
  uuid,
  text,
  uuid,
  uuid,
  text,
  text
) to service_role;

grant execute on function private.update_time_tracking_request_content(
  uuid,
  uuid,
  uuid,
  text,
  text,
  timestamptz,
  timestamptz,
  text[]
) to service_role;

drop function if exists public.can_view_request_comments(uuid, uuid);
drop function if exists public.check_time_tracking_request_update();
drop function if exists public.handle_request_status_change();
drop function if exists public.log_time_tracking_comment_activity();
drop function if exists public.log_time_tracking_request_creation();
drop function if exists public.log_time_tracking_request_update();
drop function if exists public.notify_time_tracking_request_status_change();
drop function if exists public.notify_time_tracking_request_submitted();
drop function if exists public.update_time_tracking_request(uuid, text, uuid, text, text);
drop function if exists public.update_time_tracking_request_content(
  uuid,
  uuid,
  uuid,
  text,
  text,
  timestamptz,
  timestamptz,
  text[]
);

notify pgrst, 'reload schema';

commit;
