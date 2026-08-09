import { describe, expect, it } from 'vitest';
import { resolveUserGroupsViewState } from './view-state';

describe('resolveUserGroupsViewState', () => {
  const base = {
    hasError: false,
    isFiltered: false,
    isLimitedScope: false,
    isLoading: false,
    itemCount: 0,
  };

  it.each([
    [{ ...base, hasError: true, isLoading: true }, 'error'],
    [{ ...base, isLoading: true }, 'loading'],
    [{ ...base, itemCount: 1 }, 'data'],
    [{ ...base, isFiltered: true }, 'filtered-empty'],
    [{ ...base, isLimitedScope: true }, 'restricted-empty'],
    [base, 'empty'],
  ] as const)('resolves contextual table state %#', (input, expected) => {
    expect(resolveUserGroupsViewState(input)).toBe(expected);
  });
});
