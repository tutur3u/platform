import { describe, expect, it, vi } from 'vitest';
import {
  groupTagNamesById,
  loadTutoringGroupTags,
} from './tutoring-group-tags';

// Synthetic tags and classes only.
describe('class tags for the exclusion rules', () => {
  it('lists each class with the names of its tags', () => {
    expect(
      groupTagNamesById([
        { name: 'DDT', group_ids: ['a', 'b'] },
        { name: 'Evening', group_ids: ['a'] },
        { name: '', group_ids: ['c'] },
        { name: 'Unused' },
      ])
    ).toEqual(
      new Map([
        ['a', ['DDT', 'Evening']],
        ['b', ['DDT']],
      ])
    );
  });

  it('reads every page of tags', async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({
        count: 101,
        data: Array.from({ length: 100 }, (_, index) => ({
          name: `T${index}`,
          group_ids: [],
        })),
        page: 1,
        pageSize: 100,
      })
      .mockResolvedValueOnce({
        count: 101,
        data: [{ name: 'DDT', group_ids: ['a'] }],
        page: 2,
        pageSize: 100,
      });
    const tags = await loadTutoringGroupTags('synthetic-ws', list);
    expect(list).toHaveBeenNthCalledWith(1, 'synthetic-ws', {
      page: 1,
      pageSize: 100,
    });
    expect(list).toHaveBeenCalledTimes(2);
    expect(tags.get('a')).toEqual(['DDT']);
  });

  it('stops on an empty page', async () => {
    const list = vi
      .fn()
      .mockResolvedValue({ count: 5, data: [], page: 1, pageSize: 100 });
    await expect(loadTutoringGroupTags('synthetic-ws', list)).resolves.toEqual(
      new Map()
    );
    expect(list).toHaveBeenCalledTimes(1);
  });
});
