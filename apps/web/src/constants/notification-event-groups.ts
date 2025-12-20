import type { LucideIcon } from '@tuturuuu/icons';
import {
  Bell,
  CheckCircle2,
  Clipboard,
  Clock,
  FileText,
  Lock,
  Megaphone,
  Tag,
  Users,
} from '@tuturuuu/icons';
import type { AccountNotificationEventType } from '@/hooks/useAccountNotificationPreferences';
import type { NotificationEventType } from '@/hooks/useNotificationPreferences';

export interface EventGroup<T extends string> {
  id: string;
  labelKey: string;
  descriptionKey: string;
  icon: LucideIcon;
  events: T[];
}

/**
 * Workspace notification event groups
 */
export const WORKSPACE_EVENT_GROUPS: EventGroup<NotificationEventType>[] = [
  {
    id: 'task_assignments',
    labelKey: 'task-assignments-status',
    descriptionKey: 'task-assignments-status-description',
    icon: Clipboard,
    events: ['task_assigned', 'task_updated', 'task_mention'],
  },
  {
    id: 'task_status',
    labelKey: 'task-status-changes',
    descriptionKey: 'task-status-changes-description',
    icon: CheckCircle2,
    events: ['task_completed', 'task_reopened', 'task_moved'],
  },
  {
    id: 'task_fields',
    labelKey: 'task-field-changes',
    descriptionKey: 'task-field-changes-description',
    icon: FileText,
    events: [
      'task_title_changed',
      'task_description_changed',
      'task_priority_changed',
      'task_due_date_changed',
      'task_start_date_changed',
      'task_estimation_changed',
    ],
  },
  {
    id: 'task_relationships',
    labelKey: 'task-relationships',
    descriptionKey: 'task-relationships-description',
    icon: Tag,
    events: [
      'task_label_added',
      'task_label_removed',
      'task_project_linked',
      'task_project_unlinked',
      'task_assignee_removed',
    ],
  },
  {
    id: 'deadline_reminders',
    labelKey: 'deadline-reminders',
    descriptionKey: 'deadline-reminders-description',
    icon: Clock,
    events: ['deadline_reminder'],
  },
  {
    id: 'workspace_events',
    labelKey: 'workspace-events',
    descriptionKey: 'workspace-events-description',
    icon: Users,
    events: ['workspace_invite'],
  },
];

/**
 * Account notification event groups
 */
export const ACCOUNT_EVENT_GROUPS: EventGroup<AccountNotificationEventType>[] =
  [
    {
      id: 'general_notifications',
      labelKey: 'general-notifications',
      descriptionKey: 'general-notifications-description',
      icon: Bell,
      events: ['email_notifications', 'push_notifications'],
    },
    {
      id: 'communications',
      labelKey: 'communications',
      descriptionKey: 'communications-description',
      icon: Megaphone,
      events: ['marketing_communications', 'workspace_activity'],
    },
    {
      id: 'security',
      labelKey: 'security',
      descriptionKey: 'security-description',
      icon: Lock,
      events: ['security_alerts'],
    },
  ];

/**
 * Get all workspace event types as a flat array
 */
export const getAllWorkspaceEvents = (): NotificationEventType[] =>
  WORKSPACE_EVENT_GROUPS.flatMap((group) => group.events);

/**
 * Get all account event types as a flat array
 */
export const getAllAccountEvents = (): AccountNotificationEventType[] =>
  ACCOUNT_EVENT_GROUPS.flatMap((group) => group.events);

/**
 * Get the group for a specific event type
 */
export function getEventGroup<T extends string>(
  eventType: T,
  groups: EventGroup<T>[]
): EventGroup<T> | undefined {
  return groups.find((group) => group.events.includes(eventType));
}
