import type { Task } from '@tuturuuu/types/primitives/Task';
import { describe, expect, it } from 'vitest';
import { taskMatchesLocalFilters } from './board-task-filtering';
import type { TaskFilters } from './task-filter.types';

const defaults: TaskFilters = {
  labels: [],
  projects: [],
  assignees: [],
  priorities: [],
  dueDateRange: null,
  estimationRange: null,
  includeMyTasks: false,
  includeUnassigned: false,
  sourceScope: 'all_visible',
  sourceWorkspaceIds: [],
  sourceBoardIds: [],
};
const task = (overrides: Partial<Task> = {}) =>
  ({ id: 'task', name: 'Task', priority: null, ...overrides }) as Task;

describe('local and server task filter parity', () => {
  it.each(['labels', 'projects'] as const)(
    'matches any selected %s instead of requiring all',
    (field) => {
      const filters = {
        ...defaults,
        [field]: [{ id: 'one' }, { id: 'two' }],
      } as TaskFilters;
      expect(
        taskMatchesLocalFilters(
          task({ [field]: [{ id: 'two' }] } as Partial<Task>),
          filters
        )
      ).toBe(true);
      expect(
        taskMatchesLocalFilters(
          task({ [field]: [{ id: 'other' }] } as Partial<Task>),
          filters
        )
      ).toBe(false);
      expect(taskMatchesLocalFilters(task(), filters)).toBe(false);
    }
  );
  it.each([{ min: 0 }, { max: 5 }, { min: 0, max: 5 }])(
    'excludes absent estimates from a numeric range: %j',
    (estimationRange) => {
      const filters = { ...defaults, estimationRange };
      expect(
        taskMatchesLocalFilters(task({ estimation_points: null }), filters)
      ).toBe(false);
      expect(taskMatchesLocalFilters(task(), filters)).toBe(false);
      expect(
        taskMatchesLocalFilters(task({ estimation_points: 0 }), filters)
      ).toBe(true);
    }
  );
  it('includes tasks without priority or estimation when no such filter is active', () => {
    expect(taskMatchesLocalFilters(task(), defaults)).toBe(true);
  });
});
