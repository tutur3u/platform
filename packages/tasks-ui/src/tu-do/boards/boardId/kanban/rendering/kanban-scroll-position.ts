const KANBAN_SCROLL_STORAGE_PREFIX = 'task-board-kanban-scroll';

export function getKanbanScrollStorageKey(boardId: string) {
  return `${KANBAN_SCROLL_STORAGE_PREFIX}:${boardId}`;
}

export function readKanbanScrollPosition(boardId: string) {
  if (!boardId || typeof window === 'undefined') return null;
  const value = Number.parseFloat(
    window.localStorage.getItem(getKanbanScrollStorageKey(boardId)) ?? ''
  );
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export function saveKanbanScrollPosition(boardId: string, scrollLeft: number) {
  if (
    !boardId ||
    typeof window === 'undefined' ||
    !Number.isFinite(scrollLeft) ||
    scrollLeft < 0
  )
    return;
  window.localStorage.setItem(
    getKanbanScrollStorageKey(boardId),
    String(scrollLeft)
  );
}
