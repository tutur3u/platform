import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { expect, it, vi } from 'vitest';
import { taskDetailQuery } from '../task-detail-query';
import {
  TaskDialogProvider,
  useTaskDialogContext,
} from '../task-dialog-provider';

const { getTaskDialogHydration } = vi.hoisted(() => ({
  getTaskDialogHydration: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api/tasks', () => ({
  getTaskDialogHydration,
}));

it('opens with prefetched detail and refreshes it after an edit', async () => {
  const queryClient = new QueryClient();
  const initial = {
    task: { id: 'task-1', name: 'Prefetched details', board_id: 'board-1' },
    availableLists: [],
    taskWsId: 'workspace-1',
    taskWorkspacePersonal: false,
    taskWorkspaceTier: 'PRO',
  };
  getTaskDialogHydration.mockResolvedValueOnce(initial);
  getTaskDialogHydration.mockResolvedValueOnce({
    ...initial,
    task: { ...initial.task, name: 'Saved edit' },
  });

  await queryClient.prefetchQuery(taskDetailQuery('task-1', 'workspace-1'));
  const { result } = renderHook(() => useTaskDialogContext(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <TaskDialogProvider>{children}</TaskDialogProvider>
      </QueryClientProvider>
    ),
  });

  const options = { taskWsId: 'workspace-1' };
  await act(async () => {
    await result.current.openTaskById('task-1', options);
  });
  expect(result.current.state.task?.name).toBe('Prefetched details');
  expect(getTaskDialogHydration).toHaveBeenCalledTimes(1);

  act(() => {
    result.current.triggerUpdate();
  });
  await act(async () => {
    await result.current.openTaskById('task-1', options);
  });
  expect(result.current.state.task?.name).toBe('Saved edit');
  expect(getTaskDialogHydration).toHaveBeenCalledTimes(2);
});
