import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  setTaskPanelOpen,
  useIsTaskPanelOpen,
  useIsTaskPanelSurfaceActive,
  useTaskPanelSurface,
} from './task-panel-surface';

describe('task panel surface', () => {
  it('is active only while a board surface is mounted and enabled', () => {
    const active = renderHook(() => useIsTaskPanelSurfaceActive());
    expect(active.result.current).toBe(false);

    const board = renderHook(({ enabled }) => useTaskPanelSurface(enabled), {
      initialProps: { enabled: true },
    });
    expect(active.result.current).toBe(true);

    board.rerender({ enabled: false });
    expect(active.result.current).toBe(false);

    board.rerender({ enabled: true });
    board.unmount();
    expect(active.result.current).toBe(false);
  });

  it('reports when the side panel opens and closes', () => {
    const open = renderHook(() => useIsTaskPanelOpen());
    act(() => setTaskPanelOpen(true));
    expect(open.result.current).toBe(true);
    act(() => setTaskPanelOpen(false));
    expect(open.result.current).toBe(false);
  });
});
