import { describe, expect, it } from 'vitest';
import { normalizeBoardText, sortByDisplayName } from './board-text-utils';

describe('board-text-utils', () => {
  it('normalizes only string values', () => {
    expect(normalizeBoardText('In Progress')).toBe('in progress');
    expect(normalizeBoardText(undefined)).toBe('');
    expect(normalizeBoardText(null)).toBe('');
  });

  it('sorts named entities without crashing on missing names', () => {
    expect(
      sortByDisplayName([
        { id: '2', name: 'Beta' },
        { id: '1', name: undefined },
        { id: '3', name: 'alpha' },
      ])
    ).toEqual([
      { id: '1', name: undefined },
      { id: '3', name: 'alpha' },
      { id: '2', name: 'Beta' },
    ]);
  });
});
