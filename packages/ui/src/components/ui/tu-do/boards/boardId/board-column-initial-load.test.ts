import { describe, expect, it } from 'vitest';
import type { ListPaginationState } from '../../shared/progressive-loader-context';
import { shouldStartInitialColumnLoad } from './board-column';

const loadedState: ListPaginationState = {
  hasMore: false,
  isInitialLoad: false,
  isLoading: false,
  page: 0,
  totalCount: 0,
};

describe('shouldStartInitialColumnLoad', () => {
  it('starts initial loading for visible columns even when the caller renders a collapsed external column', () => {
    expect(
      shouldStartInitialColumnLoad({
        hasElement: true,
        listState: undefined,
      })
    ).toBe(true);
  });

  it('skips loading when the column has not mounted or already has pagination state', () => {
    expect(
      shouldStartInitialColumnLoad({
        hasElement: false,
        listState: undefined,
      })
    ).toBe(false);

    expect(
      shouldStartInitialColumnLoad({
        hasElement: true,
        listState: loadedState,
      })
    ).toBe(false);
  });
});
