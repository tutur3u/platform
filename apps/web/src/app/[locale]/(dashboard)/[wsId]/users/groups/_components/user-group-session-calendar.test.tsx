// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  InternalApiError,
  type WorkspaceUserGroupSession,
} from '@tuturuuu/internal-api';
import type { ComponentProps, ReactNode } from 'react';
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
      filter_group: 'Filter group',
      files_attached_count: '{count} files',
      fix_recurring_preview_description:
        'Review the matching recurring occurrence before attaching this session.',
      grouped_timeblock_description: '{count} sessions: {groups}',
      grouped_timeblock_dialog_title: '{count} sessions in this timeblock',
      grouped_timeblock_title: '{count} sessions',
      fix_recurring_preview_title: 'Fix recurring link',
      matching_recurring_occurrence: 'Matching recurring occurrence',
      more_sessions: '+{count} more',
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
      view_grouped_timeblock: 'View sessions',
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
    externalEvents: { id: string; title?: string }[];
  }) => (
    <div>
      <div
        data-event-count={externalEvents.length}
        data-testid="calendar-events"
      >
        {externalEvents.map((event) => (
          <button
            key={event.id}
            type="button"
            onClick={() => eventAdapter.onOpen?.(event.id)}
          >
            {event.title ?? event.id}
          </button>
        ))}
      </div>
      <button
        disabled={externalEvents.length === 0}
        type="button"
        onClick={() => eventAdapter.onOpen?.(externalEvents[0]?.id ?? '')}
      >
        Open detached session
      </button>
    </div>
  ),
}));

vi.mock('./session-calendar-toolbar', () => ({
  SessionCalendarToolbar: ({
    densityStats,
    groupFilter,
    onGroupFilterChange,
    onTagFilterChange,
  }: {
    densityStats?: { groupedTimeblockCount: number; sessionCount: number };
    groupFilter: string;
    onGroupFilterChange: (value: string) => void;
    onTagFilterChange: (value: string) => void;
  }) => (
    <div
      data-group-filter={groupFilter}
      data-grouped-count={densityStats?.groupedTimeblockCount ?? 0}
      data-session-count={densityStats?.sessionCount ?? 0}
      data-testid="schedule-toolbar"
    >
      <button type="button" onClick={() => onGroupFilterChange('group-1')}>
        Filter first group
      </button>
      <button type="button" onClick={() => onTagFilterChange('tag-a')}>
        Filter tag A
      </button>
    </div>
  ),
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
  }) => {
    if (!open || !session) return null;

    return (
      <div>
        <div>Editing {(session as { groupName?: string }).groupName}</div>
        {onReconcile && (
          <button type="button" onClick={() => onReconcile(session)}>
            Fix from editor
          </button>
        )}
      </div>
    );
  },
}));

vi.mock('./session-scope-dialog', () => ({
  SessionScopeDialog: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
}));

const detachedSession: WorkspaceUserGroupSession = {
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

function renderCalendar(
  props: Partial<ComponentProps<typeof UserGroupSessionCalendar>> = {}
) {
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
        {...props}
      />
    </QueryClientProvider>
  );
}

function session(
  overrides: Partial<WorkspaceUserGroupSession>
): WorkspaceUserGroupSession {
  return {
    ...detachedSession,
    ...overrides,
    files: overrides.files ?? detachedSession.files,
    tags: overrides.tags ?? detachedSession.tags,
  };
}

describe('UserGroupSessionCalendar dense all-groups rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('groups same-slot all-groups sessions into one drilldown event', async () => {
    listWorkspaceUserGroupSessionsMock.mockResolvedValue({
      data: [
        session({
          groupId: 'group-1',
          groupName: 'Group A',
          id: 'session-1',
        }),
        session({
          groupId: 'group-2',
          groupName: 'Group B',
          id: 'session-2',
        }),
        session({
          groupId: 'group-3',
          groupName: 'Group C',
          id: 'session-3',
        }),
      ],
      groups: [
        { id: 'group-1', name: 'Group A' },
        { id: 'group-2', name: 'Group B' },
        { id: 'group-3', name: 'Group C' },
      ],
      tags: [],
    });

    renderCalendar({ canChooseGroup: true });

    const events = await screen.findByTestId('calendar-events');
    await waitFor(() =>
      expect(events).toHaveAttribute('data-event-count', '1')
    );
    expect(screen.getByTestId('schedule-toolbar')).toHaveAttribute(
      'data-grouped-count',
      '1'
    );

    fireEvent.click(screen.getByRole('button', { name: '3 sessions' }));

    expect(
      await screen.findByText('3 sessions in this timeblock')
    ).toBeInTheDocument();
    expect(screen.getByText('Group A')).toBeInTheDocument();
    expect(screen.getByText('Group B')).toBeInTheDocument();
    expect(screen.getByText('Group C')).toBeInTheDocument();
  });

  it('opens the existing editor from a grouped timeblock row', async () => {
    listWorkspaceUserGroupSessionsMock.mockResolvedValue({
      data: [
        session({
          groupId: 'group-1',
          groupName: 'Group A',
          id: 'session-1',
        }),
        session({
          groupId: 'group-2',
          groupName: 'Group B',
          id: 'session-2',
        }),
      ],
      groups: [
        { id: 'group-1', name: 'Group A' },
        { id: 'group-2', name: 'Group B' },
      ],
      tags: [],
    });

    renderCalendar({ canChooseGroup: true });

    fireEvent.click(await screen.findByRole('button', { name: '2 sessions' }));
    fireEvent.click(
      (await screen.findAllByRole('button', { name: 'Edit session' }))[0]!
    );

    expect(await screen.findByText('Editing Group A')).toBeInTheDocument();
  });

  it('renders individual events again after filtering to one group', async () => {
    const allSessions = [
      session({
        groupId: 'group-1',
        groupName: 'Group A',
        id: 'session-1',
      }),
      session({
        groupId: 'group-2',
        groupName: 'Group B',
        id: 'session-2',
      }),
    ];

    listWorkspaceUserGroupSessionsMock.mockImplementation(
      (_wsId: string, params?: { groupId?: string }) =>
        Promise.resolve({
          data: params?.groupId
            ? allSessions.filter((item) => item.groupId === params.groupId)
            : allSessions,
          groups: [
            { id: 'group-1', name: 'Group A' },
            { id: 'group-2', name: 'Group B' },
          ],
          tags: [],
        })
    );

    renderCalendar({ canChooseGroup: true });

    expect(
      await screen.findByRole('button', { name: '2 sessions' })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Filter first group' }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '2 sessions' })).toBeNull();
      expect(
        screen.getByRole('button', { name: 'Group A' })
      ).toBeInTheDocument();
    });
  });

  it('applies tag filtering before grouping', async () => {
    listWorkspaceUserGroupSessionsMock.mockResolvedValue({
      data: [
        session({
          groupId: 'group-1',
          groupName: 'Group A',
          id: 'session-1',
          tags: [{ color: null, id: 'tag-a', name: 'Tag A' }],
        }),
        session({
          groupId: 'group-2',
          groupName: 'Group B',
          id: 'session-2',
          tags: [{ color: null, id: 'tag-b', name: 'Tag B' }],
        }),
      ],
      groups: [
        { id: 'group-1', name: 'Group A' },
        { id: 'group-2', name: 'Group B' },
      ],
      tags: [
        { color: null, id: 'tag-a', name: 'Tag A' },
        { color: null, id: 'tag-b', name: 'Tag B' },
      ],
    });

    renderCalendar({ canChooseGroup: true });

    expect(
      await screen.findByRole('button', { name: '2 sessions' })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Filter tag A' }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '2 sessions' })).toBeNull();
      expect(
        screen.getByRole('button', { name: 'Group A' })
      ).toBeInTheDocument();
    });
  });
});

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
