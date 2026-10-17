import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { WorkspaceUserGroupSession } from '@tuturuuu/internal-api';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import GroupAttendanceClient from '../../../../packages/users-ui/src/components/group-attendance-client';

const api = vi.hoisted(() => ({ save: vi.fn(), read: vi.fn() }));
const notifications = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api', () => ({
  saveWorkspaceUserGroupAttendance: api.save,
  listWorkspaceUserGroupAttendance: api.read,
  listWorkspaceUserGroupAttendanceMembers: vi.fn(),
  listWorkspaceUserGroupSessions: vi.fn(),
  getWorkspaceUserGroupAttendanceShowManagers: vi.fn().mockResolvedValue(false),
}));
vi.mock('@tuturuuu/internal-api/user-group-attendance', () => ({
  filterWorkspaceUserGroupAttendanceMembers: (members: unknown) => members,
  workspaceUserGroupAttendanceShowManagersQueryKey: (wsId: string) => [
    'managers',
    wsId,
  ],
}));
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));
vi.mock('nuqs', async () => {
  const { useState } = await import('react');
  return {
    parseAsString: { withDefault: (value: string) => value },
    useQueryState: (_key: string, initial: string) => useState(initial),
  };
});
vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: notifications,
}));
vi.mock('@tuturuuu/ui/sticky-bottom-bar', () => ({
  StickyBottomBar: ({
    show,
    actions,
  }: {
    show: boolean;
    actions: React.ReactNode;
  }) => (show ? <div>{actions}</div> : null),
}));
vi.mock(
  '../../../../packages/users-ui/src/components/group-attendance-calendar',
  () => ({
    GroupAttendanceCalendar: ({
      onDateSelect,
    }: {
      onDateSelect: (date: Date, sessions: []) => void;
    }) => (
      <button
        type="button"
        onClick={() => onDateSelect(new Date(2026, 9, 18), [])}
      >
        next-date
      </button>
    ),
  })
);
vi.mock(
  '../../../../packages/users-ui/src/components/group-attendance-overview',
  () => ({
    GroupAttendanceOverview: ({
      onSelectSession,
    }: {
      onSelectSession: (id: string) => void;
    }) => (
      <>
        <button type="button" onClick={() => onSelectSession('session-one')}>
          first-session
        </button>
        <button type="button" onClick={() => onSelectSession('session-two')}>
          second-session
        </button>
      </>
    ),
  })
);
vi.mock(
  '../../../../packages/users-ui/src/components/group-attendance-member-card',
  () => ({
    GroupAttendanceMemberCard: ({
      entry,
      onNoteChange,
      onStatusChange,
    }: {
      entry: { note: string };
      onNoteChange: (note: string) => void;
      onStatusChange: (status: 'ABSENT') => void;
    }) => (
      <>
        <button type="button" onClick={() => onStatusChange('ABSENT')}>
          absent
        </button>
        <input
          aria-label="note"
          value={entry.note}
          onChange={(event) => onNoteChange(event.target.value)}
        />
      </>
    ),
  })
);

beforeEach(() => {
  api.save.mockReset();
  api.read.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

it.each(['Later draft', 'Stored note'])(
  'retains later edit %s during a save',
  async (laterNote) => {
    let finishSave: (() => void) | undefined;
    api.save.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishSave = resolve;
        })
    );
    api.save.mockResolvedValueOnce(undefined);
    api.read.mockResolvedValue([
      {
        user_id: 'student',
        status: 'PRESENT',
        notes: 'First draft',
        session_id: null,
      },
    ]);
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    render(
      <QueryClientProvider client={client}>
        <GroupAttendanceClient
          wsId="workspace"
          groupId="group"
          initialSessions={[]}
          initialMembers={[
            { id: 'student', full_name: 'Student', role: 'STUDENT' },
          ]}
          initialDate="2026-10-17"
          initialAttendance={{
            student: { status: 'PRESENT', note: 'Stored note' },
          }}
          initialShowManagers={false}
          canUpdateAttendance
        />
      </QueryClientProvider>
    );
    fireEvent.change(screen.getByLabelText('note'), {
      target: { value: 'First draft' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'save' }));
    await waitFor(() => expect(api.save).toHaveBeenCalledOnce());
    fireEvent.change(screen.getByLabelText('note'), {
      target: { value: laterNote },
    });
    await act(async () => finishSave?.());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'save' })).toBeDefined()
    );
    expect(screen.getByLabelText('note')).toHaveProperty('value', laterNote);
    fireEvent.click(screen.getByRole('button', { name: 'save' }));
    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(2));
    expect(api.save.mock.calls[1]?.[2]).toEqual([
      {
        user_id: 'student',
        status: 'PRESENT',
        notes: laterNote,
        date: '2026-10-17',
        session_id: null,
      },
    ]);
    client.clear();
  }
);

it('does not acknowledge a new group draft when the old group save completes', async () => {
  let finishSave: (() => void) | undefined;
  api.save.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finishSave = resolve;
      })
  );
  api.save.mockResolvedValueOnce(undefined);
  api.read.mockResolvedValue([]);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const view = (groupId: string) => (
    <QueryClientProvider client={client}>
      <GroupAttendanceClient
        wsId="workspace"
        groupId={groupId}
        initialSessions={[]}
        initialMembers={[{ id: 'student' }]}
        initialDate="2026-10-17"
        initialAttendance={{
          student: { status: 'PRESENT', note: 'Stored note' },
        }}
        initialShowManagers={false}
        canUpdateAttendance
      />
    </QueryClientProvider>
  );
  const rendered = render(view('first-group'));
  fireEvent.change(screen.getByLabelText('note'), {
    target: { value: 'First group draft' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'save' }));
  await waitFor(() => expect(api.save).toHaveBeenCalledOnce());
  rendered.rerender(view('second-group'));
  fireEvent.change(screen.getByLabelText('note'), {
    target: { value: 'Second group draft' },
  });
  await act(async () => finishSave?.());
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'save' }).hasAttribute('disabled')
    ).toBe(false)
  );
  expect(screen.getByLabelText('note')).toHaveProperty(
    'value',
    'Second group draft'
  );
  expect(invalidate).toHaveBeenCalledExactlyOnceWith({
    queryKey: [
      'workspaces',
      'workspace',
      'users',
      'groups',
      'first-group',
      'attendance',
      '2026-10-17',
      'legacy',
    ],
  });
  fireEvent.click(screen.getByRole('button', { name: 'save' }));
  await waitFor(() => expect(api.save).toHaveBeenCalledTimes(2));
  expect(api.save.mock.calls[0]?.slice(0, 2)).toEqual([
    'workspace',
    'first-group',
  ]);
  expect(api.save.mock.calls[1]?.slice(0, 2)).toEqual([
    'workspace',
    'second-group',
  ]);
  expect(api.save.mock.calls[1]?.[2]).toEqual([
    {
      user_id: 'student',
      status: 'PRESENT',
      notes: 'Second group draft',
      date: '2026-10-17',
      session_id: null,
    },
  ]);
  client.clear();
});

function attendanceFixture(
  workspace = 'easy-center-fixture',
  sessions: WorkspaceUserGroupSession[] = []
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = (workspaceId = workspace) => (
    <QueryClientProvider client={client}>
      <GroupAttendanceClient
        wsId={workspaceId}
        groupId="saturday-class-fixture"
        initialSessions={sessions}
        initialMembers={[{ id: 'student', full_name: 'Synthetic student' }]}
        initialDate="2026-10-17"
        initialAttendance={{
          student: { status: 'PRESENT', note: 'Stored note' },
        }}
        initialShowManagers={false}
        canUpdateAttendance
      />
    </QueryClientProvider>
  );
  return { client, view };
}

it('retains a rejected attendance draft and retries its full status and notes', async () => {
  api.save
    .mockRejectedValueOnce(new Error('Synthetic rejection'))
    .mockResolvedValueOnce(undefined);
  api.read.mockResolvedValue([]);
  const { client, view } = attendanceFixture();
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  render(view());
  fireEvent.change(screen.getByLabelText('note'), {
    target: { value: 'Retained draft' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'save' }));
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'save' }).hasAttribute('disabled')
    ).toBe(false)
  );
  expect(api.save).toHaveBeenCalledOnce();
  expect(notifications.error).toHaveBeenCalledExactlyOnceWith('save_error');
  expect(invalidate).not.toHaveBeenCalled();
  expect(api.read).not.toHaveBeenCalled();
  expect(screen.getByLabelText('note')).toHaveProperty(
    'value',
    'Retained draft'
  );
  fireEvent.click(screen.getByRole('button', { name: 'save' }));
  await waitFor(() => expect(api.save).toHaveBeenCalledTimes(2));
  expect(api.save.mock.calls[1]).toEqual(api.save.mock.calls[0]);
  expect(api.save.mock.calls[1]?.[2]).toEqual([
    {
      user_id: 'student',
      status: 'PRESENT',
      notes: 'Retained draft',
      date: '2026-10-17',
      session_id: null,
    },
  ]);
  client.clear();
});

it.each(['status', 'clear'] as const)(
  'sends a full attendance snapshot for %s and reloads persisted state',
  async (change) => {
    let stored = {
      user_id: 'student',
      status: 'PRESENT',
      notes: 'Stored note',
      session_id: null,
    };
    api.save.mockImplementation(async (_workspace, _group, payload) => {
      stored = { ...stored, ...payload[0] };
    });
    api.read.mockImplementation(async () => [stored]);
    const { client, view } = attendanceFixture();
    const rendered = render(view());
    if (change === 'status')
      fireEvent.click(screen.getByRole('button', { name: 'absent' }));
    else
      fireEvent.change(screen.getByLabelText('note'), {
        target: { value: '' },
      });
    fireEvent.click(screen.getByRole('button', { name: 'save' }));
    await waitFor(() => expect(api.read).toHaveBeenCalled());
    expect(stored).toMatchObject({
      status: change === 'status' ? 'ABSENT' : 'PRESENT',
      notes: change === 'clear' ? '' : 'Stored note',
    });
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'save' })).toBeNull()
    );
    rendered.unmount();
    client.clear();
    const reloaded = attendanceFixture();
    reloaded.client.setQueryData(
      [
        'workspaces',
        'easy-center-fixture',
        'users',
        'groups',
        'saturday-class-fixture',
        'attendance',
        '2026-10-17',
        'legacy',
      ],
      { student: { status: stored.status, note: stored.notes } }
    );
    render(reloaded.view());
    expect(screen.getByLabelText('note')).toHaveProperty('value', stored.notes);
    reloaded.client.clear();
  }
);

it.each(['workspace', 'date'] as const)(
  'keeps the new %s draft when an earlier save completes',
  async (navigation) => {
    let finishSave: (() => void) | undefined;
    api.save
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finishSave = resolve;
          })
      )
      .mockResolvedValueOnce(undefined);
    api.read.mockResolvedValue([
      {
        user_id: 'student',
        status: 'PRESENT',
        notes: 'Stored note',
        session_id: null,
      },
    ]);
    const { client, view } = attendanceFixture();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const rendered = render(view());
    fireEvent.change(screen.getByLabelText('note'), {
      target: { value: 'First scope draft' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'save' }));
    await waitFor(() => expect(api.save).toHaveBeenCalledOnce());
    if (navigation === 'workspace')
      rendered.rerender(view('other-workspace-fixture'));
    else fireEvent.click(screen.getByRole('button', { name: 'next-date' }));
    await waitFor(() =>
      expect(screen.getByLabelText('note')).toHaveProperty(
        'value',
        'Stored note'
      )
    );
    fireEvent.change(screen.getByLabelText('note'), {
      target: { value: 'New scope draft' },
    });
    await act(async () => finishSave?.());
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'save' }).hasAttribute('disabled')
      ).toBe(false)
    );
    expect(screen.getByLabelText('note')).toHaveProperty(
      'value',
      'New scope draft'
    );
    expect(invalidate).toHaveBeenCalledExactlyOnceWith({
      queryKey: [
        'workspaces',
        'easy-center-fixture',
        'users',
        'groups',
        'saturday-class-fixture',
        'attendance',
        '2026-10-17',
        'legacy',
      ],
    });
    fireEvent.click(screen.getByRole('button', { name: 'save' }));
    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(2));
    expect(api.save.mock.calls[1]?.[0]).toBe(
      navigation === 'workspace'
        ? 'other-workspace-fixture'
        : 'easy-center-fixture'
    );
    expect(api.save.mock.calls[1]?.[2][0]).toMatchObject({
      notes: 'New scope draft',
      date: navigation === 'date' ? '2026-10-18' : '2026-10-17',
    });
    client.clear();
  }
);

function syntheticSession(id: string): WorkspaceUserGroupSession {
  return {
    id,
    groupId: 'saturday-class-fixture',
    groupName: 'Synthetic Saturday class',
    description: null,
    descriptionJson: null,
    startTimezone: 'Asia/Ho_Chi_Minh',
    endTimezone: 'Asia/Ho_Chi_Minh',
    startsAt: '2026-10-17T02:00:00Z',
    endsAt: '2026-10-17T03:00:00Z',
    files: [],
    recurrenceInstanceDate: null,
    seriesId: null,
    source: null,
    status: 'scheduled',
    tags: [],
    title: 'Synthetic lesson',
  };
}

it('keeps session-specific drafts and invalidation separate during a delayed save', async () => {
  let finishSave: (() => void) | undefined;
  api.save
    .mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishSave = resolve;
        })
    )
    .mockResolvedValueOnce(undefined);
  api.read.mockImplementation(async (_workspace, _group, options) => [
    {
      user_id: 'student',
      status: 'PRESENT',
      notes: 'Stored session note',
      session_id: options.sessionId,
    },
  ]);
  const { client, view } = attendanceFixture('easy-center-fixture', [
    syntheticSession('session-one'),
    syntheticSession('session-two'),
  ]);
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  render(view());
  fireEvent.click(screen.getByRole('button', { name: 'first-session' }));
  await waitFor(() =>
    expect(screen.getByLabelText('note')).toHaveProperty(
      'value',
      'Stored session note'
    )
  );
  fireEvent.change(screen.getByLabelText('note'), {
    target: { value: 'First session draft' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'save' }));
  await waitFor(() => expect(api.save).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole('button', { name: 'second-session' }));
  await waitFor(() =>
    expect(screen.getByLabelText('note')).toHaveProperty(
      'value',
      'Stored session note'
    )
  );
  fireEvent.change(screen.getByLabelText('note'), {
    target: { value: 'Second session draft' },
  });
  await act(async () => finishSave?.());
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'save' }).hasAttribute('disabled')
    ).toBe(false)
  );
  expect(screen.getByLabelText('note')).toHaveProperty(
    'value',
    'Second session draft'
  );
  expect(invalidate).toHaveBeenCalledExactlyOnceWith({
    queryKey: [
      'workspaces',
      'easy-center-fixture',
      'users',
      'groups',
      'saturday-class-fixture',
      'attendance',
      '2026-10-17',
      'session-one',
    ],
  });
  fireEvent.click(screen.getByRole('button', { name: 'save' }));
  await waitFor(() => expect(api.save).toHaveBeenCalledTimes(2));
  expect(api.save.mock.calls[0]?.[2][0]).toMatchObject({
    session_id: 'session-one',
    notes: 'First session draft',
  });
  expect(api.save.mock.calls[1]?.[2][0]).toMatchObject({
    session_id: 'session-two',
    notes: 'Second session draft',
  });
  client.clear();
});
