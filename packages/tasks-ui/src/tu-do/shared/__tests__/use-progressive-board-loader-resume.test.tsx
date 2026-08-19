/**
 * @vitest-environment jsdom
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { listWorkspaceTasks } from '@tuturuuu/internal-api/tasks';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProgressiveBoardLoader } from '../use-progressive-board-loader';

vi.mock('@tuturuuu/internal-api/tasks', () => ({
  listWorkspaceTasks: vi.fn(),
}));

describe('useProgressiveBoardLoader resume reconciliation', () => {
  let queryClient: QueryClient;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
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
});
