import { beforeEach, describe, expect, it, vi } from 'vitest';

const bulkWorkspaceTasksMock = vi.fn();

vi.mock('@tuturuuu/internal-api/tasks', () => ({
  bulkWorkspaceTasks: (...args: unknown[]) => bulkWorkspaceTasksMock(...args),
  listWorkspaceTasks: vi.fn(),
}));

import {
  BULK_LIST_MOVE_CHUNK_SIZE,
  moveTaskIdsInBatches,
} from './bulk-list-move';

const ids = (count: number) =>
  Array.from({ length: count }, (_, index) => `task-${index}`);

describe('moveTaskIdsInBatches', () => {
  beforeEach(() => {
    bulkWorkspaceTasksMock.mockReset();
  });

  it('sends one bulk request per chunk instead of one per task', async () => {
    bulkWorkspaceTasksMock.mockImplementation(
      async (_ws: string, payload: { taskIds: string[] }) => ({
        succeededTaskIds: payload.taskIds,
      })
    );
    const progress: Array<{ done: number; total: number }> = [];
    const total = BULK_LIST_MOVE_CHUNK_SIZE * 2 + 3;

    const result = await moveTaskIdsInBatches(
      'ws-1',
      ids(total),
      { listId: 'list-2' },
      (value) => progress.push(value)
    );

    expect(bulkWorkspaceTasksMock).toHaveBeenCalledTimes(3);
    expect(bulkWorkspaceTasksMock.mock.calls[0]?.[1]).toEqual({
      taskIds: ids(total).slice(0, BULK_LIST_MOVE_CHUNK_SIZE),
      operation: { type: 'move_to_list', listId: 'list-2' },
    });
    expect(result.movedCount).toBe(total);
    expect(result.failedTaskIds).toEqual([]);
    expect(progress.at(0)).toEqual({ done: 0, total });
    expect(progress.at(-1)).toEqual({ done: total, total });
  });

  it('marks unconfirmed and failed-chunk tasks as failed', async () => {
    bulkWorkspaceTasksMock
      .mockResolvedValueOnce({ succeededTaskIds: ['task-0'] })
      .mockRejectedValueOnce(new Error('network'));

    const result = await moveTaskIdsInBatches(
      'ws-1',
      ids(BULK_LIST_MOVE_CHUNK_SIZE + 1),
      { listId: 'list-2', targetBoardId: 'board-2' }
    );

    expect(bulkWorkspaceTasksMock.mock.calls[0]?.[1].operation).toEqual({
      type: 'move_to_list',
      listId: 'list-2',
      targetBoardId: 'board-2',
    });
    expect(result.movedTaskIds).toEqual(['task-0']);
    expect(result.failedTaskIds).toHaveLength(BULK_LIST_MOVE_CHUNK_SIZE);
  });
});
