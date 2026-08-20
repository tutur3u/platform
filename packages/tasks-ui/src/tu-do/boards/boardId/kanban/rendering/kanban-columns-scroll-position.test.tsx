import '@testing-library/jest-dom';
import { act, fireEvent, render } from '@testing-library/react';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KanbanColumns } from './kanban-columns';
import { getKanbanScrollStorageKey } from './kanban-scroll-position';

vi.mock('@dnd-kit/sortable', () => ({
  horizontalListSortingStrategy: vi.fn(),
  SortableContext: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock('../../board-column', () => ({
  BoardColumn: ({ column }: { column: TaskList }) => (
    <section data-kanban-real-column="true" data-testid={column.id} />
  ),
}));

vi.mock('../../task-list-form', () => ({ TaskListForm: () => null }));
vi.mock('../../task', () => ({ TaskCard: () => null }));
vi.mock('../../../../shared/cursor-overlay-multi-wrapper', () => ({
  default: () => null,
}));

const lists: TaskList[] = [
  {
    archived: false,
    board_id: 'board-1',
    color: 'BLUE',
    created_at: '2026-05-07T00:00:00.000Z',
    creator_id: 'user-1',
    deleted: false,
    id: 'list-1',
    name: 'To Do',
    position: 0,
    status: 'not_started',
  },
];

function renderColumns() {
  return render(
    <KanbanColumns
      columns={lists}
      tasks={[]}
      boardId="board-1"
      workspaceId="ws-1"
      isPersonalWorkspace
      disableSort={false}
      selectedTasks={new Set()}
      isMultiSelectMode={false}
      setIsMultiSelectMode={vi.fn()}
      onTaskSelect={vi.fn()}
      onClearSelection={vi.fn()}
      onUpdate={vi.fn()}
      createTask={vi.fn()}
      taskHeightsRef={{ current: new Map() }}
      optimisticUpdateInProgress={new Set()}
      bulkUpdateCustomDueDate={vi.fn()}
      boardRef={{ current: null }}
      columnsId={lists.map((list) => list.id)}
    />
  );
}

describe('KanbanColumns scroll position', () => {
  beforeEach(() => window.localStorage.clear());

  it('restores and saves the last horizontal position for each board', () => {
    vi.useFakeTimers();
    const frameCallbacks: FrameRequestCallback[] = [];
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const originalCancelAnimationFrame = window.cancelAnimationFrame;
    window.localStorage.setItem(getKanbanScrollStorageKey('board-1'), '784');
    window.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      frameCallbacks.push(callback);
      return frameCallbacks.length;
    });
    window.cancelAnimationFrame = vi.fn();

    try {
      const { container, unmount } = renderColumns();
      const scrollContainer = container.firstElementChild as HTMLElement;

      expect(scrollContainer.scrollLeft).toBe(784);
      expect(scrollContainer.style.scrollBehavior).toBe('auto');
      expect(scrollContainer.style.opacity).toBe('0');
      expect(scrollContainer.style.pointerEvents).toBe('none');
      act(() => {
        for (const callback of frameCallbacks.splice(0)) callback(0);
      });
      expect(scrollContainer.scrollLeft).toBe(784);
      expect(scrollContainer.style.scrollBehavior).toBe('auto');
      expect(scrollContainer.style.opacity).toBe('0');
      expect(scrollContainer.style.pointerEvents).toBe('none');
      scrollContainer.scrollLeft = 120;
      fireEvent.scroll(scrollContainer);
      expect(
        window.localStorage.getItem(getKanbanScrollStorageKey('board-1'))
      ).toBe('784');
      act(() => vi.advanceTimersByTime(250));
      act(() => {
        for (const callback of frameCallbacks.splice(0)) callback(0);
      });
      expect(scrollContainer.style.scrollBehavior).toBe('');
      expect(scrollContainer.style.opacity).toBe('');
      expect(scrollContainer.style.pointerEvents).toBe('');

      scrollContainer.scrollLeft = 1064;
      fireEvent.scroll(scrollContainer);
      act(() => {
        for (const callback of frameCallbacks.splice(0)) callback(0);
      });

      expect(
        window.localStorage.getItem(getKanbanScrollStorageKey('board-1'))
      ).toBe('1064');
      expect(
        window.localStorage.getItem(getKanbanScrollStorageKey('board-2'))
      ).toBeNull();

      scrollContainer.scrollLeft = 1180;
      fireEvent.scroll(scrollContainer);
      unmount();
      expect(
        window.localStorage.getItem(getKanbanScrollStorageKey('board-1'))
      ).toBe('1180');
    } finally {
      window.requestAnimationFrame = originalRequestAnimationFrame;
      window.cancelAnimationFrame = originalCancelAnimationFrame;
      vi.useRealTimers();
    }
  });
});
