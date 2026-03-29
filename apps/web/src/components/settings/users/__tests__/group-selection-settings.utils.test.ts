import { describe, expect, it } from 'vitest';
import {
  buildGroupComboboxOptions,
  hasSameGroupSelection,
  hasUnresolvedSelectedGroups,
  normalizeGroupSelection,
} from '../group-selection-settings.utils';

describe('group selection settings utils', () => {
  it('normalizes group selections by trimming, filtering empties, and deduplicating', () => {
    expect(
      normalizeGroupSelection([' group-b ', '', 'group-a', 'group-b'])
    ).toEqual(['group-b', 'group-a']);
  });

  it('treats selections with the same ids as equal regardless of order', () => {
    expect(
      hasSameGroupSelection(['group-a', 'group-b'], ['group-b', 'group-a'])
    ).toBe(true);
    expect(hasSameGroupSelection(['group-a'], ['group-a', 'group-b'])).toBe(
      false
    );
  });

  it('keeps selected groups at the top while preserving archived labels', () => {
    expect(
      buildGroupComboboxOptions(
        [
          { id: 'group-b', name: 'Beta', archived: false },
          { id: 'group-c', name: 'Gamma', archived: true },
          { id: 'group-a', name: 'Alpha', archived: false },
        ],
        ['group-c', 'group-a']
      )
    ).toEqual([
      { value: 'group-a', label: 'Alpha' },
      { value: 'group-c', label: 'Gamma (Archived)' },
      { value: 'group-b', label: 'Beta' },
    ]);
  });

  it('detects unresolved selected groups not yet present in the option set', () => {
    expect(
      hasUnresolvedSelectedGroups(
        ['group-a', 'group-missing'],
        [{ value: 'group-a', label: 'Alpha' }]
      )
    ).toBe(true);

    expect(
      hasUnresolvedSelectedGroups(
        ['group-a'],
        [{ value: 'group-a', label: 'Alpha' }]
      )
    ).toBe(false);
  });
});
