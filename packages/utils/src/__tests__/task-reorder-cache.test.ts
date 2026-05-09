import type { Task } from '@tuturuuu/types/primitives/Task';
import { describe, expect, it, vi } from 'vitest';

import {
  mergeOptimisticReorderedTaskIntoCache,
  mergeServerReorderedTaskIntoCache,
} from '../task/reorder';

function createTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    display_number: 1,
    name: 'Task',
    list_id: 'todo-list',
    sort_key: 1_000_000,
    created_at: '2026-05-07T00:00:00.000Z',
    ...overrides,
  } as Task;
}

describe('reorder task cache helpers', () => {
  it('marks optimistic list moves so stale list loads cannot move the card back', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-07T01:00:00.000Z'));

    const [task] = mergeOptimisticReorderedTaskIntoCache([createTask()], {
      taskId: 'task-1',
      newListId: 'next-list',
      newSortKey: 2_000_000,
      targetListStatus: null,
    }) as Array<Task & { _localMutationAt?: number }>;

    expect(task).toEqual(
      expect.objectContaining({
        id: 'task-1',
        list_id: 'next-list',
        sort_key: 2_000_000,
        _localMutationAt: new Date('2026-05-07T01:00:00.000Z').getTime(),
      })
    );

    vi.useRealTimers();
  });

  it('keeps a fresh local marker after the server confirms a reorder', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-07T01:00:10.000Z'));

    const [task] = mergeServerReorderedTaskIntoCache(
      [
        createTask({
          list_id: 'next-list',
          sort_key: 2_000_000,
          _localMutationAt: new Date('2026-05-07T01:00:00.000Z').getTime(),
        } as Partial<Task>),
      ],
      createTask({
        list_id: 'next-list',
        sort_key: 2_500_000,
      })
    ) as Array<Task & { _localMutationAt?: number }>;

    expect(task).toEqual(
      expect.objectContaining({
        id: 'task-1',
        list_id: 'next-list',
        sort_key: 2_500_000,
        _localMutationAt: new Date('2026-05-07T01:00:10.000Z').getTime(),
      })
    );

    vi.useRealTimers();
  });
});
