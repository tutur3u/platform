import {
  Body,
  Button,
  Container,
  Head,
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

const formatDueDate = (dueDate?: string) => {
  if (!dueDate) {
    return 'Soon';
  }

  const parsedDate = new Date(dueDate);
  if (Number.isNaN(parsedDate.getTime())) {
    return 'Soon';
  }

  return parsedDate.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
};

const getUrgency = (reminderInterval: string) => {
  const normalizedInterval = reminderInterval.trim().toLowerCase();
  const isCritical = ['30 minutes', '1 hour', '30m', '1h'].includes(
    normalizedInterval
  );

  if (isCritical) {
    return {
      label: 'Critical',
      accent: '#b91c1c',
      accentSoft: '#fef2f2',
      accentBorder: '#fecaca',
      summary: 'This task needs attention now.',
    };
  }

  return {
    label: 'Upcoming',
    accent: '#c2410c',
    accentSoft: '#fff7ed',
    accentBorder: '#fdba74',
    summary: 'This task is getting close to its due time.',
  };
};

export const DeadlineReminderEmail = ({
  userName = 'there',
  taskName = 'Untitled Task',
  boardName = 'Board',
  workspaceName = 'Workspace',
  dueDate,
  reminderInterval = '24 hours',
  taskUrl,
}: DeadlineReminderEmailProps) => {
  const previewText = `${taskName} is due in ${reminderInterval}`;
  const actionUrl = taskUrl || baseUrl;
  const formattedDueDate = formatDueDate(dueDate);
  const urgency = getUrgency(reminderInterval);

  return (
    <Html>
      <Tailwind>
        <Head />
        <Preview>{previewText}</Preview>
        <Body
          className="mx-auto my-auto"
          style={{
            background:
              'linear-gradient(180deg, #fffaf4 0%, #fff 24%, #f8fafc 100%)',
            fontFamily:
              '"Instrument Sans", "Helvetica Neue", Helvetica, Arial, sans-serif',
          }}
        >
          <Container
            className="mx-auto my-10 max-w-[640px] overflow-hidden rounded-[28px] border border-solid bg-white shadow-[0_24px_70px_rgba(15,23,42,0.08)]"
            style={{ borderColor: '#e7ded1' }}
          >
            <Section
              className="px-10 pt-10 pb-8"
              style={{
                background:
                  'radial-gradient(circle at top left, #fff0d6 0%, #ffffff 55%)',
              }}
            >
              <Text
                className="m-0 inline-block rounded-full border border-solid px-3 py-1 font-semibold text-[11px] uppercase tracking-[0.24em]"
                style={{
                  color: urgency.accent,
                  backgroundColor: urgency.accentSoft,
                  borderColor: urgency.accentBorder,
                }}
              >
                {urgency.label} Deadline Reminder
              </Text>

              <Text
                className="mt-6 mb-0 font-semibold text-[40px] leading-[1.05] tracking-[-0.04em]"
                style={{
                  color: '#111827',
                  fontFamily:
                    '"Cormorant Garamond", Georgia, "Times New Roman", serif',
                }}
              >
                {taskName}
              </Text>

              <Text className="mt-4 mb-0 text-[16px] text-slate-700 leading-7">
                Hi {userName}, this task is due in{' '}
                <span
                  className="font-semibold"
                  style={{ color: urgency.accent }}
                >
                  {reminderInterval}
                </span>
                . {urgency.summary}
              </Text>

              <Section
                className="mt-8 rounded-[24px] border border-solid p-6"
                style={{
                  backgroundColor: urgency.accentSoft,
                  borderColor: urgency.accentBorder,
                }}
              >
                <Text
                  className="m-0 font-semibold text-[12px] uppercase tracking-[0.18em]"
                  style={{ color: urgency.accent }}
                >
                  Due Window
                </Text>
                <Text className="mt-3 mb-0 font-semibold text-[28px] text-slate-950 leading-8">
                  {formattedDueDate}
                </Text>

                <Section className="mt-6">
                  <Text className="m-0 text-[13px] text-slate-500 uppercase tracking-[0.16em]">
                    Workspace
                  </Text>
                  <Text className="mt-2 mb-0 font-medium text-[16px] text-slate-900">
                    {workspaceName}
                  </Text>
                </Section>

                <Section className="mt-5">
                  <Text className="m-0 text-[13px] text-slate-500 uppercase tracking-[0.16em]">
                    Board
                  </Text>
                  <Text className="mt-2 mb-0 font-medium text-[16px] text-slate-900">
                    {boardName}
                  </Text>
                </Section>
              </Section>

              <Section className="mt-8 text-center">
                <Button
                  className="rounded-full px-8 py-4 font-semibold text-[15px] text-white no-underline"
                  href={actionUrl}
                  style={{ backgroundColor: urgency.accent }}
                >
                  Open task
                </Button>
              </Section>
            </Section>

            <Section className="px-10 pb-10">
              <Section className="rounded-[22px] border border-solid bg-slate-50 px-6 py-5">
                <Text className="m-0 font-semibold text-[13px] text-slate-500 uppercase tracking-[0.16em]">
                  Why you received this
                </Text>
                <Text className="mt-3 mb-0 text-[14px] text-slate-700 leading-6">
                  You are watching this task and email reminders are enabled for
                  deadline alerts.
                </Text>
              </Section>

              <Text className="mt-6 mb-0 text-center text-[12px] text-slate-500 leading-5">
                If the button does not work, open this link directly:
              </Text>
              <Text className="mt-2 mb-0 text-center text-[12px] leading-5">
                <Link
                  href={actionUrl}
                  style={{ color: urgency.accent, textDecoration: 'none' }}
                >
                  {actionUrl}
                </Link>
              </Text>

              <Hr className="my-8 w-full border border-slate-200 border-solid" />

              <Text className="m-0 text-center text-[12px] text-slate-500 leading-5">
                Tuturuuu sends reminders close to the due time so you can act
                without digging through notification history.
              </Text>
              <Text className="mt-3 mb-0 text-center text-[12px] text-slate-400 leading-5">
                © {new Date().getFullYear()} Tuturuuu
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default DeadlineReminderEmail;
