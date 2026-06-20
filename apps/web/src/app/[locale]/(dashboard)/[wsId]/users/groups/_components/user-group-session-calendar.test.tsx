// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import {
  InternalApiError,
  type WorkspaceUserGroupSession,
} from '@tuturuuu/internal-api';
import type { ComponentProps, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserGroupSessionCalendar } from './user-group-session-calendar';

const createWorkspaceUserGroupSessionMock = vi.fn();
const listWorkspaceUserGroupMembersMock = vi.fn();
const listWorkspaceUserGroupScheduleGroupSummariesMock = vi.fn();
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
  listWorkspaceUserGroupMembers: (
    ...args: Parameters<typeof listWorkspaceUserGroupMembersMock>
  ) => listWorkspaceUserGroupMembersMock(...args),
  listWorkspaceUserGroupScheduleGroupSummaries: (
    ...args: Parameters<typeof listWorkspaceUserGroupScheduleGroupSummariesMock>
  ) => listWorkspaceUserGroupScheduleGroupSummariesMock(...args),
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
      bulk_move_date: 'Move date',
      bulk_move_sessions_failed: 'Failed to move {count} sessions',
      bulk_move_sessions_success: 'Moved {count} sessions',
      bulk_move_time: 'Start time',
      cancel_move_mode: 'Cancel move mode',
      clear_grouped_timeblock_search: 'Clear search',
      clear_visible_sessions: 'Clear visible',
      confirm_move_sessions: 'Move {count} sessions',
      detached_session: 'Detached session',
      edit_scope: 'Edit scope',
      edit_scope_future: 'This and future sessions',
      edit_scope_once: 'This session only',
      edit_session: 'Edit session',
      edit_session_named: 'Edit {name}',
      failed_to_fix_recurring_link: 'Failed to fix recurring link',
      filter_group: 'Filter group',
      filter_group_named: 'Filter to {name}',
      filtered_sessions_count: '{count} of {total} shown',
      files_attached_count: '{count} files',
      fix_recurring_preview_description:
        'Review the matching recurring occurrence before attaching this session.',
      fix_recurring_preview_title: 'Fix recurring link',
      group_managers_count_short: '{count} managers',
      group_members_count: '{count} users',
      group_roster_counts: '{managers} managers / {members} non-managers',
      group_roster_empty: 'No visible members.',
      group_roster_title: 'Group roster',
      grouped_timeblock_description: '{count} sessions: {groups}',
      grouped_timeblock_dialog_title: '{count} sessions in this timeblock',
      grouped_timeblock_no_search_results: 'No sessions match this search.',
      grouped_timeblock_search_placeholder:
        'Search groups, titles, tags, members, or schedule...',
      grouped_timeblock_title: '{count} sessions',
      inline_edit_cancel: 'Cancel',
      inline_edit_date: 'Date',
      inline_edit_end_time: 'End',
      inline_edit_save: 'Save quick edit',
      inline_edit_start_time: 'Start',
      inline_edit_tags: 'Tags',
      inline_edit_title: 'Title',
      manager_role: 'Manager',
      matching_recurring_occurrence: 'Matching recurring occurrence',
      more_sessions: '+{count} more',
      move_all_timeblock: 'Move all',
      move_selected_sessions: 'Move selected',
      new_weekly_recurring_schedule: 'New weekly recurring schedule',
      no_matching_recurring_schedule: 'No matching recurring schedule found',
      no_timezones_found: 'No timezones found',
      open_full_editor_named: 'Open full editor for {name}',
      quick_edit_session_named: 'Quick edit {name}',
      recurring_repair_exact_session:
        'This session already matches the recurring timeblock.',
      recurring_repair_adds_weekday:
        'This will add this weekday back to the recurring weekly schedule and attach the session.',
      recurring_repair_creates_weekly_series:
        'No matching recurring schedule was found. This will create a weekly recurring schedule from this session and use this session as the first occurrence.',
      recurring_repair_moves_session:
        'This will move the detached session back to the recurring timeblock and attach it to the series.',
      recurring_link_fixed: 'Recurring link fixed',
      schedule_exception_count: '{count} exceptions',
      schedule_no_upcoming: 'No upcoming schedule',
      schedule_upcoming_count: '{count} upcoming',
      search_timezone: 'Search timezone...',
      select_session_named: 'Select {name}',
      select_visible_sessions: 'Select visible',
      selected_sessions_count: '{count} selected',
      timezone: 'Timezone',
      timezone_group_all: 'All timezones',
      timezone_group_current: 'Current',
      timezone_group_suggested: 'Suggested',
      unknown_member: 'Unknown member',
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

function resetInternalApiMocks() {
  vi.clearAllMocks();
  listWorkspaceUserGroupMembersMock.mockResolvedValue({
    data: [],
    next: undefined,
  });
  listWorkspaceUserGroupScheduleGroupSummariesMock.mockResolvedValue({
    data: [],
  });
}

describe('UserGroupSessionCalendar dense all-groups rendering', () => {
  beforeEach(() => {
    resetInternalApiMocks();
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
      expect(events.getAttribute('data-event-count')).toBe('1')
    );
    expect(
      screen.getByTestId('schedule-toolbar').getAttribute('data-grouped-count')
    ).toBe('1');

    fireEvent.click(screen.getByRole('button', { name: '3 sessions' }));

    expect(
      await screen.findByText('3 sessions in this timeblock')
    ).toBeTruthy();
    expect(screen.getByText('Group A')).toBeTruthy();
    expect(screen.getByText('Group B')).toBeTruthy();
    expect(screen.getByText('Group C')).toBeTruthy();
  });

  it('opens grouped sessions in a bounded searchable manager', async () => {
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
          tags: [{ color: null, id: 'tag-b', name: 'Speaking' }],
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

    const manager = await screen.findByTestId('grouped-timeblock-manager');
    expect(screen.getByTestId('grouped-timeblock-list').className).toContain(
      'overflow-y-auto'
    );

    fireEvent.change(
      within(manager).getByPlaceholderText(
        'Search groups, titles, tags, members, or schedule...'
      ),
      { target: { value: 'Speaking' } }
    );

    expect(within(manager).queryByText('Group A')).toBeNull();
    expect(within(manager).getByText('Group B')).toBeTruthy();
  });

  it('filters grouped rows with unaccented fuzzy search', async () => {
    listWorkspaceUserGroupSessionsMock.mockResolvedValue({
      data: [
        session({
          groupId: 'group-1',
          groupName: '246-EGET0- MS HƯỞNG',
          id: 'session-1',
        }),
        session({
          groupId: 'group-2',
          groupName: '246-EDD1 - MS. TUYẾT',
          id: 'session-2',
        }),
      ],
      groups: [
        { id: 'group-1', name: '246-EGET0- MS HƯỞNG' },
        { id: 'group-2', name: '246-EDD1 - MS. TUYẾT' },
      ],
      tags: [],
    });

    renderCalendar({ canChooseGroup: true });

    fireEvent.click(await screen.findByRole('button', { name: '2 sessions' }));
    const manager = await screen.findByTestId('grouped-timeblock-manager');
    const search = within(manager).getByPlaceholderText(
      'Search groups, titles, tags, members, or schedule...'
    );

    fireEvent.change(search, { target: { value: 'huong' } });
    expect(within(manager).getByText('246-EGET0- MS HƯỞNG')).toBeTruthy();
    expect(within(manager).queryByText('246-EDD1 - MS. TUYẾT')).toBeNull();

    fireEvent.change(search, { target: { value: 'tuyt' } });
    expect(within(manager).queryByText('246-EGET0- MS HƯỞNG')).toBeNull();
    expect(within(manager).getByText('246-EDD1 - MS. TUYẾT')).toBeTruthy();
  });

  it('renders group roster counts and next four week schedule chips', async () => {
    listWorkspaceUserGroupScheduleGroupSummariesMock.mockResolvedValue({
      data: [
        {
          exceptionCount: 1,
          groupId: 'group-1',
          managerCount: 2,
          nonManagerCount: 9,
          patterns: [
            {
              daysOfWeek: [2, 4],
              endTime: '08:00',
              exceptionCount: 1,
              expectedCount: 8,
              occurrenceCount: 7,
              startTime: '07:00',
            },
          ],
          upcomingCount: 8,
        },
      ],
    });
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

    expect(await screen.findByText('11 users')).toBeTruthy();
    expect(screen.getByText('2 managers')).toBeTruthy();
    expect(screen.getByText('Tue/Thu 07:00-08:00')).toBeTruthy();
    expect(screen.getByText('1 exceptions')).toBeTruthy();
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
      await screen.findByRole('button', {
        name: 'Open full editor for Group A',
      })
    );

    expect(await screen.findByText('Editing Group A')).toBeTruthy();
  });

  it('saves inline schedule edits through the existing update path', async () => {
    const allSessions = [
      session({
        groupId: 'group-1',
        groupName: 'Group A',
        id: 'session-1',
        tags: [{ color: null, id: 'tag-a', name: 'Old tag' }],
      }),
      session({
        groupId: 'group-2',
        groupName: 'Group B',
        id: 'session-2',
      }),
    ];

    listWorkspaceUserGroupSessionsMock.mockResolvedValue({
      data: allSessions,
      groups: [
        { id: 'group-1', name: 'Group A' },
        { id: 'group-2', name: 'Group B' },
      ],
      tags: [],
    });
    updateWorkspaceUserGroupSessionMock.mockImplementation(
      (_wsId: string, sessionId: string, payload: Record<string, unknown>) =>
        Promise.resolve({
          data: {
            ...allSessions.find((item) => item.id === sessionId)!,
            ...payload,
          },
          message: 'success',
        })
    );

    renderCalendar({ canChooseGroup: true });

    fireEvent.click(await screen.findByRole('button', { name: '2 sessions' }));
    const manager = await screen.findByTestId('grouped-timeblock-manager');
    fireEvent.click(
      within(manager).getByRole('button', { name: 'Quick edit Group A' })
    );
    fireEvent.change(within(manager).getByLabelText('Title'), {
      target: { value: 'Updated lesson' },
    });
    fireEvent.change(within(manager).getByLabelText('Tags'), {
      target: { value: 'Makeup, Exam prep' },
    });
    fireEvent.change(within(manager).getByLabelText('Date'), {
      target: { value: '2026-06-27' },
    });
    fireEvent.change(within(manager).getByLabelText('Start'), {
      target: { value: '08:00' },
    });
    fireEvent.change(within(manager).getByLabelText('End'), {
      target: { value: '09:30' },
    });
    fireEvent.click(
      within(manager).getByRole('button', { name: 'Save quick edit' })
    );

    await waitFor(() =>
      expect(updateWorkspaceUserGroupSessionMock).toHaveBeenCalledWith(
        'workspace-1',
        'session-1',
        expect.objectContaining({
          endTimezone: 'Asia/Ho_Chi_Minh',
          endsAt: '2026-06-27T02:30:00.000Z',
          files: [],
          scope: 'once',
          startTimezone: 'Asia/Ho_Chi_Minh',
          startsAt: '2026-06-27T01:00:00.000Z',
          tagNames: ['Makeup', 'Exam prep'],
          title: 'Updated lesson',
        })
      )
    );
  });

  it('sends future scope for inline recurring edits only when chosen', async () => {
    const allSessions = [
      session({
        groupId: 'group-1',
        groupName: 'Group A',
        id: 'session-1',
        seriesId: 'series-1',
      }),
      session({
        groupId: 'group-2',
        groupName: 'Group B',
        id: 'session-2',
      }),
    ];

    listWorkspaceUserGroupSessionsMock.mockResolvedValue({
      data: allSessions,
      groups: [
        { id: 'group-1', name: 'Group A' },
        { id: 'group-2', name: 'Group B' },
      ],
      tags: [],
    });
    updateWorkspaceUserGroupSessionMock.mockImplementation(
      (_wsId: string, sessionId: string, payload: Record<string, unknown>) =>
        Promise.resolve({
          data: {
            ...allSessions.find((item) => item.id === sessionId)!,
            ...payload,
          },
          message: 'success',
        })
    );

    renderCalendar({ canChooseGroup: true });

    fireEvent.click(await screen.findByRole('button', { name: '2 sessions' }));
    const manager = await screen.findByTestId('grouped-timeblock-manager');
    fireEvent.click(
      within(manager).getByRole('button', { name: 'Quick edit Group A' })
    );
    fireEvent.click(
      within(manager).getByRole('button', {
        name: 'This and future sessions',
      })
    );
    fireEvent.click(
      within(manager).getByRole('button', { name: 'Save quick edit' })
    );

    await waitFor(() =>
      expect(updateWorkspaceUserGroupSessionMock).toHaveBeenCalledWith(
        'workspace-1',
        'session-1',
        expect.objectContaining({ scope: 'future' })
      )
    );
  });

  it('bulk moves visible selected sessions with the recurring scope defaulting once', async () => {
    const allSessions = [
      session({
        groupId: 'group-1',
        groupName: 'Group A',
        id: 'session-1',
        seriesId: 'series-1',
      }),
      session({
        groupId: 'group-2',
        groupName: 'Group B',
        id: 'session-2',
      }),
    ];

    listWorkspaceUserGroupSessionsMock.mockResolvedValue({
      data: allSessions,
      groups: [
        { id: 'group-1', name: 'Group A' },
        { id: 'group-2', name: 'Group B' },
      ],
      tags: [],
    });
    updateWorkspaceUserGroupSessionMock.mockImplementation(
      (_wsId: string, sessionId: string, payload: Record<string, string>) =>
        Promise.resolve({
          data: {
            ...allSessions.find((item) => item.id === sessionId)!,
            endTimezone: payload.endTimezone,
            endsAt: payload.endsAt,
            startTimezone: payload.startTimezone,
            startsAt: payload.startsAt,
          },
          message: 'success',
        })
    );

    renderCalendar({ canChooseGroup: true });

    fireEvent.click(await screen.findByRole('button', { name: '2 sessions' }));
    const manager = await screen.findByTestId('grouped-timeblock-manager');
    fireEvent.click(
      within(manager).getByRole('button', { name: 'Select visible' })
    );
    fireEvent.click(
      within(manager).getByRole('button', { name: 'Move selected' })
    );
    fireEvent.change(screen.getByLabelText('Move date'), {
      target: { value: '2026-06-27' },
    });
    fireEvent.change(screen.getByLabelText('Start time'), {
      target: { value: '08:00' },
    });
    fireEvent.click(
      within(manager).getByRole('button', { name: 'Move 2 sessions' })
    );

    await waitFor(() =>
      expect(updateWorkspaceUserGroupSessionMock).toHaveBeenCalledTimes(2)
    );
    expect(updateWorkspaceUserGroupSessionMock).toHaveBeenCalledWith(
      'workspace-1',
      'session-1',
      expect.objectContaining({
        endTimezone: 'Asia/Ho_Chi_Minh',
        endsAt: '2026-06-27T03:00:00.000Z',
        files: [],
        scope: 'once',
        startTimezone: 'Asia/Ho_Chi_Minh',
        startsAt: '2026-06-27T01:00:00.000Z',
        tagNames: [],
      })
    );
    expect(updateWorkspaceUserGroupSessionMock).toHaveBeenCalledWith(
      'workspace-1',
      'session-2',
      expect.objectContaining({
        endsAt: '2026-06-27T03:00:00.000Z',
        scope: 'once',
        startsAt: '2026-06-27T01:00:00.000Z',
      })
    );
  });

  it('bulk moves only checked sessions', async () => {
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

    listWorkspaceUserGroupSessionsMock.mockResolvedValue({
      data: allSessions,
      groups: [
        { id: 'group-1', name: 'Group A' },
        { id: 'group-2', name: 'Group B' },
      ],
      tags: [],
    });
    updateWorkspaceUserGroupSessionMock.mockImplementation(
      (_wsId: string, sessionId: string, payload: Record<string, string>) =>
        Promise.resolve({
          data: {
            ...allSessions.find((item) => item.id === sessionId)!,
            endsAt: payload.endsAt,
            startsAt: payload.startsAt,
          },
          message: 'success',
        })
    );

    renderCalendar({ canChooseGroup: true });

    fireEvent.click(await screen.findByRole('button', { name: '2 sessions' }));
    const manager = await screen.findByTestId('grouped-timeblock-manager');
    fireEvent.click(
      within(manager).getByRole('checkbox', { name: 'Select Group B' })
    );
    fireEvent.click(
      within(manager).getByRole('button', { name: 'Move selected' })
    );
    fireEvent.click(
      within(manager).getByRole('button', { name: 'Move 1 sessions' })
    );

    await waitFor(() =>
      expect(updateWorkspaceUserGroupSessionMock).toHaveBeenCalledTimes(1)
    );
    expect(updateWorkspaceUserGroupSessionMock).toHaveBeenCalledWith(
      'workspace-1',
      'session-2',
      expect.any(Object)
    );
  });

  it('sends future scope only when chosen for grouped bulk moves', async () => {
    const allSessions = [
      session({
        groupId: 'group-1',
        groupName: 'Group A',
        id: 'session-1',
        seriesId: 'series-1',
      }),
      session({
        groupId: 'group-2',
        groupName: 'Group B',
        id: 'session-2',
      }),
    ];

    listWorkspaceUserGroupSessionsMock.mockResolvedValue({
      data: allSessions,
      groups: [
        { id: 'group-1', name: 'Group A' },
        { id: 'group-2', name: 'Group B' },
      ],
      tags: [],
    });
    updateWorkspaceUserGroupSessionMock.mockImplementation(
      (_wsId: string, sessionId: string, payload: Record<string, string>) =>
        Promise.resolve({
          data: {
            ...allSessions.find((item) => item.id === sessionId)!,
            endsAt: payload.endsAt,
            startsAt: payload.startsAt,
          },
          message: 'success',
        })
    );

    renderCalendar({ canChooseGroup: true });

    fireEvent.click(await screen.findByRole('button', { name: '2 sessions' }));
    const manager = await screen.findByTestId('grouped-timeblock-manager');
    fireEvent.click(within(manager).getByRole('button', { name: 'Move all' }));
    fireEvent.click(
      within(manager).getByRole('button', {
        name: 'This and future sessions',
      })
    );
    fireEvent.click(
      within(manager).getByRole('button', { name: 'Move 2 sessions' })
    );

    await waitFor(() =>
      expect(updateWorkspaceUserGroupSessionMock).toHaveBeenCalledTimes(2)
    );
    for (const call of updateWorkspaceUserGroupSessionMock.mock.calls) {
      expect(call[2]).toEqual(expect.objectContaining({ scope: 'future' }));
    }
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
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Filter first group' }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '2 sessions' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Group A' })).toBeTruthy();
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
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Filter tag A' }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '2 sessions' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Group A' })).toBeTruthy();
    });
  });
});

describe('UserGroupSessionCalendar recurring repair preview', () => {
  beforeEach(() => {
    resetInternalApiMocks();
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
    await waitFor(() =>
      expect((openButton as HTMLButtonElement).disabled).toBe(false)
    );
    fireEvent.click(openButton);
    fireEvent.click(await screen.findByText('Fix from editor'));

    expect(
      await screen.findByText(
        'This will move the detached session back to the recurring timeblock and attach it to the series.'
      )
    ).toBeTruthy();

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
    await waitFor(() =>
      expect((openButton as HTMLButtonElement).disabled).toBe(false)
    );
    fireEvent.click(openButton);
    fireEvent.click(await screen.findByText('Fix from editor'));

    expect(
      await screen.findByText(
        'This will add this weekday back to the recurring weekly schedule and attach the session.'
      )
    ).toBeTruthy();

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
    await waitFor(() =>
      expect((openButton as HTMLButtonElement).disabled).toBe(false)
    );
    fireEvent.click(openButton);
    fireEvent.click(await screen.findByText('Fix from editor'));

    expect(
      await screen.findByText('New weekly recurring schedule')
    ).toBeTruthy();
    expect(
      await screen.findByText(
        'No matching recurring schedule was found. This will create a weekly recurring schedule from this session and use this session as the first occurrence.'
      )
    ).toBeTruthy();

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
