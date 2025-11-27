import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Masonry } from './masonry';

describe('Masonry - Breakpoints', () => {
  const originalInnerWidth = window.innerWidth;

  beforeEach(() => {
    // Reset window width before each test
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    });
  });

  afterEach(() => {
    // Restore original window width
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: originalInnerWidth,
    });
    vi.restoreAllMocks();
  });

  const createItems = (count: number) =>
    Array.from({ length: count }, (_, i) => (
      <div key={i} data-testid={`item-${i}`}>
        Item {i}
      </div>
    ));

  describe('Breakpoint Configuration', () => {
    it('uses columns prop when breakpoints is undefined', () => {
      const { container } = render(
        <Masonry columns={5} gap={16}>
          {createItems(10)}
        </Masonry>
      );

      const mainContainer = container.firstChild as HTMLElement;
      expect(mainContainer.children.length).toBe(5);
    });

    it('uses columns prop when breakpoints is empty object', () => {
      const { container } = render(
        <Masonry columns={4} gap={16} breakpoints={{}}>
          {createItems(8)}
        </Masonry>
      );

      const mainContainer = container.firstChild as HTMLElement;
      expect(mainContainer.children.length).toBe(4);
    });

    it('applies breakpoint columns based on window width', () => {
      // Set window width to 800px
      Object.defineProperty(window, 'innerWidth', { value: 800 });

      const { container } = render(
        <Masonry
          columns={4}
          gap={16}
          breakpoints={{
            1200: 4,
            900: 3,
            600: 2,
            300: 1,
          }}
        >
          {createItems(8)}
        </Masonry>
      );

      const mainContainer = container.firstChild as HTMLElement;
      // 800px is >= 600 but < 900, so should use 2 columns
      expect(mainContainer.children.length).toBe(2);
    });

    it('uses largest matching breakpoint', () => {
      // Set window width to 1000px
      Object.defineProperty(window, 'innerWidth', { value: 1000 });

      const { container } = render(
        <Masonry
          columns={1}
          gap={16}
          breakpoints={{
            1200: 5,
            900: 4,
            600: 3,
            300: 2,
          }}
        >
          {createItems(10)}
        </Masonry>
      );

      const mainContainer = container.firstChild as HTMLElement;
      // 1000px is >= 900 but < 1200, so should use 4 columns
      expect(mainContainer.children.length).toBe(4);
    });

    it('falls back to columns prop when below all breakpoints', () => {
      // Set window width to 200px (below all breakpoints)
      Object.defineProperty(window, 'innerWidth', { value: 200 });

      const { container } = render(
        <Masonry
          columns={1}
          gap={16}
          breakpoints={{
            1200: 4,
            900: 3,
            600: 2,
            300: 2,
          }}
        >
          {createItems(4)}
        </Masonry>
      );

      const mainContainer = container.firstChild as HTMLElement;
      // 200px is below all breakpoints, should use columns prop (1)
      expect(mainContainer.children.length).toBe(1);
    });

    it('uses highest column count when above all breakpoints', () => {
      // Set window width to 2000px (above all breakpoints)
      Object.defineProperty(window, 'innerWidth', { value: 2000 });

      const { container } = render(
        <Masonry
          columns={2}
          gap={16}
          breakpoints={{
            1200: 5,
            900: 4,
            600: 3,
          }}
        >
          {createItems(10)}
        </Masonry>
      );

      const mainContainer = container.firstChild as HTMLElement;
      // 2000px is >= 1200, so should use 5 columns
      expect(mainContainer.children.length).toBe(5);
    });
  });

  describe('Window Resize Handling', () => {
    it('updates columns when window is resized', async () => {
      // Start with large window
      Object.defineProperty(window, 'innerWidth', { value: 1200 });

      const { container, rerender } = render(
        <Masonry
          columns={2}
          gap={16}
          breakpoints={{
            1000: 4,
            600: 2,
          }}
        >
          {createItems(8)}
        </Masonry>
      );

      let mainContainer = container.firstChild as HTMLElement;
      expect(mainContainer.children.length).toBe(4);

      // Resize window to smaller size
      Object.defineProperty(window, 'innerWidth', { value: 700 });

      await act(async () => {
        window.dispatchEvent(new Event('resize'));
      });

      rerender(
        <Masonry
          columns={2}
          gap={16}
          breakpoints={{
            1000: 4,
            600: 2,
          }}
        >
          {createItems(8)}
        </Masonry>
      );

      mainContainer = container.firstChild as HTMLElement;
      // 700px is >= 600 but < 1000, should update to 2 columns
      expect(mainContainer.children.length).toBe(2);
    });

    it('removes resize listener on unmount', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

      const { unmount } = render(
        <Masonry
          columns={2}
          gap={16}
          breakpoints={{
            1000: 4,
            600: 2,
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

    it('does not add resize listener when breakpoints is undefined', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

      render(
        <Masonry columns={3} gap={16}>
          {createItems(6)}
        </Masonry>
      );

      const resizeCalls = addEventListenerSpy.mock.calls.filter(
        ([event]) => event === 'resize'
      );
      expect(resizeCalls.length).toBe(0);
    });

    it('does not add resize listener when breakpoints is empty', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

      render(
        <Masonry columns={3} gap={16} breakpoints={{}}>
          {createItems(6)}
        </Masonry>
      );

      const resizeCalls = addEventListenerSpy.mock.calls.filter(
        ([event]) => event === 'resize'
      );
      expect(resizeCalls.length).toBe(0);
    });
  });

  describe('Breakpoint Sorting', () => {
    it('handles unsorted breakpoints correctly', () => {
      // Breakpoints in random order
      Object.defineProperty(window, 'innerWidth', { value: 750 });

      const { container } = render(
        <Masonry
          columns={1}
          gap={16}
          breakpoints={{
            600: 2,
            1200: 4,
            900: 3,
            300: 1,
          }}
        >
          {createItems(8)}
        </Masonry>
      );

      const mainContainer = container.firstChild as HTMLElement;
      // 750px is >= 600 but < 900, so should use 2 columns
      expect(mainContainer.children.length).toBe(2);
    });

    it('sorts breakpoints from largest to smallest', () => {
      Object.defineProperty(window, 'innerWidth', { value: 950 });

      const { container } = render(
        <Masonry
          columns={1}
          gap={16}
          breakpoints={{
            300: 1,
            600: 2,
            900: 3,
            1200: 4,
          }}
        >
          {createItems(12)}
        </Masonry>
      );

      const mainContainer = container.firstChild as HTMLElement;
      // 950px should match 900 breakpoint (3 columns), not 1200 (4 columns)
      expect(mainContainer.children.length).toBe(3);
    });
  });

  describe('Edge Cases', () => {
    it('handles single breakpoint', () => {
      Object.defineProperty(window, 'innerWidth', { value: 800 });

      const { container } = render(
        <Masonry
          columns={1}
          gap={16}
          breakpoints={{
            600: 3,
          }}
        >
          {createItems(9)}
        </Masonry>
      );

      const mainContainer = container.firstChild as HTMLElement;
      // 800px is >= 600, so should use 3 columns
      expect(mainContainer.children.length).toBe(3);
    });

    it('handles breakpoint exactly at window width', () => {
      Object.defineProperty(window, 'innerWidth', { value: 600 });

      const { container } = render(
        <Masonry
          columns={1}
          gap={16}
          breakpoints={{
            600: 2,
            900: 3,
          }}
        >
          {createItems(6)}
        </Masonry>
      );

      const mainContainer = container.firstChild as HTMLElement;
      // 600px is exactly at breakpoint, should use 2 columns
      expect(mainContainer.children.length).toBe(2);
    });

    it('handles columns prop changing', () => {
      const { container, rerender } = render(
        <Masonry columns={2} gap={16}>
          {createItems(4)}
        </Masonry>
      );

      let mainContainer = container.firstChild as HTMLElement;
      expect(mainContainer.children.length).toBe(2);

      // Change columns prop
      rerender(
        <Masonry columns={4} gap={16}>
          {createItems(4)}
        </Masonry>
      );

      mainContainer = container.firstChild as HTMLElement;
      expect(mainContainer.children.length).toBe(4);
    });

    it('handles breakpoints prop changing', () => {
      Object.defineProperty(window, 'innerWidth', { value: 800 });

      const { container, rerender } = render(
        <Masonry
          columns={1}
          gap={16}
          breakpoints={{
            600: 2,
          }}
        >
          {createItems(6)}
        </Masonry>
      );

      let mainContainer = container.firstChild as HTMLElement;
      expect(mainContainer.children.length).toBe(2);

      // Change breakpoints to have different column count at 600
      rerender(
        <Masonry
          columns={1}
          gap={16}
          breakpoints={{
            600: 4,
          }}
        >
          {createItems(6)}
        </Masonry>
      );

      mainContainer = container.firstChild as HTMLElement;
      expect(mainContainer.children.length).toBe(4);
    });

    it('handles string number breakpoint keys', () => {
      Object.defineProperty(window, 'innerWidth', { value: 800 });

      // TypeScript types require number keys, but runtime might receive strings
      const breakpoints = {
        600: 2,
        1000: 4,
      };

      const { container } = render(
        <Masonry columns={1} gap={16} breakpoints={breakpoints}>
          {createItems(8)}
        </Masonry>
      );

      const mainContainer = container.firstChild as HTMLElement;
      expect(mainContainer.children.length).toBe(2);
    });
  });

  describe('Balanced Strategy with Breakpoints', () => {
    it('clears item heights when columns change via breakpoint', async () => {
      Object.defineProperty(window, 'innerWidth', { value: 1200 });

      const { container, rerender } = render(
        <Masonry
          columns={2}
          gap={16}
          strategy="balanced"
          breakpoints={{
            1000: 4,
            600: 2,
          }}
        >
          {createItems(8)}
        </Masonry>
      );

      let mainContainer = container.firstChild as HTMLElement;
      expect(mainContainer.children.length).toBe(4);

      // Resize to trigger column change
      Object.defineProperty(window, 'innerWidth', { value: 700 });

      await act(async () => {
        window.dispatchEvent(new Event('resize'));
      });

      rerender(
        <Masonry
          columns={2}
          gap={16}
          strategy="balanced"
          breakpoints={{
            1000: 4,
            600: 2,
          }}
        >
          {createItems(8)}
        </Masonry>
      );

      mainContainer = container.firstChild as HTMLElement;
      expect(mainContainer.children.length).toBe(2);
    });
  });
});
