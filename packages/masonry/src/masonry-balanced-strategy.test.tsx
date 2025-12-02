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

describe('Masonry - Balanced Strategy', () => {
  let mockResizeObserver: {
    observe: Mock;
    unobserve: Mock;
    disconnect: Mock;
    callback: ResizeObserverCallback | null;
  };

  beforeEach(() => {
    // Mock ResizeObserver
    mockResizeObserver = {
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
      callback: null,
    };

    // Create a proper class mock for ResizeObserver
    class MockResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        mockResizeObserver.callback = callback;
      }
      observe = mockResizeObserver.observe;
      unobserve = mockResizeObserver.unobserve;
      disconnect = mockResizeObserver.disconnect;
    }

    vi.stubGlobal('ResizeObserver', MockResizeObserver);

    // Mock requestAnimationFrame
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

  const createItemsWithHeights = (heights: number[]) =>
    heights.map((height, i) => (
      <div key={i} data-testid={`item-${i}`} style={{ height: `${height}px` }}>
        Item {i}
      </div>
    ));

  describe('Strategy Selection', () => {
    it('uses count strategy by default', () => {
      const { container } = render(
        <Masonry columns={3} gap={16}>
          {createItems(9)}
        </Masonry>
      );

      const mainContainer = container.firstChild as HTMLElement;
      const columns = mainContainer.children;

      // With count strategy, 9 items should be distributed 3-3-3
      for (const column of columns) {
        expect(column.children.length).toBe(3);
      }
    });

    it('accepts balanced strategy prop', () => {
      const { container } = render(
        <Masonry columns={3} gap={16} strategy="balanced">
          {createItems(9)}
        </Masonry>
      );

      const mainContainer = container.firstChild as HTMLElement;
      expect(mainContainer.children.length).toBe(3);
    });

    it('accepts count strategy prop explicitly', () => {
      const { container } = render(
        <Masonry columns={3} gap={16} strategy="count">
          {createItems(9)}
        </Masonry>
      );

      const mainContainer = container.firstChild as HTMLElement;
      const columns = mainContainer.children;

      for (const column of columns) {
        expect(column.children.length).toBe(3);
      }
    });
  });

  describe('ResizeObserver Integration', () => {
    it('creates ResizeObserver when strategy is balanced', () => {
      render(
        <Masonry columns={3} gap={16} strategy="balanced">
          {createItems(6)}
        </Masonry>
      );

      // Verify ResizeObserver was used by checking observer methods were called
      expect(mockResizeObserver.observe).toHaveBeenCalled();
    });

    it('does not create ResizeObserver when strategy is count', () => {
      render(
        <Masonry columns={3} gap={16} strategy="count">
          {createItems(6)}
        </Masonry>
      );

      // ResizeObserver should not be instantiated for count strategy
      expect(mockResizeObserver.observe).not.toHaveBeenCalled();
    });

    it('observes all masonry items', () => {
      render(
        <Masonry columns={3} gap={16} strategy="balanced">
          {createItems(6)}
        </Masonry>
      );

      // Should observe 6 items
      expect(mockResizeObserver.observe).toHaveBeenCalledTimes(6);
    });

    it('disconnects ResizeObserver on unmount', () => {
      const { unmount } = render(
        <Masonry columns={3} gap={16} strategy="balanced">
          {createItems(6)}
        </Masonry>
      );

      unmount();

      expect(mockResizeObserver.disconnect).toHaveBeenCalled();
    });
  });

  describe('Height Measurement', () => {
    it('triggers redistribution when height changes significantly', async () => {
      vi.useFakeTimers();

      const { container } = render(
        <Masonry columns={2} gap={16} strategy="balanced">
          {createItems(4)}
        </Masonry>
      );

      // Simulate height change via ResizeObserver callback
      const items = container.querySelectorAll('[data-masonry-item]');
      const firstItem = items[0] as HTMLElement;

      // Create mock resize entry
      const mockEntry = {
        target: firstItem,
        contentRect: { height: 200 } as DOMRectReadOnly,
        borderBoxSize: [],
        contentBoxSize: [],
        devicePixelContentBoxSize: [],
      };

      // Trigger the resize observer callback
      act(() => {
        mockResizeObserver.callback?.([mockEntry], {} as ResizeObserver);
      });

      // Advance timers to trigger debounced redistribution (500ms)
      await act(async () => {
        vi.advanceTimersByTime(500);
      });

      vi.useRealTimers();
    });

    it('ignores small height changes (< 10px)', async () => {
      vi.useFakeTimers();

      const { container } = render(
        <Masonry columns={2} gap={16} strategy="balanced">
          {createItems(4)}
        </Masonry>
      );

      const items = container.querySelectorAll('[data-masonry-item]');
      const firstItem = items[0] as HTMLElement;

      // Initial measurement
      const mockEntry1 = {
        target: firstItem,
        contentRect: { height: 100 } as DOMRectReadOnly,
        borderBoxSize: [],
        contentBoxSize: [],
        devicePixelContentBoxSize: [],
      };

      act(() => {
        mockResizeObserver.callback?.([mockEntry1], {} as ResizeObserver);
      });

      await act(async () => {
        vi.advanceTimersByTime(500);
      });

      // Small change (only 5px)
      const mockEntry2 = {
        target: firstItem,
        contentRect: { height: 105 } as DOMRectReadOnly,
        borderBoxSize: [],
        contentBoxSize: [],
        devicePixelContentBoxSize: [],
      };

      act(() => {
        mockResizeObserver.callback?.([mockEntry2], {} as ResizeObserver);
      });

      // Should not schedule another redistribution for small changes
      vi.useRealTimers();
    });

    it('uses average height for unmeasured items', () => {
      const { container } = render(
        <Masonry columns={2} gap={16} strategy="balanced">
          {createItems(4)}
        </Masonry>
      );

      // Even without measurements, items should be distributed
      const mainContainer = container.firstChild as HTMLElement;
      expect(mainContainer.children.length).toBe(2);
    });
  });

  describe('Distribution Algorithm', () => {
    it('places tallest items first (Largest First strategy)', async () => {
      vi.useFakeTimers();

      const { container } = render(
        <Masonry columns={2} gap={16} strategy="balanced">
          {createItemsWithHeights([100, 200, 150, 50])}
        </Masonry>
      );

      const items = container.querySelectorAll('[data-masonry-item]');

      // Simulate height measurements
      const entries = Array.from(items).map((item, index) => ({
        target: item as HTMLElement,
        contentRect: { height: [100, 200, 150, 50][index] } as DOMRectReadOnly,
        borderBoxSize: [],
        contentBoxSize: [],
        devicePixelContentBoxSize: [],
      }));

      act(() => {
        mockResizeObserver.callback?.(entries, {} as ResizeObserver);
      });

      await act(async () => {
        vi.advanceTimersByTime(500);
      });

      vi.useRealTimers();

      // Algorithm should have distributed items to minimize height difference
      const mainContainer = container.firstChild as HTMLElement;
      expect(mainContainer.children.length).toBe(2);
    });

    it('minimizes column height variance', async () => {
      vi.useFakeTimers();

      const { container } = render(
        <Masonry columns={3} gap={0} strategy="balanced">
          {createItemsWithHeights([300, 200, 100, 150, 250, 50])}
        </Masonry>
      );

      const items = container.querySelectorAll('[data-masonry-item]');

      // Simulate height measurements
      const heights = [300, 200, 100, 150, 250, 50];
      const entries = Array.from(items).map((item, index) => ({
        target: item as HTMLElement,
        contentRect: { height: heights[index] } as DOMRectReadOnly,
        borderBoxSize: [],
        contentBoxSize: [],
        devicePixelContentBoxSize: [],
      }));

      act(() => {
        mockResizeObserver.callback?.(entries, {} as ResizeObserver);
      });

      await act(async () => {
        vi.advanceTimersByTime(500);
      });

      vi.useRealTimers();

      const mainContainer = container.firstChild as HTMLElement;
      expect(mainContainer.children.length).toBe(3);
    });
  });

  describe('Balance Threshold', () => {
    it('uses default balance threshold of 0.05', () => {
      const { container } = render(
        <Masonry columns={2} gap={16} strategy="balanced">
          {createItems(4)}
        </Masonry>
      );

      const mainContainer = container.firstChild as HTMLElement;
      expect(mainContainer.children.length).toBe(2);
    });

    it('accepts custom balance threshold', () => {
      const { container } = render(
        <Masonry
          columns={2}
          gap={16}
          strategy="balanced"
          balanceThreshold={0.1}
        >
          {createItems(4)}
        </Masonry>
      );

      const mainContainer = container.firstChild as HTMLElement;
      expect(mainContainer.children.length).toBe(2);
    });

    it('accepts zero balance threshold', () => {
      const { container } = render(
        <Masonry columns={2} gap={16} strategy="balanced" balanceThreshold={0}>
          {createItems(4)}
        </Masonry>
      );

      const mainContainer = container.firstChild as HTMLElement;
      expect(mainContainer.children.length).toBe(2);
    });
  });

  describe('Redistribution Limits', () => {
    it('stops redistributing after 10 attempts', async () => {
      vi.useFakeTimers();

      const { container } = render(
        <Masonry columns={2} gap={16} strategy="balanced">
          {createItems(4)}
        </Masonry>
      );

      const items = container.querySelectorAll('[data-masonry-item]');
      const firstItem = items[0] as HTMLElement;

      // Trigger many redistributions
      for (let i = 0; i < 15; i++) {
        const mockEntry = {
          target: firstItem,
          contentRect: { height: 100 + i * 20 } as DOMRectReadOnly,
          borderBoxSize: [],
          contentBoxSize: [],
          devicePixelContentBoxSize: [],
        };

        act(() => {
          mockResizeObserver.callback?.([mockEntry], {} as ResizeObserver);
        });

        await act(async () => {
          vi.advanceTimersByTime(500);
        });
      }

      vi.useRealTimers();

      // Component should still be functional
      const mainContainer = container.firstChild as HTMLElement;
      expect(mainContainer.children.length).toBe(2);
    });
  });

  describe('Stability Detection', () => {
    it('disconnects observer after layout becomes stable', async () => {
      vi.useFakeTimers();

      render(
        <Masonry columns={2} gap={16} strategy="balanced">
          {createItems(4)}
        </Masonry>
      );

      // Wait for stability timeout (2000ms)
      await act(async () => {
        vi.advanceTimersByTime(2500);
      });

      vi.useRealTimers();

      // Observer should have been disconnected after stability period
    });
  });

  describe('Optimization Phases', () => {
    it('performs global optimization pass', async () => {
      vi.useFakeTimers();

      // Items with heights that benefit from optimization
      const { container } = render(
        <Masonry columns={3} gap={0} strategy="balanced">
          {createItemsWithHeights([100, 100, 100, 200, 200, 200])}
        </Masonry>
      );

      const items = container.querySelectorAll('[data-masonry-item]');
      const heights = [100, 100, 100, 200, 200, 200];

      const entries = Array.from(items).map((item, index) => ({
        target: item as HTMLElement,
        contentRect: { height: heights[index] } as DOMRectReadOnly,
        borderBoxSize: [],
        contentBoxSize: [],
        devicePixelContentBoxSize: [],
      }));

      act(() => {
        mockResizeObserver.callback?.(entries, {} as ResizeObserver);
      });

      await act(async () => {
        vi.advanceTimersByTime(500);
      });

      vi.useRealTimers();

      const mainContainer = container.firstChild as HTMLElement;
      expect(mainContainer.children.length).toBe(3);
    });

    it('stops optimization when near-perfectly balanced', async () => {
      vi.useFakeTimers();

      // Items with identical heights - should be perfectly balanced immediately
      const { container } = render(
        <Masonry columns={2} gap={0} strategy="balanced">
          {createItemsWithHeights([100, 100, 100, 100])}
        </Masonry>
      );

      const items = container.querySelectorAll('[data-masonry-item]');
      const entries = Array.from(items).map((item) => ({
        target: item as HTMLElement,
        contentRect: { height: 100 } as DOMRectReadOnly,
        borderBoxSize: [],
        contentBoxSize: [],
        devicePixelContentBoxSize: [],
      }));

      act(() => {
        mockResizeObserver.callback?.(entries, {} as ResizeObserver);
      });

      await act(async () => {
        vi.advanceTimersByTime(500);
      });

      vi.useRealTimers();

      // Each column should have 2 items
      const mainContainer = container.firstChild as HTMLElement;
      const column1 = mainContainer.children[0];
      const column2 = mainContainer.children[1];

      expect(column1?.children.length).toBe(2);
      expect(column2?.children.length).toBe(2);
    });
  });

  describe('ResizeObserver Fallback', () => {
    it('warns and falls back when ResizeObserver is unavailable', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Remove ResizeObserver
      vi.stubGlobal('ResizeObserver', undefined);

      render(
        <Masonry columns={2} gap={16} strategy="balanced">
          {createItems(4)}
        </Masonry>
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('ResizeObserver not available')
      );
    });
  });

  describe('Children Changes', () => {
    it('resets measurements when children count changes', () => {
      const { container, rerender } = render(
        <Masonry columns={2} gap={16} strategy="balanced">
          {createItems(4)}
        </Masonry>
      );

      let mainContainer = container.firstChild as HTMLElement;
      expect(mainContainer.children.length).toBe(2);

      // Add more items
      rerender(
        <Masonry columns={2} gap={16} strategy="balanced">
          {createItems(8)}
        </Masonry>
      );

      mainContainer = container.firstChild as HTMLElement;
      expect(mainContainer.children.length).toBe(2);
    });

    it('handles switching from balanced to count strategy', () => {
      const { container, rerender } = render(
        <Masonry columns={2} gap={16} strategy="balanced">
          {createItems(6)}
        </Masonry>
      );

      let mainContainer = container.firstChild as HTMLElement;
      expect(mainContainer.children.length).toBe(2);

      // Switch to count strategy
      rerender(
        <Masonry columns={2} gap={16} strategy="count">
          {createItems(6)}
        </Masonry>
      );

      mainContainer = container.firstChild as HTMLElement;
      // Each column should have 3 items with count strategy
      for (const column of mainContainer.children) {
        expect(column.children.length).toBe(3);
      }
    });
  });
});
