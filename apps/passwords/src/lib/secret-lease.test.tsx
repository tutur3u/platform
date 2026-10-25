import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSecretLease } from './secret-lease';

describe('useSecretLease', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('zeroes and drops the secret when its lifetime ends', () => {
    const { result } = renderHook(() => useSecretLease(60_000));
    const bytes = Uint8Array.of(1, 2, 3);
    act(() => result.current.hold('item', 'prod', bytes));
    expect(result.current.lease?.name).toBe('prod');
    act(() => vi.advanceTimersByTime(59_999));
    expect(result.current.lease).not.toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.lease).toBeNull();
    expect(Array.from(bytes)).toEqual([0, 0, 0]);
  });

  it('zeroes the previous secret when another is held and on unmount', () => {
    const { result, unmount } = renderHook(() => useSecretLease(60_000));
    const first = Uint8Array.of(9, 9);
    const second = Uint8Array.of(8, 8);
    act(() => result.current.hold('a', 'a', first));
    act(() => result.current.hold('b', 'b', second));
    expect(Array.from(first)).toEqual([0, 0]);
    unmount();
    expect(Array.from(second)).toEqual([0, 0]);
  });
});
