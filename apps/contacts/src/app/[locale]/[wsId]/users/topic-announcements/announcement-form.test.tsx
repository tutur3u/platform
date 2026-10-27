import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnnouncementForm } from './announcement-form';

const mocks = vi.hoisted(() => ({
  previewTopicAnnouncementEmail: vi.fn(async () => ({
    data: {
      attachments: [],
      html: '<p>Rendered preview body</p>',
      subject: 'Rendered preview subject',
      text: 'Rendered preview text',
    },
  })),
}));

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

vi.mock('@tuturuuu/internal-api', () => ({
  getWorkspaceUser: vi.fn(async (_wsId: string, id: string) => ({
    display_name: null,
    email: null,
    full_name: `User ${id}`,
    id,
  })),
  listWorkspaceBasicUsers: vi.fn(async () => ({ count: 0, data: [] })),
  previewTopicAnnouncementEmail: mocks.previewTopicAnnouncementEmail,
}));

vi.mock('@tuturuuu/ui/hooks/use-debounce', () => ({
  useDebounce: (value: string) => [value],
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
    teacherAssignmentsEnabled: true,
    templates: [],
    workspaceUsers: [],
    wsId: 'workspace-1',
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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('with teacher assignments off (live workspaces)', () => {
    const PRE_FEATURE_DRAFT_PAYLOAD = {
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
    };

    it('shows no teacher UI and saves the pre-feature draft payload', async () => {
      const onNotifyTeachers = vi.fn();
      const onCreate = vi.fn().mockResolvedValue(undefined);
      renderForm({
        onCreate,
        onNotifyTeachers,
        teacherAssignmentsEnabled: false,
      });

      expect(screen.queryByText('teacher_assignment_title')).toBeNull();
      expect(screen.getByRole('button', { name: 'next' })).toBeDisabled();
      completeRequiredSteps();
      expect(screen.queryByLabelText('course_book_label')).toBeNull();
      fireEvent.click(
        screen.getByRole('button', { name: 'announcement_submit_draft' })
      );

      await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
      expect(onCreate.mock.calls[0]).toEqual([PRE_FEATURE_DRAFT_PAYLOAD]);
      expect(onNotifyTeachers).not.toHaveBeenCalled();
      await waitFor(() =>
        expect(screen.getByLabelText('announcement_title')).toHaveValue('')
      );
    });

    it('still requires a topic before the recipients step', () => {
      renderForm({ teacherAssignmentsEnabled: false });
      fireEvent.change(screen.getByLabelText('announcement_title'), {
        target: { value: 'Unit 3 speaking practice' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'next' }));
      expect(screen.queryByLabelText('course_book_label')).toBeNull();
      expect(screen.getByRole('button', { name: 'next' })).toBeDisabled();
    });

    it('creates and sends with the pre-feature call and keeps the draft on failure', async () => {
      const onCreateAndSend = vi.fn().mockRejectedValue(new Error('down'));
      renderForm({ onCreateAndSend, teacherAssignmentsEnabled: false });

      completeRequiredSteps();
      fireEvent.click(
        screen.getByRole('button', { name: 'announcement_delivery_send' })
      );
      fireEvent.click(
        screen.getByRole('button', { name: 'announcement_submit_send' })
      );

      await waitFor(() => expect(onCreateAndSend).toHaveBeenCalledTimes(1));
      expect(onCreateAndSend.mock.calls[0]).toEqual([
        PRE_FEATURE_DRAFT_PAYLOAD,
      ]);
      // The draft is kept: the composer stays on the review step.
      expect(
        screen.getByRole('button', { name: 'announcement_submit_send' })
      ).toBeInTheDocument();
      expect(screen.queryByLabelText('announcement_title')).toBeNull();
    });
  });

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
        courseBook: null,
        dayLabel: null,
        endTime: null,
        groupId: null,
        place: null,
        room: null,
        sessionDate: null,
        sourceType: 'manual',
        startTime: null,
        teacherWorkspaceUserId: null,
        title: 'Unit 3 speaking practice',
        topic: 'Practice speaking about weekend plans.',
        videoUrl: null,
      })
    );
  });

  it('uploads media attachments and includes them in the reviewed draft payload', async () => {
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const createObjectURL = vi.fn(() => 'blob:lesson-preview');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL,
    });
    const onUploadAttachment = vi.fn().mockResolvedValue({
      contentType: 'image/png',
      fileName: 'lesson-preview.png',
      sizeBytes: 1234,
      storagePath: 'topic-announcements/drafts/lesson-preview.png',
      storageProvider: 'supabase',
    });
    try {
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
            new File(['image'], 'lesson-preview.png', {
              type: 'image/png',
            }),
          ],
        },
      });

      const previewImage = await screen.findByRole('img', {
        name: 'lesson-preview.png',
      });
      expect(previewImage).toHaveAttribute('src', 'blob:lesson-preview');
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
                contentType: 'image/png',
                fileName: 'lesson-preview.png',
                sizeBytes: 1234,
                storagePath: 'topic-announcements/drafts/lesson-preview.png',
                storageProvider: 'supabase',
              },
            ],
          })
        )
      );
    } finally {
      Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        value: originalCreateObjectURL,
      });
      Object.defineProperty(URL, 'revokeObjectURL', {
        configurable: true,
        value: originalRevokeObjectURL,
      });
    }
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
        }),
        expect.any(Function)
      )
    );
    expect(props.onCreate).not.toHaveBeenCalled();
  });

  it('renders the actual email preview in the review step before submit', async () => {
    renderForm();

    completeRequiredSteps();

    expect(
      await screen.findByText('Rendered preview subject')
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'email_preview_open_full' })
    );

    expect(screen.getByText('email_preview_title')).toBeInTheDocument();
    expect(mocks.previewTopicAnnouncementEmail).toHaveBeenLastCalledWith(
      'workspace-1',
      expect.objectContaining({
        contactIds: ['contact-1'],
        title: 'Unit 3 speaking practice',
        topic: 'Practice speaking about weekend plans.',
      })
    );
  });

  it('saves a teacher-assigned draft without a topic and notifies the teacher', async () => {
    const onNotifyTeachers = vi.fn().mockResolvedValue(undefined);
    const props = renderForm({
      forkSeedId: 1,
      forkSource: {
        attachments: [],
        class_label: null,
        contacts: [verifiedContact],
        course_book: 'Starter',
        day_label: null,
        end_time: null,
        group_id: null,
        place: null,
        room: null,
        session_date: '2026-11-05',
        start_time: '18:30:00',
        teacher_workspace_user_id: 'teacher-wu',
        title: 'Monday session',
        topic: '',
        video_url: null,
      } as never,
      onCreate: vi.fn().mockResolvedValue('announcement-new'),
      onNotifyTeachers,
    });

    expect(screen.getByLabelText('teacher_notify_label')).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'next' }));
    expect(screen.getByText('topic_pending_teacher')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'next' }));
    fireEvent.click(screen.getByRole('button', { name: 'next' }));

    fireEvent.click(
      screen.getByRole('button', { name: 'announcement_delivery_send' })
    );
    expect(
      screen.getByRole('button', { name: 'announcement_submit_send' })
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole('button', { name: 'announcement_delivery_draft' })
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'announcement_submit_draft' })
    );

    await waitFor(() =>
      expect(onNotifyTeachers).toHaveBeenCalledWith(['announcement-new'])
    );
    expect(props.onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        courseBook: 'Starter',
        teacherWorkspaceUserId: 'teacher-wu',
        topic: '',
      })
    );
  });

  it('resets the form after create when the send then fails', async () => {
    const onCreateAndSend = vi.fn(
      async (_payload: unknown, onCreated?: (id: string) => void) => {
        onCreated?.('announcement-new');
        throw new Error('send failed');
      }
    );
    renderForm({ onCreateAndSend });

    completeRequiredSteps();
    fireEvent.click(
      screen.getByRole('button', { name: 'announcement_delivery_send' })
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'announcement_submit_send' })
    );

    await waitFor(() =>
      expect(screen.getByLabelText('announcement_title')).toHaveValue('')
    );
    expect(onCreateAndSend).toHaveBeenCalledTimes(1);
  });

  it('keeps the saved topic and resets the form when notifying fails', async () => {
    const onNotifyTeachers = vi.fn().mockRejectedValue(new Error('down'));
    const onCreate = vi.fn().mockResolvedValue('announcement-new');
    renderForm({
      forkSeedId: 1,
      forkSource: {
        attachments: [],
        class_label: null,
        contacts: [verifiedContact],
        course_book: null,
        day_label: null,
        end_time: null,
        group_id: null,
        place: null,
        room: null,
        session_date: '2026-11-05',
        start_time: '18:30:00',
        teacher_workspace_user_id: 'teacher-wu',
        title: 'Monday session',
        topic: '',
        video_url: null,
      } as never,
      onCreate,
      onNotifyTeachers,
    });
    expect(screen.getByLabelText('announcement_title')).toHaveValue(
      'Monday session'
    );
    fireEvent.click(screen.getByRole('button', { name: 'next' }));
    fireEvent.click(screen.getByRole('button', { name: 'next' }));
    fireEvent.click(screen.getByRole('button', { name: 'next' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'announcement_submit_draft' })
    );

    await waitFor(() =>
      expect(onNotifyTeachers).toHaveBeenCalledWith(['announcement-new'])
    );
    await waitFor(() =>
      expect(screen.getByLabelText('announcement_title')).toHaveValue('')
    );
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('blocks a non-https video link on the message step', () => {
    renderForm();
    fireEvent.change(screen.getByLabelText('announcement_title'), {
      target: { value: 'Session' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'next' }));
    fireEvent.change(screen.getByLabelText('topic_primary_label'), {
      target: { value: 'Topic' },
    });
    fireEvent.change(screen.getByLabelText('video_url_label'), {
      target: { value: 'http://video.example.com' },
    });
    expect(screen.getByText('video_url_invalid')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'next' })).toBeDisabled();
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
        expect.any(String),
        expect.any(Function)
      )
    );
  });
});
