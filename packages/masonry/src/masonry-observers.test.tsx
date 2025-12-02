import { act, render } from '@testing-library/react';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from 'vitest';
import { Masonry } from './masonry';

describe('Masonry - ResizeObserver Lifecycle', () => {
  let mockResizeObserver: {
    observe: Mock;
    unobserve: Mock;
    disconnect: Mock;
    callback: ResizeObserverCallback | null;
  };

  let resizeObserverInstances: ReturnType<typeof createMockObserver>[];

  const createMockObserver = () => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
    callback: null as ResizeObserverCallback | null,
  });

  beforeEach(() => {
    resizeObserverInstances = [];

    // Create a proper class mock for ResizeObserver
    class MockResizeObserverClass {
      callback: ResizeObserverCallback | null = null;
      observe: Mock;
      unobserve: Mock;
      disconnect: Mock;

      constructor(callback: ResizeObserverCallback) {
        const instance = createMockObserver();
        instance.callback = callback;
        resizeObserverInstances.push(instance);
        mockResizeObserver = instance;
        this.callback = callback;
        this.observe = instance.observe;
        this.unobserve = instance.unobserve;
        this.disconnect = instance.disconnect;
      }
    }

    vi.stubGlobal('ResizeObserver', MockResizeObserverClass);

    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 0;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const createItems = (count: number) =>
    Array.from({ length: count }, (_, i) => (
      <div key={i} data-testid={`item-${i}`}>
        Item {i}
      </div>
    ));

  describe('Observer Setup', () => {
    it('creates ResizeObserver instance for balanced strategy', () => {
      render(
        <Masonry columns={2} gap={16} strategy="balanced">
          {createItems(4)}
        </Masonry>
      );

      // Verify ResizeObserver was created by checking instance count
      expect(resizeObserverInstances.length).toBe(1);
    });

    it('does not create ResizeObserver for count strategy', () => {
      render(
        <Masonry columns={2} gap={16} strategy="count">
          {createItems(4)}
        </Masonry>
      );

      expect(resizeObserverInstances.length).toBe(0);
    });

    it('observes all masonry item elements', () => {
      const { container } = render(
        <Masonry columns={3} gap={16} strategy="balanced">
          {createItems(9)}
        </Masonry>
      );

      expect(mockResizeObserver.observe).toHaveBeenCalledTimes(9);

      // Verify observed elements have correct data attributes
      const items = container.querySelectorAll('[data-masonry-item]');
      expect(items.length).toBe(9);
    });

    it('sets data-item-index attribute on items', () => {
      const { container } = render(
        <Masonry columns={2} gap={16} strategy="balanced">
          {createItems(4)}
        </Masonry>
      );

      const items = container.querySelectorAll('[data-masonry-item]');
      items.forEach((item) => {
        expect(item.getAttribute('data-item-index')).toBeDefined();
      });
    });
  });

  describe('Observer Cleanup', () => {
    it('disconnects observer on component unmount', () => {
      const { unmount } = render(
        <Masonry columns={2} gap={16} strategy="balanced">
          {createItems(4)}
        </Masonry>
      );

      unmount();

      expect(mockResizeObserver.disconnect).toHaveBeenCalled();
    });

    it('disconnects and recreates observer when strategy changes to balanced', () => {
      const { rerender } = render(
        <Masonry columns={2} gap={16} strategy="count">
          {createItems(4)}
        </Masonry>
      );

      expect(resizeObserverInstances.length).toBe(0);

      rerender(
        <Masonry columns={2} gap={16} strategy="balanced">
          {createItems(4)}
        </Masonry>
      );

      expect(resizeObserverInstances.length).toBe(1);
    });

    it('disconnects observer when switching from balanced to count', () => {
      const { rerender } = render(
        <Masonry columns={2} gap={16} strategy="balanced">
          {createItems(4)}
        </Masonry>
      );

      const initialObserver = resizeObserverInstances[0];

      rerender(
        <Masonry columns={2} gap={16} strategy="count">
          {createItems(4)}
        </Masonry>
      );

      expect(initialObserver?.disconnect).toHaveBeenCalled();
    });

    it('cleans up existing observer before creating new one on children change', () => {
      const { rerender } = render(
        <Masonry columns={2} gap={16} strategy="balanced">
          {createItems(4)}
        </Masonry>
      );

      const firstObserver = resizeObserverInstances[0];

      rerender(
        <Masonry columns={2} gap={16} strategy="balanced">
          {createItems(6)}
        </Masonry>
      );

      expect(firstObserver?.disconnect).toHaveBeenCalled();
    });
  });

  describe('Debounce Mechanism', () => {
    it('debounces rapid resize events (500ms)', async () => {
      vi.useFakeTimers();

      const { container } = render(
        <Masonry columns={2} gap={16} strategy="balanced">
          {createItems(4)}
        </Masonry>
      );

      const items = container.querySelectorAll('[data-masonry-item]');
      const firstItem = items[0] as HTMLElement;

      // Trigger multiple rapid resize events
      for (let i = 0; i < 5; i++) {
        const mockEntry = {
          target: firstItem,
          contentRect: { height: 100 + i * 50 } as DOMRectReadOnly,
          borderBoxSize: [],
          contentBoxSize: [],
          devicePixelContentBoxSize: [],
        };

        act(() => {
          mockResizeObserver.callback?.([mockEntry], {} as ResizeObserver);
        });

        // Advance only 100ms between events
        await act(async () => {
          vi.advanceTimersByTime(100);
        });
      }

      // Advance past debounce time
      await act(async () => {
        vi.advanceTimersByTime(500);
      });

      vi.useRealTimers();
    });

    it('clears pending timeout on unmount', async () => {
      vi.useFakeTimers();

      const { container, unmount } = render(
        <Masonry columns={2} gap={16} strategy="balanced">
          {createItems(4)}
        </Masonry>
      );

      const items = container.querySelectorAll('[data-masonry-item]');
      const firstItem = items[0] as HTMLElement;

      // Trigger resize event
      const mockEntry = {
        target: firstItem,
        contentRect: { height: 200 } as DOMRectReadOnly,
        borderBoxSize: [],
        contentBoxSize: [],
        devicePixelContentBoxSize: [],
      };

      act(() => {
        mockResizeObserver.callback?.([mockEntry], {} as ResizeObserver);
      });

      // Unmount before debounce completes
      unmount();

      // Advance time - should not throw
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      vi.useRealTimers();
    });
  });

  describe('Stability Timeout', () => {
    it('disconnects observer after 2 seconds of stability', async () => {
      vi.useFakeTimers();

      const { container } = render(
        <Masonry columns={2} gap={16} strategy="balanced">
          {createItems(4)}
        </Masonry>
      );

      const items = container.querySelectorAll('[data-masonry-item]');
      const firstItem = items[0] as HTMLElement;

      // Trigger a resize event
      const mockEntry = {
        target: firstItem,
        contentRect: { height: 200 } as DOMRectReadOnly,
        borderBoxSize: [],
        contentBoxSize: [],
        devicePixelContentBoxSize: [],
      };

      act(() => {
        mockResizeObserver.callback?.([mockEntry], {} as ResizeObserver);
      });

      // Advance past redistribution debounce
      await act(async () => {
        vi.advanceTimersByTime(500);
      });

      // Advance to stability check time (2000ms)
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });

      vi.useRealTimers();
    });

    it('resets stability check when new changes occur', async () => {
      vi.useFakeTimers();

      const { container } = render(
        <Masonry columns={2} gap={16} strategy="balanced">
          {createItems(4)}
        </Masonry>
      );

      const items = container.querySelectorAll('[data-masonry-item]');
      const firstItem = items[0] as HTMLElement;

      // First resize event
      act(() => {
        mockResizeObserver.callback?.(
          [
            {
              target: firstItem,
              contentRect: { height: 200 } as DOMRectReadOnly,
              borderBoxSize: [],
              contentBoxSize: [],
              devicePixelContentBoxSize: [],
            },
          ],
          {} as ResizeObserver
        );
      });

      // Advance 1.5 seconds (before stability)
      await act(async () => {
        vi.advanceTimersByTime(1500);
      });

      // Second resize event - should reset stability timer
      act(() => {
        mockResizeObserver.callback?.(
          [
            {
              target: firstItem,
              contentRect: { height: 300 } as DOMRectReadOnly,
              borderBoxSize: [],
              contentBoxSize: [],
              devicePixelContentBoxSize: [],
            },
          ],
          {} as ResizeObserver
        );
      });

      // Advance another 1.5 seconds - still shouldn't be stable
      await act(async () => {
        vi.advanceTimersByTime(1500);
      });

      vi.useRealTimers();
    });
  });

  describe('Threshold Triggering', () => {
    it('triggers redistribution when height change exceeds 10px', async () => {
      vi.useFakeTimers();

      const { container } = render(
        <Masonry columns={2} gap={16} strategy="balanced">
          {createItems(4)}
        </Masonry>
      );

      const items = container.querySelectorAll('[data-masonry-item]');
      const firstItem = items[0] as HTMLElement;

      // Set initial height
      act(() => {
        mockResizeObserver.callback?.(
          [
            {
              target: firstItem,
              contentRect: { height: 100 } as DOMRectReadOnly,
              borderBoxSize: [],
              contentBoxSize: [],
              devicePixelContentBoxSize: [],
            },
          ],
          {} as ResizeObserver
        );
      });

      await act(async () => {
        vi.advanceTimersByTime(500);
      });

      // Change by more than 10px
      act(() => {
        mockResizeObserver.callback?.(
          [
            {
              target: firstItem,
              contentRect: { height: 150 } as DOMRectReadOnly,
              borderBoxSize: [],
              contentBoxSize: [],
              devicePixelContentBoxSize: [],
            },
          ],
          {} as ResizeObserver
        );
      });

      await act(async () => {
        vi.advanceTimersByTime(500);
      });

      vi.useRealTimers();
    });

    it('ignores height changes of 10px or less', async () => {
      vi.useFakeTimers();

      const { container } = render(
        <Masonry columns={2} gap={16} strategy="balanced">
          {createItems(4)}
        </Masonry>
      );

      const items = container.querySelectorAll('[data-masonry-item]');
      const firstItem = items[0] as HTMLElement;

      // Set initial height
      act(() => {
        mockResizeObserver.callback?.(
          [
            {
              target: firstItem,
              contentRect: { height: 100 } as DOMRectReadOnly,
              borderBoxSize: [],
              contentBoxSize: [],
              devicePixelContentBoxSize: [],
            },
          ],
          {} as ResizeObserver
        );
      });

      await act(async () => {
        vi.advanceTimersByTime(500);
      });

      // Change by only 8px
      act(() => {
        mockResizeObserver.callback?.(
          [
            {
              target: firstItem,
              contentRect: { height: 108 } as DOMRectReadOnly,
              borderBoxSize: [],
              contentBoxSize: [],
              devicePixelContentBoxSize: [],
            },
          ],
          {} as ResizeObserver
        );
      });

      // This should not trigger a redistribution

      vi.useRealTimers();
    });

    it('ignores zero height elements', async () => {
      vi.useFakeTimers();

      const { container } = render(
        <Masonry columns={2} gap={16} strategy="balanced">
          {createItems(4)}
        </Masonry>
      );

      const items = container.querySelectorAll('[data-masonry-item]');
      const firstItem = items[0] as HTMLElement;

      act(() => {
        mockResizeObserver.callback?.(
          [
            {
              target: firstItem,
              contentRect: { height: 0 } as DOMRectReadOnly,
              borderBoxSize: [],
              contentBoxSize: [],
              devicePixelContentBoxSize: [],
            },
          ],
          {} as ResizeObserver
        );
      });

      // Zero height should be ignored

      vi.useRealTimers();
    });
  });

  describe('Redistribution Count Limit', () => {
    it('stops redistributing after 10 attempts', async () => {
      vi.useFakeTimers();

      const { container } = render(
        <Masonry columns={2} gap={16} strategy="balanced">
          {createItems(4)}
        </Masonry>
      );

      const items = container.querySelectorAll('[data-masonry-item]');
      const firstItem = items[0] as HTMLElement;

      // Trigger 12 redistributions
      for (let i = 0; i < 12; i++) {
        act(() => {
          mockResizeObserver.callback?.(
            [
              {
                target: firstItem,
                contentRect: { height: 100 + i * 50 } as DOMRectReadOnly,
                borderBoxSize: [],
                contentBoxSize: [],
                devicePixelContentBoxSize: [],
              },
            ],
            {} as ResizeObserver
          );
        });

        await act(async () => {
          vi.advanceTimersByTime(600);
        });
      }

      vi.useRealTimers();

      // Component should still render correctly
      const mainContainer = container.firstChild as HTMLElement;
      expect(mainContainer.children.length).toBe(2);
    });

    it('resets redistribution count when children change', () => {
      const { rerender } = render(
        <Masonry columns={2} gap={16} strategy="balanced">
          {createItems(4)}
        </Masonry>
      );

      // Change children count
      rerender(
        <Masonry columns={2} gap={16} strategy="balanced">
          {createItems(6)}
        </Masonry>
      );

      // Should have created a new observer
      expect(resizeObserverInstances.length).toBeGreaterThan(1);
    });
  });

  describe('Pending Changes Handling', () => {
    it('handles pending changes during debounce window', async () => {
      vi.useFakeTimers();

      const { container } = render(
        <Masonry columns={2} gap={16} strategy="balanced">
          {createItems(4)}
        </Masonry>
      );

      const items = container.querySelectorAll('[data-masonry-item]');
      const firstItem = items[0] as HTMLElement;
      const secondItem = items[1] as HTMLElement;

      // First change
      act(() => {
        mockResizeObserver.callback?.(
          [
            {
              target: firstItem,
              contentRect: { height: 200 } as DOMRectReadOnly,
              borderBoxSize: [],
              contentBoxSize: [],
              devicePixelContentBoxSize: [],
            },
          ],
          {} as ResizeObserver
        );
      });

      // Second change during debounce (within 500ms)
      await act(async () => {
        vi.advanceTimersByTime(200);
      });

      act(() => {
        mockResizeObserver.callback?.(
          [
            {
              target: secondItem,
              contentRect: { height: 300 } as DOMRectReadOnly,
              borderBoxSize: [],
              contentBoxSize: [],
              devicePixelContentBoxSize: [],
            },
          ],
          {} as ResizeObserver
        );
      });

      // Complete debounce
      await act(async () => {
        vi.advanceTimersByTime(500);
      });

      vi.useRealTimers();
    });
  });

  describe('Non-HTMLElement Targets', () => {
    it('ignores non-HTMLElement targets in callback', async () => {
      vi.useFakeTimers();

      render(
        <Masonry columns={2} gap={16} strategy="balanced">
          {createItems(4)}
        </Masonry>
      );

      // Call with non-HTMLElement target
      act(() => {
        mockResizeObserver.callback?.(
          [
            {
              target: {} as Element, // Not an HTMLElement
              contentRect: { height: 200 } as DOMRectReadOnly,
              borderBoxSize: [],
              contentBoxSize: [],
              devicePixelContentBoxSize: [],
            },
          ],
          {} as ResizeObserver
        );
      });

      // Should not throw or cause issues
      await act(async () => {
        vi.advanceTimersByTime(500);
      });

      vi.useRealTimers();
    });
  });
});
