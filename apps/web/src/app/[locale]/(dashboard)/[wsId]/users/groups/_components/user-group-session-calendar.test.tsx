// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { InternalApiError } from '@tuturuuu/internal-api';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserGroupSessionCalendar } from './user-group-session-calendar';

const createWorkspaceUserGroupSessionMock = vi.fn();
const listWorkspaceUserGroupSessionsMock = vi.fn();
const previewWorkspaceUserGroupSessionReconciliationMock = vi.fn();
const reconcileWorkspaceUserGroupSessionMock = vi.fn();
const updateWorkspaceUserGroupSessionMock = vi.fn();

vi.mock('@tuturuuu/internal-api', () => ({
  createWorkspaceUserGroupSession: (
    ...args: Parameters<typeof createWorkspaceUserGroupSessionMock>
  ) => createWorkspaceUserGroupSessionMock(...args),
  InternalApiError: class InternalApiError extends Error {
    constructor(
      message: string,
      public readonly status: number,
      public readonly code?: string
    ) {
      super(message);
      this.name = 'InternalApiError';
    }
  },
  listWorkspaceUserGroupSessions: (
    ...args: Parameters<typeof listWorkspaceUserGroupSessionsMock>
  ) => listWorkspaceUserGroupSessionsMock(...args),
  previewWorkspaceUserGroupSessionReconciliation: (
    ...args: Parameters<
      typeof previewWorkspaceUserGroupSessionReconciliationMock
    >
  ) => previewWorkspaceUserGroupSessionReconciliationMock(...args),
  reconcileWorkspaceUserGroupSession: (
    ...args: Parameters<typeof reconcileWorkspaceUserGroupSessionMock>
  ) => reconcileWorkspaceUserGroupSessionMock(...args),
  updateWorkspaceUserGroupSession: (
    ...args: Parameters<typeof updateWorkspaceUserGroupSessionMock>
  ) => updateWorkspaceUserGroupSessionMock(...args),
}));

vi.mock('next-intl', () => {
  const messages: Record<string, Record<string, string>> = {
    calendar: {
      '4-days': '4 days',
      agenda: 'Agenda',
      day: 'Day',
      month: 'Month',
      week: 'Week',
    },
    common: {
      cancel: 'Cancel',
    },
    'ws-user-group-schedule': {
      confirm_fix_recurring_link: 'Attach to recurring schedule',
      confirm_fix_recurring_link_convert_weekly: 'Create weekly series',
      confirm_fix_recurring_link_snap: 'Move back and attach',
      confirm_fix_recurring_link_weekly: 'Add weekday and attach',
      detached_session: 'Detached session',
      edit_session: 'Edit session',
      failed_to_fix_recurring_link: 'Failed to fix recurring link',
      files_attached_count: '{count} files',
      fix_recurring_preview_description:
        'Review the matching recurring occurrence before attaching this session.',
      fix_recurring_preview_title: 'Fix recurring link',
      matching_recurring_occurrence: 'Matching recurring occurrence',
      new_weekly_recurring_schedule: 'New weekly recurring schedule',
      no_matching_recurring_schedule: 'No matching recurring schedule found',
      recurring_repair_exact_session:
        'This session already matches the recurring timeblock.',
      recurring_repair_adds_weekday:
        'This will add this weekday back to the recurring weekly schedule and attach the session.',
      recurring_repair_creates_weekly_series:
        'No matching recurring schedule was found. This will create a weekly recurring schedule from this session and use this session as the first occurrence.',
      recurring_repair_moves_session:
        'This will move the detached session back to the recurring timeblock and attach it to the series.',
      recurring_link_fixed: 'Recurring link fixed',
      untitled_session: 'Session',
    },
  };

  return {
    useLocale: () => 'en',
    useMessages: () => messages,
    useTranslations:
      (namespace: string) =>
      (key: string, values?: Record<string, unknown>) => {
        const value = messages[namespace]?.[key];
        if (typeof value !== 'string') return key;
        return values
          ? value.replace(/\{(\w+)\}/gu, (_match: string, name: string) =>
              String(values[name] ?? `{${name}}`)
            )
          : value;
      },
  };
});

vi.mock('@tuturuuu/ui/legacy/calendar/smart-calendar', () => ({
  SmartCalendar: ({
    eventAdapter,
    externalEvents,
  }: {
    eventAdapter: {
      onOpen?: (eventId: string) => void;
    };
    externalEvents: { id: string }[];
  }) => (
    <button
      disabled={externalEvents.length === 0}
      type="button"
      onClick={() => eventAdapter.onOpen?.(externalEvents[0]?.id ?? '')}
    >
      Open detached session
    </button>
  ),
}));

vi.mock('./session-calendar-toolbar', () => ({
  SessionCalendarToolbar: () => <div data-testid="schedule-toolbar" />,
}));

vi.mock('./session-editor-dialog', () => ({
  SessionEditorDialog: ({
    onReconcile,
    open,
    session,
  }: {
    onReconcile?: (session: unknown) => void;
    open?: boolean;
    session?: unknown;
  }) =>
    open && session && onReconcile ? (
      <button type="button" onClick={() => onReconcile(session)}>
        Fix from editor
      </button>
    ) : null,
}));

vi.mock('./session-scope-dialog', () => ({
  SessionScopeDialog: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
}));

const detachedSession = {
  description: null,
  descriptionJson: null,
  endTimezone: 'Asia/Ho_Chi_Minh',
  endsAt: '2026-06-26T10:30:00.000Z',
  files: [],
  groupId: 'group-1',
  groupName: 'Test group',
  id: 'session-1',
  recurrenceInstanceDate: null,
  seriesId: null,
  source: 'detached_series_instance',
  startTimezone: 'Asia/Ho_Chi_Minh',
  startsAt: '2026-06-26T08:30:00.000Z',
  status: 'scheduled',
  tags: [],
  title: 'Test group',
};

function renderCalendar() {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <UserGroupSessionCalendar
        canUpdateSchedule
        title="Test group"
        wsId="workspace-1"
      />
    </QueryClientProvider>
  );
}

describe('UserGroupSessionCalendar recurring repair preview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('confirms snap repairs with the previewed mode', async () => {
    listWorkspaceUserGroupSessionsMock.mockResolvedValue({
      data: [detachedSession],
      groups: [{ id: 'group-1', name: 'Test group' }],
      tags: [],
    });
    previewWorkspaceUserGroupSessionReconciliationMock.mockResolvedValue({
      data: {
        date: '2026-06-26',
        mode: 'snap',
        occurrence: {
          date: '2026-06-26',
          description: null,
          descriptionJson: null,
          endTimezone: 'Asia/Ho_Chi_Minh',
          endsAt: '2026-06-26T09:00:00.000Z',
          groupId: 'group-1',
          groupName: 'Test group',
          seriesId: 'series-1',
          startTimezone: 'Asia/Ho_Chi_Minh',
          startsAt: '2026-06-26T07:00:00.000Z',
          title: 'Test group',
        },
        seriesId: 'series-1',
        session: detachedSession,
      },
      message: 'success',
    });
    reconcileWorkspaceUserGroupSessionMock.mockResolvedValue({
      data: { ...detachedSession, seriesId: 'series-1' },
      message: 'success',
    });

    renderCalendar();

    const openButton = await screen.findByText('Open detached session');
    await waitFor(() => expect(openButton).not.toBeDisabled());
    fireEvent.click(openButton);
    fireEvent.click(await screen.findByText('Fix from editor'));

    expect(
      await screen.findByText(
        'This will move the detached session back to the recurring timeblock and attach it to the series.'
      )
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText('Move back and attach'));

    await waitFor(() => {
      expect(reconcileWorkspaceUserGroupSessionMock).toHaveBeenCalledWith(
        'workspace-1',
        'session-1',
        { mode: 'snap' }
      );
    });
  });

  it('confirms weekly pattern repairs with the previewed mode', async () => {
    const weeklySession = {
      ...detachedSession,
      endsAt: '2026-06-24T09:00:00.000Z',
      startsAt: '2026-06-24T07:00:00.000Z',
    };
    listWorkspaceUserGroupSessionsMock.mockResolvedValue({
      data: [weeklySession],
      groups: [{ id: 'group-1', name: 'Test group' }],
      tags: [],
    });
    previewWorkspaceUserGroupSessionReconciliationMock.mockResolvedValue({
      data: {
        date: '2026-06-24',
        mode: 'weekly',
        occurrence: {
          date: '2026-06-24',
          description: null,
          descriptionJson: null,
          endTimezone: 'Asia/Ho_Chi_Minh',
          endsAt: '2026-06-24T09:00:00.000Z',
          groupId: 'group-1',
          groupName: 'Test group',
          seriesId: 'series-1',
          startTimezone: 'Asia/Ho_Chi_Minh',
          startsAt: '2026-06-24T07:00:00.000Z',
          title: 'Test group',
        },
        seriesId: 'series-1',
        session: weeklySession,
      },
      message: 'success',
    });
    reconcileWorkspaceUserGroupSessionMock.mockResolvedValue({
      data: { ...weeklySession, seriesId: 'series-1' },
      message: 'success',
    });

    renderCalendar();

    const openButton = await screen.findByText('Open detached session');
    await waitFor(() => expect(openButton).not.toBeDisabled());
    fireEvent.click(openButton);
    fireEvent.click(await screen.findByText('Fix from editor'));

    expect(
      await screen.findByText(
        'This will add this weekday back to the recurring weekly schedule and attach the session.'
      )
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText('Add weekday and attach'));

    await waitFor(() => {
      expect(reconcileWorkspaceUserGroupSessionMock).toHaveBeenCalledWith(
        'workspace-1',
        'session-1',
        { mode: 'weekly' }
      );
    });
  });

  it('offers weekly conversion when no recurring schedule matches', async () => {
    const weeklySession = {
      ...detachedSession,
      endsAt: '2026-06-24T09:00:00.000Z',
      startsAt: '2026-06-24T07:00:00.000Z',
    };
    listWorkspaceUserGroupSessionsMock.mockResolvedValue({
      data: [weeklySession],
      groups: [{ id: 'group-1', name: 'Test group' }],
      tags: [],
    });
    previewWorkspaceUserGroupSessionReconciliationMock.mockRejectedValue(
      new InternalApiError('No matching recurring schedule found', 404)
    );
    reconcileWorkspaceUserGroupSessionMock.mockResolvedValue({
      data: { ...weeklySession, seriesId: 'series-1' },
      message: 'success',
    });

    renderCalendar();

    const openButton = await screen.findByText('Open detached session');
    await waitFor(() => expect(openButton).not.toBeDisabled());
    fireEvent.click(openButton);
    fireEvent.click(await screen.findByText('Fix from editor'));

    expect(
      await screen.findByText('New weekly recurring schedule')
    ).toBeInTheDocument();
    expect(
      await screen.findByText(
        'No matching recurring schedule was found. This will create a weekly recurring schedule from this session and use this session as the first occurrence.'
      )
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText('Create weekly series'));

    await waitFor(() => {
      expect(reconcileWorkspaceUserGroupSessionMock).toHaveBeenCalledWith(
        'workspace-1',
        'session-1',
        { mode: 'convert_weekly' }
      );
    });
  });
});
