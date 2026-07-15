import { describe, expect, it } from 'vitest';

import { getTaskCardVisibilityState } from './task-card-visibility';

describe('getTaskCardVisibilityState', () => {
  it('hides the card only for the active drag source before placement starts', () => {
    expect(
      getTaskCardVisibilityState({
        isDragging: true,
        optimisticUpdateInProgress: false,
      })
    ).toEqual({
      hidden: true,
      pending: false,
    });
  });

  it('keeps an optimistically moved card visible even if dnd-kit still reports dragging', () => {
    expect(
      getTaskCardVisibilityState({
        isDragging: true,
        optimisticUpdateInProgress: true,
      })
    ).toEqual({
      hidden: false,
      pending: true,
    });
  });

  it('keeps a pending placement visible after drag state has cleared', () => {
    expect(
      getTaskCardVisibilityState({
        isDragging: false,
        optimisticUpdateInProgress: true,
      })
    ).toEqual({
      hidden: false,
      pending: true,
    });
  });
});
