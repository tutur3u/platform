import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Tailwind,
  Text,
} from '@react-email/components';

type NotificationType =
  | 'task_assigned'
  | 'task_updated'
  | 'task_completed'
  | 'task_mention'
  | 'workspace_invite'
  | 'comment_added'
  | 'deadline_reminder'
  | 'general';

interface NotificationItem {
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
}

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://tuturuuu.com';

const NOTIFICATION_CONFIG: Record<
  NotificationType,
  { label: string; color: string; bgColor: string }
> = {
  task_assigned: {
    label: 'Task Assigned',
    color: '#2563eb',
    bgColor: '#dbeafe',
  },
  task_updated: {
    label: 'Task Updated',
    color: '#7c3aed',
    bgColor: '#ede9fe',
  },
  task_completed: {
    label: 'Task Completed',
    color: '#059669',
    bgColor: '#d1fae5',
  },
  task_mention: {
    label: 'Mentioned',
    color: '#d97706',
    bgColor: '#fef3c7',
  },
  workspace_invite: {
    label: 'Invitation',
    color: '#0891b2',
    bgColor: '#cffafe',
  },
  comment_added: {
    label: 'New Comment',
    color: '#4f46e5',
    bgColor: '#e0e7ff',
  },
  deadline_reminder: {
    label: 'Deadline',
    color: '#dc2626',
    bgColor: '#fee2e2',
  },
  general: {
    label: 'Notification',
    color: '#6b7280',
    bgColor: '#f3f4f6',
  },
};

const getNotificationConfig = (type: string) => {
  return (
    NOTIFICATION_CONFIG[type as NotificationType] || NOTIFICATION_CONFIG.general
  );
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
    hour: 'numeric',
    minute: '2-digit',
  });
};

const NotificationCard = ({
  notification,
  workspaceUrl,
}: {
  notification: NotificationItem;
  workspaceUrl: string;
}) => {
  const config = getNotificationConfig(notification.type);
  const actionUrl = notification.actionUrl || workspaceUrl;

  return (
    <Section
      style={{
        backgroundColor: '#ffffff',
        borderRadius: '12px',
        border: '1px solid #e5e7eb',
        marginBottom: '12px',
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
        <td style={{ padding: '16px 20px' }}>
          <table cellPadding="0" cellSpacing="0" style={{ width: '100%' }}>
            <tr>
              <td>
                <span
                  style={{
                    display: 'inline-block',
                    padding: '4px 10px',
                    backgroundColor: config.bgColor,
                    color: config.color,
                    fontSize: '11px',
                    fontWeight: 600,
                    borderRadius: '9999px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  {config.label}
                </span>
                <span
                  style={{
                    marginLeft: '12px',
                    fontSize: '12px',
                    color: '#9ca3af',
                  }}
                >
                  {formatRelativeTime(notification.createdAt)}
                </span>
              </td>
            </tr>
            <tr>
              <td style={{ paddingTop: '10px' }}>
                <Link
                  href={actionUrl}
                  style={{
                    color: '#111827',
                    fontSize: '15px',
                    fontWeight: 600,
                    textDecoration: 'none',
                    lineHeight: '1.4',
                  }}
                >
                  {notification.title}
                </Link>
              </td>
            </tr>
            {notification.description && (
              <tr>
                <td style={{ paddingTop: '6px' }}>
                  <Text
                    style={{
                      margin: 0,
                      color: '#6b7280',
                      fontSize: '14px',
                      lineHeight: '1.5',
                    }}
                  >
                    {notification.description}
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

export const NotificationDigestEmail = ({
  userName = 'there',
  workspaceName = 'Your Workspace',
  notifications = [],
  workspaceUrl = BASE_URL,
  logoUrl,
}: NotificationDigestEmailProps) => {
  const notificationCount = notifications.length;
  const previewText =
    notificationCount === 0
      ? `No new notifications in ${workspaceName}`
      : `${notificationCount} new notification${notificationCount !== 1 ? 's' : ''} in ${workspaceName}`;

  return (
    <Html>
      <Head>
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
      </Head>
      <Preview>{previewText}</Preview>
      <Tailwind>
        <Body
          style={{
            backgroundColor: '#f8fafc',
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
            margin: 0,
            padding: '40px 0',
          }}
        >
          <Container
            style={{
              maxWidth: '560px',
              margin: '0 auto',
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              boxShadow:
                '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <Section
              style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                padding: '32px 40px',
                textAlign: 'center',
              }}
            >
              {logoUrl && (
                <Img
                  src={logoUrl}
                  alt="Tuturuuu"
                  width="48"
                  height="48"
                  style={{
                    margin: '0 auto 16px',
                    borderRadius: '12px',
                  }}
                />
              )}
              <Heading
                style={{
                  margin: 0,
                  color: '#ffffff',
                  fontSize: '24px',
                  fontWeight: 700,
                  letterSpacing: '-0.025em',
                }}
              >
                Notification Digest
              </Heading>
              <Text
                style={{
                  margin: '8px 0 0',
                  color: 'rgba(255, 255, 255, 0.85)',
                  fontSize: '14px',
                }}
              >
                {workspaceName}
              </Text>
            </Section>

            {/* Content */}
            <Section style={{ padding: '32px 24px' }}>
              {/* Greeting */}
              <Text
                style={{
                  margin: '0 0 8px',
                  color: '#111827',
                  fontSize: '18px',
                  fontWeight: 600,
                }}
              >
                Hi {userName},
              </Text>
              <Text
                style={{
                  margin: '0 0 24px',
                  color: '#6b7280',
                  fontSize: '14px',
                  lineHeight: '1.6',
                }}
              >
                {notificationCount === 0
                  ? "You're all caught up! No new notifications."
                  : `You have ${notificationCount} new notification${notificationCount !== 1 ? 's' : ''} waiting for your attention.`}
              </Text>

              {/* Notifications */}
              {notificationCount > 0 && (
                <Section style={{ marginBottom: '24px' }}>
                  {notifications.map((notification) => (
                    <NotificationCard
                      key={notification.id}
                      notification={notification}
                      workspaceUrl={workspaceUrl}
                    />
                  ))}
                </Section>
              )}

              {/* CTA */}
              <Section style={{ textAlign: 'center', marginTop: '8px' }}>
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
                    padding: '14px 28px',
                    borderRadius: '10px',
                    textDecoration: 'none',
                    textAlign: 'center',
                    boxShadow: '0 2px 4px rgba(79, 70, 229, 0.3)',
                  }}
                >
                  {notificationCount === 0
                    ? 'Go to Workspace'
                    : 'View All Notifications'}
                </Button>
              </Section>
            </Section>

            <Hr
              style={{
                borderColor: '#e5e7eb',
                margin: 0,
              }}
            />

            {/* Footer */}
            <Section
              style={{
                padding: '24px',
                backgroundColor: '#f9fafb',
              }}
            >
              <Text
                style={{
                  margin: '0 0 12px',
                  color: '#6b7280',
                  fontSize: '12px',
                  textAlign: 'center',
                  lineHeight: '1.6',
                }}
              >
                You received this email because you have notifications enabled
                for{' '}
                <span style={{ fontWeight: 600, color: '#374151' }}>
                  {workspaceName}
                </span>
                .
              </Text>
              <Text
                style={{
                  margin: '0 0 16px',
                  color: '#6b7280',
                  fontSize: '12px',
                  textAlign: 'center',
                }}
              >
                <Link
                  href={`${workspaceUrl}/settings/notifications`}
                  style={{
                    color: '#4f46e5',
                    textDecoration: 'underline',
                  }}
                >
                  Manage notification preferences
                </Link>
              </Text>
              <Text
                style={{
                  margin: 0,
                  color: '#9ca3af',
                  fontSize: '11px',
                  textAlign: 'center',
                }}
              >
                {new Date().getFullYear()} Tuturuuu. All rights reserved.
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default NotificationDigestEmail;
