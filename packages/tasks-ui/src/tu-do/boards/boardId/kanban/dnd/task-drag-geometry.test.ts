import { describe, expect, it } from 'vitest';
import {
  getFrozenActiveRectFromDelta,
  getTaskDropPositionFromRects,
} from './task-drag-geometry';

describe('task drag geometry', () => {
  it('derives the active card rect from frozen drag-start top plus dnd delta', () => {
    expect(
      getFrozenActiveRectFromDelta({
        deltaY: -72,
        dragSession: {
          activeInitialRect: { height: 118.4, top: 420 },
          activeTaskId: 'task-4',
          height: 118.4,
          sourceInsertionIndex: 3,
          sourceListId: 'list-1',
        },
        fallbackRect: { height: 20, top: 999 },
      })
    ).toEqual({ height: 118, top: 348 });
  });

  it('falls back to the supplied rect when no frozen drag session is available', () => {
    expect(
      getFrozenActiveRectFromDelta({
        deltaY: 40,
        fallbackRect: { height: 87.8, top: 120 },
      })
    ).toEqual({ height: 88, top: 120 });
  });

  it('prefers the translated active top while keeping the frozen active height', () => {
    expect(
      getFrozenActiveRectFromDelta({
        deltaY: 0,
        dragSession: {
          activeInitialRect: { height: 118.4, top: 420 },
          activeTaskId: 'task-4',
          height: 118.4,
          sourceInsertionIndex: 3,
          sourceListId: 'list-1',
        },
        fallbackRect: { height: 20, top: 999 },
        translatedRect: { height: 20, top: 310 },
      })
    ).toEqual({ height: 118, top: 310 });
  });

  it('keeps pointer y as the strongest before/after signal for non-preview fallback drops', () => {
    expect(
      getTaskDropPositionFromRects({
        activeRect: { height: 120, top: 180 },
        overRect: { height: 80, top: 100 },
        pointerY: 120,
      })
    ).toBe('before');

    expect(
      getTaskDropPositionFromRects({
        activeRect: { height: 80, top: 20 },
        overRect: { height: 80, top: 100 },
        pointerY: 170,
      })
    ).toBe('after');
  });
});
