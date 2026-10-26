import { describe, expect, it } from 'vitest';
import {
  collectFilterOptions,
  filterCycleTasks,
  groupTasksByStatus,
  hasActiveFilters,
  resolveScopeCycles,
} from '../cycle-planning-model';
import {
  ASSIGNEE_ME,
  ASSIGNEE_UNASSIGNED,
  EMPTY_CYCLE_PLANNING_FILTERS,
  PROJECT_NONE,
} from '../types';
import { ALICE, APOLLO, CYCLES, ME, MYSELF, makeTask } from './fixtures';

const NOW = new Date('2026-10-27T09:00:00Z');

describe('resolveScopeCycles', () => {
  it('picks the active cycle as current and the earliest planned one as next', () => {
    const { current, next } = resolveScopeCycles(CYCLES, NOW);
    expect(current?.id).toBe('cycle-now');
    expect(next?.id).toBe('cycle-next');
  });

  it('falls back to a planned cycle that spans today', () => {
    const { current, next } = resolveScopeCycles(
      [{ ...CYCLES[1]!, status: 'planned' }, CYCLES[3]!],
      NOW
    );
    expect(current?.id).toBe('cycle-now');
    expect(next?.id).toBe('cycle-next');
  });

  it('returns nulls without cycles', () => {
    expect(resolveScopeCycles([], NOW)).toEqual({ current: null, next: null });
  });
});

describe('groupTasksByStatus', () => {
  it('orders sections Active, Review, Not started, Done, Closed and drops empty ones', () => {
    const groups = groupTasksByStatus([
      makeTask({ id: 'a', status: 'closed' }),
      makeTask({ id: 'b', status: 'not_started' }),
      makeTask({ id: 'c', status: 'active' }),
      makeTask({ id: 'd', status: 'active' }),
      makeTask({ id: 'e', status: 'documents' }),
    ]);
    expect(groups.map((group) => [group.status, group.tasks.length])).toEqual([
      ['active', 2],
      ['not_started', 1],
      ['closed', 1],
    ]);
  });
});

describe('filterCycleTasks', () => {
  const tasks = [
    makeTask({ id: 'mine', assignees: [MYSELF], projects: [APOLLO] }),
    makeTask({ id: 'alice', assignees: [ALICE], priority: 'high' }),
    makeTask({ id: 'nobody', name: 'Fix login', display_number: 42 }),
  ];
  const ids = (filters: Partial<typeof EMPTY_CYCLE_PLANNING_FILTERS>) =>
    filterCycleTasks(
      tasks,
      { ...EMPTY_CYCLE_PLANNING_FILTERS, ...filters },
      ME
    ).map((task) => task.id);

  it('keeps everything without filters', () => {
    expect(ids({})).toEqual(['mine', 'alice', 'nobody']);
  });

  it('filters by Me, Unassigned and people', () => {
    expect(ids({ assigneeIds: [ASSIGNEE_ME] })).toEqual(['mine']);
    expect(ids({ assigneeIds: [ASSIGNEE_UNASSIGNED] })).toEqual(['nobody']);
    expect(ids({ assigneeIds: ['alice', ASSIGNEE_ME] })).toEqual([
      'mine',
      'alice',
    ]);
  });

  it('filters by project, including no project', () => {
    expect(ids({ projectIds: ['apollo'] })).toEqual(['mine']);
    expect(ids({ projectIds: [PROJECT_NONE] })).toEqual(['alice', 'nobody']);
  });

  it('searches titles and ticket ids', () => {
    expect(ids({ query: 'login' })).toEqual(['nobody']);
    expect(ids({ query: 'tt-42' })).toEqual(['nobody']);
  });

  it('applies More filters', () => {
    expect(ids({ priorities: ['high'] })).toEqual(['alice']);
    expect(
      hasActiveFilters({ ...EMPTY_CYCLE_PLANNING_FILTERS, query: ' ' })
    ).toBe(false);
  });

  it('derives filter options from the tasks, excluding the current user', () => {
    const options = collectFilterOptions(tasks, ME);
    expect(options.people.map((person) => person.id)).toEqual(['alice']);
    expect(options.projects).toEqual([APOLLO]);
  });
});
