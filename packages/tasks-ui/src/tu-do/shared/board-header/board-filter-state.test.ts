import { describe, expect, it } from 'vitest';
import {
  clearBoardFilters,
  collectBoardPeople,
  countUnassignedTasks,
  DEFAULT_BOARD_FILTERS,
  getListStatusesForFilter,
  hasActiveBoardFilters,
  isFocusActive,
  listMatchesStatusFilter,
  sanitizeListStatusFilter,
  sanitizeSavedBoardFilters,
  toggleFocus,
  togglePersonFilter,
  toggleProjectFilter,
  toggleUnassignedFilter,
} from './board-filter-state';

const me = { id: 'me', display_name: 'Linh', avatar_url: null, email: null };
const minh = {
  id: 'minh',
  display_name: 'Minh',
  avatar_url: null,
  email: null,
};
const people = [me, minh];

describe('board header filter state', () => {
  it('treats picking only yourself as Mine', () => {
    const mine = togglePersonFilter(DEFAULT_BOARD_FILTERS, 'me', people, 'me');
    expect(mine.assignees.map((person) => person.id)).toEqual(['me']);
    expect(mine.includeMyTasks).toBe(true);

    const both = togglePersonFilter(mine, 'minh', people, 'me');
    expect(both.assignees.map((person) => person.id)).toEqual(['me', 'minh']);
    expect(both.includeMyTasks).toBe(false);

    const none = togglePersonFilter(
      togglePersonFilter(both, 'me', people, 'me'),
      'minh',
      people,
      'me'
    );
    expect(none.assignees).toEqual([]);
    expect(none.includeMyTasks).toBe(false);
  });

  it('reads a legacy assigned-to-me filter as your pill being on', () => {
    const legacy = { ...DEFAULT_BOARD_FILTERS, includeMyTasks: true };
    expect(togglePersonFilter(legacy, 'me', people, 'me')).toMatchObject({
      assignees: [],
      includeMyTasks: false,
    });
  });

  it('keeps people and Unassigned exclusive', () => {
    const minhOnly = togglePersonFilter(
      DEFAULT_BOARD_FILTERS,
      'minh',
      people,
      'me'
    );
    const unassigned = toggleUnassignedFilter(minhOnly);
    expect(unassigned).toMatchObject({
      assignees: [],
      includeMyTasks: false,
      includeUnassigned: true,
    });
    expect(togglePersonFilter(unassigned, 'minh', people, 'me')).toMatchObject({
      includeUnassigned: false,
    });
  });

  it('toggles projects by id', () => {
    const platform = { id: 'p1', name: 'Platform' };
    const on = toggleProjectFilter(DEFAULT_BOARD_FILTERS, platform);
    expect(on.projects).toEqual([platform]);
    expect(toggleProjectFilter(on, platform).projects).toEqual([]);
  });

  it('turns Focus on as my open tasks by priority and off again', () => {
    const focused = toggleFocus({
      currentUser: me,
      filters: { ...DEFAULT_BOARD_FILTERS, projects: [{ id: 'p', name: 'P' }] },
      listStatusFilter: 'all',
    });
    expect(focused.listStatusFilter).toBe('open');
    expect(focused.filters).toMatchObject({
      assignees: [me],
      includeMyTasks: true,
      projects: [],
      sortBy: 'priority-high',
    });
    expect(isFocusActive(focused.filters, focused.listStatusFilter, 'me')).toBe(
      true
    );

    const off = toggleFocus({ currentUser: me, ...focused });
    expect(off.listStatusFilter).toBe('all');
    expect(off.filters).toMatchObject({
      assignees: [],
      includeMyTasks: false,
      sortBy: undefined,
    });
  });

  it('is not Focus once someone else or a project is added', () => {
    const focused = toggleFocus({
      currentUser: me,
      filters: DEFAULT_BOARD_FILTERS,
      listStatusFilter: 'all',
    });
    const withMinh = togglePersonFilter(focused.filters, 'minh', people, 'me');
    expect(isFocusActive(withMinh, 'open', 'me')).toBe(false);
  });

  it('maps the open status filter to every list that is not done', () => {
    expect(getListStatusesForFilter('all')).toBeUndefined();
    expect(getListStatusesForFilter('open')).toEqual([
      'not_started',
      'active',
      'review',
    ]);
    expect(listMatchesStatusFilter({ status: 'done' }, 'open')).toBe(false);
    expect(listMatchesStatusFilter({ status: 'review' }, 'open')).toBe(true);
    expect(listMatchesStatusFilter({ status: 'done' }, 'all')).toBe(true);
  });

  it('drops saved filters the header no longer offers', () => {
    const restored = sanitizeSavedBoardFilters({
      ...DEFAULT_BOARD_FILTERS,
      labels: [{ id: 'l', name: 'Bug', color: 'red' } as never],
      priorities: ['high'],
      dueDateRange: { from: new Date() },
      sourceScope: 'current_board',
      sortBy: 'due-date-asc',
      projects: [{ id: 'p', name: 'P' }],
      hideEmptyTaskLists: true,
    });
    expect(restored).toMatchObject({
      labels: [],
      priorities: [],
      dueDateRange: null,
      sourceScope: 'all_visible',
      projects: [{ id: 'p', name: 'P' }],
      hideEmptyTaskLists: true,
    });
    expect(restored.sortBy).toBeUndefined();
    expect(sanitizeSavedBoardFilters({ sortBy: 'priority-low' }).sortBy).toBe(
      'priority-low'
    );
    expect(sanitizeListStatusFilter('not_started')).toBe('all');
    expect(sanitizeListStatusFilter('open')).toBe('open');
  });

  it('shows Clear for any filter, including hidden legacy ones', () => {
    expect(hasActiveBoardFilters(DEFAULT_BOARD_FILTERS, 'all')).toBe(false);
    expect(hasActiveBoardFilters(DEFAULT_BOARD_FILTERS, 'open')).toBe(true);
    expect(
      hasActiveBoardFilters(
        { ...DEFAULT_BOARD_FILTERS, priorities: ['low'] },
        'all'
      )
    ).toBe(true);
    expect(
      clearBoardFilters({
        ...DEFAULT_BOARD_FILTERS,
        includeUnassigned: true,
        sortBy: 'priority-high',
        hideEmptyTaskLists: true,
      })
    ).toEqual({ ...DEFAULT_BOARD_FILTERS, hideEmptyTaskLists: true });
  });

  it('lists people you first, then by task count', () => {
    const tasks = [
      { assignees: [minh] },
      { assignees: [minh, me] },
      { assignees: [] },
      { assignees: [{ id: 'an', display_name: 'An' }] },
      { assignees: [minh] },
    ];
    expect(collectBoardPeople(tasks, 'me').map((p) => p.id)).toEqual([
      'me',
      'minh',
      'an',
    ]);
    expect(collectBoardPeople(tasks, 'me')[1]?.taskCount).toBe(3);
    expect(countUnassignedTasks(tasks)).toBe(1);
  });
});
