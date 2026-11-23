import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePrepaidMonthCount } from './use-prepaid-month-count';

const query = vi.hoisted(() => ({ value: null as number | null }));

vi.mock('nuqs', () => ({
  useQueryState: () => [query.value, vi.fn()],
}));

describe('usePrepaidMonthCount', () => {
  beforeEach(() => {
    query.value = null;
  });

  it('defaults to a single month', () => {
    const { result } = renderHook(() => usePrepaidMonthCount());
    expect(result.current[0]).toBe(1);
  });

  it('starts at the range carried by the pending-list link', () => {
    query.value = 3;
    const { result } = renderHook(() => usePrepaidMonthCount());
    expect(result.current[0]).toBe(3);
  });

  it('clamps an out-of-range link value', () => {
    query.value = 40;
    const { result } = renderHook(() => usePrepaidMonthCount());
    expect(result.current[0]).toBe(12);
  });

  it('lets the operator reduce the pre-selected range', () => {
    query.value = 3;
    const { result } = renderHook(() => usePrepaidMonthCount());

    act(() => result.current[1](1));

    expect(result.current[0]).toBe(1);
  });
});
