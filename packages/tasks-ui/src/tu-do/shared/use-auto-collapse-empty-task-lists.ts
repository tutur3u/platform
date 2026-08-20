'use client';

import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';

type ListCount = { list_id: string; count: number };

export function useAutoCollapseEmptyTaskLists({
  enabled,
  collapsed,
  listCounts,
  lists,
  manualCollapsePreferences,
  setCollapsed,
}: {
  enabled: boolean;
  collapsed: Record<string, boolean>;
  listCounts?: ListCount[] | null;
  lists: Array<TaskList & { is_external_staging?: boolean }>;
  manualCollapsePreferences: Record<string, boolean>;
  setCollapsed: Dispatch<SetStateAction<Record<string, boolean>>>;
}) {
  const autoCollapsedIds = useRef(new Set<string>());
  const manuallyExpandedEmptyIds = useRef(new Set<string>());
  const countByListId = useMemo(
    () => new Map(listCounts?.map(({ list_id, count }) => [list_id, count])),
    [listCounts]
  );

  useLayoutEffect(() => {
    if (!listCounts) return;

    const next = { ...collapsed };
    const changes: Array<[string, boolean]> = [];

    for (const list of lists) {
      if (list.is_external_staging) continue;
      const isEmpty = (countByListId.get(list.id) ?? 0) === 0;
      const wasAutoCollapsed = autoCollapsedIds.current.has(list.id);
      const manualPreference = manualCollapsePreferences[list.id];
      const isManuallyExpanded =
        manualPreference === false ||
        manuallyExpandedEmptyIds.current.has(list.id);

      if (manualPreference !== undefined) {
        if (next[list.id] !== manualPreference) {
          next[list.id] = manualPreference;
          changes.push([list.id, manualPreference]);
        }
        autoCollapsedIds.current.delete(list.id);
        if (manualPreference) {
          manuallyExpandedEmptyIds.current.delete(list.id);
        }
      } else if (!enabled) {
        if (wasAutoCollapsed && next[list.id]) {
          next[list.id] = false;
          changes.push([list.id, false]);
        }
        autoCollapsedIds.current.delete(list.id);
        manuallyExpandedEmptyIds.current.delete(list.id);
      } else if (isEmpty && !isManuallyExpanded) {
        if (!next[list.id]) {
          next[list.id] = true;
          changes.push([list.id, true]);
        }
        autoCollapsedIds.current.add(list.id);
      } else if (!isEmpty) {
        manuallyExpandedEmptyIds.current.delete(list.id);
        if (wasAutoCollapsed && next[list.id]) {
          next[list.id] = false;
          changes.push([list.id, false]);
        }
        autoCollapsedIds.current.delete(list.id);
      }
    }

    if (changes.length === 0) return;
    setCollapsed(next);
  }, [
    collapsed,
    countByListId,
    enabled,
    listCounts,
    lists,
    manualCollapsePreferences,
    setCollapsed,
  ]);

  return useCallback(
    (listId: string, collapsed: boolean) => {
      const isEmpty = (countByListId.get(listId) ?? 0) === 0;
      autoCollapsedIds.current.delete(listId);
      if (enabled && isEmpty && !collapsed) {
        manuallyExpandedEmptyIds.current.add(listId);
      } else {
        manuallyExpandedEmptyIds.current.delete(listId);
      }
    },
    [countByListId, enabled]
  );
}
