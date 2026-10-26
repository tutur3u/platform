import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TeacherTopicsView } from './teacher-topics-view';

const mocks = vi.hoisted(() => ({
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
