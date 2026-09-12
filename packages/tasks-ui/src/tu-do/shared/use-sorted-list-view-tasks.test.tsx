import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { TASK_UNPRIORITIZED_POSITION_CONFIG_ID } from '@tuturuuu/utils/task-helper';
import type { ReactNode } from 'react';
import { expect, it, vi } from 'vitest';
import { useSortedListViewTasks } from './use-sorted-list-view-tasks';

vi.mock('@tuturuuu/internal-api/users', () => ({
  getUserConfig: vi.fn(async () => ({ value: 'first' })),
}));

it('immediately reorders loaded tasks when the shared saved preference changes', () => {
  const queryClient = new QueryClient();
  const key = ['user-config', TASK_UNPRIORITIZED_POSITION_CONFIG_ID];
  queryClient.setQueryData(key, 'first');
  const tasks = [
    { id: 'high', priority: 'high' },
    { id: 'none', priority: null },
  ] as Task[];
  const { result } = renderHook(
    () =>
      useSortedListViewTasks(tasks, {
        sortField: 'priority',
        sortOrder: 'desc',
      }),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    }
  );
  expect(result.current.map((task) => task.id)).toEqual(['none', 'high']);
  act(() => {
    queryClient.setQueryData(key, 'last');
  });
  // Query notifications are scheduled; flush before checking the reordered view.
  return vi.waitFor(() =>
    expect(result.current.map((task) => task.id)).toEqual(['high', 'none'])
  );
});
