/**
 * @vitest-environment jsdom
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BULK_DELETE_CHUNK_SIZE,
  useBulkDeleteTasks,
} from '../bulk-mutations-delete';

type BulkPayload = {
  taskIds: string[];
  operation: { type: string; updates?: { deleted?: boolean } };
};

const mocks = vi.hoisted(() => ({
  bulkWorkspaceTasks: vi.fn(),
  toast: {
    error: vi.fn(),
    loading: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock('@tuturuuu/internal-api/tasks', () => ({
  bulkWorkspaceTasks: mocks.bulkWorkspaceTasks,
  getWorkspaceTask: vi.fn(() => Promise.resolve({ task: null })),
}));

vi.mock('@tuturuuu/ui/sonner', () => ({ toast: mocks.toast }));

function succeedAll(_wsId: string, payload: BulkPayload) {
  return Promise.resolve({
    successCount: payload.taskIds.length,
    failCount: 0,
    taskIds: payload.taskIds,
    succeededTaskIds: payload.taskIds,
    failures: [],
    taskMetaById: {},
  });
}

function makeTasks(count: number) {
  return Array.from(
    { length: count },
    (_, index) =>
      ({
        id: `task-${index}`,
        name: `Task ${index}`,
        list_id: 'list-1',
        created_at: '2026-01-01T00:00:00.000Z',
      }) as unknown as Task
  );
}

function progressCalls() {
  return mocks.toast.loading.mock.calls.map(([message, options]) => ({
    done: (message as ReactElement<{ done: number }>).props.done,
    total: (message as ReactElement<{ total: number }>).props.total,
    id: (options as { id: string }).id,
  }));
}

describe('useBulkDeleteTasks', () => {
  let queryClient: QueryClient;
  let wrapper: ({ children }: { children: ReactNode }) => ReactElement;
  const clearSelection = vi.fn();
  const setBulkDeleteOpen = vi.fn();
  const broadcast = vi.fn();

  function renderDelete() {
    return renderHook(
      () =>
        useBulkDeleteTasks(
          queryClient,
          'ws-1',
          'board-1',
          clearSelection,
          setBulkDeleteOpen,
          broadcast
        ),
      { wrapper }
    ).result;
  }

  const boardIds = () =>
    queryClient
      .getQueryData<Task[]>(['tasks', 'board-1'])
      ?.map((task) => task.id);

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.bulkWorkspaceTasks.mockImplementation(succeedAll);
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  });

  it('deletes in batched requests, reports x/N and closes the dialog at once', async () => {
    const tasks = makeTasks(BULK_DELETE_CHUNK_SIZE * 2 + 20);
    queryClient.setQueryData(['tasks', 'board-1'], tasks);
    const result = renderDelete();

    await act(async () => {
      await result.current.mutateAsync({
        taskIds: tasks.map((task) => task.id),
        toastId: 'delete-toast',
      });
    });

    expect(mocks.bulkWorkspaceTasks).toHaveBeenCalledTimes(3);
    expect(
      mocks.bulkWorkspaceTasks.mock.calls.map(
        ([, payload]) => (payload as BulkPayload).taskIds.length
      )
    ).toEqual([BULK_DELETE_CHUNK_SIZE, BULK_DELETE_CHUNK_SIZE, 20]);
    expect(mocks.bulkWorkspaceTasks.mock.calls[0]?.[1]).toMatchObject({
      operation: { type: 'update_fields', updates: { deleted: true } },
    });

    const progress = progressCalls();
    expect(progress[0]).toEqual({ done: 0, total: 120, id: 'delete-toast' });
    expect(progress.at(-1)).toEqual({
      done: 120,
      total: 120,
      id: 'delete-toast',
    });
    expect(progress.map((call) => call.done)).toEqual(
      expect.arrayContaining([50, 100])
    );

    expect(setBulkDeleteOpen).toHaveBeenCalledWith(false);
    expect(clearSelection).toHaveBeenCalled();
    expect(boardIds()).toEqual([]);
    expect(broadcast).toHaveBeenCalledTimes(120);
    expect(mocks.toast.success).toHaveBeenCalledWith(
      'Deleted selected tasks',
      expect.objectContaining({
        id: 'delete-toast',
        action: expect.objectContaining({ label: 'Undo' }),
      })
    );
  });

  it('removes cards before the request settles', async () => {
    const tasks = makeTasks(3);
    queryClient.setQueryData(['tasks', 'board-1'], tasks);
    let release: () => void = () => undefined;
    mocks.bulkWorkspaceTasks.mockImplementation(
      (wsId: string, payload: BulkPayload) =>
        new Promise((resolve) => {
          release = () => resolve(succeedAll(wsId, payload));
        })
    );
    const result = renderDelete();

    let pending: Promise<unknown> = Promise.resolve();
    await act(async () => {
      pending = result.current.mutateAsync({
        taskIds: ['task-0', 'task-2'],
        toastId: 't',
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(boardIds()).toEqual(['task-1']);
    expect(setBulkDeleteOpen).toHaveBeenCalledWith(false);

    await act(async () => {
      release();
      await pending;
    });
    expect(boardIds()).toEqual(['task-1']);
  });

  it('rolls the board back and shows the error in the same toast when nothing is deleted', async () => {
    const tasks = makeTasks(2);
    queryClient.setQueryData(['tasks', 'board-1'], tasks);
    mocks.bulkWorkspaceTasks.mockRejectedValue(new Error('offline'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = renderDelete();

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          taskIds: ['task-0', 'task-1'],
          toastId: 'fail-toast',
        })
      ).rejects.toThrow();
    });

    expect(boardIds()).toEqual(['task-0', 'task-1']);
    expect(mocks.toast.error).toHaveBeenCalledWith(
      'Failed to delete selected tasks',
      { id: 'fail-toast' }
    );
    expect(mocks.toast.success).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('restores only the tasks the server failed to delete', async () => {
    const tasks = makeTasks(3);
    queryClient.setQueryData(['tasks', 'board-1'], tasks);
    mocks.bulkWorkspaceTasks.mockImplementation(
      (_wsId: string, payload: BulkPayload) =>
        Promise.resolve({
          successCount: payload.taskIds.length - 1,
          failCount: 1,
          taskIds: payload.taskIds,
          succeededTaskIds: payload.taskIds.filter((id) => id !== 'task-1'),
          failures: [{ taskId: 'task-1', error: 'denied' }],
          taskMetaById: {},
        })
    );
    const result = renderDelete();

    await act(async () => {
      await result.current.mutateAsync({
        taskIds: ['task-0', 'task-1', 'task-2'],
        toastId: 'partial',
      });
    });

    expect(boardIds()).toEqual(['task-1']);
    expect(mocks.toast.warning).toHaveBeenCalledWith(
      'Partial deletion completed',
      expect.objectContaining({
        id: 'partial',
        action: expect.objectContaining({ label: 'Undo' }),
      })
    );
  });

  it('Undo restores tasks from other workspaces through their own workspace', async () => {
    const local = { ...makeTasks(1)[0], ws_id: 'ws-1' } as Task;
    const external = {
      ...makeTasks(2)[1],
      source_workspace_id: 'source-ws',
    } as unknown as Task;
    queryClient.setQueryData(['tasks', 'board-1'], [local, external]);
    const result = renderDelete();

    await act(async () => {
      await result.current.mutateAsync({
        taskIds: ['task-0', 'task-1'],
        toastId: 'mixed',
      });
    });
    expect(
      mocks.bulkWorkspaceTasks.mock.calls.map(([workspaceId]) => workspaceId)
    ).toEqual(['ws-1', 'source-ws']);

    const options = mocks.toast.success.mock.calls[0]?.[1] as {
      action: { onClick: () => void };
    };
    mocks.bulkWorkspaceTasks.mockClear();

    await act(async () => {
      options.action.onClick();
      // A second click while the toast animates out does nothing.
      options.action.onClick();
      await vi.waitFor(() =>
        expect(mocks.toast.success).toHaveBeenCalledTimes(2)
      );
    });

    expect(
      mocks.bulkWorkspaceTasks.mock.calls.map(([workspaceId, payload]) => [
        workspaceId,
        (payload as BulkPayload).taskIds,
        (payload as BulkPayload).operation.updates?.deleted,
      ])
    ).toEqual([
      ['ws-1', ['task-0'], false],
      ['source-ws', ['task-1'], false],
    ]);
  });

  it('rolls back only its own cards when a concurrent delete is still running', async () => {
    const tasks = makeTasks(4);
    queryClient.setQueryData(['tasks', 'board-1'], tasks);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let failFirst: (error: Error) => void = () => undefined;
    mocks.bulkWorkspaceTasks.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          failFirst = reject;
        })
    );
    const first = renderDelete();
    const second = renderDelete();

    let firstRun: Promise<unknown> = Promise.resolve();
    await act(async () => {
      firstRun = first.current
        .mutateAsync({ taskIds: ['task-0'], toastId: 'a' })
        .catch(() => undefined);
      await vi.waitFor(() =>
        expect(mocks.bulkWorkspaceTasks).toHaveBeenCalledTimes(1)
      );
      await second.current.mutateAsync({ taskIds: ['task-1'], toastId: 'b' });
    });
    expect(boardIds()).toEqual(['task-2', 'task-3']);

    await act(async () => {
      failFirst(new Error('offline'));
      await firstRun;
    });

    // task-0 comes back; task-1, deleted by the other run, stays gone.
    expect(boardIds()?.sort()).toEqual(['task-0', 'task-2', 'task-3']);
    errorSpy.mockRestore();
  });

  it('rolls a task back only into the caches that held it', async () => {
    const tasks = makeTasks(2);
    const other = { ...makeTasks(3)[2] } as Task;
    queryClient.setQueryData(['tasks', 'board-1'], tasks);
    queryClient.setQueryData(['tasks-full', 'board-1', 'all'], tasks);
    queryClient.setQueryData(['tasks-full', 'board-1', 'sprints'], [other]);
    mocks.bulkWorkspaceTasks.mockRejectedValue(new Error('offline'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = renderDelete();

    await act(async () => {
      await result.current
        .mutateAsync({ taskIds: ['task-0'], toastId: 'scoped' })
        .catch(() => undefined);
    });

    expect(boardIds()).toEqual(['task-0', 'task-1']);
    expect(
      queryClient
        .getQueryData<Task[]>(['tasks-full', 'board-1', 'all'])
        ?.map((task) => task.id)
    ).toEqual(['task-0', 'task-1']);
    expect(
      queryClient
        .getQueryData<Task[]>(['tasks-full', 'board-1', 'sprints'])
        ?.map((task) => task.id)
    ).toEqual(['task-2']);
    errorSpy.mockRestore();
  });

  it('takes the cards out again when Undo fails', async () => {
    const tasks = makeTasks(2);
    queryClient.setQueryData(['tasks', 'board-1'], tasks);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = renderDelete();

    await act(async () => {
      await result.current.mutateAsync({
        taskIds: ['task-0'],
        toastId: 'undo-fail',
      });
    });
    const options = mocks.toast.success.mock.calls[0]?.[1] as {
      action: { onClick: () => void };
    };
    mocks.bulkWorkspaceTasks.mockRejectedValue(new Error('offline'));

    await act(async () => {
      options.action.onClick();
      await vi.waitFor(() => expect(mocks.toast.error).toHaveBeenCalled());
    });

    expect(boardIds()).toEqual(['task-1']);
    expect(mocks.toast.error).toHaveBeenCalledWith(
      'Failed to restore deleted tasks',
      { id: 'undo-fail-undo' }
    );
    errorSpy.mockRestore();
  });

  it('refreshes the recycle bin after a delete', async () => {
    queryClient.setQueryData(['tasks', 'board-1'], makeTasks(1));
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const result = renderDelete();

    await act(async () => {
      await result.current.mutateAsync({ taskIds: ['task-0'], toastId: 'r' });
    });

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['deleted-tasks', 'board-1'],
    });
  });

  it('Undo restores the deleted ids and puts the cards back', async () => {
    const tasks = makeTasks(3);
    queryClient.setQueryData(['tasks', 'board-1'], tasks);
    const result = renderDelete();

    await act(async () => {
      await result.current.mutateAsync({
        taskIds: ['task-0', 'task-2'],
        toastId: 'delete-toast',
      });
    });
    expect(boardIds()).toEqual(['task-1']);

    const options = mocks.toast.success.mock.calls[0]?.[1] as {
      action: { onClick: () => void };
    };
    mocks.bulkWorkspaceTasks.mockClear();
    broadcast.mockClear();
    clearSelection.mockClear();
    setBulkDeleteOpen.mockClear();

    await act(async () => {
      options.action.onClick();
      await vi.waitFor(() =>
        expect(mocks.toast.success).toHaveBeenCalledTimes(2)
      );
    });

    expect(mocks.bulkWorkspaceTasks).toHaveBeenCalledTimes(1);
    expect(mocks.bulkWorkspaceTasks).toHaveBeenCalledWith(
      'ws-1',
      {
        taskIds: ['task-0', 'task-2'],
        operation: { type: 'update_fields', updates: { deleted: false } },
      },
      expect.anything()
    );
    expect(boardIds()?.sort()).toEqual(['task-0', 'task-1', 'task-2']);
    expect(broadcast).toHaveBeenCalledWith(
      'task:upsert',
      expect.objectContaining({
        task: expect.objectContaining({ id: 'task-0', deleted_at: null }),
      })
    );
    expect(mocks.toast.success).toHaveBeenLastCalledWith(
      'Tasks restored',
      expect.objectContaining({ id: 'delete-toast-undo' })
    );
    expect(progressCalls().at(-1)).toEqual({
      done: 2,
      total: 2,
      id: 'delete-toast-undo',
    });
    // Undo never reopens the dialog or touches the selection.
    expect(setBulkDeleteOpen).not.toHaveBeenCalled();
    expect(clearSelection).not.toHaveBeenCalled();
  });
});
