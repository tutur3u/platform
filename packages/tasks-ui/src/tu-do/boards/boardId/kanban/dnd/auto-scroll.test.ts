import type { DragMoveEvent } from '@dnd-kit/core';
import { describe, expect, it } from 'vitest';
import {
  getKanbanDragAutoScrollPointerX,
  getKanbanEdgeAutoScrollAmount,
} from './auto-scroll';

const rect = {
  left: 100,
  right: 500,
};

function createDragMoveEvent({
  deltaX = 0,
  initialLeft = 200,
  pointerStartX,
  translatedLeft = initialLeft,
  width = 80,
}: {
  deltaX?: number;
  initialLeft?: number;
  pointerStartX?: number;
  translatedLeft?: number | null;
  width?: number;
}) {
  return {
    active: {
      rect: {
        current: {
          initial: {
            left: initialLeft,
            width,
          },
          translated:
            translatedLeft === null
              ? null
              : {
                  left: translatedLeft,
                  width,
                },
        },
      },
    },
    activatorEvent:
      pointerStartX === undefined
        ? ({ type: 'keydown' } as Event)
        : ({ clientX: pointerStartX } as unknown as Event),
    delta: {
      x: deltaX,
      y: 0,
    },
  } as unknown as DragMoveEvent;
}

describe('getKanbanEdgeAutoScrollAmount', () => {
  it('scrolls left when the drag center is near the left edge', () => {
    expect(
      getKanbanEdgeAutoScrollAmount(125, rect, {
        threshold: 100,
        speed: 10,
        maxSpeed: 30,
      })
    ).toBeLessThan(0);
  });

  it('scrolls right when the drag center is near the right edge', () => {
    expect(
      getKanbanEdgeAutoScrollAmount(475, rect, {
        threshold: 100,
        speed: 10,
        maxSpeed: 30,
      })
    ).toBeGreaterThan(0);
  });

  it('does nothing away from horizontal edges or without a drag center', () => {
    expect(getKanbanEdgeAutoScrollAmount(300, rect)).toBe(0);
    expect(getKanbanEdgeAutoScrollAmount(null, rect)).toBe(0);
  });

  it('uses pointer position for edge auto-scroll instead of card center', () => {
    const pointerX = getKanbanDragAutoScrollPointerX(
      createDragMoveEvent({
        deltaX: 215,
        pointerStartX: 260,
        translatedLeft: 190,
        width: 80,
      })
    );

    expect(pointerX).toBe(475);
    expect(
      getKanbanEdgeAutoScrollAmount(pointerX, rect, {
        threshold: 100,
        speed: 10,
        maxSpeed: 30,
      })
    ).toBeGreaterThan(0);
    expect(
      getKanbanEdgeAutoScrollAmount(230, rect, {
        threshold: 100,
        speed: 10,
        maxSpeed: 30,
      })
    ).toBe(0);
  });

  it('falls back to the active card center without pointer coordinates', () => {
    expect(
      getKanbanDragAutoScrollPointerX(
        createDragMoveEvent({
          translatedLeft: 370,
          width: 100,
        })
      )
    ).toBe(420);
  });
});
