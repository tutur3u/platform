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

export interface NotificationItem {
  id: string;
  type: NotificationType | string;
  title: string;
  description?: string;
  data?: Record<string, unknown>;
  createdAt: string;
  actionUrl?: string;
}

interface NotificationDigestEmailProps {
  userName?: string;
  workspaceName?: string;
  notifications?: NotificationItem[];
  workspaceUrl?: string;
  logoUrl?: string;
  subjectLine?: string;
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

export const getNotificationConfig = (type: string) => {
  return (
    NOTIFICATION_CONFIG[type as NotificationType] || NOTIFICATION_CONFIG.general
  );
};

// Generate smart subject line based on notification content
export const generateSubjectLine = (
  notifications: NotificationItem[],
  workspaceName: string
): string => {
  if (notifications.length === 0) {
    return `Updates from ${workspaceName}`;
  }

  // Sort by priority (lower = more important)
  const sorted = [...notifications].sort((a, b) => {
    const priorityA = getNotificationConfig(a.type).priority;
    const priorityB = getNotificationConfig(b.type).priority;
    return priorityA - priorityB;
  });

  const primary = sorted[0]!;
  const config = getNotificationConfig(primary.type);
  const remaining = notifications.length - 1;
  const remainingText = remaining > 0 ? ` (+${remaining} more)` : '';

  // Generate contextual subject based on notification type
  switch (primary.type) {
    case 'workspace_invite':
      return `${config.emoji} You're invited to ${(primary.data?.workspace_name as string) || workspaceName}${remainingText}`;

    case 'deadline_reminder':
      return `${config.emoji} Deadline: ${primary.title}${remainingText}`;

    case 'task_assigned':
      return `${config.emoji} New task: ${primary.title}${remainingText}`;

    case 'task_mention':
      return `${config.emoji} ${(primary.data?.mentioned_by as string) || 'Someone'} mentioned you${remainingText}`;

    case 'comment_added':
      return `${config.emoji} New comment on "${truncate(primary.title, 30)}"${remainingText}`;

    case 'task_completed':
      return `${config.emoji} Task completed: ${primary.title}${remainingText}`;

    case 'task_updated':
      return `${config.emoji} Updated: ${primary.title}${remainingText}`;

    default:
      if (notifications.length === 1) {
        return `${config.emoji} ${primary.title}`;
      }
      return `${config.emoji} ${notifications.length} updates from ${workspaceName}`;
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

// Group notifications by type for better organization
const groupNotificationsByType = (
  notifications: NotificationItem[]
): Map<string, NotificationItem[]> => {
  const groups = new Map<string, NotificationItem[]>();

  // Sort by priority first
  const sorted = [...notifications].sort((a, b) => {
    const priorityA = getNotificationConfig(a.type).priority;
    const priorityB = getNotificationConfig(b.type).priority;
    return priorityA - priorityB;
  });

  for (const notification of sorted) {
    const type = notification.type;
    if (!groups.has(type)) {
      groups.set(type, []);
    }
    groups.get(type)!.push(notification);
  }

  return groups;
};

const NotificationCard = ({
  notification,
  workspaceUrl,
  isCompact = false,
}: {
  notification: NotificationItem;
  workspaceUrl: string;
  isCompact?: boolean;
}) => {
  const config = getNotificationConfig(notification.type);
  const actionUrl = notification.actionUrl || workspaceUrl;

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
        backgroundColor: '#ffffff',
        borderRadius: '8px',
        border: '1px solid #e5e7eb',
        marginBottom: '8px',
        overflow: 'hidden',
      }}
    >
      <Row>
        <td
          style={{
            width: '4px',
            backgroundColor: config.color,
            padding: 0,
          }}
        />
        <td style={{ padding: '12px 16px' }}>
          <table cellPadding="0" cellSpacing="0" style={{ width: '100%' }}>
            <tr>
              <td>
                <Link
                  href={actionUrl}
                  style={{
                    color: '#111827',
                    fontSize: '14px',
                    fontWeight: 600,
                    textDecoration: 'none',
                    lineHeight: '1.4',
                  }}
                >
                  {notification.title}
                </Link>
              </td>
              <td style={{ textAlign: 'right', verticalAlign: 'top' }}>
                <span style={{ color: '#9ca3af', fontSize: '12px' }}>
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
                      color: '#6b7280',
                      fontSize: '13px',
                      lineHeight: '1.4',
                    }}
                  >
                    {truncate(notification.description, 120)}
                  </Text>
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
  type,
  notifications,
  workspaceUrl,
}: {
  type: string;
  notifications: NotificationItem[];
  workspaceUrl: string;
}) => {
  const config = getNotificationConfig(type);
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
              backgroundColor: config.bgColor,
              color: config.color,
              padding: '4px 10px',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            {config.emoji} {config.label}
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
                +{hiddenCount} more {config.label.toLowerCase()}
                {hiddenCount > 1 ? 's' : ''} →
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
  const groups = groupNotificationsByType(notifications);
  const stats: Array<{ emoji: string; count: number; label: string }> = [];

  groups.forEach((items, type) => {
    const config = getNotificationConfig(type);
    stats.push({
      emoji: config.emoji,
      count: items.length,
      label: config.label,
    });
  });

  if (stats.length <= 1) return null;

  return (
    <Section
      style={{
        backgroundColor: '#f9fafb',
        borderRadius: '8px',
        padding: '12px 16px',
        marginBottom: '20px',
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
                    ? '1px solid #e5e7eb'
                    : 'none',
                padding: '0 8px',
              }}
            >
              <Text
                style={{
                  margin: 0,
                  fontSize: '18px',
                  fontWeight: 700,
                  color: '#111827',
                }}
              >
                {stat.count}
              </Text>
              <Text
                style={{
                  margin: '2px 0 0',
                  fontSize: '11px',
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                {stat.emoji} {stat.label}
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
}: NotificationDigestEmailProps) => {
  const notificationCount = notifications.length;
  const groups = groupNotificationsByType(notifications);

  // Get the most important notification for preview
  const sortedByPriority = [...notifications].sort((a, b) => {
    const priorityA = getNotificationConfig(a.type).priority;
    const priorityB = getNotificationConfig(b.type).priority;
    return priorityA - priorityB;
  });

  const primaryNotification = sortedByPriority[0];
  const previewText =
    notificationCount === 0
      ? `No new notifications in ${workspaceName}`
      : primaryNotification
        ? `${getNotificationConfig(primaryNotification.type).emoji} ${primaryNotification.title}${notificationCount > 1 ? ` and ${notificationCount - 1} more` : ''}`
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
            backgroundColor: '#f3f4f6',
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
            margin: 0,
            padding: '24px 16px',
          }}
        >
          <Container
            style={{
              maxWidth: '520px',
              margin: '0 auto',
            }}
          >
            {/* Header Card */}
            <Section
              style={{
                backgroundColor: '#ffffff',
                borderRadius: '12px',
                overflow: 'hidden',
                marginBottom: '12px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
              }}
            >
              {/* Gradient Header */}
              <Section
                style={{
                  background:
                    'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                  padding: '24px',
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
                          borderRadius: '6px',
                          marginBottom: '12px',
                        }}
                      />
                    )}
                    <Heading
                      style={{
                        margin: 0,
                        color: '#ffffff',
                        fontSize: '20px',
                        fontWeight: 700,
                      }}
                    >
                      {notificationCount === 0
                        ? "You're all caught up!"
                        : `${notificationCount} new update${notificationCount !== 1 ? 's' : ''}`}
                    </Heading>
                    <Text
                      style={{
                        margin: '4px 0 0',
                        color: 'rgba(255,255,255,0.8)',
                        fontSize: '13px',
                      }}
                    >
                      {workspaceName}
                    </Text>
                  </Column>
                </Row>
              </Section>

              {/* Content */}
              <Section style={{ padding: '20px' }}>
                {/* Greeting */}
                <Text
                  style={{
                    margin: '0 0 16px',
                    color: '#374151',
                    fontSize: '14px',
                    lineHeight: '1.5',
                  }}
                >
                  Hi {userName},{' '}
                  {notificationCount === 0
                    ? 'no new notifications to show.'
                    : "here's what needs your attention:"}
                </Text>

                {/* Quick Stats */}
                {notificationCount > 0 && (
                  <QuickStats notifications={notifications} />
                )}

                {/* Grouped Notifications */}
                {notificationCount > 0 &&
                  Array.from(groups.entries()).map(([type, items]) => (
                    <NotificationGroup
                      key={type}
                      type={type}
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
                      backgroundColor: '#4f46e5',
                      color: '#ffffff',
                      fontSize: '14px',
                      fontWeight: 600,
                      padding: '12px 24px',
                      borderRadius: '8px',
                      textDecoration: 'none',
                    }}
                  >
                    {notificationCount === 0
                      ? 'Go to Workspace'
                      : 'View All Notifications'}
                  </Button>
                </Section>
              </Section>
            </Section>

            {/* Footer */}
            <Section style={{ textAlign: 'center', padding: '16px 0' }}>
              <Text
                style={{
                  margin: '0 0 8px',
                  color: '#6b7280',
                  fontSize: '12px',
                }}
              >
                <Link
                  href={`${workspaceUrl}/settings/notifications`}
                  style={{ color: '#4f46e5', textDecoration: 'underline' }}
                >
                  Manage preferences
                </Link>
                {' • '}
                <Link
                  href={workspaceUrl}
                  style={{ color: '#6b7280', textDecoration: 'none' }}
                >
                  {workspaceName}
                </Link>
              </Text>
              <Text style={{ margin: 0, color: '#9ca3af', fontSize: '11px' }}>
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
