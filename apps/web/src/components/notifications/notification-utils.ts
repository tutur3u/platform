import type { Notification, NotificationType } from '@/hooks/useNotifications';
import type { Json } from '@tuturuuu/types';
import {
  AlertCircle,
  AtSign,
  Bell,
  Calendar,
  CheckCircle2,
  Clock,
  ClipboardList,
  Edit3,
  FileText,
  Link2,
  Mail,
  MoveRight,
  RotateCcw,
  Shield,
  Tag,
  UserMinus,
  UserPlus,
} from '@tuturuuu/icons';
import { getDescriptionText } from '@tuturuuu/utils/text-helper';
import dayjs from 'dayjs';
import type { ReactNode } from 'react';
import { createElement } from 'react';

// Translation function type that accepts any string key
export type TranslationFn = (
  key: string,
  options?: Record<string, unknown>
) => string;

// ============================================================================
// Types
// ============================================================================

export type NotificationTab = 'all' | 'unread' | 'mentions' | 'tasks';

export interface NotificationGroup {
  key: string;
  notifications: Notification[];
  entityId: string | null;
  entityType: string | null;
}

export interface DateGroup {
  label: string;
  key: string;
  notifications: Array<NotificationGroup>;
}

export interface NotificationAction {
  id: string;
  label: string;
  icon?: ReactNode;
  variant?:
    | 'default'
    | 'destructive'
    | 'outline'
    | 'secondary'
    | 'ghost'
    | 'link';
  type: string;
  payload: Record<string, unknown>;
}

// ============================================================================
// Constants
// ============================================================================

export const ALL_NOTIFICATION_TYPES: NotificationType[] = [
  'task_assigned',
  'task_updated',
  'task_completed',
  'task_reopened',
  'task_priority_changed',
  'task_due_date_changed',
  'task_start_date_changed',
  'task_estimation_changed',
  'task_moved',
  'task_mention',
  'task_title_changed',
  'task_description_changed',
  'task_label_added',
  'task_label_removed',
  'task_project_linked',
  'task_project_unlinked',
  'task_assignee_removed',
  'workspace_invite',
  'system_announcement',
  'account_update',
  'security_alert',
];

export const MENTION_TYPES: NotificationType[] = ['task_mention'];

export const TASK_TYPES: NotificationType[] = [
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

const TIME_WINDOW_MS = 5 * 60 * 1000; // 5 minutes for grouping

// ============================================================================
// Icon Mapping
// ============================================================================

const ICON_MAP: Record<string, typeof Bell> = {
  task_assigned: ClipboardList,
  task_updated: Edit3,
  task_completed: CheckCircle2,
  task_reopened: RotateCcw,
  task_priority_changed: AlertCircle,
  task_due_date_changed: Calendar,
  task_start_date_changed: Calendar,
  task_estimation_changed: Clock,
  task_moved: MoveRight,
  task_mention: AtSign,
  task_title_changed: FileText,
  task_description_changed: FileText,
  task_label_added: Tag,
  task_label_removed: Tag,
  task_project_linked: Link2,
  task_project_unlinked: Link2,
  task_assignee_removed: UserMinus,
  workspace_invite: Mail,
  system_announcement: Bell,
  account_update: UserPlus,
  security_alert: Shield,
};

export function getNotificationIcon(
  type: string,
  className = 'h-4 w-4'
): ReactNode {
  const IconComponent = ICON_MAP[type] || Bell;
  return createElement(IconComponent, { className });
}

// ============================================================================
// Link Generation
// ============================================================================

export function getEntityLink(
  notification: Notification,
  currentWsId: string
): string | null {
  const { entity_type, entity_id, ws_id } = notification;
  const targetWsId = ws_id || currentWsId;

  if (entity_type === 'task' && entity_id) {
    return `/${targetWsId}/tasks/${entity_id}`;
  }

  if (entity_type === 'workspace' && entity_id) {
    return `/${entity_id}`;
  }

  return null;
}

// ============================================================================
// Grouping Functions
// ============================================================================

export function groupNotificationsByEntity(
  notifications: Notification[]
): NotificationGroup[] {
  const groups: NotificationGroup[] = [];

  for (const notification of notifications) {
    // Only group task-related notifications
    if (
      !notification.entity_type ||
      notification.entity_type !== 'task' ||
      !notification.entity_id
    ) {
      groups.push({
        key: notification.id,
        notifications: [notification],
        entityId: null,
        entityType: null,
      });
      continue;
    }

    // Find existing group for this entity within time window
    const existingGroup = groups.find(
      (g) =>
        g.entityId === notification.entity_id &&
        g.entityType === notification.entity_type &&
        g.notifications.length > 0 &&
        Math.abs(
          new Date(g.notifications[0]!.created_at).getTime() -
            new Date(notification.created_at).getTime()
        ) < TIME_WINDOW_MS
    );

    if (existingGroup) {
      existingGroup.notifications.push(notification);
    } else {
      groups.push({
        key: `${notification.entity_type}-${notification.entity_id}-${notification.id}`,
        notifications: [notification],
        entityId: notification.entity_id,
        entityType: notification.entity_type,
      });
    }
  }

  return groups;
}

export function groupNotificationsByDate(
  groups: NotificationGroup[],
  t: (key: string) => string
): DateGroup[] {
  const now = dayjs();
  const today = now.startOf('day');
  const yesterday = today.subtract(1, 'day');
  const thisWeek = today.subtract(7, 'day');

  const dateGroups: Record<string, NotificationGroup[]> = {
    today: [],
    yesterday: [],
    thisWeek: [],
    earlier: [],
  };

  for (const group of groups) {
    const firstNotification = group.notifications[0];
    if (!firstNotification) continue;

    const createdAt = dayjs(firstNotification.created_at);

    if (createdAt.isAfter(today)) {
      dateGroups['today']!.push(group);
    } else if (createdAt.isAfter(yesterday)) {
      dateGroups['yesterday']!.push(group);
    } else if (createdAt.isAfter(thisWeek)) {
      dateGroups['thisWeek']!.push(group);
    } else {
      dateGroups['earlier']!.push(group);
    }
  }

  const result: DateGroup[] = [];

  if (dateGroups['today']!.length > 0) {
    result.push({
      label: t('date_today'),
      key: 'today',
      notifications: dateGroups['today']!,
    });
  }

  if (dateGroups['yesterday']!.length > 0) {
    result.push({
      label: t('date_yesterday'),
      key: 'yesterday',
      notifications: dateGroups['yesterday']!,
    });
  }

  if (dateGroups['thisWeek']!.length > 0) {
    result.push({
      label: t('date_this_week'),
      key: 'thisWeek',
      notifications: dateGroups['thisWeek']!,
    });
  }

  if (dateGroups['earlier']!.length > 0) {
    result.push({
      label: t('date_earlier'),
      key: 'earlier',
      notifications: dateGroups['earlier']!,
    });
  }

  return result;
}

// ============================================================================
// Formatting Helpers
// ============================================================================

const FIELD_NAME_MAP: Record<string, string> = {
  name: 'Title',
  description: 'Description',
  priority: 'Priority',
  due_date: 'Due Date',
  start_date: 'Start Date',
  estimation: 'Estimation',
  completed: 'Status',
  label_name: 'Label',
  list_id: 'List',
};

export function formatFieldName(field: string): string {
  return (
    FIELD_NAME_MAP[field] ||
    field.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
  );
}

export function capitalizeFirst(str: string): string {
  if (!str || typeof str !== 'string') return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function formatValue(value: unknown, field: string): string {
  if (value === null || value === undefined) return 'Not set';

  if (typeof value === 'boolean') return value ? 'Completed' : 'Not completed';

  if (field === 'priority') {
    const priorityMap: Record<string, string> = {
      low: 'Low',
      medium: 'Medium',
      high: 'High',
      urgent: 'Urgent',
    };
    return (
      priorityMap[String(value).toLowerCase()] || capitalizeFirst(String(value))
    );
  }

  if (field === 'due_date' || field === 'end_date' || field === 'start_date') {
    if (typeof value === 'string' && value.includes('T')) {
      const date = dayjs(value);
      if (date.isValid()) {
        return date.format('MMM D, YYYY');
      }
    }
    return capitalizeFirst(String(value));
  }

  if (field === 'estimation' || field === 'estimation_points') {
    const num = Number(value);
    if (!Number.isNaN(num)) {
      return `${num} hour${num !== 1 ? 's' : ''}`;
    }
    return String(value);
  }

  if (field === 'description') {
    const descriptionText = getDescriptionText(value as string | Json);
    if (descriptionText.length > 50) {
      return `${descriptionText.substring(0, 50)}...`;
    }
    return descriptionText || 'Not set';
  }

  if (typeof value === 'string' && value.length > 50) {
    return `${value.substring(0, 50)}...`;
  }

  if (typeof value === 'string') {
    return capitalizeFirst(value);
  }

  return String(value);
}

// ============================================================================
// Tab Filtering
// ============================================================================

export function getTypesForTab(tab: NotificationTab): NotificationType[] {
  switch (tab) {
    case 'mentions':
      return MENTION_TYPES;
    case 'tasks':
      return TASK_TYPES;
    default:
      return [];
  }
}

export function filterNotificationsByTab(
  notifications: Notification[],
  tab: NotificationTab
): Notification[] {
  switch (tab) {
    case 'unread':
      return notifications.filter((n) => !n.read_at);
    case 'mentions':
      return notifications.filter((n) => MENTION_TYPES.includes(n.type));
    case 'tasks':
      return notifications.filter((n) => TASK_TYPES.includes(n.type));
    default:
      return notifications;
  }
}
