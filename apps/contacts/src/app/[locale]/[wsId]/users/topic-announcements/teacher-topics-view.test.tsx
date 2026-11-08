import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  formatTeacherDeadline,
  TeacherTopicsView,
} from './teacher-topics-view';

const mocks = vi.hoisted(() => ({
  getWorkspaceCalendarSettings: vi.fn(),
  listTopicAnnouncements: vi.fn(),
  sendTopicAnnouncement: vi.fn(),
  updateTopicAnnouncement: vi.fn(),
  uploadTopicAnnouncementAttachment: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@tuturuuu/internal-api', () => mocks);

function topic(overrides: Record<string, unknown>) {
  return {
    attachments: [],
    class_label: 'Class A',
    contacts: [],
    course_book: null,
    group: null,
    id: 'topic-1',
    send_due_at: '2020-01-01T00:00:00.000Z',
    sent_at: null,
    session_date: '2020-01-02',
    start_time: '18:30:00',
    status: 'draft',
    title: 'Monday session',
    topic: '',
    video_url: null,
    ...overrides,
  };
}

function renderView(canSend = true) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <TeacherTopicsView canSend={canSend} wsId="workspace-1" />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listTopicAnnouncements.mockResolvedValue({
    count: 2,
    data: [
      topic({}),
      topic({
        id: 'topic-2',
        sent_at: '2019-12-31T00:00:00.000Z',
        status: 'sent',
        title: 'Tuesday session',
        topic: 'Done',
      }),
    ],
  });
  mocks.getWorkspaceCalendarSettings.mockResolvedValue({
    timezone: 'Asia/Ho_Chi_Minh',
  });
  mocks.uploadTopicAnnouncementAttachment.mockResolvedValue({
    data: {
      contentType: 'image/png',
      fileName: 'page.png',
      sizeBytes: 4,
      storagePath: 'workspace-1/topic-announcements/attachments/page.png',
      storageProvider: 'supabase',
    },
  });
  mocks.updateTopicAnnouncement.mockResolvedValue({ data: {} });
  mocks.sendTopicAnnouncement.mockResolvedValue({ auditId: 'audit-1' });
});

describe('TeacherTopicsView', () => {
  it('shows derived late and sent states and locks sent topics', async () => {
    renderView();
    expect(await screen.findByText('Monday session')).toBeInTheDocument();
    expect(screen.getByText('delivery_state_late')).toBeInTheDocument();
    expect(screen.getByText('delivery_state_sent')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'teacher_edit_topic' })
    ).toBeDisabled();
  });

  it('saves the topic fields and sends in one step', async () => {
    renderView();
    fireEvent.click(
      await screen.findByRole('button', { name: 'teacher_write_topic' })
    );
    fireEvent.change(screen.getByLabelText('course_book_label'), {
      target: { value: 'Book 2' },
    });
    fireEvent.change(screen.getByLabelText('teacher_topic_label'), {
      target: { value: 'Food and drinks' },
    });
    fireEvent.change(screen.getByLabelText('video_url_label'), {
      target: { value: 'https://video.example.com/1' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'teacher_save_and_send' })
    );

    await waitFor(() =>
      expect(mocks.sendTopicAnnouncement).toHaveBeenCalledWith(
        'workspace-1',
        'topic-1'
      )
    );
    expect(mocks.updateTopicAnnouncement).toHaveBeenCalledWith(
      'workspace-1',
      'topic-1',
      {
        courseBook: 'Book 2',
        topic: 'Food and drinks',
        videoUrl: 'https://video.example.com/1',
      }
    );
  });

  it('saves a draft without sending and hides send without permission', async () => {
    renderView(false);
    fireEvent.click(
      await screen.findByRole('button', { name: 'teacher_write_topic' })
    );
    expect(
      screen.queryByRole('button', { name: 'teacher_save_and_send' })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'teacher_save_draft' }));

    await waitFor(() =>
      expect(mocks.updateTopicAnnouncement).toHaveBeenCalled()
    );
    expect(mocks.sendTopicAnnouncement).not.toHaveBeenCalled();
  });

  it('does not re-attach saved files when a send is retried', async () => {
    mocks.sendTopicAnnouncement
      .mockRejectedValueOnce(new Error('send failed'))
      .mockResolvedValueOnce({ auditId: 'audit-1' });
    renderView();
    fireEvent.click(
      await screen.findByRole('button', { name: 'teacher_write_topic' })
    );
    fireEvent.change(screen.getByLabelText('teacher_topic_label'), {
      target: { value: 'Food and drinks' },
    });
    const fileInput = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: {
        files: [new File(['page'], 'page.png', { type: 'image/png' })],
      },
    });
    await waitFor(() =>
      expect(mocks.uploadTopicAnnouncementAttachment).toHaveBeenCalled()
    );
    await screen.findByText('page.png');

    const saveAndSend = screen.getByRole('button', {
      name: 'teacher_save_and_send',
    });
    fireEvent.click(saveAndSend);
    await waitFor(() =>
      expect(mocks.sendTopicAnnouncement).toHaveBeenCalledTimes(1)
    );
    expect(mocks.updateTopicAnnouncement.mock.calls[0]?.[2]).toHaveProperty(
      'attachmentDrafts'
    );

    await waitFor(() => expect(saveAndSend).not.toBeDisabled());
    fireEvent.click(saveAndSend);
    await waitFor(() =>
      expect(mocks.sendTopicAnnouncement).toHaveBeenCalledTimes(2)
    );
    expect(mocks.updateTopicAnnouncement).toHaveBeenCalledTimes(2);
    expect(mocks.updateTopicAnnouncement.mock.calls[1]?.[2]).not.toHaveProperty(
      'attachmentDrafts'
    );
  });

  it('pages past the first page of topics', async () => {
    mocks.listTopicAnnouncements.mockResolvedValue({
      count: 60,
      data: [topic({})],
      totalPages: 2,
    });
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: 'next' }));
    await waitFor(() =>
      expect(mocks.listTopicAnnouncements).toHaveBeenLastCalledWith(
        'workspace-1',
        expect.objectContaining({ page: 2 })
      )
    );
  });

  it('formats the deadline in the workspace timezone', () => {
    const value = '2026-11-04T11:30:00.000Z';
    expect(formatTeacherDeadline(value, 'Asia/Ho_Chi_Minh')).toContain(
      new Date(value).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Ho_Chi_Minh',
      })
    );
    expect(formatTeacherDeadline(value, 'Asia/Ho_Chi_Minh')).toMatch(/6:30/u);
    expect(formatTeacherDeadline(null, 'Asia/Ho_Chi_Minh')).toBeNull();
  });

  it('blocks sending without a topic', async () => {
    renderView();
    fireEvent.click(
      await screen.findByRole('button', { name: 'teacher_write_topic' })
    );
    expect(
      screen.getByRole('button', { name: 'teacher_save_and_send' })
    ).toBeDisabled();
  });
});
