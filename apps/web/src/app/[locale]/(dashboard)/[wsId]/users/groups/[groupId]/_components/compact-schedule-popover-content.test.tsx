import { fireEvent, render, screen } from '@testing-library/react';
import type {
  WorkspaceUserGroupMissingSessionOccurrence,
  WorkspaceUserGroupSession,
} from '@tuturuuu/internal-api';
import { describe, expect, it, vi } from 'vitest';
import { CompactSchedulePopoverContent } from './compact-schedule-popover-content';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    if (key === 'day_timeblock_count') return `${values?.count} timeblocks`;
    if (key === 'files_attached_count') return `${values?.count} files`;
    if (key === 'move_mode_source') return `Moving ${values?.title}`;
    if (key === 'tag_count') return `${values?.count} tags`;
    return key;
  },
}));

function session(): WorkspaceUserGroupSession {
  return {
    description: null,
    descriptionJson: null,
    endTimezone: 'Asia/Ho_Chi_Minh',
    endsAt: '2026-06-26T09:00:00.000Z',
    files: [{ id: 'file-1', name: 'Slides', storagePath: 'slides.pdf' }],
    groupId: 'group-1',
    groupName: 'Testing',
    id: 'session-1',
    recurrenceInstanceDate: null,
    seriesId: null,
    source: 'admin',
    startTimezone: 'Asia/Ho_Chi_Minh',
    startsAt: '2026-06-26T07:00:00.000Z',
    status: 'scheduled',
    tags: [{ color: null, id: 'tag-1', name: 'Exam' }],
    title: 'Testing',
  };
}

function missing(): WorkspaceUserGroupMissingSessionOccurrence {
  return {
    date: '2026-06-26',
    description: null,
    descriptionJson: null,
    endTimezone: 'Asia/Ho_Chi_Minh',
    endsAt: '2026-06-26T09:00:00.000Z',
    groupId: 'group-1',
    groupName: 'Testing',
    seriesId: 'series-1',
    startTimezone: 'Asia/Ho_Chi_Minh',
    startsAt: '2026-06-26T07:00:00.000Z',
    title: 'Testing',
  };
}

describe('CompactSchedulePopoverContent', () => {
  it('renders sessions, missing occurrences, and action callbacks', () => {
    const onAddSession = vi.fn();
    const onEditSession = vi.fn();
    const onMoveHere = vi.fn();
    const onMoveSession = vi.fn();
    const onRepairMissing = vi.fn();
    const currentSession = session();
    const missingOccurrence = missing();

    render(
      <CompactSchedulePopoverContent
        bucket={{
          missing: [missingOccurrence],
          sessions: [currentSession],
        }}
        canUpdate
        dateLabel="Fri, Jun 26"
        fullScheduleHref="/ws/users/groups/group-1/schedule"
        moveSource={currentSession}
        onAddSession={onAddSession}
        onEditSession={onEditSession}
        onMoveHere={onMoveHere}
        onMoveSession={onMoveSession}
        onRepairMissing={onRepairMissing}
      />
    );

    expect(screen.getAllByText('Testing')).toHaveLength(2);
    expect(screen.getByText('Moving Testing')).toBeVisible();
    expect(screen.getAllByText('14:00-16:00 Asia/Ho_Chi_Minh')).toHaveLength(2);
    expect(screen.getByText('2 timeblocks')).toBeVisible();
    expect(screen.getByText('1 tags')).toBeVisible();
    expect(screen.getByText('1 files')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'edit_session' }));
    fireEvent.click(screen.getByRole('button', { name: 'move_session' }));
    fireEvent.click(screen.getByRole('button', { name: 'move_here' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'add_missing_session' })
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'add_session_on_date' })
    );

    expect(onEditSession).toHaveBeenCalledWith(currentSession);
    expect(onMoveSession).toHaveBeenCalledWith(currentSession);
    expect(onMoveHere).toHaveBeenCalledTimes(1);
    expect(onRepairMissing).toHaveBeenCalledWith(missingOccurrence);
    expect(onAddSession).toHaveBeenCalledTimes(1);
  });
});
