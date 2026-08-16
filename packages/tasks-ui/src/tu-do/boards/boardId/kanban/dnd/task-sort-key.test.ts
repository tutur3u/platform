import type { Task } from '@tuturuuu/types/primitives/Task';
import { describe, expect, it } from 'vitest';
import {
  compareTasksByEffectiveSortKey,
  getEffectiveTaskSortKey,
} from './task-sort-key';

function createTask(overrides: Partial<Task>): Task {
  return {
    id: overrides.id ?? 'task-1',
    created_at: '2026-08-17T00:00:00.000Z',
    display_number: 1,
    list_id: 'list-1',
    name: 'Task',
    ...overrides,
  } as Task;
}

describe('personal board task ordering', () => {
  it('prefers the personal ordering key for a placed external task', () => {
    const task = createTask({
      is_personal_external: true,
      is_personal_external_default: false,
      personal_sort_key: 2_000_000,
      sort_key: 90_000_000,
    });

    expect(getEffectiveTaskSortKey(task)).toBe(2_000_000);
  });

  it('sorts mixed local and external tasks by their visible board ordering keys', () => {
    const externalTask = createTask({
      id: 'external-task',
      is_personal_external: true,
      is_personal_external_default: false,
      personal_sort_key: 2_000_000,
      sort_key: 90_000_000,
    });
    const localTask = createTask({ id: 'local-task', sort_key: 3_000_000 });

    expect(
      [localTask, externalTask]
        .sort(compareTasksByEffectiveSortKey)
        .map((task) => task.id)
    ).toEqual(['external-task', 'local-task']);
  });
});
