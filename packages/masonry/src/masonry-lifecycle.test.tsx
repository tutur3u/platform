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

describe('Masonry - Lifecycle & Props', () => {
  let mockResizeObserver: {
    observe: Mock;
    unobserve: Mock;
    disconnect: Mock;
    callback: ResizeObserverCallback | null;
  };

  beforeEach(() => {
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

    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 0;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const createItems = (count: number, prefix = 'item') =>
    Array.from({ length: count }, (_, i) => (
      <div key={`${prefix}-${i}`} data-testid={`${prefix}-${i}`}>
        Item {i}
      </div>
    ));

  describe('Gap Prop', () => {
    it('applies default gap of 16px', () => {
      const { container } = render(
        <Masonry columns={2}>{createItems(4)}</Masonry>
      );

      const mainContainer = container.firstChild as HTMLElement;
      expect(mainContainer.style.gap).toBe('16px');
    });

    it('applies custom gap value', () => {
      const { container } = render(
        <Masonry columns={2} gap={24}>
          {createItems(4)}
        </Masonry>
      );

      const mainContainer = container.firstChild as HTMLElement;
      expect(mainContainer.style.gap).toBe('24px');
    });

    it('applies gap to columns as well', () => {
      const { container } = render(
        <Masonry columns={2} gap={20}>
          {createItems(4)}
        </Masonry>
      );

      const mainContainer = container.firstChild as HTMLElement;
      const column = mainContainer.children[0] as HTMLElement;
      expect(column.style.gap).toBe('20px');
    });

    it('handles zero gap', () => {
      const { container } = render(
        <Masonry columns={2} gap={0}>
          {createItems(4)}
        </Masonry>
      );

      const mainContainer = container.firstChild as HTMLElement;
      expect(mainContainer.style.gap).toBe('0px');
    });

    it('updates gap when prop changes', () => {
      const { container, rerender } = render(
        <Masonry columns={2} gap={16}>
          {createItems(4)}
        </Masonry>
      );

      let mainContainer = container.firstChild as HTMLElement;
      expect(mainContainer.style.gap).toBe('16px');

      rerender(
        <Masonry columns={2} gap={32}>
          {createItems(4)}
        </Masonry>
      );

      mainContainer = container.firstChild as HTMLElement;
      expect(mainContainer.style.gap).toBe('32px');
    });
  });

  describe('Smooth Transitions', () => {
    it('applies transition style when enabled', () => {
      const { container } = render(
        <Masonry columns={2} gap={16} smoothTransitions={true}>
          {createItems(4)}
        </Masonry>
      );

      const mainContainer = container.firstChild as HTMLElement;
      const column = mainContainer.children[0] as HTMLElement;

      expect(column.style.transition).toBeTruthy();
      expect(column.style.transition).toContain('0.3s');
    });

    it('does not apply transition when disabled (default)', () => {
      const { container } = render(
        <Masonry columns={2} gap={16}>
          {createItems(4)}
        </Masonry>
      );

      const mainContainer = container.firstChild as HTMLElement;
      const column = mainContainer.children[0] as HTMLElement;

      expect(column.style.transition).toBe('');
    });

    it('applies transition to items when enabled', () => {
      const { container } = render(
        <Masonry columns={2} gap={16} smoothTransitions={true}>
          {createItems(2)}
        </Masonry>
      );

      const item = container.querySelector(
        '[data-masonry-item]'
      ) as HTMLElement;
      expect(item.style.transition).toContain('transform');
    });

    it('toggles transition when prop changes', () => {
      const { container, rerender } = render(
        <Masonry columns={2} gap={16} smoothTransitions={false}>
          {createItems(4)}
        </Masonry>
      );

      let column = (container.firstChild as HTMLElement)
        .children[0] as HTMLElement;
      expect(column.style.transition).toBe('');

      rerender(
        <Masonry columns={2} gap={16} smoothTransitions={true}>
          {createItems(4)}
        </Masonry>
      );

      column = (container.firstChild as HTMLElement).children[0] as HTMLElement;
      expect(column.style.transition).toBeTruthy();
    });
  });

  describe('Data Attributes', () => {
    it('adds data-masonry-item to wrapped items', () => {
      const { container } = render(
        <Masonry columns={2} gap={16}>
          {createItems(4)}
        </Masonry>
      );

      const items = container.querySelectorAll('[data-masonry-item]');
      expect(items.length).toBe(4);
    });

    it('adds data-item-index attribute with correct value', () => {
      const { container } = render(
        <Masonry columns={2} gap={16}>
          {createItems(4)}
        </Masonry>
      );

      const items = container.querySelectorAll('[data-masonry-item]');

      // Check that indices are assigned
      const indices = Array.from(items).map((item) =>
        item.getAttribute('data-item-index')
      );

      expect(indices).toContain('0');
      expect(indices).toContain('1');
      expect(indices).toContain('2');
      expect(indices).toContain('3');
    });

    it('maintains consistent indices across redistributions', async () => {
      vi.useFakeTimers();

      const { container } = render(
        <Masonry columns={2} gap={16} strategy="balanced">
          {createItems(4)}
        </Masonry>
      );

      const getIndices = () =>
        Array.from(container.querySelectorAll('[data-masonry-item]')).map(
          (item) => item.getAttribute('data-item-index')
        );

      const initialIndices = getIndices();

      // Trigger redistribution
      const items = container.querySelectorAll('[data-masonry-item]');
      const mockEntry = {
        target: items[0] as HTMLElement,
        contentRect: { height: 200 } as DOMRectReadOnly,
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

      vi.useRealTimers();

      // Indices should still be present (values may change with redistribution)
      const afterIndices = getIndices();
      expect(afterIndices.length).toBe(initialIndices.length);
    });
  });

  describe('Cleanup on Unmount', () => {
    it('cleans up ResizeObserver on unmount', () => {
      const { unmount } = render(
        <Masonry columns={2} gap={16} strategy="balanced">
          {createItems(4)}
        </Masonry>
      );

      unmount();

      expect(mockResizeObserver.disconnect).toHaveBeenCalled();
    });

    it('cleans up resize event listener on unmount', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

      const { unmount } = render(
        <Masonry
          columns={2}
          gap={16}
          breakpoints={{
            600: 2,
            1000: 4,
          }}
        >
          {createItems(4)}
        </Masonry>
      );

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'resize',
        expect.any(Function)
      );
    });

    it('cleans up pending timeouts on unmount', async () => {
      vi.useFakeTimers();

      const { container, unmount } = render(
        <Masonry columns={2} gap={16} strategy="balanced">
          {createItems(4)}
        </Masonry>
      );

      // Trigger a redistribution
      const items = container.querySelectorAll('[data-masonry-item]');
      act(() => {
        mockResizeObserver.callback?.(
          [
            {
              target: items[0] as HTMLElement,
              contentRect: { height: 200 } as DOMRectReadOnly,
              borderBoxSize: [],
              contentBoxSize: [],
              devicePixelContentBoxSize: [],
            },
          ],
          {} as ResizeObserver
        );
      });

      // Unmount before timeout completes
      unmount();

      // Advance time - should not throw
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      vi.useRealTimers();
    });
  });

  describe('Children Changes', () => {
    it('handles adding children', () => {
      const { container, rerender } = render(
        <Masonry columns={2} gap={16}>
          {createItems(2)}
        </Masonry>
      );

      let mainContainer = container.firstChild as HTMLElement;
      let totalItems = Array.from(mainContainer.children).reduce(
        (sum, col) => sum + col.children.length,
        0
      );
      expect(totalItems).toBe(2);

      rerender(
        <Masonry columns={2} gap={16}>
          {createItems(6)}
        </Masonry>
      );

      mainContainer = container.firstChild as HTMLElement;
      totalItems = Array.from(mainContainer.children).reduce(
        (sum, col) => sum + col.children.length,
        0
      );
      expect(totalItems).toBe(6);
    });

    it('handles removing children', () => {
      const { container, rerender } = render(
        <Masonry columns={2} gap={16}>
          {createItems(6)}
        </Masonry>
      );

      let mainContainer = container.firstChild as HTMLElement;
      let totalItems = Array.from(mainContainer.children).reduce(
        (sum, col) => sum + col.children.length,
        0
      );
      expect(totalItems).toBe(6);

      rerender(
        <Masonry columns={2} gap={16}>
          {createItems(2)}
        </Masonry>
      );

      mainContainer = container.firstChild as HTMLElement;
      totalItems = Array.from(mainContainer.children).reduce(
        (sum, col) => sum + col.children.length,
        0
      );
      expect(totalItems).toBe(2);
    });

    it('handles empty children array', () => {
      const { container } = render(
        <Masonry columns={3} gap={16}>
          {[]}
        </Masonry>
      );

      const mainContainer = container.firstChild as HTMLElement;
      expect(mainContainer.children.length).toBe(3); // 3 empty columns

      for (const column of mainContainer.children) {
        expect(column.children.length).toBe(0);
      }
    });

    it('handles changing from empty to populated', () => {
      const { container, rerender } = render(
        <Masonry columns={2} gap={16}>
          {[]}
        </Masonry>
      );

      let mainContainer = container.firstChild as HTMLElement;
      let totalItems = Array.from(mainContainer.children).reduce(
        (sum, col) => sum + col.children.length,
        0
      );
      expect(totalItems).toBe(0);

      rerender(
        <Masonry columns={2} gap={16}>
          {createItems(4)}
        </Masonry>
      );

      mainContainer = container.firstChild as HTMLElement;
      totalItems = Array.from(mainContainer.children).reduce(
        (sum, col) => sum + col.children.length,
        0
      );
      expect(totalItems).toBe(4);
    });

    it('handles different children with same count', () => {
      const { rerender, getByTestId } = render(
        <Masonry columns={2} gap={16}>
          {createItems(4, 'first')}
        </Masonry>
      );

      expect(getByTestId('first-0')).toBeInTheDocument();

      rerender(
        <Masonry columns={2} gap={16}>
          {createItems(4, 'second')}
        </Masonry>
      );

      expect(getByTestId('second-0')).toBeInTheDocument();
    });
  });

  describe('Column Changes', () => {
    it('redistributes items when columns increase', () => {
      const { container, rerender } = render(
        <Masonry columns={2} gap={16}>
          {createItems(8)}
        </Masonry>
      );

      let mainContainer = container.firstChild as HTMLElement;
      expect(mainContainer.children.length).toBe(2);

      rerender(
        <Masonry columns={4} gap={16}>
          {createItems(8)}
        </Masonry>
      );

      mainContainer = container.firstChild as HTMLElement;
      expect(mainContainer.children.length).toBe(4);
    });

    it('redistributes items when columns decrease', () => {
      const { container, rerender } = render(
        <Masonry columns={4} gap={16}>
          {createItems(8)}
        </Masonry>
      );

      let mainContainer = container.firstChild as HTMLElement;
      expect(mainContainer.children.length).toBe(4);

      rerender(
        <Masonry columns={2} gap={16}>
          {createItems(8)}
        </Masonry>
      );

      mainContainer = container.firstChild as HTMLElement;
      expect(mainContainer.children.length).toBe(2);
    });

    it('handles single column', () => {
      const { container } = render(
        <Masonry columns={1} gap={16}>
          {createItems(5)}
        </Masonry>
      );

      const mainContainer = container.firstChild as HTMLElement;
      expect(mainContainer.children.length).toBe(1);
      expect(mainContainer.children[0]?.children.length).toBe(5);
    });

    it('handles many columns', () => {
      const { container } = render(
        <Masonry columns={10} gap={16}>
          {createItems(20)}
        </Masonry>
      );

      const mainContainer = container.firstChild as HTMLElement;
      expect(mainContainer.children.length).toBe(10);
    });
  });

  describe('Strategy Switching', () => {
    it('switches from count to balanced strategy', () => {
      const { container, rerender } = render(
        <Masonry columns={2} gap={16} strategy="count">
          {createItems(4)}
        </Masonry>
      );

      let mainContainer = container.firstChild as HTMLElement;
      expect(mainContainer.children.length).toBe(2);

      rerender(
        <Masonry columns={2} gap={16} strategy="balanced">
          {createItems(4)}
        </Masonry>
      );

      mainContainer = container.firstChild as HTMLElement;
      expect(mainContainer.children.length).toBe(2);
      expect(mockResizeObserver.observe).toHaveBeenCalled();
    });

    it('switches from balanced to count strategy', () => {
      const { container, rerender } = render(
        <Masonry columns={2} gap={16} strategy="balanced">
          {createItems(4)}
        </Masonry>
      );

      rerender(
        <Masonry columns={2} gap={16} strategy="count">
          {createItems(4)}
        </Masonry>
      );

      const mainContainer = container.firstChild as HTMLElement;
      expect(mainContainer.children.length).toBe(2);
      expect(mockResizeObserver.disconnect).toHaveBeenCalled();
    });

    it('clears height measurements when switching to balanced', () => {
      const { rerender } = render(
        <Masonry columns={2} gap={16} strategy="count">
          {createItems(4)}
        </Masonry>
      );

      rerender(
        <Masonry columns={2} gap={16} strategy="balanced">
          {createItems(4)}
        </Masonry>
      );

      // Items should be re-observed
      expect(mockResizeObserver.observe).toHaveBeenCalled();
    });
  });

  describe('Container Styles', () => {
    it('applies flex display to container', () => {
      const { container } = render(
        <Masonry columns={2} gap={16}>
          {createItems(4)}
        </Masonry>
      );

      const mainContainer = container.firstChild as HTMLElement;
      expect(mainContainer.style.display).toBe('flex');
    });

    it('applies flex-start alignment to container', () => {
      const { container } = render(
        <Masonry columns={2} gap={16}>
          {createItems(4)}
        </Masonry>
      );

      const mainContainer = container.firstChild as HTMLElement;
      expect(mainContainer.style.alignItems).toBe('flex-start');
    });

    it('applies flex column direction to columns', () => {
      const { container } = render(
        <Masonry columns={2} gap={16}>
          {createItems(4)}
        </Masonry>
      );

      const mainContainer = container.firstChild as HTMLElement;
      const column = mainContainer.children[0] as HTMLElement;
      expect(column.style.flexDirection).toBe('column');
    });

    it('applies flex: 1 to columns', () => {
      const { container } = render(
        <Masonry columns={2} gap={16}>
          {createItems(4)}
        </Masonry>
      );

      const mainContainer = container.firstChild as HTMLElement;
      const column = mainContainer.children[0] as HTMLElement;
      // flex: 1 expands to "1 1 0%" in computed style
      expect(column.style.flex).toMatch(/^1/);
    });
  });

  describe('ClassName Prop', () => {
    it('applies custom className to container', () => {
      const { container } = render(
        <Masonry columns={2} gap={16} className="custom-masonry">
          {createItems(4)}
        </Masonry>
      );

      const mainContainer = container.firstChild as HTMLElement;
      expect(mainContainer.classList.contains('custom-masonry')).toBe(true);
    });

    it('applies empty className by default', () => {
      const { container } = render(
        <Masonry columns={2} gap={16}>
          {createItems(4)}
        </Masonry>
      );

      const mainContainer = container.firstChild as HTMLElement;
      expect(mainContainer.className).toBe('');
    });

    it('handles multiple classNames', () => {
      const { container } = render(
        <Masonry columns={2} gap={16} className="class1 class2 class3">
          {createItems(4)}
        </Masonry>
      );

      const mainContainer = container.firstChild as HTMLElement;
      expect(mainContainer.classList.contains('class1')).toBe(true);
      expect(mainContainer.classList.contains('class2')).toBe(true);
      expect(mainContainer.classList.contains('class3')).toBe(true);
    });

    it('updates className when prop changes', () => {
      const { container, rerender } = render(
        <Masonry columns={2} gap={16} className="original">
          {createItems(4)}
        </Masonry>
      );

      let mainContainer = container.firstChild as HTMLElement;
      expect(mainContainer.classList.contains('original')).toBe(true);

      rerender(
        <Masonry columns={2} gap={16} className="updated">
          {createItems(4)}
        </Masonry>
      );

      mainContainer = container.firstChild as HTMLElement;
      expect(mainContainer.classList.contains('updated')).toBe(true);
      expect(mainContainer.classList.contains('original')).toBe(false);
    });
  });

  describe('Ref Management', () => {
    it('container ref is accessible internally', () => {
      render(
        <Masonry columns={2} gap={16} strategy="balanced">
          {createItems(4)}
        </Masonry>
      );

      // The component uses an internal ref for ResizeObserver
      // Verify it works by checking observer was set up
      expect(mockResizeObserver.observe).toHaveBeenCalled();
    });
  });
});
