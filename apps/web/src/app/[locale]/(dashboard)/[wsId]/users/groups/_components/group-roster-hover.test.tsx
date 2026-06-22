// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GroupRosterHover } from './group-roster-hover';

const listWorkspaceUserGroupMembersMock = vi.fn();

vi.mock('@tuturuuu/internal-api', () => ({
  listWorkspaceUserGroupMembers: (
    ...args: Parameters<typeof listWorkspaceUserGroupMembersMock>
  ) => listWorkspaceUserGroupMembersMock(...args),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    const messages: Record<string, string> = {
      group_managers_count_short: '{count} managers',
      group_members_count: '{count} users',
      group_roster_counts: '{managers} managers / {members} non-managers',
      group_roster_empty: 'No visible members.',
      group_roster_title: 'Group roster',
      manager_role: 'Manager',
      unknown_member: 'Unknown member',
    };
    const value = messages[key] ?? key;
    return values
      ? value.replace(/\{(\w+)\}/gu, (_match, name) =>
          String(values[name] ?? `{${name}}`)
        )
      : value;
  },
}));

vi.mock('@tuturuuu/ui/hover-card', async () => {
  const React = await import('react');

  return {
    HoverCard: ({
      children,
      onOpenChange,
    }: {
      children: ReactNode;
      onOpenChange?: (open: boolean) => void;
    }) => {
      React.useEffect(() => {
        onOpenChange?.(true);
      }, [onOpenChange]);

      return <div>{children}</div>;
    },
    HoverCardContent: ({ children }: { children: ReactNode }) => (
      <div>{children}</div>
    ),
    HoverCardTrigger: ({ children }: { children: ReactNode }) => (
      <>{children}</>
    ),
  };
});

function renderRoster() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <GroupRosterHover
        groupId="group-1"
        managerCount={1}
        nonManagerCount={2}
        wsId="workspace-1"
      />
    </QueryClientProvider>
  );
}

describe('GroupRosterHover', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads roster pages on hover and fetches the next page near scroll end', async () => {
    listWorkspaceUserGroupMembersMock
      .mockResolvedValueOnce({
        data: [
          {
            avatar_url: null,
            display_name: 'Student One',
            email: 'student.one@example.com',
            full_name: null,
            id: 'user-1',
            phone: '+84000000001',
            role: 'STUDENT',
          },
        ],
        next: 1,
      })
      .mockResolvedValueOnce({
        data: [
          {
            avatar_url: null,
            display_name: 'Manager Two',
            email: 'manager.two@example.com',
            full_name: null,
            id: 'user-2',
            phone: '+84000000002',
            role: 'TEACHER',
          },
        ],
        next: undefined,
      });

    renderRoster();

    expect(await screen.findByText('Student One')).toBeTruthy();
    expect(
      screen.getByText('student.one@example.com | +84000000001')
    ).toBeTruthy();
    expect(listWorkspaceUserGroupMembersMock).toHaveBeenCalledWith(
      'workspace-1',
      'group-1',
      {
        limit: 25,
        offset: 0,
      }
    );

    const rosterList = screen.getByTestId('group-roster-list');
    Object.defineProperties(rosterList, {
      clientHeight: { configurable: true, value: 80 },
      scrollHeight: { configurable: true, value: 160 },
      scrollTop: { configurable: true, value: 90 },
    });
    fireEvent.scroll(rosterList);

    await waitFor(() =>
      expect(listWorkspaceUserGroupMembersMock).toHaveBeenCalledWith(
        'workspace-1',
        'group-1',
        {
          limit: 25,
          offset: 1,
        }
      )
    );
    expect(await screen.findByText('Manager Two')).toBeTruthy();
    expect(screen.getByText('Manager')).toBeTruthy();
  });

  it('publishes loaded roster search text once for unchanged members', async () => {
    const searchTextCalls: string[] = [];

    listWorkspaceUserGroupMembersMock.mockResolvedValue({
      data: [
        {
          avatar_url: null,
          display_name: 'Student One',
          email: 'student.one@example.com',
          full_name: null,
          id: 'user-1',
          phone: '+84000000001',
          role: 'STUDENT',
        },
      ],
      next: undefined,
    });

    function RosterSearchCapture() {
      const [, setCapturedTextByGroupId] = useState(
        () => new Map<string, string>()
      );

      return (
        <GroupRosterHover
          groupId="group-1"
          managerCount={0}
          nonManagerCount={1}
          wsId="workspace-1"
          onSearchTextChange={(groupId, value) => {
            searchTextCalls.push(`${groupId}:${value}`);
            setCapturedTextByGroupId((current) => {
              const next = new Map(current);
              next.set(groupId, value);
              return next;
            });
          }}
        />
      );
    }

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <RosterSearchCapture />
      </QueryClientProvider>
    );

    await waitFor(() => expect(searchTextCalls).toHaveLength(1));
    await waitFor(() =>
      expect(searchTextCalls).toEqual([
        'group-1:Student One student.one@example.com +84000000001 student one student.one@example.com +84000000001',
      ])
    );
  });
});
