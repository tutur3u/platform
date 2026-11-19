import { describe, expect, it } from 'vitest';
import {
  buildCommandTaskListOptions,
  shouldUseFilteredTaskList,
} from './use-task-search';

describe('command task server controls', () => {
  it('pushes assignment, priority, and sorting ahead of the API limit', () => {
    expect(
      buildCommandTaskListOptions(
        'launch',
        { priority: 'critical', sort: 'priority', status: 'assigned' },
        new Date('2026-08-26T08:00:00.000Z')
      )
    ).toEqual({
      assignedToMe: true,
      closed: 'exclude',
      completed: 'exclude',
      limit: 40,
      priorities: ['critical'],
      q: 'launch',
      sortBy: 'priority-high',
    });
  });

  it('bounds due-soon results on the server before truncation', () => {
    expect(
      buildCommandTaskListOptions(
        '',
        { priority: 'all', sort: 'due', status: 'due-soon' },
        new Date('2026-08-26T08:00:00.000Z')
      )
    ).toEqual({
      closed: 'exclude',
      completed: 'exclude',
      dueDateFrom: '2026-08-26T08:00:00.000Z',
      dueDateTo: '2026-08-29T08:00:00.000Z',
      limit: 30,
      priorities: undefined,
      q: undefined,
      sortBy: 'due-date-asc',
    });
  });

  it('keeps semantic search only when no server controls are active', () => {
    expect(shouldUseFilteredTaskList('launch', 'all', 'all', 'relevance')).toBe(
      false
    );
    expect(
      shouldUseFilteredTaskList('launch', 'overdue', 'all', 'relevance')
    ).toBe(true);
    expect(shouldUseFilteredTaskList('', 'overdue', 'all', 'relevance')).toBe(
      false
    );
  });

  it('looks up a single-letter board key with no extra filters', () => {
    expect(shouldUseFilteredTaskList('F-12', 'all', 'all', 'relevance')).toBe(
      true
    );
    expect(
      buildCommandTaskListOptions('F-12', {
        priority: 'all',
        sort: 'relevance',
        status: 'all',
      })
    ).toEqual({
      identifier: 'F-12',
      limit: 40,
      priorities: undefined,
      sortBy: 'created-date-desc',
    });
  });
});
