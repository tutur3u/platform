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

interface WorkspaceInviteEmailProps {
  inviteeName?: string;
  inviterName?: string;
  workspaceName?: string;
  workspaceId?: string;
  inviteUrl?: string;
}

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://tuturuuu.com';

export const WorkspaceInviteEmail = ({
  inviteeName = 'there',
  inviterName = 'Someone',
  workspaceName = 'a workspace',
  workspaceId,
  inviteUrl,
}: WorkspaceInviteEmailProps) => {
  const previewText = `${inviterName} invited you to join ${workspaceName} on Tuturuuu`;

  // Use provided invite URL or construct default
  const actionUrl =
    inviteUrl || (workspaceId ? `${baseUrl}/${workspaceId}` : baseUrl);

  return (
    <Html>
      <Tailwind>
        <Head />
        <Preview>{previewText}</Preview>
        <Body className="mx-auto my-auto bg-gray-50 font-sans">
          <Container className="mx-auto my-10 max-w-[600px] rounded-lg border border-gray-200 border-solid bg-white p-5 shadow-sm">
            {/* Header */}
            <Section className="mt-4">
              <Heading className="mx-0 my-0 p-0 text-center font-bold text-[28px] text-gray-900">
                ✉️ You&apos;re Invited!
              </Heading>
            </Section>

            <Hr className="mx-0 my-6 w-full border border-gray-200 border-solid" />

            {/* Main Content */}
            <Text className="font-medium text-[16px] text-gray-900 leading-6">
              Hi {inviteeName},
            </Text>
            <Text className="text-[14px] text-gray-700 leading-6">
              <span className="font-semibold text-gray-900">{inviterName}</span>{' '}
              has invited you to join{' '}
              <span className="font-semibold text-blue-600">
                {workspaceName}
              </span>{' '}
              on Tuturuuu.
            </Text>

            <Text className="text-[14px] text-gray-700 leading-6">
              Tuturuuu helps teams collaborate more effectively with powerful
              tools for task management, project tracking, and team
              communication.
            </Text>

            {/* Feature highlights */}
            <Section className="mt-4 mb-6 rounded-lg bg-gray-50 p-4">
              <Text className="m-0 font-medium text-[14px] text-gray-900">
                What you can do in {workspaceName}:
              </Text>
              <ul className="mt-2 pl-4 text-[14px] text-gray-700 leading-6">
                <li>📋 Collaborate on tasks and projects</li>
                <li>💬 Communicate with team members</li>
                <li>📊 Track progress and deadlines</li>
                <li>🔔 Stay updated with notifications</li>
              </ul>
            </Section>

            {/* CTA Button */}
            <Section className="mt-8 mb-8 text-center">
              <Button
                className="rounded-lg bg-blue-600 px-8 py-4 text-center font-semibold text-[16px] text-white no-underline"
                href={actionUrl}
              >
                Accept Invitation
              </Button>
            </Section>

            {/* Alternative Link */}
            <Text className="text-center text-[12px] text-gray-600 leading-5">
              or copy and paste this URL into your browser:{' '}
              <Link href={actionUrl} className="text-blue-600 no-underline">
                {actionUrl}
              </Link>
            </Text>

            <Hr className="mx-0 my-[26px] w-full border border-gray-200 border-solid" />

            {/* Footer */}
            <Text className="text-center text-[12px] text-gray-500 leading-5">
              If you weren&apos;t expecting this invitation, you can safely
              ignore this email.
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

export default WorkspaceInviteEmail;
