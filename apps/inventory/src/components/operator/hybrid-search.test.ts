import { describe, expect, it } from 'vitest';
import {
  collectHybridSearchResults,
  hasCompleteHybridSearchCache,
  matchesHybridSearch,
  normalizeSearchQuery,
} from './hybrid-search';

describe('hybrid inventory search', () => {
  it('normalizes whitespace, casing, and accents', () => {
    expect(normalizeSearchQuery('  Ácrylic   KEYCHAIN ')).toBe(
      'acrylic keychain'
    );
  });

  it('matches every token across nested product fields', () => {
    expect(
      matchesHybridSearch(
        {
          category: 'Keychains',
          inventory: [{ warehouse_name: 'Main Booth' }],
          name: 'Furi Ferntail',
        },
        'furi booth'
      )
    ).toBe(true);
    expect(matchesHybridSearch({ name: 'Furi Ferntail' }, 'furi poster')).toBe(
      false
    );
  });

  it('serves cached matches before a later server result and deduplicates ids', () => {
    const results = collectHybridSearchResults<{
      id: string;
      name: string;
    }>({
      entries: [
        [
          ['inventory', 'ws', 'products', {}, ''],
          {
            count: 2,
            data: [
              { id: '1', name: 'Acrylic standee' },
              { id: '2', name: 'Plushie' },
            ],
          },
        ],
        [
          ['inventory', 'ws', 'products', {}, 'acrylic'],
          { count: 1, data: [{ id: '1', name: 'Acrylic standee v2' }] },
        ],
      ],
      getId: (item) => item.id,
      query: 'acrylic',
      visibleItems: [],
    });

    expect(results).toEqual([{ id: '1', name: 'Acrylic standee v2' }]);
  });

  it('detects a fully populated unfiltered paginated cache', () => {
    expect(
      hasCompleteHybridSearchCache([
        [
          ['inventory', 'ws', 'products', {}, ''],
          {
            pages: [
              { count: 3, data: [{ id: '1' }, { id: '2' }] },
              { count: 3, data: [{ id: '3' }] },
            ],
          },
        ],
      ])
    ).toBe(true);
  });
});
