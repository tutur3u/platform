import { act, renderHook } from '@testing-library/react';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useKanbanLayoutState } from './use-kanban-layout-state';

const lists: TaskList[] = [
  {
    archived: false,
    board_id: 'board-1',
    color: 'BLUE',
    created_at: '2026-08-20T00:00:00.000Z',
    creator_id: 'user-1',
    deleted: false,
    id: 'list-1',
    name: 'To Do',
    position: 0,
    status: 'not_started',
  },
  {
    archived: false,
    board_id: 'board-1',
    color: 'GREEN',
    created_at: '2026-08-20T00:00:00.000Z',
    creator_id: 'user-1',
    deleted: false,
    id: 'list-2',
    name: 'Done',
    position: 1,
    status: 'done',
  },
];

describe('useKanbanLayoutState', () => {
  beforeEach(() => window.localStorage.clear());

  it('restores every board layout preference in the layout phase', () => {
    window.localStorage.setItem(
      'personal-board-external-tasks-collapsed:board-1',
      'false'
    );
    window.localStorage.setItem(
      'task-board-list-collapsed:board-1:list-1',
      'true'
    );
    window.localStorage.setItem(
      'task-board-deadline-section-collapsed:board-1:overdue',
      'false'
    );
    const manualRef = { current: vi.fn() };

    const { result } = renderHook(() =>
      useKanbanLayoutState({
        boardId: 'board-1',
        lists,
        manualCollapseChangeRef: manualRef,
        persistCollapsedTaskLists: true,
        personalWorkspace: true,
      })
    );

    expect(result.current.kanbanLayoutRestored).toBe(true);
    expect(result.current.externalTasksCollapsed).toBe(false);
    expect(result.current.taskListsCollapsed).toMatchObject({
      'list-1': true,
      'list-2': false,
    });
    expect(result.current.deadlineSectionsCollapsed).toMatchObject({
      overdue: false,
      upcoming: true,
    });
  });

  it('keeps the current session state when persistence is disabled later', () => {
    const manualRef = { current: vi.fn() };
    const { result, rerender } = renderHook(
      ({ persist }) =>
        useKanbanLayoutState({
          boardId: 'board-1',
          lists,
          manualCollapseChangeRef: manualRef,
          persistCollapsedTaskLists: persist,
          personalWorkspace: true,
        }),
      { initialProps: { persist: true } }
    );

    act(() => result.current.handleTaskListCollapsedChange('list-1', true));
    act(() => result.current.handleExternalTasksCollapsedChange(false));
    rerender({ persist: false });

    expect(result.current.taskListsCollapsed['list-1']).toBe(true);
    expect(result.current.externalTasksCollapsed).toBe(false);
  });
});
