import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import GroupAttendanceClient from '../../../../packages/users-ui/src/components/group-attendance-client';

const api = vi.hoisted(() => ({ save: vi.fn(), read: vi.fn() }));
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
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
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
  () => ({ GroupAttendanceCalendar: () => null })
);
vi.mock(
  '../../../../packages/users-ui/src/components/group-attendance-overview',
  () => ({ GroupAttendanceOverview: () => null })
);
vi.mock(
  '../../../../packages/users-ui/src/components/group-attendance-member-card',
  () => ({
    GroupAttendanceMemberCard: ({
      entry,
      onNoteChange,
    }: {
      entry: { note: string };
      onNoteChange: (note: string) => void;
    }) => (
      <input
        aria-label="note"
        value={entry.note}
        onChange={(event) => onNoteChange(event.target.value)}
      />
    ),
  })
);

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
