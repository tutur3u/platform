import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import {
  type ListNotificationsResponse,
  listNotifications,
  type Notification,
  type NotificationPreferenceScope,
  type NotificationPriority,
  type NotificationType,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';

const notificationTabs = new Set(['all', 'mentions', 'tasks', 'unread']);
const notificationScopes = new Set(['system', 'user', 'workspace']);
const notificationPriorities = new Set(['high', 'low', 'medium', 'urgent']);
export const taskNotificationTypes: NotificationType[] = [
  'task_assigned',
  'task_updated',
  'task_completed',
  'task_reopened',
  'task_priority_changed',
  'task_due_date_changed',
  'task_start_date_changed',
  'task_estimation_changed',
  'task_moved',
  'task_title_changed',
  'task_description_changed',
  'task_label_added',
  'task_label_removed',
  'task_project_linked',
  'task_project_unlinked',
  'task_assignee_removed',
];
const taskNotificationTypeSet = new Set<NotificationType>(
  taskNotificationTypes
);
const notificationTypes = new Set<NotificationType>([
  'account_update',
  'deadline_reminder',
  'post_approved',
  'post_rejected',
  'report_approved',
  'report_rejected',
  'security_alert',
  'system_announcement',
  'task_assigned',
  'task_assignee_removed',
  'task_completed',
  'task_description_changed',
  'task_due_date_changed',
  'task_estimation_changed',
  'task_label_added',
  'task_label_removed',
  'task_mention',
  'task_moved',
  'task_priority_changed',
  'task_project_linked',
  'task_project_unlinked',
  'task_reopened',
  'task_start_date_changed',
  'task_title_changed',
  'task_updated',
  'time_tracking_request_approved',
  'time_tracking_request_needs_info',
  'time_tracking_request_rejected',
  'time_tracking_request_resubmitted',
  'time_tracking_request_submitted',
  'workspace_invite',
]);

export type NotificationsTab = 'all' | 'mentions' | 'tasks' | 'unread';

export type NotificationsSearch = {
  page: number;
  pageSize: number;
  priority: NotificationPriority | '';
  scope: NotificationPreferenceScope | '';
  tab: NotificationsTab;
  type: NotificationType | '';
};

export type NotificationListItemData = {
  description?: string | null;
  message?: string | null;
  workspace_id?: string | null;
  workspace_name?: string | null;
};

export type NotificationListItem = Omit<Notification, 'data'> & {
  data: NotificationListItemData | null;
};

export type NotificationsListResponse = Omit<
  ListNotificationsResponse,
  'notifications'
> & {
  notifications: NotificationListItem[];
};

export type NotificationsRouteData = NotificationsSearch & {
  notifications: NotificationsListResponse;
  workspaceId: string;
};

function parsePositiveInteger(value: unknown, fallback: number, max?: number) {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseInt(value, 10)
        : Number.NaN;

  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return max ? Math.min(parsed, max) : parsed;
}

function parseOptionalSetValue<T extends string>(
  value: unknown,
  allowedValues: Set<string>
): T | '' {
  return typeof value === 'string' && allowedValues.has(value)
    ? (value as T)
    : '';
}

export function validateNotificationsSearch(
  search: Record<string, unknown>
): NotificationsSearch {
  return {
    page: parsePositiveInteger(search.page, 1),
    pageSize: parsePositiveInteger(search.pageSize, 20, 100),
    priority: parseOptionalSetValue<NotificationPriority>(
      search.priority,
      notificationPriorities
    ),
    scope: parseOptionalSetValue<NotificationPreferenceScope>(
      search.scope,
      notificationScopes
    ),
    tab:
      typeof search.tab === 'string' && notificationTabs.has(search.tab)
        ? (search.tab as NotificationsTab)
        : 'all',
    type: parseOptionalSetValue<NotificationType>(
      search.type,
      notificationTypes
    ),
  };
}

function typeForTab(
  tab: NotificationsTab,
  explicitType: NotificationType | ''
): NotificationType | undefined {
  if (explicitType) {
    return explicitType;
  }

  if (tab === 'mentions') {
    return 'task_mention';
  }

  return undefined;
}

function readOptionalString(data: Notification['data'], key: string) {
  const value = data?.[key];
  return typeof value === 'string' ? value : null;
}

function toNotificationListItem(
  notification: Notification
): NotificationListItem {
  const { data, ...rest } = notification;

  return {
    ...rest,
    data: data
      ? {
          description: readOptionalString(data, 'description'),
          message: readOptionalString(data, 'message'),
          workspace_id: readOptionalString(data, 'workspace_id'),
          workspace_name: readOptionalString(data, 'workspace_name'),
        }
      : null,
  };
}

function toNotificationsListResponse(
  response: ListNotificationsResponse
): NotificationsListResponse {
  return {
    ...response,
    notifications: response.notifications.map(toNotificationListItem),
  };
}

function sortNotificationListItems(notifications: NotificationListItem[]) {
  return notifications.toSorted((left, right) => {
    const createdAtDelta =
      new Date(right.created_at).getTime() -
      new Date(left.created_at).getTime();

    if (createdAtDelta !== 0) {
      return createdAtDelta;
    }

    return right.id.localeCompare(left.id);
  });
}

async function listTaskNotifications(
  search: NotificationsSearch,
  offset: number,
  pageSize: number,
  options: Parameters<typeof listNotifications>[1]
): Promise<NotificationsListResponse> {
  if (search.type && !taskNotificationTypeSet.has(search.type)) {
    return {
      count: 0,
      limit: pageSize,
      notifications: [],
      offset,
    };
  }

  const types = search.type ? [search.type] : taskNotificationTypes;
  const aggregateLimit = offset + pageSize;
  const responses = await Promise.all(
    types.map((type) =>
      listNotifications(
        {
          limit: aggregateLimit,
          offset: 0,
          priority: search.priority || undefined,
          scope: search.scope || undefined,
          type,
          wsId: null,
        },
        options
      )
    )
  );
  const notifications = sortNotificationListItems(
    responses
      .flatMap((response) => response.notifications)
      .map(toNotificationListItem)
  );

  return {
    count: responses.reduce((sum, response) => sum + response.count, 0),
    limit: pageSize,
    notifications: notifications.slice(offset, offset + pageSize),
    offset,
  };
}

export const loadNotificationsData = createServerFn({ method: 'GET' })
  .validator((data: NotificationsSearch & { wsId: string }) => data)
  .handler(async ({ data }): Promise<NotificationsRouteData> => {
    const page = data.page;
    const pageSize = data.pageSize;
    const offset = (page - 1) * pageSize;
    const apiOptions = withForwardedInternalApiAuth(getRequestHeaders());

    const response =
      data.tab === 'tasks'
        ? await listTaskNotifications(data, offset, pageSize, apiOptions)
        : toNotificationsListResponse(
            await listNotifications(
              {
                limit: pageSize,
                offset,
                priority: data.priority || undefined,
                scope: data.scope || undefined,
                type: typeForTab(data.tab, data.type),
                unreadOnly: data.tab === 'unread' || undefined,
                wsId: null,
              },
              apiOptions
            )
          );

    return {
      notifications: response,
      page,
      pageSize,
      priority: data.priority,
      scope: data.scope,
      tab: data.tab,
      type: data.type,
      workspaceId: data.wsId,
    };
  });
