import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { useIsMobile } from '../use-mobile';

describe('useIsMobile', () => {
  const MOBILE_BREAKPOINT = 768;
  let originalInnerWidth: number;
  let matchMediaMock: ReturnType<typeof vi.fn>;
  let addEventListenerMock: ReturnType<typeof vi.fn>;
  let removeEventListenerMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    originalInnerWidth = window.innerWidth;
    addEventListenerMock = vi.fn();
    removeEventListenerMock = vi.fn();

    matchMediaMock = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: addEventListenerMock,
      removeEventListener: removeEventListenerMock,
      dispatchEvent: vi.fn(),
    }));

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: matchMediaMock,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      value: originalInnerWidth,
    });
    vi.restoreAllMocks();
  });

  describe('initial state', () => {
    it('should return false for desktop width', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        value: 1024,
      });

      const { result } = renderHook(() => useIsMobile());

      expect(result.current).toBe(false);
    });

    it('should return true for mobile width', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        value: 500,
      });

      const { result } = renderHook(() => useIsMobile());

      expect(result.current).toBe(true);
    });

    it('should return false for width equal to breakpoint', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        value: MOBILE_BREAKPOINT,
      });

      const { result } = renderHook(() => useIsMobile());

      expect(result.current).toBe(false);
    });

    it('should return true for width one less than breakpoint', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        value: MOBILE_BREAKPOINT - 1,
      });

      const { result } = renderHook(() => useIsMobile());

      expect(result.current).toBe(true);
    });
  });

  describe('matchMedia setup', () => {
    it('should call matchMedia with correct query', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        value: 1024,
      });

      renderHook(() => useIsMobile());

      expect(matchMediaMock).toHaveBeenCalledWith(
        `(max-width: ${MOBILE_BREAKPOINT - 1}px)`
      );
    });

    it('should add event listener for change', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        value: 1024,
      });

      renderHook(() => useIsMobile());

      expect(addEventListenerMock).toHaveBeenCalledWith(
        'change',
        expect.any(Function)
      );
    });

    it('should remove event listener on unmount', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        value: 1024,
      });

      const { unmount } = renderHook(() => useIsMobile());
      unmount();

      expect(removeEventListenerMock).toHaveBeenCalledWith(
        'change',
        expect.any(Function)
      );
    });
  });

  describe('responsive behavior', () => {
    it('should update when window is resized to mobile', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        value: 1024,
      });

      const { result } = renderHook(() => useIsMobile());

      expect(result.current).toBe(false);

      // Get the onChange handler
      const call = addEventListenerMock.mock.calls[0]!;
      const onChange = call[1] as () => void;

      // Simulate resize to mobile
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        value: 500,
      });

      act(() => {
        onChange();
      });

      expect(result.current).toBe(true);
    });

    it('should update when window is resized to desktop', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        value: 500,
      });

      const { result } = renderHook(() => useIsMobile());

      expect(result.current).toBe(true);

      // Get the onChange handler
      const call = addEventListenerMock.mock.calls[0]!;
      const onChange = call[1] as () => void;

      // Simulate resize to desktop
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        value: 1024,
      });

      act(() => {
        onChange();
      });

      expect(result.current).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle very small widths', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        value: 320, // Small mobile
      });

      const { result } = renderHook(() => useIsMobile());

      expect(result.current).toBe(true);
    });

    it('should handle very large widths', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        value: 2560, // Large desktop
      });

      const { result } = renderHook(() => useIsMobile());

      expect(result.current).toBe(false);
    });

    it('should handle tablet widths (just above breakpoint)', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        value: 800, // Tablet
      });

      const { result } = renderHook(() => useIsMobile());

      expect(result.current).toBe(false);
    });
  });
});
