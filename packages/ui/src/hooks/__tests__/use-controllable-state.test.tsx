import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useControllableState } from '../use-controllable-state';

describe('useControllableState', () => {
  describe('uncontrolled', () => {
    it('starts from defaultProp and updates internal state', () => {
      const onChange = vi.fn();
      const { result } = renderHook(() =>
        useControllableState<number>({ defaultProp: 1, onChange })
      );

      expect(result.current[0]).toBe(1);
      expect(onChange).not.toHaveBeenCalled();

      act(() => {
        result.current[1](2);
      });

      expect(result.current[0]).toBe(2);
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(2);
    });

    it('supports functional updates', () => {
      const { result } = renderHook(() =>
        useControllableState<number>({ defaultProp: 5 })
      );

      act(() => {
        result.current[1]((prev) => (prev ?? 0) + 1);
      });

      expect(result.current[0]).toBe(6);
    });

    it('does not call onChange when the value is unchanged', () => {
      const onChange = vi.fn();
      const { result } = renderHook(() =>
        useControllableState<string>({ defaultProp: 'a', onChange })
      );

      act(() => {
        result.current[1]('a');
      });

      expect(onChange).not.toHaveBeenCalled();
    });

    it('uses the latest onChange without re-subscribing', () => {
      const first = vi.fn();
      const second = vi.fn();
      const { result, rerender } = renderHook(
        ({ onChange }) =>
          useControllableState<number>({ defaultProp: 0, onChange }),
        { initialProps: { onChange: first } }
      );
      const setValue = result.current[1];

      rerender({ onChange: second });
      act(() => {
        setValue(1);
      });

      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledWith(1);
    });

    it('works without an onChange callback', () => {
      const { result } = renderHook(() =>
        useControllableState<boolean>({ defaultProp: false })
      );

      act(() => {
        result.current[1](true);
      });

      expect(result.current[0]).toBe(true);
    });
  });

  describe('controlled', () => {
    it('returns prop and reports changes without storing them', () => {
      const onChange = vi.fn();
      const { result } = renderHook(() =>
        useControllableState<number>({ prop: 10, defaultProp: 1, onChange })
      );

      expect(result.current[0]).toBe(10);

      act(() => {
        result.current[1](11);
      });

      expect(result.current[0]).toBe(10);
      expect(onChange).toHaveBeenCalledWith(11);
    });

    it('passes the current prop to functional updates', () => {
      const onChange = vi.fn();
      const { result } = renderHook(() =>
        useControllableState<number>({ prop: 3, onChange })
      );

      act(() => {
        result.current[1]((prev) => (prev ?? 0) * 2);
      });

      expect(onChange).toHaveBeenCalledWith(6);
    });

    it('skips onChange when the next value equals prop', () => {
      const onChange = vi.fn();
      const { result } = renderHook(() =>
        useControllableState<number>({ prop: 3, onChange })
      );

      act(() => {
        result.current[1](3);
      });

      expect(onChange).not.toHaveBeenCalled();
    });

    it('follows prop changes from the parent', () => {
      const { result, rerender } = renderHook(
        ({ prop }) => useControllableState<string>({ prop }),
        { initialProps: { prop: 'x' } }
      );

      rerender({ prop: 'y' });

      expect(result.current[0]).toBe('y');
    });
  });
});
