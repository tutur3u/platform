import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ProgressiveLoaderProvider,
  type ProgressiveLoaderValue,
} from '../progressive-loader-context';
import { useBoardHeaderData } from './use-board-header-data';

const listMembers = vi.hoisted(() => vi.fn());
vi.mock('@tuturuuu/internal-api/tasks', () => ({
  listWorkspaceTaskBoardViewableMembers: listMembers,
}));

const me = { id: 'me', display_name: 'Linh' };
const later = { id: 'later', display_name: 'Minh' };
const lists = [{ id: 'list-1' }, { id: 'list-2' }] as TaskList[];
const task = {
  id: 'task-1',
  list_id: 'list-1',
  assignees: [me],
  projects: [{ id: 'project-1', name: 'Platform' }],
} as Task;
const complete = {
  page: 0,
  hasMore: false,
  totalCount: 1,
  isLoading: false,
  isInitialLoad: false,
};

function setup({
  pagination = {},
  tasks = [task],
  enabled = true,
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  }),
}: {
  pagination?: ProgressiveLoaderValue['pagination'];
  tasks?: Task[];
  enabled?: boolean;
  queryClient?: QueryClient;
} = {}) {
  const loader = {
    pagination,
    loadListPage: vi.fn(),
    revalidateLoadedLists: vi.fn(),
  };
  return renderHook(
    ({ tasks, pagination }) => {
      loader.pagination = pagination;
      return useBoardHeaderData({
        tasks,
        lists,
        currentUserId: 'me',
        workspaceId: 'ws-1',
        boardId: 'board-1',
        enabled,
      });
    },
    {
      initialProps: { tasks, pagination },
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          <ProgressiveLoaderProvider value={loader}>
            {children}
          </ProgressiveLoaderProvider>
        </QueryClientProvider>
      ),
    }
  );
}

describe('useBoardHeaderData', () => {
  beforeEach(() => {
    listMembers.mockReset();
    listMembers.mockResolvedValue({
      members: [me, later].map((person) => ({ ...person, user_id: person.id })),
    });
  });

  it('includes a member assigned only beyond the first page and enables counts after all pages load', async () => {
    const { result, rerender } = setup({
      pagination: {
        'list-1': { ...complete, hasMore: true },
        'list-2': complete,
      },
    });
    await waitFor(() =>
      expect(result.current.people.map((person) => person.id)).toEqual([
        'me',
        'later',
      ])
    );
    expect(listMembers).toHaveBeenCalledWith('ws-1', 'board-1');
    expect(result.current.countsComplete).toBe(false);

    rerender({
      tasks: [
        task,
        { ...task, id: 'task-51', assignees: [later] } as Task,
        { ...task, id: 'task-52', assignees: [] },
      ],
      pagination: { 'list-1': { ...complete, page: 1 }, 'list-2': complete },
    });
    expect(result.current.countsComplete).toBe(true);
    expect(result.current.people.map((person) => person.taskCount)).toEqual([
      1, 1,
    ]);
    expect(result.current.unassignedCount).toBe(1);
    expect(result.current.projectTaskCounts.get('project-1')).toBe(3);
  });

  it.each([
    ['unvisited', {}],
    ['initial load', { 'list-1': { ...complete, isInitialLoad: true } }],
    ['loading', { 'list-1': { ...complete, isLoading: true } }],
    ['later pages', { 'list-1': { ...complete, hasMore: true } }],
  ])('does not claim complete counts with an %s list', (_label, pagination) => {
    const { result } = setup({
      pagination: { 'list-2': complete, ...pagination },
    });
    expect(result.current.countsComplete).toBe(false);
  });

  it('reuses the assignee picker normalized member cache', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      ['task-board-viewable-members', 'ws-1', 'board-1'],
      [{ id: later.id, user_id: later.id, display_name: later.display_name }]
    );
    const { result } = setup({ queryClient });
    expect(result.current.people.map((person) => person.id)).toEqual([
      'me',
      'later',
    ]);
    expect(listMembers).not.toHaveBeenCalled();
  });

  it('keeps assigned nonmembers available and ignores deleted tasks in counts', async () => {
    listMembers.mockResolvedValueOnce({ members: [] });
    const { result } = setup({
      tasks: [task, { ...task, id: 'old-task', deleted_at: '2026-10-01' }],
    });
    await waitFor(() => expect(listMembers).toHaveBeenCalledTimes(1));
    expect(
      result.current.people.find((person) => person.id === me.id)?.taskCount
    ).toBe(1);
    expect(result.current.projectTaskCounts.get('project-1')).toBe(1);
  });

  it('does not query private board members on public or read-only boards', () => {
    setup({ enabled: false });
    expect(listMembers).not.toHaveBeenCalled();
  });
});
