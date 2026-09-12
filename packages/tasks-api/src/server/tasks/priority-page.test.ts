import { describe, expect, it, vi } from 'vitest';
import { loadPriorityPage } from './priority-page';

const ids = ['critical', 'high', 'low', 'none-new', 'none-old'];
const expected = ['none-new', 'none-old', 'critical', 'high', 'low'];
const options = {
  priorities: [],
  sortBy: 'priority-high',
  offset: 0,
  limit: 2,
};
function loader(source = ids) {
  return vi.fn(
    async ({
      priorities,
      offset,
      limit,
    }: {
      priorities: string[];
      offset: number;
      limit: number;
    }) => {
      const filtered = priorities.length
        ? source.filter((id) => !id.startsWith('none'))
        : source;
      return {
        count: filtered.length,
        taskIds: filtered.slice(offset, offset + limit),
      };
    }
  );
}

describe('priority pagination', () => {
  it.each([0, 1, 2, 3, 4, 5, 20])(
    'returns the correct first-placement page at offset %i',
    async (offset) => {
      const load = loader();
      expect(await loadPriorityPage({ ...options, offset }, load)).toEqual({
        count: 5,
        taskIds: expected.slice(offset, offset + 2),
      });
      expect(load.mock.calls.length).toBeLessThanOrEqual(4);
      expect(load.mock.calls.every(([page]) => page.limit <= 2)).toBe(true);
    }
  );
  it('preserves low-to-high order within prioritized tasks', async () => {
    expect(
      (
        await loadPriorityPage(
          { ...options, sortBy: 'priority-low', limit: 5 },
          loader(['low', 'high', 'critical', 'none-new', 'none-old'])
        )
      ).taskIds
    ).toEqual(['none-new', 'none-old', 'low', 'high', 'critical']);
  });
  it.each([
    { unprioritizedPosition: 'last' as const },
    { sortBy: 'name-asc' },
    { priorities: ['high'] },
  ])(
    'uses one unchanged query when rotation is unnecessary: %j',
    async (overrides) => {
      const load = loader();
      await loadPriorityPage({ ...options, ...overrides }, load);
      expect(load).toHaveBeenCalledExactlyOnceWith({
        ...options,
        ...overrides,
      });
    }
  );
  it.each([[[]], [['high']], [['none-new']]])(
    'handles homogeneous and empty results: %j',
    async (source) => {
      expect(await loadPriorityPage(options, loader(source))).toEqual({
        count: source.length,
        taskIds: source,
      });
    }
  );
  it('returns count-only requests without loading task pages', async () => {
    const load = loader();
    expect(await loadPriorityPage({ ...options, limit: 0 }, load)).toEqual({
      count: 5,
      taskIds: [],
    });
    expect(load).toHaveBeenCalledTimes(1);
  });
  it('propagates database failures instead of returning a misleading empty page', async () => {
    await expect(
      loadPriorityPage(
        options,
        vi.fn().mockRejectedValue(new Error('unavailable'))
      )
    ).rejects.toThrow('unavailable');
  });
});
