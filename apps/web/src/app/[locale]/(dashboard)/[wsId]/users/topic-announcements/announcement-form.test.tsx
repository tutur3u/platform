import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AnnouncementForm } from './announcement-form';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values
      ? `${key}:${Object.entries(values)
          .map(([valueKey, value]) => `${valueKey}=${value}`)
          .join(',')}`
      : key,
}));

vi.mock('@tuturuuu/ui/date-time-picker', () => ({
  DateTimePicker: () => (
    <div data-testid="schedule-picker">schedule picker</div>
  ),
}));

const verifiedContact = {
  archived: false,
  createdAt: '2026-05-20T00:00:00.000Z',
  email: 'teacher@example.com',
  id: 'contact-1',
  metadata: {},
  name: 'Teacher One',
  tags: [],
  verificationStatus: 'verified' as const,
  workspaceUserId: null,
};

function renderForm(
  overrides: Partial<Parameters<typeof AnnouncementForm>[0]> = {}
) {
  const props = {
    canSend: true,
    contacts: [verifiedContact],
    groups: [],
    isCreating: false,
    isSavingTemplate: false,
    isScheduling: false,
    isSending: false,
    onCreate: vi.fn().mockResolvedValue(undefined),
    onCreateAndSchedule: vi.fn().mockResolvedValue(undefined),
    onCreateAndSend: vi.fn().mockResolvedValue(undefined),
    onSaveTemplate: vi.fn(),
    onTimezoneRequired: vi.fn(),
    onUploadAttachment: vi.fn(),
    schedulingTimezone: 'Asia/Ho_Chi_Minh',
    templates: [],
    workspaceUsers: [],
    ...overrides,
  };

  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <AnnouncementForm {...props} />
    </QueryClientProvider>
  );
  return props;
}

function completeRequiredSteps() {
  fireEvent.change(screen.getByLabelText('announcement_title'), {
    target: { value: 'Unit 3 speaking practice' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'next' }));

  fireEvent.change(screen.getByLabelText('topic_primary_label'), {
    target: { value: 'Practice speaking about weekend plans.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'next' }));

  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'next' }));
}

describe('AnnouncementForm', () => {
  it('gates each step and saves a reviewed draft payload', async () => {
    const props = renderForm();

    expect(screen.getByRole('button', { name: 'next' })).toBeDisabled();

    completeRequiredSteps();

    fireEvent.click(
      screen.getByRole('button', { name: 'announcement_submit_draft' })
    );

    await waitFor(() =>
      expect(props.onCreate).toHaveBeenCalledWith({
        attachmentDrafts: [],
        classLabel: null,
        contactIds: ['contact-1'],
        dayLabel: null,
        endTime: null,
        groupId: null,
        place: null,
        room: null,
        sessionDate: null,
        sourceType: 'manual',
        startTime: null,
        title: 'Unit 3 speaking practice',
        topic: 'Practice speaking about weekend plans.',
      })
    );
  });

  it('uploads media attachments and includes them in the reviewed draft payload', async () => {
    const onUploadAttachment = vi.fn().mockResolvedValue({
      contentType: 'application/pdf',
      fileName: 'lesson-plan.pdf',
      sizeBytes: 1234,
      storagePath: 'topic-announcements/drafts/lesson-plan.pdf',
      storageProvider: 'supabase',
    });
    const props = renderForm({ onUploadAttachment });

    fireEvent.change(screen.getByLabelText('announcement_title'), {
      target: { value: 'Unit 3 speaking practice' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'next' }));

    fireEvent.change(screen.getByLabelText('topic_primary_label'), {
      target: { value: 'Practice speaking about weekend plans.' },
    });
    fireEvent.change(screen.getByLabelText('attachments_upload_label'), {
      target: {
        files: [
          new File(['%PDF'], 'lesson-plan.pdf', {
            type: 'application/pdf',
          }),
        ],
      },
    });

    await waitFor(() =>
      expect(screen.getByText('lesson-plan.pdf')).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole('button', { name: 'next' }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'next' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'announcement_submit_draft' })
    );

    await waitFor(() =>
      expect(props.onCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          attachmentDrafts: [
            {
              contentType: 'application/pdf',
              fileName: 'lesson-plan.pdf',
              sizeBytes: 1234,
              storagePath: 'topic-announcements/drafts/lesson-plan.pdf',
              storageProvider: 'supabase',
            },
          ],
        })
      )
    );
  });

  it('creates and sends from the final delivery step', async () => {
    const props = renderForm();

    completeRequiredSteps();
    fireEvent.click(
      screen.getByRole('button', { name: 'announcement_delivery_send' })
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'announcement_submit_send' })
    );

    await waitFor(() =>
      expect(props.onCreateAndSend).toHaveBeenCalledWith(
        expect.objectContaining({
          contactIds: ['contact-1'],
          title: 'Unit 3 speaking practice',
        })
      )
    );
    expect(props.onCreate).not.toHaveBeenCalled();
  });

  it('creates and schedules from the final delivery step', async () => {
    const props = renderForm();

    completeRequiredSteps();
    fireEvent.click(
      screen.getByRole('button', { name: 'announcement_delivery_schedule' })
    );

    expect(screen.getByTestId('schedule-picker')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'announcement_submit_schedule' })
    );

    await waitFor(() =>
      expect(props.onCreateAndSchedule).toHaveBeenCalledWith(
        expect.objectContaining({
          contactIds: ['contact-1'],
          title: 'Unit 3 speaking practice',
        }),
        expect.any(String)
      )
    );
  });
});
