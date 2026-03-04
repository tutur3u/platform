import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Tailwind,
  Text,
} from '@react-email/components';

export type NotificationType =
  | 'task_assigned'
  | 'task_updated'
  | 'task_completed'
  | 'task_mention'
  | 'workspace_invite'
  | 'comment_added'
  | 'deadline_reminder'
  | 'general';

// Category-based grouping for email display
export type NotificationCategory =
  | 'task_assignments' // assigned, mention
  | 'task_status' // completed, reopened, moved
  | 'task_updates' // field changes: title, description, priority, dates
  | 'task_relationships' // labels, projects, assignee removed
  | 'workspace' // invites
  | 'comments' // comment activity
  | 'deadlines' // deadline reminders
  | 'system' // announcements
  | 'general'; // fallback

// Map granular notification types to display categories
export const TYPE_TO_CATEGORY: Record<string, NotificationCategory> = {
  // Assignments
  task_assigned: 'task_assignments',
  task_mention: 'task_assignments',

  // Status changes
  task_completed: 'task_status',
  task_reopened: 'task_status',
  task_moved: 'task_status',

  // Field updates
  task_updated: 'task_updates',
  task_title_changed: 'task_updates',
  task_description_changed: 'task_updates',
  task_priority_changed: 'task_updates',
  task_due_date_changed: 'task_updates',
  task_start_date_changed: 'task_updates',
  task_estimation_changed: 'task_updates',

  // Relationships
  task_label_added: 'task_relationships',
  task_label_removed: 'task_relationships',
  task_project_linked: 'task_relationships',
  task_project_unlinked: 'task_relationships',
  task_assignee_removed: 'task_relationships',

  // Other
  workspace_invite: 'workspace',
  comment_added: 'comments',
  deadline_reminder: 'deadlines',
  system_announcement: 'system',
};

export const getCategoryForType = (type: string): NotificationCategory =>
  TYPE_TO_CATEGORY[type] || 'general';

export interface NotificationItem {
  id: string;
  type: NotificationType | string;
  title: string;
  description?: string;
  data?: Record<string, unknown>;
  createdAt: string;
  actionUrl?: string;
  isConsolidated?: boolean;
  consolidatedCount?: number;
  changeTypes?: string[];
}

// Extended notification item for consolidated per-task display
export interface ConsolidatedNotification extends NotificationItem {
  /** True if this represents multiple notifications for the same entity */
  isConsolidated?: boolean;
  consolidatedCount?: number;
  changeTypes?: string[];
}

// Extended notification item for consolidated per-task display
export interface ConsolidatedNotification extends NotificationItem {}

interface NotificationDigestEmailProps {
  userName?: string;
  workspaceName?: string;
  notifications?: NotificationItem[];
  workspaceUrl?: string;
  logoUrl?: string;
  /** ISO timestamp of when batch window started */
  windowStart?: string;
  /** ISO timestamp of when batch window ended */
  windowEnd?: string;
  /** ISO timestamp of when the email is being sent */
  sentAt?: string;
}

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://tuturuuu.com';

export const NOTIFICATION_CONFIG: Record<
  NotificationType,
  {
    label: string;
    emoji: string;
    color: string;
    bgColor: string;
    priority: number;
    actionVerb: string;
  }
> = {
  workspace_invite: {
    label: 'Invitation',
    emoji: '✉️',
    color: '#0891b2',
    bgColor: '#ecfeff',
    priority: 1,
    actionVerb: 'View Invite',
  },
  deadline_reminder: {
    label: 'Deadline',
    emoji: '⏰',
    color: '#dc2626',
    bgColor: '#fef2f2',
    priority: 2,
    actionVerb: 'View Task',
  },
  task_assigned: {
    label: 'Assigned',
    emoji: '📋',
    color: '#2563eb',
    bgColor: '#eff6ff',
    priority: 3,
    actionVerb: 'View Task',
  },
  task_mention: {
    label: 'Mention',
    emoji: '@',
    color: '#d97706',
    bgColor: '#fffbeb',
    priority: 4,
    actionVerb: 'View',
  },
  comment_added: {
    label: 'Comment',
    emoji: '💬',
    color: '#4f46e5',
    bgColor: '#eef2ff',
    priority: 5,
    actionVerb: 'Reply',
  },
  task_completed: {
    label: 'Completed',
    emoji: '✅',
    color: '#059669',
    bgColor: '#ecfdf5',
    priority: 6,
    actionVerb: 'View',
  },
  task_updated: {
    label: 'Updated',
    emoji: '📝',
    color: '#7c3aed',
    bgColor: '#f5f3ff',
    priority: 7,
    actionVerb: 'View',
  },
  general: {
    label: 'Update',
    emoji: '🔔',
    color: '#6b7280',
    bgColor: '#f9fafb',
    priority: 8,
    actionVerb: 'View',
  },
};

// Category-based configuration for consolidated email display
export const CATEGORY_CONFIG: Record<
  NotificationCategory,
  {
    label: string;
    emoji: string;
    color: string;
    bgColor: string;
    priority: number;
    actionVerb: string;
  }
> = {
  workspace: {
    label: 'Invitations',
    emoji: '✉️',
    color: '#0891b2',
    bgColor: '#ecfeff',
    priority: 1,
    actionVerb: 'View',
  },
  deadlines: {
    label: 'Deadlines',
    emoji: '⏰',
    color: '#dc2626',
    bgColor: '#fef2f2',
    priority: 2,
    actionVerb: 'View',
  },
  task_assignments: {
    label: 'Assignments',
    emoji: '📋',
    color: '#2563eb',
    bgColor: '#eff6ff',
    priority: 3,
    actionVerb: 'View',
  },
  comments: {
    label: 'Comments',
    emoji: '💬',
    color: '#4f46e5',
    bgColor: '#eef2ff',
    priority: 4,
    actionVerb: 'Reply',
  },
  task_status: {
    label: 'Status Changes',
    emoji: '✅',
    color: '#059669',
    bgColor: '#ecfdf5',
    priority: 5,
    actionVerb: 'View',
  },
  task_updates: {
    label: 'Task Updates',
    emoji: '📝',
    color: '#7c3aed',
    bgColor: '#f5f3ff',
    priority: 6,
    actionVerb: 'View',
  },
  task_relationships: {
    label: 'Labels & Projects',
    emoji: '🏷️',
    color: '#0891b2',
    bgColor: '#ecfeff',
    priority: 7,
    actionVerb: 'View',
  },
  system: {
    label: 'Announcements',
    emoji: '📢',
    color: '#7c3aed',
    bgColor: '#f5f3ff',
    priority: 8,
    actionVerb: 'Read',
  },
  general: {
    label: 'Updates',
    emoji: '🔔',
    color: '#6b7280',
    bgColor: '#f9fafb',
    priority: 9,
    actionVerb: 'View',
  },
};

// Get category config for a notification type
export const getCategoryConfig = (type: string) => {
  const category = getCategoryForType(type);
  return CATEGORY_CONFIG[category];
};

export const getNotificationConfig = (type: string) => {
  return (
    NOTIFICATION_CONFIG[type as NotificationType] || NOTIFICATION_CONFIG.general
  );
};

// Generate smart subject line based on notification content
// Using clean, professional format without emojis for better email client compatibility
export const generateSubjectLine = (
  notifications: NotificationItem[],
  workspaceName: string
): string => {
  if (notifications.length === 0) {
    return `Your digest from ${workspaceName}`;
  }

  // Sort by category priority (lower = more important)
  const sorted = [...notifications].sort((a, b) => {
    const categoryA = getCategoryForType(a.type);
    const categoryB = getCategoryForType(b.type);
    return (
      CATEGORY_CONFIG[categoryA].priority - CATEGORY_CONFIG[categoryB].priority
    );
  });

  const primary = sorted[0]!;
  const primaryCategory = getCategoryForType(primary.type);
  const remaining = notifications.length - 1;
  const remainingText = remaining > 0 ? ` and ${remaining} more` : '';

  // Generate clean, professional subject lines (no emojis)
  switch (primaryCategory) {
    case 'workspace':
      return `You're invited to join ${(primary.data?.workspace_name as string) || workspaceName}`;

    case 'deadlines':
      return `Reminder: ${truncate(primary.title, 40)} is due soon${remainingText}`;

    case 'task_assignments':
      if (primary.type === 'task_mention') {
        return `${(primary.data?.mentioned_by as string) || 'Someone'} mentioned you${remainingText}`;
      }
      return `New assignment: ${truncate(primary.title, 40)}${remainingText}`;

    case 'comments':
      return `New comment on "${truncate(primary.title, 30)}"${remainingText}`;

    case 'task_status':
      if (primary.type === 'task_completed') {
        return `Task completed: ${truncate(primary.title, 40)}${remainingText}`;
      } else if (primary.type === 'task_reopened') {
        return `Task reopened: ${truncate(primary.title, 40)}${remainingText}`;
      }
      return `Task moved: ${truncate(primary.title, 35)}${remainingText}`;

    case 'task_updates':
      return `Task updated: ${truncate(primary.title, 40)}${remainingText}`;

    case 'task_relationships':
      return `Changes to ${truncate(primary.title, 40)}${remainingText}`;

    case 'system':
      return `${primary.title}${remainingText}`;

    default:
      if (notifications.length === 1) {
        return primary.title;
      }
      return `${notifications.length} updates from ${workspaceName}`;
  }
};

const truncate = (str: string, length: number): string => {
  if (str.length <= length) return str;
  return `${str.slice(0, length - 1)}…`;
};

const formatRelativeTime = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
};

// Format a single timestamp for display
const formatSingleTime = (date: Date): string => {
  const day = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  const time = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${day} at ${time}`;
};

const formatDateRange = (start: Date, end: Date): string => {
  const startDay = start.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  const endDay = end.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  // Same day
  if (startDay === endDay) {
    const timeRange = `${start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} - ${end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
    return `${startDay}, ${timeRange}`;
  }

  // Different days
  return `${startDay} - ${endDay}`;
};

// Format a date range for display in email header
export const formatTimeRange = (
  windowStart?: string,
  windowEnd?: string,
  notifications?: NotificationItem[]
): string => {
  // If we have notification timestamps, use the actual range
  if (notifications && notifications.length > 0) {
    const timestamps = notifications.map((n) =>
      new Date(n.createdAt).getTime()
    );
    const oldest = new Date(Math.min(...timestamps));
    const newest = new Date(Math.max(...timestamps));

    // If same time (within 1 minute), show single timestamp instead of range
    if (Math.abs(oldest.getTime() - newest.getTime()) < 60000) {
      return formatSingleTime(newest);
    }
    return formatDateRange(oldest, newest);
  }

  // Fall back to window timestamps
  if (windowStart && windowEnd) {
    const start = new Date(windowStart);
    const end = new Date(windowEnd);

    // If same time (within 1 minute), show single timestamp
    if (Math.abs(start.getTime() - end.getTime()) < 60000) {
      return formatSingleTime(end);
    }
    return formatDateRange(start, end);
  }

  return '';
};

// Calculate delay information for display
export const getDelayInfo = (
  windowEnd?: string,
  sentAt?: string
): { isDelayed: boolean; delayText: string } => {
  if (!windowEnd || !sentAt) {
    return { isDelayed: false, delayText: '' };
  }

  const windowEndDate = new Date(windowEnd);
  const sentAtDate = new Date(sentAt);
  const delayMs = sentAtDate.getTime() - windowEndDate.getTime();

  // Consider delayed if more than 15 minutes after window end
  const DELAY_THRESHOLD_MS = 15 * 60 * 1000;
  if (delayMs <= DELAY_THRESHOLD_MS) {
    return { isDelayed: false, delayText: '' };
  }

  const delayMins = Math.floor(delayMs / 60000);
  const delayHours = Math.floor(delayMs / 3600000);
  const delayDays = Math.floor(delayMs / 86400000);

  let delayText: string;
  if (delayDays > 0) {
    delayText = `Delayed ${delayDays} day${delayDays > 1 ? 's' : ''}`;
  } else if (delayHours > 0) {
    delayText = `Delayed ${delayHours} hour${delayHours > 1 ? 's' : ''}`;
  } else {
    delayText = `Delayed ${delayMins} minute${delayMins > 1 ? 's' : ''}`;
  }

  return { isDelayed: true, delayText };
};

// Readable change type names for consolidated notifications
const CHANGE_TYPE_LABELS: Record<string, string> = {
  task_updated: 'updated',
  task_title_changed: 'title',
  task_description_changed: 'description',
  task_priority_changed: 'priority',
  task_due_date_changed: 'due date',
  task_start_date_changed: 'start date',
  task_estimation_changed: 'estimate',
  task_moved: 'moved',
  task_completed: 'completed',
  task_reopened: 'reopened',
  task_label_added: 'label added',
  task_label_removed: 'label removed',
  task_project_linked: 'project linked',
  task_project_unlinked: 'project unlinked',
  task_assignee_removed: 'assignee removed',
};

// Consolidate multiple notifications for the same entity (task) into a single item
// This prevents overwhelming users when a task receives many rapid updates
const consolidateByEntity = (
  notifications: NotificationItem[]
): ConsolidatedNotification[] => {
  // Categories that should be consolidated by entity_id
  const consolidatableCategories: NotificationCategory[] = [
    'task_updates',
    'task_status',
    'task_relationships',
  ];

  // Separate notifications into consolidatable and non-consolidatable
  const toConsolidate: NotificationItem[] = [];
  const keepSeparate: NotificationItem[] = [];

  for (const notification of notifications) {
    const category = getCategoryForType(notification.type);
    const entityId = notification.data?.task_id as string | undefined;

    if (consolidatableCategories.includes(category) && entityId) {
      toConsolidate.push(notification);
    } else {
      keepSeparate.push(notification);
    }
  }

  // Group by entity_id
  const entityGroups = new Map<string, NotificationItem[]>();
  for (const notification of toConsolidate) {
    const entityId = notification.data?.task_id as string;
    if (!entityGroups.has(entityId)) {
      entityGroups.set(entityId, []);
    }
    entityGroups.get(entityId)!.push(notification);
  }

  // Create consolidated notifications
  const consolidated: ConsolidatedNotification[] = [];

  for (const [, group] of entityGroups) {
    if (group.length === 1) {
      // Single notification, no consolidation needed
      const single = group[0] as ConsolidatedNotification;
      consolidated.push({
        ...single,
        isConsolidated:
          single.isConsolidated ||
          Boolean(single.consolidatedCount && single.consolidatedCount > 1),
      });
    } else {
      // Multiple notifications for same entity - consolidate
      // Use the most recent notification as the base
      const sorted = [...group].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      const mostRecent = sorted[0]!;

      // Collect unique change types
      const changeTypes = [...new Set(group.map((n) => n.type))];
      const changeLabels = changeTypes
        .map((t) => CHANGE_TYPE_LABELS[t] || t.replace('task_', ''))
        .slice(0, 3); // Show max 3 labels

      const additionalCount = changeTypes.length - changeLabels.length;
      const changesText =
        additionalCount > 0
          ? `${changeLabels.join(', ')}, +${additionalCount} more`
          : changeLabels.join(', ');

      consolidated.push({
        ...mostRecent,
        isConsolidated: true,
        consolidatedCount: group.length,
        changeTypes,
        // Update description to reflect consolidation
        description: `${group.length} changes: ${changesText}`,
      });
    }
  }

  // Return non-consolidatable items plus consolidated items
  return [...(keepSeparate as ConsolidatedNotification[]), ...consolidated];
};

// Group notifications by category for consolidated display
const groupNotificationsByCategory = (
  notifications: NotificationItem[]
): Map<NotificationCategory, ConsolidatedNotification[]> => {
  // First, consolidate notifications by entity
  const consolidatedNotifications = consolidateByEntity(notifications);

  const groups = new Map<NotificationCategory, ConsolidatedNotification[]>();

  // Group by category
  for (const notification of consolidatedNotifications) {
    const category = getCategoryForType(notification.type);
    if (!groups.has(category)) {
      groups.set(category, []);
    }
    groups.get(category)!.push(notification);
  }

  // Sort groups by priority
  const sortedGroups = new Map(
    [...groups.entries()].sort(
      (a, b) => CATEGORY_CONFIG[a[0]].priority - CATEGORY_CONFIG[b[0]].priority
    )
  );

  // Sort notifications within each group by createdAt (newest first)
  for (const [, items] of sortedGroups) {
    items.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  return sortedGroups;
};

const NotificationCard = ({
  notification,
  workspaceUrl,
  isCompact = false,
}: {
  notification: ConsolidatedNotification;
  workspaceUrl: string;
  isCompact?: boolean;
}) => {
  const config = getNotificationConfig(notification.type);
  const actionUrl = notification.actionUrl || workspaceUrl;
  const isConsolidated =
    notification.isConsolidated &&
    notification.consolidatedCount &&
    notification.consolidatedCount > 1;

  // Check if this is a task_moved notification with list names
  const isTaskMoved = notification.type === 'task_moved';
  const oldListName = notification.data?.old_list_name as string | undefined;
  const newListName = notification.data?.new_list_name as string | undefined;
  const hasListMoveInfo = isTaskMoved && oldListName && newListName;

  if (isCompact) {
    return (
      <tr>
        <td style={{ padding: '8px 0' }}>
          <Link
            href={actionUrl}
            style={{
              color: '#374151',
              fontSize: '14px',
              textDecoration: 'none',
            }}
          >
            {notification.title}
          </Link>
          {hasListMoveInfo && (
            <span
              style={{ color: '#6b7280', fontSize: '12px', marginLeft: '6px' }}
            >
              ({oldListName} → {newListName})
            </span>
          )}
          <span
            style={{ color: '#9ca3af', fontSize: '12px', marginLeft: '8px' }}
          >
            {formatRelativeTime(notification.createdAt)}
          </span>
        </td>
      </tr>
    );
  }

  return (
    <Section
      style={{
        backgroundColor: '#fffdf8',
        borderRadius: '16px',
        border: '1px solid #e7dece',
        marginBottom: '12px',
        overflow: 'hidden',
        boxShadow: '0 12px 28px rgba(77, 53, 32, 0.08)',
      }}
    >
      <Row>
        <td
          style={{
            width: '6px',
            backgroundColor: config.color,
            padding: 0,
          }}
        />
        <td style={{ padding: '16px 18px' }}>
          <table cellPadding="0" cellSpacing="0" style={{ width: '100%' }}>
            <tr>
              <td>
                <Text
                  style={{
                    margin: '0 0 6px',
                    color: config.color,
                    fontSize: '10px',
                    fontWeight: 700,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                  }}
                >
                  {config.label}
                </Text>
                <Link
                  href={actionUrl}
                  style={{
                    color: '#181411',
                    fontSize: '15px',
                    fontWeight: 600,
                    textDecoration: 'none',
                    lineHeight: '1.4',
                  }}
                >
                  {notification.title}
                </Link>
              </td>
              <td style={{ textAlign: 'right', verticalAlign: 'top' }}>
                {isConsolidated && (
                  <span
                    style={{
                      backgroundColor: '#efe3cf',
                      color: '#7c5431',
                      fontSize: '10px',
                      fontWeight: 600,
                      padding: '4px 8px',
                      borderRadius: '999px',
                      marginRight: '6px',
                      display: 'inline-block',
                    }}
                  >
                    {notification.consolidatedCount} updates
                  </span>
                )}
                <span style={{ color: '#8b7b68', fontSize: '12px' }}>
                  {formatRelativeTime(notification.createdAt)}
                </span>
              </td>
            </tr>
            {notification.description && (
              <tr>
                <td colSpan={2} style={{ paddingTop: '4px' }}>
                  <Text
                    style={{
                      margin: 0,
                      color: '#5b5147',
                      fontSize: '13px',
                      lineHeight: '1.55',
                    }}
                  >
                    {truncate(notification.description, 120)}
                  </Text>
                </td>
              </tr>
            )}
            {hasListMoveInfo && (
              <tr>
                <td colSpan={2} style={{ paddingTop: '6px' }}>
                  <table cellPadding="0" cellSpacing="0">
                    <tr>
                      <td
                        style={{
                          backgroundColor: '#fef2f2',
                          color: '#dc2626',
                          fontSize: '11px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                        }}
                      >
                        {oldListName}
                      </td>
                      <td
                        style={{
                          color: '#9ca3af',
                          fontSize: '11px',
                          padding: '0 6px',
                        }}
                      >
                        →
                      </td>
                      <td
                        style={{
                          backgroundColor: '#ecfdf5',
                          color: '#059669',
                          fontSize: '11px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                        }}
                      >
                        {newListName}
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            )}
          </table>
        </td>
      </Row>
    </Section>
  );
};

const NotificationGroup = ({
  category,
  notifications,
  workspaceUrl,
}: {
  category: NotificationCategory;
  notifications: ConsolidatedNotification[];
  workspaceUrl: string;
}) => {
  const config = CATEGORY_CONFIG[category];
  const showCompact = notifications.length > 3;
  const displayNotifications = showCompact
    ? notifications.slice(0, 2)
    : notifications;
  const hiddenCount = showCompact ? notifications.length - 2 : 0;

  return (
    <Section style={{ marginBottom: '20px' }}>
      {/* Group Header */}
      <table cellPadding="0" cellSpacing="0" style={{ marginBottom: '8px' }}>
        <tr>
          <td
            style={{
              backgroundColor: '#f5ede1',
              color: config.color,
              padding: '6px 12px',
              borderRadius: '999px',
              fontSize: '12px',
              fontWeight: 600,
              letterSpacing: '0.04em',
            }}
          >
            {config.label}
            {notifications.length > 1 && (
              <span style={{ fontWeight: 400, marginLeft: '4px' }}>
                ({notifications.length})
              </span>
            )}
          </td>
        </tr>
      </table>

      {/* Notifications */}
      {displayNotifications.map((notification) => (
        <NotificationCard
          key={notification.id}
          notification={notification}
          workspaceUrl={workspaceUrl}
        />
      ))}

      {/* Show more link if there are hidden notifications */}
      {hiddenCount > 0 && (
        <table cellPadding="0" cellSpacing="0" style={{ width: '100%' }}>
          <tr>
            <td style={{ textAlign: 'center', padding: '8px 0' }}>
              <Link
                href={`${workspaceUrl}/notifications`}
                style={{
                  color: config.color,
                  fontSize: '13px',
                  textDecoration: 'none',
                }}
              >
                +{hiddenCount} more {config.label.toLowerCase()} →
              </Link>
            </td>
          </tr>
        </table>
      )}
    </Section>
  );
};

const QuickStats = ({
  notifications,
}: {
  notifications: NotificationItem[];
}) => {
  const groups = groupNotificationsByCategory(notifications);
  const stats: Array<{ count: number; label: string; color: string }> = [];

  groups.forEach((items, category) => {
    const config = CATEGORY_CONFIG[category];
    stats.push({
      count: items.length,
      label: config.label,
      color: config.color,
    });
  });

  // Only show stats if there are multiple categories
  if (stats.length <= 1) return null;

  return (
    <Section
      style={{
        backgroundColor: '#f7f1e8',
        borderRadius: '18px',
        padding: '8px',
        marginBottom: '24px',
      }}
    >
      <table cellPadding="0" cellSpacing="0" style={{ width: '100%' }}>
        <tr>
          {stats.slice(0, 4).map((stat, index) => (
            <td
              key={stat.label}
              style={{
                textAlign: 'center',
                borderRight:
                  index < Math.min(stats.length, 4) - 1
                    ? '1px solid #eadfce'
                    : 'none',
                padding: '14px 8px',
              }}
            >
              <Text
                style={{
                  margin: 0,
                  fontSize: '22px',
                  fontWeight: 700,
                  color: '#181411',
                  fontFamily: 'Georgia, "Times New Roman", serif',
                }}
              >
                {stat.count}
              </Text>
              <Text
                style={{
                  margin: '4px 0 0',
                  fontSize: '11px',
                  color: stat.color,
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  fontWeight: 700,
                }}
              >
                {stat.label}
              </Text>
            </td>
          ))}
        </tr>
      </table>
    </Section>
  );
};

export const NotificationDigestEmail = ({
  userName = 'there',
  workspaceName = 'Your Workspace',
  notifications = [],
  workspaceUrl = BASE_URL,
  logoUrl,
  windowStart,
  windowEnd,
  sentAt,
}: NotificationDigestEmailProps) => {
  const notificationCount = notifications.length;
  const groups = groupNotificationsByCategory(notifications);

  // Calculate time range and delay info
  const timeRange = formatTimeRange(windowStart, windowEnd, notifications);
  const { isDelayed, delayText } = getDelayInfo(windowEnd, sentAt);

  // Get the most important notification for preview (sorted by category priority)
  const sortedByPriority = [...notifications].sort((a, b) => {
    const categoryA = getCategoryForType(a.type);
    const categoryB = getCategoryForType(b.type);
    return (
      CATEGORY_CONFIG[categoryA].priority - CATEGORY_CONFIG[categoryB].priority
    );
  });

  const primaryNotification = sortedByPriority[0];
  const previewText =
    notificationCount === 0
      ? `No new notifications in ${workspaceName}`
      : primaryNotification
        ? `${primaryNotification.title}${notificationCount > 1 ? ` and ${notificationCount - 1} more` : ''}`
        : `${notificationCount} notification${notificationCount !== 1 ? 's' : ''} in ${workspaceName}`;

  return (
    <Html>
      <Head>
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
        <style>{`
          @media only screen and (max-width: 600px) {
            .mobile-padding { padding: 16px !important; }
            .mobile-text { font-size: 14px !important; }
          }
        `}</style>
      </Head>
      <Preview>{previewText}</Preview>
      <Tailwind>
        <Body
          style={{
            background:
              'linear-gradient(180deg, #efe4d3 0%, #f8f4ed 38%, #f3ede4 100%)',
            fontFamily: '"Avenir Next", "Segoe UI", sans-serif',
            margin: 0,
            padding: '28px 16px',
          }}
        >
          <Container
            style={{
              maxWidth: '560px',
              margin: '0 auto',
            }}
          >
            {/* Header Card */}
            <Section
              style={{
                backgroundColor: '#fffdf8',
                borderRadius: '24px',
                overflow: 'hidden',
                marginBottom: '14px',
                border: '1px solid #eadfce',
                boxShadow: '0 20px 50px rgba(90, 62, 38, 0.12)',
              }}
            >
              <Section
                style={{
                  background:
                    'linear-gradient(135deg, #1d3528 0%, #2f5144 48%, #a36d3a 100%)',
                  padding: '30px 28px 26px',
                }}
              >
                <Row>
                  <Column>
                    {logoUrl && (
                      <Img
                        src={logoUrl}
                        alt="Logo"
                        width="32"
                        height="32"
                        style={{
                          borderRadius: '10px',
                          marginBottom: '14px',
                          border: '1px solid rgba(255,255,255,0.2)',
                        }}
                      />
                    )}
                    <Text
                      style={{
                        margin: '0 0 10px',
                        color: 'rgba(255,255,255,0.72)',
                        fontSize: '11px',
                        fontWeight: 700,
                        letterSpacing: '0.16em',
                        textTransform: 'uppercase',
                      }}
                    >
                      Notification Brief
                    </Text>
                    <Heading
                      style={{
                        margin: 0,
                        color: '#ffffff',
                        fontSize: '28px',
                        fontWeight: 700,
                        letterSpacing: '-0.02em',
                        fontFamily: 'Georgia, "Times New Roman", serif',
                      }}
                    >
                      {notificationCount === 0
                        ? "You're all caught up!"
                        : `${notificationCount} fresh update${notificationCount !== 1 ? 's' : ''}`}
                    </Heading>
                    <Text
                      style={{
                        margin: '8px 0 0',
                        color: 'rgba(255,255,255,0.8)',
                        fontSize: '14px',
                        lineHeight: '1.5',
                      }}
                    >
                      {workspaceName}
                      {timeRange ? ` · ${timeRange}` : ''}
                    </Text>
                  </Column>
                </Row>
              </Section>

              {/* Delay Warning Banner */}
              {isDelayed && (
                <Section
                  style={{
                    backgroundColor: '#fef3c7',
                    padding: '10px 16px',
                    borderBottom: '1px solid #fcd34d',
                  }}
                >
                  <Text
                    style={{
                      margin: 0,
                      color: '#8b5a1f',
                      fontSize: '12px',
                      textAlign: 'center',
                      fontWeight: 600,
                    }}
                  >
                    {delayText}. This digest includes updates from an earlier
                    window.
                  </Text>
                </Section>
              )}

              {/* Content */}
              <Section style={{ padding: '26px 24px 24px' }}>
                {/* Greeting */}
                <Text
                  style={{
                    margin: '0 0 18px',
                    color: '#43372c',
                    fontSize: '15px',
                    lineHeight: '1.7',
                  }}
                >
                  Hi {userName},{' '}
                  {notificationCount === 0
                    ? 'no new notifications to show.'
                    : "here's the latest activity worth reviewing:"}
                </Text>

                {/* Quick Stats */}
                {notificationCount > 0 && (
                  <QuickStats notifications={notifications} />
                )}

                {/* Grouped Notifications */}
                {notificationCount > 0 &&
                  Array.from(groups.entries()).map(([category, items]) => (
                    <NotificationGroup
                      key={category}
                      category={category}
                      notifications={items}
                      workspaceUrl={workspaceUrl}
                    />
                  ))}

                {/* Main CTA */}
                <Section style={{ textAlign: 'center', marginTop: '16px' }}>
                  <Button
                    href={
                      notificationCount === 0
                        ? workspaceUrl
                        : `${workspaceUrl}/notifications`
                    }
                    style={{
                      display: 'inline-block',
                      backgroundColor: '#1f3b2f',
                      color: '#ffffff',
                      fontSize: '14px',
                      fontWeight: 600,
                      padding: '14px 28px',
                      borderRadius: '999px',
                      textDecoration: 'none',
                      letterSpacing: '0.02em',
                    }}
                  >
                    {notificationCount === 0
                      ? 'Open workspace'
                      : 'Review all notifications'}
                  </Button>
                </Section>
              </Section>
            </Section>

            {/* Footer */}
            <Section style={{ textAlign: 'center', padding: '18px 4px 8px' }}>
              <Text
                style={{
                  margin: '0 0 8px',
                  color: '#6f6254',
                  fontSize: '12px',
                  lineHeight: '1.6',
                }}
              >
                <Link
                  href={`${workspaceUrl}/settings/notifications`}
                  style={{ color: '#1f3b2f', textDecoration: 'underline' }}
                >
                  Manage preferences
                </Link>
                {' · '}
                <Link
                  href={workspaceUrl}
                  style={{ color: '#6f6254', textDecoration: 'none' }}
                >
                  {workspaceName}
                </Link>
              </Text>
              <Text style={{ margin: 0, color: '#9a8a78', fontSize: '11px' }}>
                © {new Date().getFullYear()} Tuturuuu
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default NotificationDigestEmail;
