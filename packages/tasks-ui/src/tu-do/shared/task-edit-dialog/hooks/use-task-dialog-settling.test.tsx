import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_DESCRIPTION_SETTLE_MS } from '../constants';
import { useTaskDialogSettling } from './use-task-dialog-settling';

describe('task dialog delayed loading lifecycle', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  const initial = {
    isOpen: true,
    taskId: 'a',
    isHydratingTask: true,
    isYjsSyncing: false,
  };

  it('gives a delayed task load its own bounded description wait', () => {
    const { result, rerender } = renderHook(useTaskDialogSettling, {
      initialProps: initial,
    });
    act(() => vi.advanceTimersByTime(MAX_DESCRIPTION_SETTLE_MS * 2));
    expect(result.current).toBe(true);
    rerender({ ...initial, isHydratingTask: false, isYjsSyncing: true });
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(MAX_DESCRIPTION_SETTLE_MS - 1));
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe(false);
  });

  it('reveals loaded content immediately after durable hydration', () => {
    const { result, rerender } = renderHook(useTaskDialogSettling, {
      initialProps: initial,
    });
    rerender({ ...initial, isHydratingTask: false, isYjsSyncing: true });
    expect(result.current).toBe(true);
    rerender({ ...initial, isHydratingTask: false });
    expect(result.current).toBe(false);
  });

  it('resets the skeleton wait on reopen and task switch and closes its timers', () => {
    const syncing = { ...initial, isHydratingTask: false, isYjsSyncing: true };
    const { result, rerender, unmount } = renderHook(useTaskDialogSettling, {
      initialProps: syncing,
    });
    act(() => vi.advanceTimersByTime(MAX_DESCRIPTION_SETTLE_MS));
    expect(result.current).toBe(false);
    rerender({ ...syncing, isOpen: false });
    expect(vi.getTimerCount()).toBe(0);
    rerender(syncing);
    expect(result.current).toBe(true);
    act(() => vi.advanceTimersByTime(MAX_DESCRIPTION_SETTLE_MS));
    rerender({ ...syncing, taskId: 'b' });
    expect(result.current).toBe(true);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
