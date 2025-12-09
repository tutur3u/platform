import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useStableArray } from '../use-stable-array';

describe('useStableArray', () => {
  describe('basic functionality', () => {
    it('should return the same array reference for identical content', () => {
      const initialArray = [1, 2, 3];
      const { result, rerender } = renderHook(
        ({ array }) => useStableArray(array),
        { initialProps: { array: initialArray } }
      );

      const firstResult = result.current;

      // Re-render with a new array instance but same content
      rerender({ array: [1, 2, 3] });

      expect(result.current).toBe(firstResult);
    });

    it('should return a new reference when content changes', () => {
      const { result, rerender } = renderHook(
        ({ array }) => useStableArray(array),
        { initialProps: { array: [1, 2, 3] } }
      );

      const firstResult = result.current;

      // Re-render with different content
      rerender({ array: [1, 2, 4] });

      expect(result.current).not.toBe(firstResult);
      expect(result.current).toEqual([1, 2, 4]);
    });

    it('should detect length changes', () => {
      const { result, rerender } = renderHook(
        ({ array }) => useStableArray(array),
        { initialProps: { array: [1, 2, 3] } }
      );

      const firstResult = result.current;

      // Re-render with different length
      rerender({ array: [1, 2] });

      expect(result.current).not.toBe(firstResult);
      expect(result.current).toEqual([1, 2]);
    });

    it('should detect additions', () => {
      const { result, rerender } = renderHook(
        ({ array }) => useStableArray(array),
        { initialProps: { array: [1, 2] } }
      );

      const firstResult = result.current;

      // Add element
      rerender({ array: [1, 2, 3] });

      expect(result.current).not.toBe(firstResult);
      expect(result.current).toEqual([1, 2, 3]);
    });
  });

  describe('with different types', () => {
    it('should work with strings', () => {
      const { result, rerender } = renderHook(
        ({ array }) => useStableArray(array),
        { initialProps: { array: ['a', 'b', 'c'] } }
      );

      const firstResult = result.current;

      // Same content
      rerender({ array: ['a', 'b', 'c'] });
      expect(result.current).toBe(firstResult);

      // Different content
      rerender({ array: ['a', 'b', 'd'] });
      expect(result.current).not.toBe(firstResult);
    });

    it('should work with objects (reference comparison)', () => {
      const obj1 = { id: 1 };
      const obj2 = { id: 2 };

      const { result, rerender } = renderHook(
        ({ array }) => useStableArray(array),
        { initialProps: { array: [obj1, obj2] } }
      );

      const firstResult = result.current;

      // Same object references
      rerender({ array: [obj1, obj2] });
      expect(result.current).toBe(firstResult);

      // New object references (even with same content)
      rerender({ array: [{ id: 1 }, { id: 2 }] });
      expect(result.current).not.toBe(firstResult);
    });

    it('should work with null/undefined values', () => {
      const { result, rerender } = renderHook(
        ({ array }) => useStableArray(array),
        {
          initialProps: {
            array: [null, undefined, 1] as (number | null | undefined)[],
          },
        }
      );

      const firstResult = result.current;

      // Same content
      rerender({ array: [null, undefined, 1] });
      expect(result.current).toBe(firstResult);
    });

    it('should work with boolean values', () => {
      const { result, rerender } = renderHook(
        ({ array }) => useStableArray(array),
        { initialProps: { array: [true, false, true] } }
      );

      const firstResult = result.current;

      // Same content
      rerender({ array: [true, false, true] });
      expect(result.current).toBe(firstResult);

      // Different content
      rerender({ array: [false, false, true] });
      expect(result.current).not.toBe(firstResult);
    });
  });

  describe('edge cases', () => {
    it('should handle empty arrays', () => {
      const { result, rerender } = renderHook(
        ({ array }) => useStableArray(array),
        { initialProps: { array: [] as number[] } }
      );

      const firstResult = result.current;

      // Another empty array
      rerender({ array: [] });
      expect(result.current).toBe(firstResult);

      // Non-empty array
      rerender({ array: [1] });
      expect(result.current).not.toBe(firstResult);
    });

    it('should handle single element arrays', () => {
      const { result, rerender } = renderHook(
        ({ array }) => useStableArray(array),
        { initialProps: { array: [1] } }
      );

      const firstResult = result.current;

      // Same content
      rerender({ array: [1] });
      expect(result.current).toBe(firstResult);

      // Different content
      rerender({ array: [2] });
      expect(result.current).not.toBe(firstResult);
    });

    it('should handle large arrays', () => {
      const largeArray = Array.from({ length: 1000 }, (_, i) => i);
      const { result, rerender } = renderHook(
        ({ array }) => useStableArray(array),
        { initialProps: { array: largeArray } }
      );

      const firstResult = result.current;

      // Same content
      rerender({ array: [...largeArray] });
      expect(result.current).toBe(firstResult);

      // Change last element
      const modifiedArray = [...largeArray];
      modifiedArray[999] = 9999;
      rerender({ array: modifiedArray });
      expect(result.current).not.toBe(firstResult);
    });
  });

  describe('multiple re-renders', () => {
    it('should maintain stability across multiple re-renders', () => {
      const { result, rerender } = renderHook(
        ({ array }) => useStableArray(array),
        { initialProps: { array: [1, 2, 3] } }
      );

      const firstResult = result.current;

      // Multiple re-renders with same content
      for (let i = 0; i < 10; i++) {
        rerender({ array: [1, 2, 3] });
      }

      expect(result.current).toBe(firstResult);
    });
  });
});
