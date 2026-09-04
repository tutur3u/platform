import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTaskRevert } from './use-task-revert';

const mocks = vi.hoisted(() => ({
  revertWorkspaceTaskHistory: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api/task-history', async (importOriginal) => ({
  ...(await importOriginal()),
  revertWorkspaceTaskHistory: mocks.revertWorkspaceTaskHistory,
}));

vi.mock('@tuturuuu/ui/hooks/use-toast', () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

const task: Task = {
  id: 'task-1',
  name: 'Current name',
  description: 'Current description',
  list_id: 'list-current',
  display_number: 1,
  priority: 'high' as const,
  created_at: '2026-08-24T00:00:00.000Z',
  labels: [],
};

const snapshot = {
  id: 'task-1',
  name: 'Historical name',
  description: 'Historical description',
  priority: 'low' as const,
  start_date: null,
  end_date: null,
  estimation_points: null,
  list_id: 'list-history',
  completed: false,
  assignees: [],
  labels: [{ id: 'label-1', name: 'Historical', color: 'green' }],
  projects: [],
};

function createHarness() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  queryClient.setQueryData(['tasks', 'board-1'], [task]);
  queryClient.setQueryData(['task', task.id], task);

  return {
    queryClient,
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  };
}

describe('useTaskRevert', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('optimistically restores selected fields and settles with server data', async () => {
    let resolveMutation!: (value: unknown) => void;
    mocks.revertWorkspaceTaskHistory.mockReturnValue(
      new Promise((resolve) => {
        resolveMutation = resolve;
      })
    );
    const { queryClient, wrapper } = createHarness();
    const { result } = renderHook(
      () =>
        useTaskRevert({
          wsId: 'ws-1',
          taskId: task.id,
          boardId: 'board-1',
        }),
      { wrapper }
    );

    act(() => {
      result.current.mutate({
        historyId: 'history-1',
        fields: ['name', 'labels'],
        snapshot,
      });
    });

    await waitFor(() => {
      const optimistic = queryClient.getQueryData<(typeof task)[]>([
        'tasks',
        'board-1',
      ])?.[0] as typeof task & { _optimisticMutationIds?: string[] };
      expect(optimistic.name).toBe('Historical name');
      expect(optimistic.labels?.[0]?.id).toBe('label-1');
      expect(optimistic._optimisticMutationIds).toHaveLength(1);
    });

    resolveMutation({
      success: true,
      revertedFields: ['name', 'labels'],
      task: {
        id: task.id,
        name: 'Historical name',
        list_id: task.list_id,
        display_number: task.display_number,
        created_at: task.created_at,
      },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const settled = queryClient.getQueryData<
      Array<typeof task & { _optimisticMutationIds?: string[] }>
    >(['tasks', 'board-1'])?.[0];
    expect(settled?.name).toBe('Historical name');
    expect(settled?.labels?.[0]?.id).toBe('label-1');
    expect(settled?._optimisticMutationIds).toBeUndefined();
    expect(mocks.revertWorkspaceTaskHistory).toHaveBeenCalledWith(
      'ws-1',
      task.id,
      { historyId: 'history-1', fields: ['name', 'labels'] }
    );
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Version restored' })
    );
  });

  it('rolls back owned fields without erasing a concurrent update', async () => {
    let rejectMutation!: (error: Error) => void;
    mocks.revertWorkspaceTaskHistory.mockReturnValue(
      new Promise((_, reject) => {
        rejectMutation = reject;
      })
    );
    const { queryClient, wrapper } = createHarness();
    const { result } = renderHook(
      () =>
        useTaskRevert({
          wsId: 'ws-1',
          taskId: task.id,
          boardId: 'board-1',
        }),
      { wrapper }
    );

    act(() => {
      result.current.mutate({
        historyId: 'history-1',
        fields: ['name'],
        snapshot,
      });
    });
    await waitFor(() =>
      expect(
        queryClient.getQueryData<(typeof task)[]>(['tasks', 'board-1'])?.[0]
          ?.name
      ).toBe('Historical name')
    );

    queryClient.setQueryData(['tasks', 'board-1'], (current: (typeof task)[]) =>
      current.map((entry) =>
        entry.id === task.id
          ? { ...entry, priority: 'critical' as const }
          : entry
      )
    );
    rejectMutation(new Error('Restore rejected'));

    await waitFor(() => expect(result.current.isError).toBe(true));
    const rolledBack = queryClient.getQueryData<(typeof task)[]>([
      'tasks',
      'board-1',
    ])?.[0];
    expect(rolledBack?.name).toBe('Current name');
    expect(rolledBack?.priority).toBe('critical');
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Restore rejected',
        variant: 'destructive',
      })
    );
  });
});
