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

interface DeadlineReminderEmailProps {
  userName?: string;
  taskName?: string;
  boardName?: string;
  workspaceName?: string;
  dueDate?: string;
  reminderInterval?: string;
  taskUrl?: string;
}

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://tuturuuu.com';

export const DeadlineReminderEmail = ({
  userName = 'there',
  taskName = 'Untitled Task',
  boardName = 'Board',
  workspaceName = 'Workspace',
  dueDate,
  reminderInterval = '24 hours',
  taskUrl,
}: DeadlineReminderEmailProps) => {
  const previewText = `Task "${taskName}" is due in ${reminderInterval}`;

  const formattedDueDate = dueDate
    ? new Date(dueDate).toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
      })
    : 'soon';

  const actionUrl = taskUrl || baseUrl;

  // Determine urgency level for styling
  const isUrgent =
    reminderInterval === '1 hour' ||
    reminderInterval === '30 minutes' ||
    reminderInterval === '1h' ||
    reminderInterval === '30m';

  return (
    <Html>
      <Tailwind>
        <Head />
        <Preview>{previewText}</Preview>
        <Body className="mx-auto my-auto bg-gray-50 font-sans">
          <Container className="mx-auto my-10 max-w-[600px] rounded-lg border border-gray-200 border-solid bg-white p-5 shadow-sm">
            {/* Header */}
            <Section className="mt-4">
              <Heading
                className={`mx-0 my-0 p-0 text-center font-bold text-[28px] ${isUrgent ? 'text-red-600' : 'text-orange-500'}`}
              >
                {isUrgent ? '🚨' : '⏰'} Task Due {isUrgent ? 'Very ' : ''}Soon
              </Heading>
            </Section>

            <Hr className="mx-0 my-6 w-full border border-gray-200 border-solid" />

            {/* Main Content */}
            <Text className="font-medium text-[16px] text-gray-900 leading-6">
              Hi {userName},
            </Text>
            <Text className="text-[14px] text-gray-700 leading-6">
              This is a reminder that your task is due in{' '}
              <span
                className={`font-semibold ${isUrgent ? 'text-red-600' : 'text-orange-500'}`}
              >
                {reminderInterval}
              </span>
              .
            </Text>

            {/* Task Details Box */}
            <Section
              className={`mt-4 mb-6 rounded-lg p-4 ${isUrgent ? 'bg-red-50 border border-red-200' : 'bg-orange-50 border border-orange-200'}`}
            >
              <Text className="m-0 font-semibold text-[16px] text-gray-900">
                {taskName}
              </Text>
              <Text className="mt-2 mb-0 text-[14px] text-gray-600">
                Board: {boardName}
              </Text>
              <Text className="mt-1 mb-0 text-[14px] text-gray-600">
                Workspace: {workspaceName}
              </Text>
              <Hr className="my-3 w-full border border-gray-200 border-solid" />
              <Text
                className={`m-0 font-semibold text-[14px] ${isUrgent ? 'text-red-600' : 'text-orange-600'}`}
              >
                Due: {formattedDueDate}
              </Text>
            </Section>

            {/* CTA Button */}
            <Section className="mt-8 mb-8 text-center">
              <Button
                className={`rounded-lg px-8 py-4 text-center font-semibold text-[16px] text-white no-underline ${isUrgent ? 'bg-red-600' : 'bg-orange-500'}`}
                href={actionUrl}
              >
                View Task
              </Button>
            </Section>

            {/* Alternative Link */}
            <Text className="text-center text-[12px] text-gray-600 leading-5">
              or copy and paste this URL into your browser:{' '}
              <Link
                href={actionUrl}
                className={`no-underline ${isUrgent ? 'text-red-600' : 'text-orange-500'}`}
              >
                {actionUrl}
              </Link>
            </Text>

            <Hr className="mx-0 my-[26px] w-full border border-gray-200 border-solid" />

            {/* Footer */}
            <Text className="text-center text-[12px] text-gray-500 leading-5">
              You are receiving this because you are watching this task. You can
              manage your notification preferences in your account settings.
            </Text>
            <Text className="mt-4 text-center text-[12px] text-gray-500 leading-5">
              © {new Date().getFullYear()} Tuturuuu. All rights reserved.
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default DeadlineReminderEmail;
