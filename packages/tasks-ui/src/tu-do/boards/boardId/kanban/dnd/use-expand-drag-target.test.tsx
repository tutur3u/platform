import type { DndMonitorListener, DragOverEvent } from '@dnd-kit/core';
import { act, renderHook } from '@testing-library/react';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useExpandDragTarget } from './use-expand-drag-target';

let monitor: DndMonitorListener;
vi.mock('@dnd-kit/core', () => ({
  useDndMonitor: (listener: DndMonitorListener) => {
    monitor = listener;
  },
}));
const event = (id: string | null, type = 'Task') =>
  ({
    active: { data: { current: { type } } },
    over: id ? { id } : null,
  }) as unknown as DragOverEvent;
const column = { id: 'list', is_collapsed: true } as TaskList;
afterEach(() => vi.useRealTimers());

describe('collapsed task drop targets', () => {
  it('expands after a deliberate hover, without expanding lists passed briefly', () => {
    vi.useFakeTimers();
    const expand = vi.fn();
    renderHook(() =>
      useExpandDragTarget({
        column,
        readOnly: false,
        onTaskListCollapsedChange: expand,
      })
    );
    act(() => {
      monitor.onDragOver?.(event('list'));
      vi.advanceTimersByTime(399);
    });
    expect(expand).not.toHaveBeenCalled();
    act(() => {
      monitor.onDragOver?.(event(null));
      vi.advanceTimersByTime(400);
    });
    expect(expand).not.toHaveBeenCalled();
    act(() => {
      monitor.onDragOver?.(event('list'));
      vi.advanceTimersByTime(400);
    });
    expect(expand).toHaveBeenCalledExactlyOnceWith('list', false);
  });

  it('cancels pending expansion on drop, cancellation, and unmount', () => {
    vi.useFakeTimers();
    const expand = vi.fn();
    const { unmount } = renderHook(() =>
      useExpandDragTarget({
        column,
        readOnly: false,
        onTaskListCollapsedChange: expand,
      })
    );
    for (const cancel of [
      () => monitor.onDragEnd?.(event(null)),
      () => monitor.onDragCancel?.({} as never),
      unmount,
    ]) {
      act(() => {
        monitor.onDragOver?.(event('list'));
        cancel();
        vi.advanceTimersByTime(400);
      });
    }
    expect(expand).not.toHaveBeenCalled();
  });

  it('expands immediately when dropped before the hover delay elapses', () => {
    vi.useFakeTimers();
    const expand = vi.fn();
    renderHook(() =>
      useExpandDragTarget({
        column,
        readOnly: false,
        onTaskListCollapsedChange: expand,
      })
    );
    act(() => {
      monitor.onDragOver?.(event('list'));
      monitor.onDragEnd?.(event('list'));
      vi.advanceTimersByTime(400);
    });
    expect(expand).toHaveBeenCalledExactlyOnceWith('list', false);
  });

  it('ignores column reordering and expands external task targets with their own callback', () => {
    vi.useFakeTimers();
    const expand = vi.fn();
    renderHook(() =>
      useExpandDragTarget({
        column: { ...column, is_external_staging: true },
        readOnly: false,
        onExternalTasksCollapsedChange: expand,
      })
    );
    act(() => {
      monitor.onDragOver?.(event('list', 'Column'));
      vi.advanceTimersByTime(400);
    });
    expect(expand).not.toHaveBeenCalled();
    act(() => {
      monitor.onDragOver?.(event('list'));
      vi.advanceTimersByTime(400);
    });
    expect(expand).toHaveBeenCalledExactlyOnceWith(false);
  });
});
