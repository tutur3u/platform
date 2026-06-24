import type { NotificationType } from '@tuturuuu/internal-api';
import {
  type NotificationListItem,
  type NotificationsTab,
  taskNotificationTypes,
} from '@/lib/notifications/notification-list-route-data';

const taskTypes = new Set<NotificationType>(taskNotificationTypes);

export function isTaskNotification(type: NotificationType) {
  return taskTypes.has(type);
}

export function countNotifications(
  notifications: NotificationListItem[],
  tab: NotificationsTab
) {
  if (tab === 'unread') {
    return notifications.filter((notification) => !notification.read_at).length;
  }

  if (tab === 'mentions') {
    return notifications.filter(
      (notification) => notification.type === 'task_mention'
    ).length;
  }

  if (tab === 'tasks') {
    return notifications.filter((notification) =>
      isTaskNotification(notification.type)
    ).length;
  }

  return notifications.length;
}

export function formatNotificationType(type: NotificationType) {
  return type
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function formatNotificationDate(value: string, locale: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function getNotificationBody(notification: NotificationListItem) {
  const message = notification.data?.message;
  const description = notification.data?.description;
  const workspaceName = notification.data?.workspace_name;

  if (typeof message === 'string' && message.trim()) {
    return message.trim();
  }

  if (typeof description === 'string' && description.trim()) {
    return description.trim();
  }

  if (typeof workspaceName === 'string' && workspaceName.trim()) {
    return workspaceName.trim();
  }

  return null;
}
