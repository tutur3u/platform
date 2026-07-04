import { getInternalApiClient, type InternalApiClientOptions } from './client';

export type NotificationChannel = 'web' | 'email' | 'push' | 'sms';

export type WorkspaceNotificationEventType =
  | 'task_assigned'
  | 'task_updated'
  | 'task_mention'
  | 'task_title_changed'
  | 'task_description_changed'
  | 'task_priority_changed'
  | 'task_due_date_changed'
  | 'task_start_date_changed'
  | 'task_estimation_changed'
  | 'task_moved'
  | 'task_completed'
  | 'task_reopened'
  | 'task_label_added'
  | 'task_label_removed'
  | 'task_project_linked'
  | 'task_project_unlinked'
  | 'task_assignee_removed'
  | 'deadline_reminder'
  | 'time_tracking_request_submitted'
  | 'time_tracking_request_resubmitted'
  | 'time_tracking_request_approved'
  | 'time_tracking_request_rejected'
  | 'time_tracking_request_needs_info'
  | 'workspace_invite';

export type AccountNotificationChannel = Extract<
  NotificationChannel,
  'email' | 'push' | 'web'
>;

export type AccountNotificationEventType =
  | 'email_notifications'
  | 'push_notifications'
  | 'marketing_communications'
  | 'security_alerts'
  | 'workspace_activity';

export type NotificationType =
  | WorkspaceNotificationEventType
  | 'account_update'
  | 'post_approved'
  | 'post_rejected'
  | 'report_approved'
  | 'report_rejected'
  | 'security_alert'
  | 'system_announcement';

export type NotificationPriority = 'high' | 'low' | 'medium' | 'urgent';

export type NotificationPreferenceScope = 'system' | 'user' | 'workspace';

export type NotificationActor = {
  avatar_url: string | null;
  display_name: string | null;
  id: string;
};

export type NotificationData = Record<string, unknown> & {
  workspace_id?: string | null;
  workspace_name?: string | null;
};

export type Notification = {
  created_at: string;
  created_by: string | null;
  data: NotificationData | null;
  entity_id: string | null;
  entity_type: string | null;
  expires_at: string | null;
  id: string;
  priority: NotificationPriority | null;
  read_at: string | null;
  scope: NotificationPreferenceScope;
  title: string;
  type: NotificationType;
  updated_at: string;
  user_id: string | null;
  ws_id: string | null;
  actor?: NotificationActor | null;
};

export type NotificationPreferenceBase<
  EventType extends string,
  Channel extends string,
> = {
  channel: Channel;
  created_at: string;
  enabled: boolean;
  event_type: EventType;
  id: string;
  scope?: NotificationPreferenceScope;
  updated_at: string;
  user_id: string;
};

export type WorkspaceNotificationPreference = NotificationPreferenceBase<
  WorkspaceNotificationEventType,
  NotificationChannel
> & {
  ws_id: string;
};

export type AccountNotificationPreference = NotificationPreferenceBase<
  AccountNotificationEventType,
  AccountNotificationChannel
> & {
  scope: 'user';
  ws_id: null;
};

export type NotificationPreferenceUpdate<
  EventType extends string,
  Channel extends string,
> = {
  channel: Channel;
  enabled: boolean;
  eventType: EventType;
};

export type WorkspaceNotificationPreferenceUpdate =
  NotificationPreferenceUpdate<
    WorkspaceNotificationEventType,
    NotificationChannel
  >;

export type AccountNotificationPreferenceUpdate = NotificationPreferenceUpdate<
  AccountNotificationEventType,
  AccountNotificationChannel
>;

export type WorkspaceNotificationPreferencesResponse = {
  preferences: WorkspaceNotificationPreference[];
};

export type AccountNotificationPreferencesResponse = {
  preferences: AccountNotificationPreference[];
};

export type NotificationPreferencesMutationResponse = {
  success: true;
};

export type ListNotificationsParams = {
  limit?: number;
  offset?: number;
  priority?: NotificationPriority;
  readOnly?: boolean;
  scope?: NotificationPreferenceScope;
  type?: NotificationType;
  unreadOnly?: boolean;
  wsId?: string | null;
};

export type ListNotificationsResponse = {
  count: number;
  limit: number;
  notifications: Notification[];
  offset: number;
};

export async function listNotifications(
  params: ListNotificationsParams = {},
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<ListNotificationsResponse>('/api/v1/notifications', {
    cache: 'no-store',
    query: {
      limit: params.limit,
      offset: params.offset,
      priority: params.priority,
      readOnly: params.readOnly,
      scope: params.scope,
      type: params.type,
      unreadOnly: params.unreadOnly,
      wsId: params.wsId,
    },
  });
}

export async function listWorkspaceNotificationPreferences(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<WorkspaceNotificationPreferencesResponse>(
    '/api/v1/notifications/preferences',
    {
      cache: 'no-store',
      query: {
        wsId: workspaceId,
      },
    }
  );
}

export async function updateWorkspaceNotificationPreferences(
  workspaceId: string,
  preferences: WorkspaceNotificationPreferenceUpdate[],
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<NotificationPreferencesMutationResponse>(
    '/api/v1/notifications/preferences',
    {
      body: JSON.stringify({
        preferences,
        wsId: workspaceId,
      }),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'PUT',
    }
  );
}

export async function listAccountNotificationPreferences(
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<AccountNotificationPreferencesResponse>(
    '/api/v1/notifications/account-preferences',
    {
      cache: 'no-store',
    }
  );
}

export async function updateAccountNotificationPreferences(
  preferences: AccountNotificationPreferenceUpdate[],
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<NotificationPreferencesMutationResponse>(
    '/api/v1/notifications/account-preferences',
    {
      body: JSON.stringify({ preferences }),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'PUT',
    }
  );
}
