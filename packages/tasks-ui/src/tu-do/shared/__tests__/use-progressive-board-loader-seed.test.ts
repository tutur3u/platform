import { describe, expect, it } from 'vitest';
import {
  deriveListPageState,
  seedFromFirstListPages,
} from '../use-progressive-board-loader';

const task = (id: string, listId = 'list-1') =>
  ({ id, list_id: listId, name: id }) as any;

describe('deriveListPageState', () => {
  it('uses the exact count when the server sends one', () => {
    expect(deriveListPageState(0, 50, 120)).toEqual({
      hasMore: true,
      totalCount: 120,
    });
    expect(deriveListPageState(2, 20, 120)).toEqual({
      hasMore: false,
      totalCount: 120,
    });
  });

  it('never reports fewer tasks than were loaded', () => {
    expect(deriveListPageState(1, 50, 60)).toEqual({
      hasMore: false,
      totalCount: 100,
    });
  });

  it('infers more pages from a full page without a count', () => {
    expect(deriveListPageState(0, 50, null)).toEqual({
      hasMore: true,
      totalCount: 51,
    });
    expect(deriveListPageState(0, 12, undefined)).toEqual({
      hasMore: false,
      totalCount: 12,
    });
  });
});

describe('seedFromFirstListPages', () => {
  it('builds the cache and loaded first-page pagination per list', () => {
    const seed = seedFromFirstListPages({
      'list-1': { tasks: [task('a'), task('b')], count: 2 },
      'list-2': { tasks: [], count: 0 },
    });

    expect(seed.tasks.map((t) => t.id)).toEqual(['a', 'b']);
    expect(seed.pagination['list-1']).toEqual({
      page: 0,
      hasMore: false,
      totalCount: 2,
      firstPageTaskCount: 2,
      isLoading: false,
      isInitialLoad: false,
    });
    expect(seed.pagination['list-2']?.totalCount).toBe(0);
  });

  it('keeps one copy of a task seen in two lists', () => {
    const seed = seedFromFirstListPages({
      'list-1': { tasks: [task('a')], count: 1 },
      'list-2': { tasks: [task('a', 'list-2')], count: 1 },
    });
    expect(seed.tasks).toHaveLength(1);
  });
});
