'use client';

import { type KeyboardEvent, useCallback, useRef, useState } from 'react';

const ROW = '[data-notification-row]';

/**
 * Roving focus over notification rows: one row is tabbable, arrows/Home/End
 * move between rows, E toggles read state and Enter opens the row. Keys typed
 * inside a row's own controls are left to those controls.
 */
export function useNotificationRoving({
  rowIds,
  onToggle,
  onOpen,
}: {
  rowIds: string[];
  onToggle: (rowId: string) => void;
  onOpen: (rowId: string) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const current =
    activeId && rowIds.includes(activeId) ? activeId : (rowIds[0] ?? null);

  const focusRow = useCallback((id: string | undefined) => {
    if (!id) return;
    setActiveId(id);
    const element = [
      ...(containerRef.current?.querySelectorAll<HTMLElement>(ROW) ?? []),
    ].find((el) => el.dataset.notificationRow === id);
    element?.focus();
    element?.scrollIntoView?.({ block: 'nearest' });
  }, []);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      const row = (event.target as HTMLElement).closest<HTMLElement>(ROW);
      if (!row || row !== event.target) return;
      const id = row.dataset.notificationRow ?? '';
      const index = rowIds.indexOf(id);
      const move = (next: number) =>
        focusRow(rowIds[Math.max(0, Math.min(rowIds.length - 1, next))]);
      switch (event.key) {
        case 'ArrowDown':
          move(index + 1);
          break;
        case 'ArrowUp':
          move(index - 1);
          break;
        case 'Home':
          move(0);
          break;
        case 'End':
          move(rowIds.length - 1);
          break;
        case 'e':
        case 'E':
          if (event.metaKey || event.ctrlKey || event.altKey) return;
          onToggle(id);
          break;
        case 'Enter':
          onOpen(id);
          break;
        default:
          return;
      }
      event.preventDefault();
    },
    [rowIds, onToggle, onOpen, focusRow]
  );

  /** Moves focus off a row that is about to leave the list. */
  const focusNeighbor = useCallback(
    (id: string) => {
      const index = rowIds.indexOf(id);
      focusRow(rowIds[index + 1] ?? rowIds[index - 1]);
    },
    [rowIds, focusRow]
  );

  return {
    activeId: current,
    setActiveId,
    focusRow,
    onKeyDown,
    containerRef,
    focusNeighbor,
  };
}
