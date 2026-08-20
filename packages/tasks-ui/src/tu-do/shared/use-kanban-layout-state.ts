'use client';

import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import {
  type MutableRefObject,
  useCallback,
  useLayoutEffect,
  useState,
} from 'react';
import type {
  KanbanDeadlineCollapsedState,
  KanbanDeadlineSection,
} from '../boards/boardId/kanban/rendering/kanban-deadline-panels';

const EXTERNAL_TASKS_COLLAPSED_STORAGE_PREFIX =
  'personal-board-external-tasks-collapsed';
const TASK_LIST_COLLAPSED_STORAGE_PREFIX = 'task-board-list-collapsed';
const LEGACY_CLOSED_TASK_LIST_COLLAPSED_STORAGE_PREFIX =
  'task-board-closed-list-collapsed';
const DEADLINE_SECTION_COLLAPSED_STORAGE_PREFIX =
  'task-board-deadline-section-collapsed';

function getTaskListCollapsedStorageKey(boardId: string, listId: string) {
  return `${TASK_LIST_COLLAPSED_STORAGE_PREFIX}:${boardId}:${listId}`;
}

function getLegacyClosedTaskListCollapsedStorageKey(
  boardId: string,
  listId: string
) {
  return `${LEGACY_CLOSED_TASK_LIST_COLLAPSED_STORAGE_PREFIX}:${boardId}:${listId}`;
}

function getDeadlineSectionCollapsedStorageKey(
  boardId: string,
  section: KanbanDeadlineSection
) {
  return `${DEADLINE_SECTION_COLLAPSED_STORAGE_PREFIX}:${boardId}:${section}`;
}

function parseStoredBoolean(value: string | null) {
  return value === null ? null : value === 'true';
}

interface UseKanbanLayoutStateOptions {
  boardId: string;
  lists: TaskList[];
  manualCollapseChangeRef: MutableRefObject<
    (listId: string, collapsed: boolean) => void
  >;
  persistCollapsedTaskLists: boolean;
  personalWorkspace: boolean;
}

export function useKanbanLayoutState({
  boardId,
  lists,
  manualCollapseChangeRef,
  persistCollapsedTaskLists,
  personalWorkspace,
}: UseKanbanLayoutStateOptions) {
  const [externalTasksCollapsed, setExternalTasksCollapsed] = useState(false);
  const [taskListsCollapsed, setTaskListsCollapsed] = useState<
    Record<string, boolean>
  >({});
  const [deadlineSectionsCollapsed, setDeadlineSectionsCollapsed] =
    useState<KanbanDeadlineCollapsedState>({});
  const [restoredBoardId, setRestoredBoardId] = useState<string | null>(null);

  useLayoutEffect(() => {
    const canReadStorage =
      persistCollapsedTaskLists && typeof window !== 'undefined';
    const sameBoard = restoredBoardId === boardId;
    const visibleLists = lists.filter((list) => !list.deleted);

    setExternalTasksCollapsed((previous) => {
      if (!personalWorkspace) return false;
      const stored = canReadStorage
        ? parseStoredBoolean(
            window.localStorage.getItem(
              `${EXTERNAL_TASKS_COLLAPSED_STORAGE_PREFIX}:${boardId}`
            )
          )
        : null;
      return stored ?? (sameBoard ? previous : true);
    });

    setTaskListsCollapsed((previous) => {
      const next: Record<string, boolean> = {};
      for (const list of visibleLists) {
        const stored = canReadStorage
          ? parseStoredBoolean(
              window.localStorage.getItem(
                getTaskListCollapsedStorageKey(boardId, list.id)
              ) ??
                (list.status === 'closed'
                  ? window.localStorage.getItem(
                      getLegacyClosedTaskListCollapsedStorageKey(
                        boardId,
                        list.id
                      )
                    )
                  : null)
            )
          : null;
        next[list.id] =
          stored ??
          (sameBoard ? previous[list.id] : undefined) ??
          list.status === 'closed';
      }
      return next;
    });

    setDeadlineSectionsCollapsed((previous) => {
      const next: KanbanDeadlineCollapsedState = {};
      for (const section of ['overdue', 'upcoming'] as const) {
        const stored = canReadStorage
          ? parseStoredBoolean(
              window.localStorage.getItem(
                getDeadlineSectionCollapsedStorageKey(boardId, section)
              )
            )
          : null;
        next[section] = stored ?? (sameBoard ? previous[section] : true);
      }
      return next;
    });

    setRestoredBoardId(boardId);
  }, [
    boardId,
    lists,
    persistCollapsedTaskLists,
    personalWorkspace,
    restoredBoardId,
  ]);

  const handleExternalTasksCollapsedChange = useCallback(
    (collapsed: boolean) => {
      setExternalTasksCollapsed(collapsed);
      if (
        !persistCollapsedTaskLists ||
        !personalWorkspace ||
        typeof window === 'undefined'
      )
        return;
      window.localStorage.setItem(
        `${EXTERNAL_TASKS_COLLAPSED_STORAGE_PREFIX}:${boardId}`,
        String(collapsed)
      );
    },
    [boardId, persistCollapsedTaskLists, personalWorkspace]
  );

  const persistTaskListCollapsed = useCallback(
    (listId: string, collapsed: boolean) => {
      if (!persistCollapsedTaskLists || typeof window === 'undefined') return;
      window.localStorage.setItem(
        getTaskListCollapsedStorageKey(boardId, listId),
        String(collapsed)
      );
      if (
        lists.some((list) => list.id === listId && list.status === 'closed')
      ) {
        window.localStorage.setItem(
          getLegacyClosedTaskListCollapsedStorageKey(boardId, listId),
          String(collapsed)
        );
      }
    },
    [boardId, lists, persistCollapsedTaskLists]
  );

  const handleTaskListCollapsedChange = useCallback(
    (listId: string, collapsed: boolean) => {
      manualCollapseChangeRef.current(listId, collapsed);
      setTaskListsCollapsed((previous) => ({
        ...previous,
        [listId]: collapsed,
      }));
      persistTaskListCollapsed(listId, collapsed);
    },
    [manualCollapseChangeRef, persistTaskListCollapsed]
  );

  const handleDeadlineSectionCollapsedChange = useCallback(
    (section: KanbanDeadlineSection, collapsed: boolean) => {
      setDeadlineSectionsCollapsed((previous) => ({
        ...previous,
        [section]: collapsed,
      }));
      if (!persistCollapsedTaskLists || typeof window === 'undefined') return;
      window.localStorage.setItem(
        getDeadlineSectionCollapsedStorageKey(boardId, section),
        String(collapsed)
      );
    },
    [boardId, persistCollapsedTaskLists]
  );

  return {
    deadlineSectionsCollapsed,
    externalTasksCollapsed,
    handleDeadlineSectionCollapsedChange,
    handleExternalTasksCollapsedChange,
    handleTaskListCollapsedChange,
    kanbanLayoutRestored: restoredBoardId === boardId,
    persistTaskListCollapsed,
    setTaskListsCollapsed,
    taskListsCollapsed,
  };
}
