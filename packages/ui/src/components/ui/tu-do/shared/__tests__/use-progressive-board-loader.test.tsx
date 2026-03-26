/**
 * @vitest-environment jsdom
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { listWorkspaceTasks } from '@tuturuuu/internal-api/tasks';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProgressiveBoardLoader } from '../use-progressive-board-loader';

vi.mock('@tuturuuu/internal-api/tasks', () => ({
  listWorkspaceTasks: vi.fn(),
}));

describe('useProgressiveBoardLoader', () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    vi.mocked(listWorkspaceTasks).mockResolvedValue({ tasks: [] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('upserts incoming task records instead of preserving stale cache entries', async () => {
    const cachedTask: Task = {
      id: 'task-1',
      display_number: 1,
      name: 'Done task',
      list_id: 'list-1',
      created_at: '2026-03-19T00:00:00.000Z',
    };

    queryClient.setQueryData(['tasks', 'board-1'], [cachedTask]);

    vi.mocked(listWorkspaceTasks).mockResolvedValueOnce({
      tasks: [
        {
          ...cachedTask,
          completed_at: '2026-03-19T01:00:00.000Z',
        },
      ],
    });

    const { result } = renderHook(
      () => useProgressiveBoardLoader('ws-1', 'board-1'),
      { wrapper }
    );

    await act(async () => {
      await result.current.loadListPage('list-1', 0);
    });

    expect(listWorkspaceTasks).toHaveBeenCalledWith('ws-1', {
      listId: 'list-1',
      limit: 50,
      offset: 0,
    });
    expect(queryClient.getQueryData<Task[]>(['tasks', 'board-1'])).toEqual([
      {
        ...cachedTask,
        completed_at: '2026-03-19T01:00:00.000Z',
      },
    ]);
  });

  it('appends newly discovered tasks after merging existing ones', async () => {
    const cachedTask: Task = {
      id: 'task-1',
      display_number: 1,
      name: 'Existing task',
      list_id: 'list-1',
      created_at: '2026-03-19T00:00:00.000Z',
    };

    queryClient.setQueryData(['tasks', 'board-1'], [cachedTask]);

    vi.mocked(listWorkspaceTasks).mockResolvedValueOnce({
      tasks: [
        {
          ...cachedTask,
          completed_at: '2026-03-19T01:00:00.000Z',
        },
        {
          id: 'task-2',
          display_number: 2,
          name: 'New task',
          list_id: 'list-1',
          created_at: '2026-03-19T02:00:00.000Z',
        },
      ],
    });

    const { result } = renderHook(
      () => useProgressiveBoardLoader('ws-1', 'board-1'),
      { wrapper }
    );

    await act(async () => {
      await result.current.loadListPage('list-1', 0);
    });

    expect(queryClient.getQueryData<Task[]>(['tasks', 'board-1'])).toEqual([
      {
        ...cachedTask,
        completed_at: '2026-03-19T01:00:00.000Z',
      },
      {
        id: 'task-2',
        display_number: 2,
        name: 'New task',
        list_id: 'list-1',
        created_at: '2026-03-19T02:00:00.000Z',
      },
    ]);
  });

  it('does not overwrite a local move completed after request start', async () => {
    const cachedTask: Task = {
      id: 'task-1',
      display_number: 1,
      name: 'Task',
      list_id: 'done-list',
      created_at: '2026-03-19T00:00:00.000Z',
      closed_at: '2026-03-19T01:00:00.000Z',
      completed_at: '2026-03-19T01:00:00.000Z',
    };

    queryClient.setQueryData(['tasks', 'board-1'], [cachedTask]);

    let resolveFetch: (value: { tasks: Task[] }) => void = () => {
      throw new Error('Expected pending fetch resolver');
    };
    const pendingFetch = new Promise<{ tasks: Task[] }>((resolve) => {
      resolveFetch = resolve;
    });

    vi.mocked(listWorkspaceTasks).mockImplementationOnce(() => pendingFetch);

    const { result } = renderHook(
      () => useProgressiveBoardLoader('ws-1', 'board-1'),
      { wrapper }
    );

    let loadPromise: Promise<unknown> | undefined;
    await act(async () => {
      loadPromise = result.current.loadListPage('todo-list', 0);
      await Promise.resolve();
    });

    queryClient.setQueryData(
      ['tasks', 'board-1'],
      [
        {
          ...cachedTask,
          _localMutationAt: Date.now() + 1000,
        } as Task,
      ]
    );

    resolveFetch({
      tasks: [
        {
          ...cachedTask,
          list_id: 'todo-list',
          completed_at: undefined,
          closed_at: undefined,
        },
      ],
    });

    await act(async () => {
      await loadPromise;
    });

    expect(queryClient.getQueryData<Task[]>(['tasks', 'board-1'])).toEqual([
      {
        ...cachedTask,
        _localMutationAt: expect.any(Number),
      },
    ]);
  });

  it('overwrites local mutation when _localMutationAt precedes request start', async () => {
    const cachedTask = {
      id: 'task-1',
      display_number: 1,
      name: 'Task',
      list_id: 'done-list',
      created_at: '2026-03-19T00:00:00.000Z',
      _localMutationAt: Date.now() - 60_000,
    } as Task;
    const { _localMutationAt: _ignored, ...serverTask } = cachedTask as Task & {
      _localMutationAt?: number;
    };

    queryClient.setQueryData(['tasks', 'board-1'], [cachedTask]);

    vi.mocked(listWorkspaceTasks).mockResolvedValueOnce({
      tasks: [
        {
          ...serverTask,
          list_id: 'todo-list',
        },
      ],
    });

    const { result } = renderHook(
      () => useProgressiveBoardLoader('ws-1', 'board-1'),
      { wrapper }
    );

    await act(async () => {
      await result.current.loadListPage('todo-list', 0);
    });

    const tasks = queryClient.getQueryData<Task[]>(['tasks', 'board-1']);
    expect(tasks?.[0]?.list_id).toBe('todo-list');
    expect(tasks?.[0]).not.toHaveProperty('_localMutationAt');
  });

  it('revalidates loaded lists without clearing other list tasks', async () => {
    const existingOtherListTask: Task = {
      id: 'task-other',
      display_number: 20,
      name: 'Other list task',
      list_id: 'list-2',
      created_at: '2026-03-19T00:00:00.000Z',
    };

    const staleListTask: Task = {
      id: 'task-1',
      display_number: 1,
      name: 'Stale list task',
      list_id: 'list-1',
      created_at: '2026-03-19T00:00:00.000Z',
    };

    queryClient.setQueryData(
      ['tasks', 'board-1'],
      [staleListTask, existingOtherListTask]
    );

    const { result } = renderHook(
      () => useProgressiveBoardLoader('ws-1', 'board-1'),
      { wrapper }
    );

    await act(async () => {
      await result.current.loadListPage('list-1', 0);
      await result.current.loadListPage('list-1', 1);
    });

    vi.mocked(listWorkspaceTasks)
      .mockResolvedValueOnce({
        tasks: [
          {
            ...staleListTask,
            name: 'Fresh page 0 task',
          },
        ],
      })
      .mockResolvedValueOnce({
        tasks: [
          {
            id: 'task-2',
            display_number: 2,
            name: 'Fresh page 1 task',
            list_id: 'list-1',
            created_at: '2026-03-19T01:00:00.000Z',
          },
        ],
      });

    await act(async () => {
      await result.current.revalidateLoadedLists();
    });

    const finalTasks = queryClient.getQueryData<Task[]>(['tasks', 'board-1']);
    expect(finalTasks).toEqual([
      {
        ...staleListTask,
        name: 'Fresh page 0 task',
      },
      existingOtherListTask,
      {
        id: 'task-2',
        display_number: 2,
        name: 'Fresh page 1 task',
        list_id: 'list-1',
        created_at: '2026-03-19T01:00:00.000Z',
      },
    ]);
  });
});
