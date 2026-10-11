import type { LettinRecord } from '@tuturuuu/internal-api/lettin';
import { expect, it } from 'vitest';
import { filterWiki } from './components/wiki-model';
import { filterWorkProgress } from './work-progress';

const record = (
  id: string,
  workProgress?: LettinRecord['draft']['workProgress']
): LettinRecord => ({
  id,
  version: 1,
  published: null,
  published_at: null,
  draft: {
    title: id,
    description: 'Private notes',
    kind: 'character',
    image: '',
    credit: '',
    tags: ['cast'],
    links: [],
    content: { type: 'doc' },
    workProgress,
  },
});
it('defaults old drafts to unstarted and does not infer progress from publication', () => {
  const old = record('Old');
  const published = {
    ...record('Published', 'revising'),
    published: record('Published').draft,
    published_at: '2026-10-09',
  };
  const entries = [old, record('Drafting', 'drafting'), published];
  expect(filterWorkProgress(entries, 'unstarted')).toEqual([old]);
  expect(filterWorkProgress(entries, 'revising')).toEqual([published]);
  expect(filterWorkProgress(entries, 'ready')).toEqual([]);
  expect(filterWorkProgress(entries, 'all')).toBe(entries);
});
it('composes with saved search and kind sections without modifying records', () => {
  const entries = [
    record('Alice', 'drafting'),
    record('Bob', 'ready'),
    {
      ...record('Place', 'drafting'),
      draft: {
        ...record('Place').draft,
        kind: 'location' as const,
        workProgress: 'drafting' as const,
      },
    },
  ];
  expect(
    filterWiki(
      filterWorkProgress(entries, 'drafting'),
      'characters',
      'cast'
    ).map((e) => e.id)
  ).toEqual(['Alice']);
  expect(
    filterWiki(filterWorkProgress(entries, 'ready'), 'characters', 'Alice')
  ).toEqual([]);
  expect(entries[0]!.draft.workProgress).toBe('drafting');
});
