import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getActiveInstantBoardSync,
  type InstantBoardSync,
  InstantBoardSyncProvider,
  setActiveInstantBoardSync,
} from '../instant-board-sync-context';
import { useBoardReorderTask } from '../use-board-reorder-task';

const mocks = vi.hoisted(() => ({
  legacy: { mutate: vi.fn(), mutateAsync: vi.fn() },
  toastError: vi.fn(),
}));

vi.mock('@tuturuuu/utils/task-helper', () => ({
  useReorderTask: () => mocks.legacy,
}));
vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { error: mocks.toastError },
}));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

function makeSync(reorderTask: InstantBoardSync['actions']['reorderTask']) {
  return {
    boardId: 'board-1',
    collection: {} as InstantBoardSync['collection'],
    actions: {
      createTask: vi.fn(),
      updateTask: vi.fn(),
      reorderTask,
    },
  } as InstantBoardSync;
}

function render(sync: InstantBoardSync | null) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(
    ['task_lists', 'board-1'],
    [{ id: 'done', status: 'done' }]
  );
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <InstantBoardSyncProvider value={sync}>
        {children}
      </InstantBoardSyncProvider>
    </QueryClientProvider>
  );
  return renderHook(() => useBoardReorderTask('board-1', 'ws-1'), {
    wrapper,
  }).result;
}

const variables = { taskId: 'a', newListId: 'done', newSortKey: 5 };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useBoardReorderTask', () => {
  it('keeps the established mutation while the pilot is off', () => {
    expect(render(null).current).toBe(mocks.legacy);
  });

  it('routes through the instant action with the target list status', async () => {
    const saved = { id: 'a', list_id: 'done' } as Task;
    const reorderTask = vi.fn().mockResolvedValue(saved);
    const result = render(makeSync(reorderTask));
    const onSuccess = vi.fn();
    const onSettled = vi.fn();

    await expect(
      result.current.mutateAsync(variables, { onSuccess, onSettled })
    ).resolves.toBe(saved);

    expect(reorderTask).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'a', targetListStatus: 'done' })
    );
    expect(onSuccess).toHaveBeenCalledWith(saved, variables);
    expect(onSettled).toHaveBeenCalledWith(saved, null, variables);
  });

  it('reports a reverted move and settles the drag on failure', async () => {
    const error = new Error('network');
    const reorderTask = vi.fn().mockRejectedValue(error);
    const result = render(makeSync(reorderTask));
    const onSettled = vi.fn();

    result.current.mutate(variables, { onSettled });
    await vi.waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        'failed_update_task_reverted'
      )
    );
    expect(onSettled).toHaveBeenCalledWith(undefined, error, variables);
  });
});

describe('active instant board registry', () => {
  it('only hands the dialog the sync of the same board', () => {
    const sync = makeSync(vi.fn());
    setActiveInstantBoardSync(sync);
    expect(getActiveInstantBoardSync('board-1')).toBe(sync);
    expect(getActiveInstantBoardSync('board-2')).toBeNull();
    setActiveInstantBoardSync(null);
    expect(getActiveInstantBoardSync('board-1')).toBeNull();
  });
});
