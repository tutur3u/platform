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
import type {
  AccountNotificationEventType,
  WorkspaceNotificationEventType,
} from '@tuturuuu/internal-api';

export type EventGroup<T extends string> = {
  descriptionKey: string;
  events: T[];
  icon: LucideIcon;
  id: string;
  labelKey: string;
};

export const WORKSPACE_EVENT_GROUPS: EventGroup<WorkspaceNotificationEventType>[] =
  [
    {
      descriptionKey: 'task-assignments-status-description',
      events: ['task_assigned', 'task_updated', 'task_mention'],
      icon: Clipboard,
      id: 'task_assignments',
      labelKey: 'task-assignments-status',
    },
    {
      descriptionKey: 'task-status-changes-description',
      events: ['task_completed', 'task_reopened', 'task_moved'],
      icon: CheckCircle2,
      id: 'task_status',
      labelKey: 'task-status-changes',
    },
    {
      descriptionKey: 'task-field-changes-description',
      events: [
        'task_title_changed',
        'task_description_changed',
        'task_priority_changed',
        'task_due_date_changed',
        'task_start_date_changed',
        'task_estimation_changed',
      ],
      icon: FileText,
      id: 'task_fields',
      labelKey: 'task-field-changes',
    },
    {
      descriptionKey: 'task-relationships-description',
      events: [
        'task_label_added',
        'task_label_removed',
        'task_project_linked',
        'task_project_unlinked',
        'task_assignee_removed',
      ],
      icon: Tag,
      id: 'task_relationships',
      labelKey: 'task-relationships',
    },
    {
      descriptionKey: 'deadline-reminders-description',
      events: ['deadline_reminder'],
      icon: Clock,
      id: 'deadline_reminders',
      labelKey: 'deadline-reminders',
    },
    {
      descriptionKey: 'time-tracking-requests-description',
      events: [
        'time_tracking_request_submitted',
        'time_tracking_request_resubmitted',
        'time_tracking_request_approved',
        'time_tracking_request_rejected',
        'time_tracking_request_needs_info',
      ],
      icon: Clock,
      id: 'time_tracking_requests',
      labelKey: 'time-tracking-requests',
    },
    {
      descriptionKey: 'workspace-events-description',
      events: ['workspace_invite'],
      icon: Users,
      id: 'workspace_events',
      labelKey: 'workspace-events',
    },
  ];

export const ACCOUNT_EVENT_GROUPS: EventGroup<AccountNotificationEventType>[] =
  [
    {
      descriptionKey: 'general-notifications-description',
      events: ['email_notifications', 'push_notifications'],
      icon: Bell,
      id: 'general_notifications',
      labelKey: 'general-notifications',
    },
    {
      descriptionKey: 'communications-description',
      events: ['marketing_communications', 'workspace_activity'],
      icon: Megaphone,
      id: 'communications',
      labelKey: 'communications',
    },
    {
      descriptionKey: 'security-description',
      events: ['security_alerts'],
      icon: Lock,
      id: 'security',
      labelKey: 'security',
    },
  ];

export const WORKSPACE_NOTIFICATION_CHANNELS = [
  'web',
  'email',
  'push',
] as const;

export function getAllWorkspaceNotificationEvents() {
  return WORKSPACE_EVENT_GROUPS.flatMap((group) => group.events);
}
