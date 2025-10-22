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
  Section,
  Tailwind,
  Text,
} from '@react-email/components';

interface TaskAssignedEmailProps {
  assigneeName?: string;
  assigneeEmail?: string;
  taskName?: string;
  taskDescription?: string;
  assignedByName?: string;
  assignedByEmail?: string;
  taskUrl?: string;
  workspaceName?: string;
  priority?: 'critical' | 'high' | 'normal' | 'low';
  dueDate?: string;
}

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://tuturuuu.com';

const priorityColors = {
  critical: '#dc2626',
  high: '#ea580c',
  normal: '#059669',
  low: '#6b7280',
};

const priorityLabels = {
  critical: 'Critical',
  high: 'High',
  normal: 'Normal',
  low: 'Low',
};

export const TaskAssignedEmail = ({
  assigneeName = 'User',
  assigneeEmail = 'user@example.com',
  taskName = 'Sample Task',
  taskDescription = 'This is a sample task description',
  assignedByName = 'Team Member',
  assignedByEmail = 'member@example.com',
  taskUrl = `${baseUrl}/tasks/123`,
  workspaceName = 'My Workspace',
  priority = 'normal',
  dueDate,
}: TaskAssignedEmailProps) => {
  const previewText = `${assignedByName} assigned you a task: ${taskName}`;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Tailwind>
        <Body className="mx-auto my-auto bg-white font-sans">
          <Container className="mx-auto my-[40px] w-[465px] rounded border border-[#eaeaea] border-solid p-[20px]">
            <Section className="mt-[32px]">
              <Img
                src={`${baseUrl}/media/logo.png`}
                width="40"
                height="40"
                alt="Tuturuuu"
                className="mx-auto my-0"
              />
            </Section>
            <Heading className="mx-0 my-[30px] p-0 text-center font-normal text-[24px] text-black">
              You've been assigned a task
            </Heading>
            <Text className="text-[14px] text-black leading-[24px]">
              Hi {assigneeName},
            </Text>
            <Text className="text-[14px] text-black leading-[24px]">
              <strong>{assignedByName}</strong> (
              <Link
                href={`mailto:${assignedByEmail}`}
                className="text-blue-600 no-underline"
              >
                {assignedByEmail}
              </Link>
              ) has assigned you a task in <strong>{workspaceName}</strong>.
            </Text>

            <Section className="my-[32px] rounded border border-[#eaeaea] border-solid p-[24px]">
              <Heading className="m-0 mb-[12px] text-[18px] font-semibold text-black">
                {taskName}
              </Heading>
              {taskDescription && (
                <Text className="m-0 mb-[16px] text-[14px] text-[#666666] leading-[20px]">
                  {taskDescription}
                </Text>
              )}
              <Section className="mt-[16px]">
                {priority && (
                  <Text className="m-0 mb-[8px] text-[12px] text-[#666666]">
                    <strong>Priority:</strong>{' '}
                    <span
                      style={{
                        color: priorityColors[priority],
                        fontWeight: 600,
                      }}
                    >
                      {priorityLabels[priority]}
                    </span>
                  </Text>
                )}
                {dueDate && (
                  <Text className="m-0 text-[12px] text-[#666666]">
                    <strong>Due Date:</strong> {dueDate}
                  </Text>
                )}
              </Section>
            </Section>

            <Section className="mt-[32px] mb-[32px] text-center">
              <Button
                className="rounded bg-[#9333ea] px-5 py-3 text-center font-semibold text-[14px] text-white no-underline"
                href={taskUrl}
              >
                View Task
              </Button>
            </Section>

            <Text className="text-[14px] text-[#666666] leading-[24px]">
              or copy and paste this URL into your browser:{' '}
              <Link href={taskUrl} className="text-blue-600 no-underline">
                {taskUrl}
              </Link>
            </Text>

            <Hr className="mx-0 my-[26px] w-full border border-[#eaeaea] border-solid" />

            <Text className="text-[#666666] text-[12px] leading-[24px]">
              This notification was sent to{' '}
              <span className="text-black">{assigneeEmail}</span>. You're
              receiving this because you're a member of{' '}
              <strong>{workspaceName}</strong>. To manage your notification
              preferences, visit your account settings.
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default TaskAssignedEmail;
