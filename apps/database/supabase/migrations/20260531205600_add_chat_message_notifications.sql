-- Add first-class chat message notifications for mobile push deep links.

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check check (type in (
    'task_assigned',
    'task_updated',
    'task_mention',
    'task_label_added',
    'task_label_removed',
    'task_title_changed',
    'task_description_changed',
    'task_priority_changed',
    'task_due_date_changed',
    'task_start_date_changed',
    'task_estimation_changed',
    'task_assignee_added',
    'task_assignee_removed',
    'task_project_linked',
    'task_project_unlinked',
    'task_moved',
    'task_completed',
    'task_reopened',
    'task_deleted',
    'task_restored',
    'deadline_reminder',
    'workspace_invite',
    'system_announcement',
    'account_update',
    'security_alert',
    'report_approved',
    'report_rejected',
    'post_approved',
    'post_rejected',
    'time_tracking_request_submitted',
    'time_tracking_request_resubmitted',
    'time_tracking_request_approved',
    'time_tracking_request_rejected',
    'time_tracking_request_needs_info',
    'chat_message'
  ));

comment on constraint notifications_type_check on public.notifications is
  'Validates notification types for task activity, workspace/system notices, approvals, time tracking request workflows, and chat messages.';

create or replace function private.create_chat_message_push_notification(
  p_ws_id uuid,
  p_user_id uuid,
  p_actor_user_id uuid,
  p_conversation_id uuid,
  p_message_id uuid,
  p_title text,
  p_description text default null,
  p_data jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_notification_id uuid;
  v_push_batch_id uuid;
  v_should_send_push boolean := false;
  v_is_workspace_member boolean := false;
begin
  if p_user_id is null
     or p_actor_user_id is null
     or p_user_id = p_actor_user_id then
    return null;
  end if;

  select exists (
    select 1
    from public.workspace_members
    where ws_id = p_ws_id
      and user_id = p_user_id
  )
  into v_is_workspace_member;

  if not v_is_workspace_member then
    return null;
  end if;

  v_should_send_push := public.should_send_notification(
    p_user_id,
    'chat_message',
    'push',
    'workspace'::public.notification_scope,
    p_ws_id
  );

  if not coalesce(v_should_send_push, false) then
    return null;
  end if;

  insert into public.notifications (
    ws_id,
    user_id,
    type,
    code,
    title,
    description,
    data,
    entity_type,
    entity_id,
    created_by,
    scope,
    priority
  ) values (
    p_ws_id,
    p_user_id,
    'chat_message',
    'chat_message',
    p_title,
    p_description,
    p_data || jsonb_build_object(
      'workspace_id', p_ws_id,
      'ws_id', p_ws_id,
      'conversation_id', p_conversation_id,
      'message_id', p_message_id,
      'openTarget', 'chat'
    ),
    'chat_conversation',
    p_conversation_id,
    p_actor_user_id,
    'workspace'::public.notification_scope,
    'medium'::public.notification_priority
  )
  returning id into v_notification_id;

  v_push_batch_id := public.get_or_create_notification_batch(
    p_ws_id,
    p_user_id,
    'push',
    1,
    null,
    'immediate'::public.notification_delivery_mode
  );

  insert into private.notification_delivery_log (
    notification_id,
    channel,
    status,
    batch_id
  ) values (
    v_notification_id,
    'push',
    'pending',
    v_push_batch_id
  );

  update private.notification_batches
  set notification_count = notification_count + 1
  where id = v_push_batch_id;

  return v_notification_id;
end;
$$;

revoke execute on function private.create_chat_message_push_notification(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  jsonb
) from public, anon, authenticated;

grant execute on function private.create_chat_message_push_notification(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  jsonb
) to service_role;

comment on function private.create_chat_message_push_notification(
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  jsonb
) is
  'Queues an immediate push notification for an explicit non-sender chat conversation member.';
