/**
 * @vitest-environment jsdom
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tuturuuu/internal-api/tasks', () => ({
  getWorkspaceTaskRelationships: vi.fn().mockResolvedValue({ blocking: [] }),
  updateWorkspaceTask: vi.fn().mockResolvedValue({
    task: {
      id: 'task-1',
      display_number: 1,
      name: 'Task',
      list_id: 'target-list',
      sort_key: 2_000_000,
      created_at: '2026-08-13T00:00:00.000Z',
    },
  }),
}));

import { useReorderTask } from '../task/reorder';

describe('useReorderTask', () => {
  it('cancels stale board fetches without reverting the dropped destination', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { retry: false },
      },
    });
    const cancelQueries = vi.spyOn(queryClient, 'cancelQueries');
    const task = {
      id: 'task-1',
      display_number: 1,
      name: 'Task',
      list_id: 'source-list',
      sort_key: 1_000_000,
      created_at: '2026-08-13T00:00:00.000Z',
    } as Task;

    queryClient.setQueryData(['tasks', 'board-1'], [task]);
    queryClient.setQueryData(['tasks-full', 'board-1'], [task]);
    queryClient.setQueryData(
      ['task_lists', 'board-1'],
      [{ id: 'target-list', status: 'active' }]
    );

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () => useReorderTask('board-1', 'workspace-1'),
      { wrapper }
    );

    act(() => {
      result.current.mutate({
        taskId: task.id,
        newListId: 'target-list',
        newSortKey: 2_000_000,
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(cancelQueries).toHaveBeenCalledWith(
      { queryKey: ['tasks', 'board-1'] },
      { revert: false }
    );
    expect(cancelQueries).toHaveBeenCalledWith(
      { queryKey: ['tasks-full', 'board-1'] },
      { revert: false }
    );
    expect(queryClient.getQueryData<Task[]>(['tasks', 'board-1'])?.[0]).toEqual(
      expect.objectContaining({ list_id: 'target-list' })
    );
  });
});
