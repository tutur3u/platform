/**
 * @vitest-environment jsdom
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { listWorkspaceTasks } from '@tuturuuu/internal-api/tasks';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { ReactNode } from 'react';
import { expect, it, vi } from 'vitest';
import { useProgressiveBoardLoader } from '../use-progressive-board-loader';

vi.mock('@tuturuuu/internal-api/tasks', () => ({
  listWorkspaceTasks: vi.fn(),
  getWorkspaceTask: vi.fn().mockRejectedValue(new Error('Unavailable')),
}));

it('preserves actual first-page size across pagination and refreshes it on revalidation', async () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const task = { id: 'task-1', name: 'Task', list_id: 'list-1' } as Task;
  vi.mocked(listWorkspaceTasks).mockResolvedValueOnce({
    tasks: [task],
    count: 9,
  });
  const { result } = renderHook(
    () => useProgressiveBoardLoader('ws-1', 'board-1'),
    { wrapper }
  );
  await act(async () => {
    await result.current.loadListPage('list-1', 0);
  });
  vi.mocked(listWorkspaceTasks).mockResolvedValueOnce({
    tasks: [],
    count: 9,
  });
  await act(async () => {
    await result.current.loadListPage('list-1', 1);
  });
  expect(result.current.pagination['list-1']?.firstPageTaskCount).toBe(1);
  vi.mocked(listWorkspaceTasks)
    .mockResolvedValueOnce({
      tasks: [task, { ...task, id: 'task-2' }],
      count: 9,
    })
    .mockResolvedValueOnce({ tasks: [], count: 9 });
  await act(async () => {
    await result.current.revalidateLoadedLists();
  });
  expect(result.current.pagination['list-1']?.firstPageTaskCount).toBe(2);
});
