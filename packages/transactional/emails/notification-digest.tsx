import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Tailwind,
  Text,
} from '@react-email/components';

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  description: string;
  data: Record<string, any>;
  createdAt: string;
}

interface NotificationDigestEmailProps {
  userName?: string;
  workspaceName?: string;
  notifications?: NotificationItem[];
  workspaceUrl?: string;
}

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://tuturuuu.com';

const getNotificationIcon = (type: string) => {
  switch (type) {
    case 'task_assigned':
      return '📋';
    case 'task_updated':
      return '✏️';
    case 'task_mention':
      return '@';
    case 'workspace_invite':
      return '✉️';
    default:
      return '🔔';
  }
};

const getNotificationColor = (type: string) => {
  switch (type) {
    case 'task_assigned':
      return '#3b82f6'; // blue
    case 'task_updated':
      return '#8b5cf6'; // purple
    case 'task_mention':
      return '#f59e0b'; // amber
    case 'workspace_invite':
      return '#10b981'; // green
    default:
      return '#6b7280'; // gray
  }
};

export const NotificationDigestEmail = ({
  userName = 'User',
  workspaceName = 'Your Workspace',
  notifications = [],
  workspaceUrl = baseUrl,
}: NotificationDigestEmailProps) => {
  const previewText = `You have ${notifications.length} new notification${notifications.length !== 1 ? 's' : ''} in ${workspaceName}`;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Tailwind>
        <Body className="mx-auto my-auto bg-gray-50 font-sans">
          <Container className="mx-auto my-[40px] max-w-[600px] rounded-lg border border-gray-200 border-solid bg-white p-[20px] shadow-sm">
            {/* Header */}
            <Section className="mt-[16px]">
              <Heading className="mx-0 my-0 p-0 text-center font-bold text-[28px] text-gray-900">
                🔔 Tuturuuu Notifications
              </Heading>
              <Text className="mt-2 text-center text-[14px] text-gray-600">
                {workspaceName}
              </Text>
            </Section>

            <Hr className="mx-0 my-[24px] w-full border border-gray-200 border-solid" />

            {/* Greeting */}
            <Text className="text-[16px] text-gray-900 font-medium leading-[24px]">
              Hi {userName},
            </Text>
            <Text className="text-[14px] text-gray-700 leading-[24px]">
              You have {notifications.length} new notification
              {notifications.length !== 1 ? 's' : ''} waiting for you:
            </Text>

            {/* Notifications List */}
            <Section className="mt-[24px]">
              {notifications.map((notification, index) => (
                <div key={notification.id}>
                  <Section
                    className="mb-[16px] rounded-lg border border-gray-200 border-solid p-[16px]"
                    style={{
                      borderLeftWidth: '4px',
                      borderLeftColor: getNotificationColor(notification.type),
                    }}
                  >
                    <Text className="m-0 text-[12px] text-gray-500 uppercase tracking-wide">
                      {getNotificationIcon(notification.type)}{' '}
                      {notification.type.replace('_', ' ')}
                    </Text>
                    <Text className="mt-[8px] mb-[4px] text-[16px] font-semibold text-gray-900 leading-[20px]">
                      {notification.title}
                    </Text>
                    {notification.description && (
                      <Text className="mt-0 text-[14px] text-gray-700 leading-[20px]">
                        {notification.description}
                      </Text>
                    )}
                    <Text className="mt-[8px] text-[12px] text-gray-500">
                      {new Date(notification.createdAt).toLocaleString()}
                    </Text>
                  </Section>
                  {index < notifications.length - 1 && (
                    <div style={{ height: '8px' }} />
                  )}
                </div>
              ))}
            </Section>

            {/* CTA Button */}
            <Section className="mt-[32px] mb-[32px] text-center">
              <Button
                className="rounded-lg bg-blue-600 px-6 py-3 text-center font-semibold text-[14px] text-white no-underline"
                href={workspaceUrl}
              >
                View All Notifications
              </Button>
            </Section>

            {/* Alternative Link */}
            <Text className="text-center text-[12px] text-gray-600 leading-[20px]">
              or copy and paste this URL into your browser:{' '}
              <Link href={workspaceUrl} className="text-blue-600 no-underline">
                {workspaceUrl}
              </Link>
            </Text>

            <Hr className="mx-0 my-[26px] w-full border border-gray-200 border-solid" />

            {/* Footer */}
            <Text className="text-center text-[12px] text-gray-500 leading-[20px]">
              You received this email because you have notifications enabled for{' '}
              <span className="font-medium text-gray-700">{workspaceName}</span>
              .
            </Text>
            <Text className="text-center text-[12px] text-gray-500 leading-[20px]">
              To manage your notification preferences,{' '}
              <Link
                href={`${workspaceUrl}/settings/notifications`}
                className="text-blue-600 no-underline"
              >
                click here
              </Link>
              .
            </Text>
            <Text className="text-center text-[12px] text-gray-500 leading-[20px] mt-[16px]">
              © {new Date().getFullYear()} Tuturuuu. All rights reserved.
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default NotificationDigestEmail;
