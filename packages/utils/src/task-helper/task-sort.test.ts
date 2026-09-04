import { describe, expect, it } from 'vitest';
import {
  parseTaskSortBy,
  type SortableTask,
  sortTasksByCriterion,
} from './task-sort';

const task = (
  id: string,
  values: Partial<SortableTask> = {}
): SortableTask => ({
  id,
  name: id,
  created_at: '2026-01-01T00:00:00.000Z',
  ...values,
});

describe('sortTasksByCriterion', () => {
  it('accepts only supported server and client sort criteria', () => {
    expect(parseTaskSortBy('priority-high')).toBe('priority-high');
    expect(parseTaskSortBy('unknown')).toBeUndefined();
    expect(parseTaskSortBy(null)).toBeUndefined();
  });

  it('sorts every priority direction with unset priorities last', () => {
    const tasks = [
      task('none'),
      task('high', { priority: 'high' }),
      task('low', { priority: 'low' }),
      task('critical', { priority: 'critical' }),
      task('normal', { priority: 'normal' }),
    ];

    expect(
      sortTasksByCriterion(tasks, 'priority-high').map(({ id }) => id)
    ).toEqual(['critical', 'high', 'normal', 'low', 'none']);
    expect(
      sortTasksByCriterion(tasks, 'priority-low').map(({ id }) => id)
    ).toEqual(['low', 'normal', 'high', 'critical', 'none']);
  });

  it('keeps missing due dates and estimations last in both directions', () => {
    const tasks = [
      task('none'),
      task('invalid', { end_date: 'not-a-date' }),
      task('early', {
        end_date: '2026-01-02T00:00:00.000Z',
        estimation_points: 1,
      }),
      task('late', {
        end_date: '2026-01-03T00:00:00.000Z',
        estimation_points: 8,
      }),
    ];

    expect(
      sortTasksByCriterion(tasks, 'due-date-desc').map(({ id }) => id)
    ).toEqual(['late', 'early', 'invalid', 'none']);
    expect(
      sortTasksByCriterion(tasks, 'estimation-low').map(({ id }) => id)
    ).toEqual(['early', 'late', 'invalid', 'none']);
  });

  it('uses newest creation time and then id as stable tie-breakers', () => {
    const tasks = [
      task('b', { priority: 'high' }),
      task('c', {
        priority: 'high',
        created_at: '2026-01-02T00:00:00.000Z',
      }),
      task('a', { priority: 'high' }),
    ];

    expect(
      sortTasksByCriterion(tasks, 'priority-high').map(({ id }) => id)
    ).toEqual(['c', 'a', 'b']);
  });
});
