/** @vitest-environment jsdom */

import { act, renderHook } from '@testing-library/react';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { useAutoCollapseEmptyTaskLists } from './use-auto-collapse-empty-task-lists';

const lists = [
  { id: 'empty', status: 'active' },
  { id: 'occupied', status: 'active' },
] as TaskList[];

function useHarness(
  counts: Array<{ list_id: string; count: number }>,
  manualCollapsePreferences: Record<string, boolean> = {},
  initialCollapsed: Record<string, boolean> = {}
) {
  const [collapsed, setCollapsed] =
    useState<Record<string, boolean>>(initialCollapsed);
  const recordManualChange = useAutoCollapseEmptyTaskLists({
    collapsed,
    enabled: true,
    listCounts: counts,
    lists,
    manualCollapsePreferences,
    setCollapsed,
  });
  return { collapsed, recordManualChange, setCollapsed };
}

describe('useAutoCollapseEmptyTaskLists', () => {
  it('collapses empty lists and expands them when tasks arrive', () => {
    const { result, rerender } = renderHook(
      ({ counts }) => useHarness(counts),
      {
        initialProps: {
          counts: [
            { list_id: 'empty', count: 0 },
            { list_id: 'occupied', count: 1 },
          ],
        },
      }
    );

    expect(result.current.collapsed.empty).toBe(true);

    rerender({
      counts: [
        { list_id: 'empty', count: 1 },
        { list_id: 'occupied', count: 1 },
      ],
    });
    expect(result.current.collapsed.empty).toBe(false);
  });

  it('respects a manual expansion while an empty list remains empty', () => {
    const { result, rerender } = renderHook(
      ({ counts }) => useHarness(counts),
      { initialProps: { counts: [{ list_id: 'empty', count: 0 }] } }
    );

    act(() => {
      result.current.recordManualChange('empty', false);
      result.current.setCollapsed((current) => ({
        ...current,
        empty: false,
      }));
    });
    rerender({ counts: [{ list_id: 'empty', count: 0 }] });

    expect(result.current.collapsed.empty).toBe(false);
  });

  it('keeps an explicitly expanded empty list expanded across restoration', () => {
    const { result, rerender } = renderHook(
      ({ counts }) => useHarness(counts, { empty: false }, { empty: true }),
      { initialProps: { counts: [{ list_id: 'empty', count: 0 }] } }
    );

    expect(result.current.collapsed.empty).not.toBe(true);

    rerender({ counts: [{ list_id: 'empty', count: 1 }] });
    rerender({ counts: [{ list_id: 'empty', count: 0 }] });

    expect(result.current.collapsed.empty).not.toBe(true);
  });

  it('keeps an explicitly collapsed populated list collapsed', () => {
    const { result } = renderHook(() =>
      useHarness(
        [{ list_id: 'occupied', count: 1 }],
        { occupied: true },
        { occupied: false }
      )
    );

    expect(result.current.collapsed.occupied).toBe(true);
  });
});
