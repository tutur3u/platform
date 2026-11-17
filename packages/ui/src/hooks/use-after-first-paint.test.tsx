import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAfterFirstPaint } from './use-after-first-paint';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('is false on the first render and true once the browser is idle', () => {
  let idle: (() => void) | undefined;
  vi.stubGlobal('requestIdleCallback', (callback: () => void) => {
    idle = callback;
    return 1;
  });
  vi.stubGlobal('cancelIdleCallback', vi.fn());
  const { result } = renderHook(() => useAfterFirstPaint());
  expect(result.current).toBe(false);
  act(() => idle?.());
  expect(result.current).toBe(true);
});

it('opens after the idle cap when the browser never reports idle', () => {
  vi.stubGlobal('requestIdleCallback', () => 1);
  vi.stubGlobal('cancelIdleCallback', vi.fn());
  const { result } = renderHook(() => useAfterFirstPaint());
  act(() => vi.advanceTimersByTime(1499));
  expect(result.current).toBe(false);
  act(() => vi.advanceTimersByTime(1));
  expect(result.current).toBe(true);
});

it('uses a short delay without the idle API', () => {
  vi.stubGlobal('requestIdleCallback', undefined);
  const { result } = renderHook(() => useAfterFirstPaint());
  expect(result.current).toBe(false);
  act(() => vi.advanceTimersByTime(250));
  expect(result.current).toBe(true);
});

it('cancels pending work on unmount', () => {
  const cancel = vi.fn();
  vi.stubGlobal('requestIdleCallback', () => 7);
  vi.stubGlobal('cancelIdleCallback', cancel);
  const { unmount } = renderHook(() => useAfterFirstPaint());
  unmount();
  expect(cancel).toHaveBeenCalledWith(7);
  expect(vi.getTimerCount()).toBe(0);
});
