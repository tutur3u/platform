import { describe, expect, it } from 'vitest';
import {
  filterAndSortTasks,
  isTaskDueSoon,
  isTaskOverdue,
  parseCommandQuery,
} from './command-task-results';
import type { TaskSearchResult } from './use-task-search';

const NOW = new Date('2026-08-26T12:00:00.000Z');

function task(
  id: string,
  overrides: Partial<TaskSearchResult> = {}
): TaskSearchResult {
  return {
    created_at: '2026-08-20T12:00:00.000Z',
    id,
    name: `Task ${id}`,
    priority: 'normal',
    ...overrides,
  };
}

describe('parseCommandQuery', () => {
  it.each([
    ['# fix login', 'tasks', 'fix login'],
    ['> toggle theme', 'actions', 'toggle theme'],
    ['/ settings', 'navigate', 'settings'],
    ['plain search', null, 'plain search'],
  ] as const)('routes %s to %s', (query, tab, normalizedQuery) => {
    expect(parseCommandQuery(query)).toEqual({
      query: normalizedQuery,
      tab,
    });
  });
});

describe('task result controls', () => {
  const tasks = [
    task('critical', {
      created_at: '2026-08-25T12:00:00.000Z',
      end_date: '2026-08-25T12:00:00.000Z',
      is_assigned_to_current_user: true,
      priority: 'critical',
    }),
    task('soon', {
      end_date: '2026-08-28T12:00:00.000Z',
      priority: 'high',
    }),
    task('later', {
      created_at: '2026-08-01T12:00:00.000Z',
      end_date: '2026-09-10T12:00:00.000Z',
      priority: 'low',
    }),
    task('done', { completed: true, priority: 'critical' }),
  ];

  it('distinguishes overdue and due-soon tasks', () => {
    expect(isTaskOverdue(tasks[0]!, NOW)).toBe(true);
    expect(isTaskDueSoon(tasks[1]!, NOW)).toBe(true);
    expect(isTaskDueSoon(tasks[2]!, NOW)).toBe(false);
  });

  it('combines status and priority filters', () => {
    expect(
      filterAndSortTasks(
        tasks,
        { priority: 'critical', sort: 'relevance', status: 'assigned' },
        NOW
      ).map(({ id }) => id)
    ).toEqual(['critical']);
  });

  it('sorts due dates with undated tasks last', () => {
    expect(
      filterAndSortTasks(
        tasks,
        { priority: 'all', sort: 'due', status: 'open' },
        NOW
      ).map(({ id }) => id)
    ).toEqual(['critical', 'soon', 'later']);
  });

  it('sorts by priority and creation time', () => {
    expect(
      filterAndSortTasks(tasks, {
        priority: 'all',
        sort: 'priority',
        status: 'open',
      }).map(({ id }) => id)
    ).toEqual(['critical', 'soon', 'later']);

    expect(
      filterAndSortTasks(tasks, {
        priority: 'all',
        sort: 'newest',
        status: 'open',
      }).map(({ id }) => id)
    ).toEqual(['critical', 'soon', 'later']);
  });
});
