import type { DragMoveEvent } from '@dnd-kit/core';
import { act, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getKanbanDragAutoScrollPointerX,
  getKanbanEdgeAutoScrollAmount,
  useAutoScroll,
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

afterEach(() => vi.unstubAllGlobals());

it('suspends snapping and smooth scrolling throughout a drag and restores them', () => {
  let frame: FrameRequestCallback = () => {};
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback) => {
      frame = callback;
      return 1;
    })
  );
  const cancel = vi.fn();
  vi.stubGlobal('cancelAnimationFrame', cancel);
  const container = document.createElement('div');
  container.style.scrollSnapType = 'x mandatory';
  container.style.scrollBehavior = 'smooth';
  vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
    left: 100,
    right: 500,
  } as DOMRect);
  const { result, unmount } = renderHook(() =>
    useAutoScroll({ current: container })
  );
  act(() => {
    result.current.updateAutoScrollPointerX(490);
    result.current.startAutoScroll();
  });
  expect(container.style.scrollSnapType).toBe('none');
  expect(container.style.scrollBehavior).toBe('auto');
  act(() => frame(16));
  expect(container.scrollLeft).toBeGreaterThan(0);
  act(() => result.current.stopAutoScroll());
  expect(container.style.scrollSnapType).toBe('x mandatory');
  expect(container.style.scrollBehavior).toBe('smooth');
  act(() => result.current.startAutoScroll());
  unmount();
  expect(container.style.scrollSnapType).toBe('x mandatory');
  expect(cancel).toHaveBeenCalled();
});

it('reverses direction using viewport pointer coordinates after a long left scroll', () => {
  let frame: FrameRequestCallback = () => {};
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback) => {
      frame = callback;
      return 1;
    })
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const container = document.createElement('div');
  container.scrollLeft = 3000;
  vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
    left: 100,
    right: 500,
  } as DOMRect);
  const { result, unmount } = renderHook(() =>
    useAutoScroll({ current: container })
  );
  act(() => {
    result.current.startAutoScroll(
      new MouseEvent('mousedown', { clientX: 110 })
    );
    result.current.updateAutoScrollPointerX(3490);
  });
  fireEvent.mouseMove(document, { clientX: 110 });
  act(() => frame(16));
  expect(container.scrollLeft).toBeLessThan(3000);
  const leftPosition = container.scrollLeft;
  fireEvent.mouseMove(document, { clientX: 490 });
  // Dnd-kit reports a scroll-adjusted delta, which can still be far left.
  act(() => {
    result.current.updateAutoScrollPointerX(-2510);
    frame(32);
  });
  expect(container.scrollLeft).toBeGreaterThan(leftPosition);
  act(() => result.current.stopAutoScroll());
  // The next drag must not retain pointer coordinates from the previous drag.
  fireEvent.mouseMove(document, { clientX: 110 });
  act(() => {
    result.current.updateAutoScrollPointerX(490);
    result.current.startAutoScroll();
    frame(48);
  });
  expect(container.scrollLeft).toBeGreaterThan(3000);
  unmount();
});
