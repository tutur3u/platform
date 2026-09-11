/**
 * @vitest-environment jsdom
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { InternalApiError } from '@tuturuuu/internal-api';
import {
  getWorkspaceTask,
  listWorkspaceTasks,
} from '@tuturuuu/internal-api/tasks';
import type { WorkspaceTaskBoard } from '@tuturuuu/types';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readTaskBoardCache, writeTaskBoardCache } from '../task-board-cache';
import { useProgressiveBoardLoader } from '../use-progressive-board-loader';

vi.mock('@tuturuuu/internal-api/tasks', () => ({
  listWorkspaceTasks: vi.fn(),
  getWorkspaceTask: vi.fn().mockRejectedValue(new Error('Unavailable')),
}));

describe('useProgressiveBoardLoader resume reconciliation', () => {
  let queryClient: QueryClient;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    localStorage.clear();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.mocked(listWorkspaceTasks).mockResolvedValue({ tasks: [] });
  });

  async function loadThenRevalidate(cachedTask: Task, count?: number) {
    const { result } = renderHook(
      () => useProgressiveBoardLoader('ws-1', 'board-1'),
      { wrapper }
    );
    await act(() => result.current.loadListPage('list-1', 0));
    queryClient.setQueryData(['tasks', 'board-1'], [cachedTask]);
    vi.mocked(listWorkspaceTasks).mockResolvedValueOnce({ tasks: [], count });
    await act(() => result.current.revalidateLoadedLists());
    return queryClient.getQueryData<Task[]>(['tasks', 'board-1']);
  }

  it('retains last-known tasks when a wake response omits an authoritative count', async () => {
    const cachedTask = {
      id: 'task-cached',
      display_number: 1,
      name: 'Retain after sleep',
      list_id: 'list-1',
      created_at: '2026-08-20T00:00:00.000Z',
    } as Task;

    expect(await loadThenRevalidate(cachedTask)).toEqual([cachedTask]);
  });

  it('removes absent tasks when a wake response has an authoritative count', async () => {
    const cachedTask = {
      id: 'task-removed',
      display_number: 1,
      name: 'Removed on authoritative refresh',
      list_id: 'list-1',
      created_at: '2026-08-20T00:00:00.000Z',
    } as Task;

    expect(await loadThenRevalidate(cachedTask, 0)).toEqual([]);
  });
  it('retains a persisted saved task outside the refreshed page after reload and marker expiry', async () => {
    const savedTask = {
      id: 'saved-at-end',
      name: 'Saved at the end of a long list',
      list_id: 'list-1',
      _localMutationAt: Date.now() - 60_000,
    } as unknown as Task;
    const firstPage = Array.from({ length: 50 }, (_, index) => ({
      id: `task-${index}`,
      list_id: 'list-1',
      name: `Task ${index}`,
    })) as Task[];
    writeTaskBoardCache('ws-1', 'board-1', {
      board: { id: 'board-1' } as WorkspaceTaskBoard,
      pagination: {
        'list-1': {
          page: 0,
          hasMore: true,
          totalCount: 51,
          isLoading: false,
          isInitialLoad: false,
        },
      },
      tasks: [...firstPage, savedTask],
    });
    const restored = readTaskBoardCache('ws-1', 'board-1')!;
    const { result } = renderHook(
      () => useProgressiveBoardLoader('ws-1', 'board-1', restored.pagination),
      { wrapper }
    );
    queryClient.setQueryData(['tasks', 'board-1'], restored.tasks);
    vi.mocked(listWorkspaceTasks).mockResolvedValue({
      tasks: firstPage,
      count: 51,
    });
    await act(() => result.current.revalidateLoadedLists());
    expect(
      queryClient.getQueryData<Task[]>(['tasks', 'board-1'])
    ).toContainEqual(savedTask);
    expect(result.current.pagination['list-1']?.hasMore).toBe(true);
  });

  it('resets pagination after a failed load so retry uses the correct offset', async () => {
    const { result } = renderHook(
      () => useProgressiveBoardLoader('ws-1', 'board-1'),
      { wrapper }
    );
    vi.mocked(listWorkspaceTasks).mockResolvedValueOnce({
      tasks: [],
      count: 100,
    });
    await act(() => result.current.loadListPage('list-1', 0));
    vi.mocked(listWorkspaceTasks).mockRejectedValueOnce(new Error('Offline'));
    await act(async () => {
      await expect(result.current.loadListPage('list-1', 1)).rejects.toThrow(
        'Offline'
      );
    });
    expect(result.current.pagination['list-1']).toMatchObject({
      page: 0,
      hasMore: true,
      isLoading: false,
    });
    await act(() =>
      result.current.loadListPage(
        'list-1',
        result.current.pagination['list-1']!.page + 1
      )
    );
    expect(vi.mocked(listWorkspaceTasks).mock.lastCall?.[1]?.offset).toBe(50);
  });
  it('removes a confirmed deletion from a partial refresh without dropping a displaced task', async () => {
    const deleted = { id: 'deleted', list_id: 'list-1' } as Task;
    const displaced = { id: 'displaced', list_id: 'list-1' } as Task;
    const { result } = renderHook(
      () =>
        useProgressiveBoardLoader('ws-1', 'board-1', {
          'list-1': {
            page: 0,
            hasMore: true,
            totalCount: 100,
            isLoading: false,
            isInitialLoad: false,
          },
        }),
      { wrapper }
    );
    queryClient.setQueryData(['tasks', 'board-1'], [deleted, displaced]);
    vi.mocked(listWorkspaceTasks).mockResolvedValue({ tasks: [], count: 100 });
    vi.mocked(getWorkspaceTask).mockImplementation(async (_ws, id) => {
      if (id === 'deleted') throw new InternalApiError('Gone', 404);
      return { task: displaced } as never;
    });
    await act(() => result.current.revalidateLoadedLists());
    expect(queryClient.getQueryData(['tasks', 'board-1'])).toEqual([displaced]);
  });
});
