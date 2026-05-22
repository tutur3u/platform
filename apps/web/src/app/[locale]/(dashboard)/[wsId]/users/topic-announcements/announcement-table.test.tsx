import { fireEvent, render, screen } from '@testing-library/react';
import type { TopicAnnouncementRecord } from '@tuturuuu/internal-api';
import { describe, expect, it, vi } from 'vitest';
import { AnnouncementTable } from './announcement-table';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values
      ? `${key}:${Object.entries(values)
          .map(([valueKey, value]) => `${valueKey}=${value}`)
          .join(',')}`
      : key,
}));

vi.mock('./announcement-schedule-dialog', () => ({
  AnnouncementScheduleDialog: () => (
    <div data-testid="schedule-dialog">schedule dialog</div>
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

function createAnnouncement(
  overrides: Partial<TopicAnnouncementRecord> = {}
): TopicAnnouncementRecord {
  return {
    attachments: [],
    batch_id: null,
    body: '',
    class_label: 'HUONG-EGET1',
    contacts: [verifiedContact],
    created_at: '2026-05-20T00:00:00.000Z',
    day_label: 'Saturday',
    end_time: '18:00:00',
    group: null,
    group_id: null,
    id: 'announcement-1',
    last_error: null,
    place: 'CENTER 1',
    room: '6',
    scheduled_send_at: null,
    sent_email_audit_id: null,
    sent_at: null,
    session_date: null,
    source_type: 'manual',
    start_time: '16:30:00',
    status: 'draft',
    title: 'Unit 3 speaking practice',
    topic: 'Practice speaking about weekend plans.',
    ...overrides,
  };
}

function renderTable(
  announcements: TopicAnnouncementRecord[],
  overrides: Partial<Parameters<typeof AnnouncementTable>[0]> = {}
) {
  const props = {
    announcements,
    canSend: true,
    firstRowNumber: 41,
    isDeleting: false,
    isLoading: false,
    isScheduling: false,
    isSending: false,
    onCancelSchedule: vi.fn(),
    onDelete: vi.fn(),
    onFork: vi.fn(),
    onPreview: vi.fn(),
    onSchedule: vi.fn(),
    onSend: vi.fn(),
    onTimezoneRequired: vi.fn(),
    schedulingTimezone: 'Asia/Ho_Chi_Minh',
    ...overrides,
  };

  render(<AnnouncementTable {...props} />);
  return props;
}

describe('AnnouncementTable', () => {
  it('renders an Excel-style row number and removes draft or queued rows after confirmation', async () => {
    const props = renderTable([
      createAnnouncement({ id: 'draft-1', status: 'draft' }),
      createAnnouncement({
        id: 'queued-1',
        scheduled_send_at: '2026-06-01T10:00:00.000Z',
        status: 'queued',
        title: 'Queued announcement',
      }),
    ]);

    expect(screen.getByText('41')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('legacy_ord')).toBeInTheDocument();

    fireEvent.pointerDown(
      screen.getAllByRole('button', { name: 'announcement_actions' })[0]!
    );
    fireEvent.click(await screen.findByText('remove_announcement'));
    fireEvent.click(
      screen.getByRole('button', { name: 'remove_announcement' })
    );

    expect(props.onDelete).toHaveBeenCalledWith('draft-1');

    fireEvent.pointerDown(
      screen.getAllByRole('button', { name: 'announcement_actions' })[1]!
    );
    fireEvent.click(await screen.findByText('remove_announcement'));
    fireEvent.click(
      screen.getByRole('button', { name: 'remove_announcement' })
    );

    expect(props.onDelete).toHaveBeenCalledWith('queued-1');
  });

  it('does not expose remove for sent announcements', async () => {
    renderTable([
      createAnnouncement({
        id: 'sent-1',
        sent_at: '2026-05-20T10:00:00.000Z',
        status: 'sent',
      }),
    ]);

    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'announcement_actions' })
    );

    expect(screen.queryByText('remove_announcement')).not.toBeInTheDocument();
  });

  it('opens full email preview for sent announcements', async () => {
    const sentAnnouncement = createAnnouncement({
      id: 'sent-1',
      sent_at: '2026-05-20T10:00:00.000Z',
      status: 'sent',
    });
    const props = renderTable([sentAnnouncement]);

    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'announcement_actions' })
    );
    fireEvent.click(await screen.findByText('preview_announcement'));

    expect(props.onPreview).toHaveBeenCalledWith(sentAnnouncement);
  });

  it('forks sent announcements as a reusable draft', async () => {
    const sentAnnouncement = createAnnouncement({
      id: 'sent-1',
      sent_at: '2026-05-20T10:00:00.000Z',
      status: 'sent',
    });
    const props = renderTable([sentAnnouncement]);

    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'announcement_actions' })
    );
    fireEvent.click(await screen.findByText('fork_announcement'));

    expect(props.onFork).toHaveBeenCalledWith(sentAnnouncement);
  });
});
