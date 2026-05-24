import { describe, expect, it } from 'vitest';
import {
  addPendingTaskIds,
  getPendingTaskIdsForDrop,
  removePendingTaskIds,
} from './task-drag-pending';

describe('task drag pending helpers', () => {
  it('keeps the active task pending for a normal drop', () => {
    expect(getPendingTaskIdsForDrop({ activeTaskId: 'task-1' })).toEqual([
      'task-1',
    ]);
  });

  it('includes repaired sort-key tasks without duplicating the active task', () => {
    expect(
      getPendingTaskIdsForDrop({
        activeTaskId: 'task-1',
        repairedTaskSortKeys: [
          { listId: 'list-1', sortKey: 1_000_000, taskId: 'task-2' },
          { listId: 'list-1', sortKey: 2_000_000, taskId: 'task-1' },
          { listId: 'list-1', sortKey: 3_000_000, taskId: 'task-3' },
        ],
      })
    ).toEqual(['task-1', 'task-2', 'task-3']);
  });

  it('adds and removes pending task ids immutably', () => {
    const current = new Set(['task-1']);
    const added = addPendingTaskIds(current, ['task-2', 'task-3']);
    const removed = removePendingTaskIds(added, ['task-1', 'task-3']);

    expect(Array.from(current)).toEqual(['task-1']);
    expect(Array.from(added)).toEqual(['task-1', 'task-2', 'task-3']);
    expect(Array.from(removed)).toEqual(['task-2']);
  });
});
