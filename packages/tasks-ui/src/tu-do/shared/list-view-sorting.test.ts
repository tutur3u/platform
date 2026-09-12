import type { Task } from '@tuturuuu/types/primitives/Task';
import { describe, expect, it } from 'vitest';
import { sortListViewTasks } from './list-view-sorting';

function task(id: string, name: string, createdAt: string): Task {
  return {
    assignees: [],
    created_at: createdAt,
    display_number: 1,
    end_date: null,
    id,
    labels: [],
    list_id: 'list-1',
    name,
    priority: null,
    sort_key: 1000,
    start_date: undefined,
  };
}

describe('sortListViewTasks', () => {
  it.each(['asc', 'desc'] as const)(
    'honors unprioritized placement independently of direction: %s',
    (sortOrder) => {
      const none = task('none', 'None', '2026-01-01');
      const high = {
        ...task('high', 'High', '2026-01-01'),
        priority: 'high' as const,
      };
      const options = { sortField: 'priority' as const, sortOrder };
      expect(sortListViewTasks([high, none], options).map((t) => t.id)).toEqual(
        ['none', 'high']
      );
      expect(
        sortListViewTasks([high, none], {
          ...options,
          unprioritizedPosition: 'last',
        }).map((t) => t.id)
      ).toEqual(['high', 'none']);
    }
  );
  it('keeps parent-provided order when board-level sorting is active', () => {
    const parentSortedTasks = [
      task('task-a', 'Alpha', '2026-01-01T00:00:00.000Z'),
      task('task-z', 'Zulu', '2026-05-01T00:00:00.000Z'),
    ];

    expect(
      sortListViewTasks(parentSortedTasks, {
        preserveTaskOrder: true,
        sortField: 'created_at',
        sortOrder: 'desc',
      }).map((item) => item.id)
    ).toEqual(['task-a', 'task-z']);
  });

  it('uses local list sorting when no parent ordering must be preserved', () => {
    const tasks = [
      task('task-a', 'Alpha', '2026-01-01T00:00:00.000Z'),
      task('task-z', 'Zulu', '2026-05-01T00:00:00.000Z'),
    ];

    expect(
      sortListViewTasks(tasks, {
        sortField: 'created_at',
        sortOrder: 'desc',
      }).map((item) => item.id)
    ).toEqual(['task-z', 'task-a']);
  });
});
