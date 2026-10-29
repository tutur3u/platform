import '@testing-library/jest-dom';
import { act, render, screen } from '@testing-library/react';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_KANBAN_COLUMN_WIDTH } from './kanban-column-width';
import { KanbanColumns } from './kanban-columns';

const { cursorOverlayMock, taskCardMock } = vi.hoisted(() => ({
  cursorOverlayMock: vi.fn(),
  taskCardMock: vi.fn(),
}));

vi.mock('@dnd-kit/sortable', () => ({
  horizontalListSortingStrategy: vi.fn(),
  SortableContext: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock('../../board-column', () => ({
  BoardColumn: ({
    column,
    specialPinned,
    specialStickyOffset,
  }: {
    column: TaskList;
    specialPinned?: boolean;
    specialStickyOffset?: string;
  }) => (
    <section
      data-kanban-pinned-special={specialStickyOffset ? 'true' : undefined}
      data-kanban-real-column={column.is_external_staging ? undefined : 'true'}
      data-special-pinned={String(specialPinned === true)}
      data-special-sticky-offset={specialStickyOffset}
      data-testid={`column-${column.id}`}
    />
  ),
}));

vi.mock('../../task-list-form', () => ({
  TaskListForm: () => null,
}));

vi.mock('../../task', () => ({
  TaskCard: (props: Record<string, any>) => {
    taskCardMock(props);

    return (
      <article data-testid={`shared-task-card-${props.task.id}`}>
        {props.task.name}
      </article>
    );
  },
}));

vi.mock('../../../../shared/cursor-overlay-multi-wrapper', () => ({
  default: (props: Record<string, unknown>) => {
    cursorOverlayMock(props);
    return <div data-testid="cursor-overlay" />;
  },
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
  {
    archived: false,
    board_id: 'board-1',
    color: 'GREEN',
    created_at: '2026-05-07T00:00:00.000Z',
    creator_id: 'user-1',
    deleted: false,
    id: 'list-2',
    name: 'In Progress',
    position: 1,
    status: 'active',
  },
];

const externalList: TaskList = {
  archived: false,
  board_id: 'board-1',
  color: 'CYAN',
  created_at: '2026-05-07T00:00:00.000Z',
  creator_id: 'user-1',
  deleted: false,
  id: 'external-list',
  is_external_staging: true,
  name: 'External tasks',
  position: 2,
  status: 'active',
};

const collapsedClosedList: TaskList = {
  archived: false,
  board_id: 'board-1',
  color: 'PURPLE',
  created_at: '2026-05-07T00:00:00.000Z',
  creator_id: 'user-1',
  deleted: false,
  id: 'closed-list',
  is_collapsed: true,
  name: 'Closed',
  position: 3,
  status: 'closed',
};

function getMockRect(left: number, right: number) {
  return {
    bottom: 0,
    height: 0,
    left,
    right,
    toJSON: () => ({}),
    top: 0,
    width: right - left,
    x: left,
    y: 0,
  } as DOMRect;
}

describe('KanbanColumns', () => {
  beforeEach(() => {
    cursorOverlayMock.mockClear();
    taskCardMock.mockClear();
  });

  it('keeps filtered columns at the standard Kanban width', () => {
    const { container } = render(
      <KanbanColumns
        columns={lists.slice(1)}
        tasks={[]}
        boardId="board-1"
        workspaceId="ws-1"
        isPersonalWorkspace={false}
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
        listStatusFilter="active"
        bulkUpdateCustomDueDate={vi.fn()}
        boardRef={{ current: null }}
        columnsId={[lists[1]?.id ?? 'list-2']}
      />
    );

    expect(
      (container.firstElementChild as HTMLElement).style.getPropertyValue(
        '--kanban-column-width'
      )
    ).toBe(DEFAULT_KANBAN_COLUMN_WIDTH);
  });

  it('counts collapsed closed columns in dynamic width calculation', () => {
    const { container } = render(
      <KanbanColumns
        columns={[...lists, collapsedClosedList]}
        tasks={[]}
        boardId="board-1"
        workspaceId="ws-1"
        isPersonalWorkspace={false}
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
        listStatusFilter="all"
        bulkUpdateCustomDueDate={vi.fn()}
        boardRef={{ current: null }}
        columnsId={[...lists, collapsedClosedList].map((list) => list.id)}
      />
    );

    expect(
      (container.firstElementChild as HTMLElement).style.getPropertyValue(
        '--kanban-column-width'
      )
    ).toContain('3.5rem');
  });

  it('uses mandatory snapping on the measured scroll container', () => {
    const { container } = render(
      <KanbanColumns
        columns={lists}
        tasks={[]}
        boardId="board-1"
        workspaceId="ws-1"
        isPersonalWorkspace={false}
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

    expect(container.firstElementChild).toHaveClass('snap-mandatory');
    expect(container.firstElementChild).not.toHaveClass('snap-proximity');
  });

  it('keeps rendering board columns when cursor overlays are gated off', () => {
    render(
      <KanbanColumns
        columns={lists}
        tasks={[]}
        boardId="board-1"
        workspaceId="ws-1"
        isPersonalWorkspace={false}
        cursorsEnabled={false}
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

    expect(screen.getByTestId('column-list-1')).toBeInTheDocument();
    expect(screen.getByTestId('column-list-2')).toBeInTheDocument();
    expect(screen.queryByTestId('cursor-overlay')).not.toBeInTheDocument();
  });

  it('renders cursor overlays when cursor gating allows them', () => {
    render(
      <KanbanColumns
        columns={lists}
        tasks={[]}
        boardId="board-1"
        workspaceId="ws-1"
        isPersonalWorkspace={false}
        cursorsEnabled
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

    expect(screen.getByTestId('cursor-overlay')).toBeInTheDocument();
    expect(cursorOverlayMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channelName: 'board-realtime-board-1',
        cursorScope: { boardId: 'board-1', type: 'board' },
      })
    );
  });

  it('anchors the first load on the first real task list when the external staging list renders to the left', () => {
    const frameCallbacks: FrameRequestCallback[] = [];
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const originalCancelAnimationFrame = window.cancelAnimationFrame;

    window.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      frameCallbacks.push(callback);
      return frameCallbacks.length;
    });
    window.cancelAnimationFrame = vi.fn();

    try {
      const { container, rerender } = render(
        <KanbanColumns
          columns={[externalList, ...lists]}
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
          columnsId={[externalList, ...lists].map((list) => list.id)}
        />
      );
      const scrollContainer = container.firstElementChild as HTMLElement;
      const firstRealColumn = screen.getByTestId('column-list-1');
      Object.defineProperty(firstRealColumn, 'offsetLeft', {
        configurable: true,
        value: 320,
      });

      act(() => {
        for (const callback of frameCallbacks) callback(0);
      });

      expect(scrollContainer.scrollLeft).toBe(312);

      scrollContainer.scrollLeft = 64;
      rerender(
        <KanbanColumns
          columns={[externalList, ...lists]}
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
          columnsId={[externalList, ...lists].map((list) => list.id)}
        />
      );

      expect(scrollContainer.scrollLeft).toBe(64);
    } finally {
      window.requestAnimationFrame = originalRequestAnimationFrame;
      window.cancelAnimationFrame = originalCancelAnimationFrame;
    }
  });

  it('keeps the first real task list visible when pinned special lists are sticky', () => {
    const frameCallbacks: FrameRequestCallback[] = [];
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const originalCancelAnimationFrame = window.cancelAnimationFrame;
    const collapsedExternalList = {
      ...externalList,
      is_external_collapsed: true,
    };

    window.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      frameCallbacks.push(callback);
      return frameCallbacks.length;
    });
    window.cancelAnimationFrame = vi.fn();

    try {
      const { container } = render(
        <KanbanColumns
          columns={[collapsedExternalList, ...lists]}
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
          columnsId={[collapsedExternalList, ...lists].map((list) => list.id)}
          specialTaskListPins={{ external_tasks: true }}
        />
      );
      const scrollContainer = container.firstElementChild as HTMLElement;
      const firstRealColumn = screen.getByTestId('column-list-1');
      const pinnedExternalColumn = screen.getByTestId('column-external-list');

      Object.defineProperty(firstRealColumn, 'offsetLeft', {
        configurable: true,
        value: 320,
      });
      Object.defineProperty(pinnedExternalColumn, 'getBoundingClientRect', {
        configurable: true,
        value: () => getMockRect(8, 64),
      });

      act(() => {
        for (const callback of frameCallbacks) callback(0);
      });

      expect(scrollContainer.scrollLeft).toBe(256);
    } finally {
      window.requestAnimationFrame = originalRequestAnimationFrame;
      window.cancelAnimationFrame = originalCancelAnimationFrame;
    }
  });

  it('assigns sticky offsets to pinned external and closed task lists', () => {
    const collapsedExternalList = {
      ...externalList,
      is_external_collapsed: true,
    };

    render(
      <KanbanColumns
        columns={[collapsedExternalList, ...lists, collapsedClosedList]}
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
        columnsId={[collapsedExternalList, ...lists, collapsedClosedList].map(
          (list) => list.id
        )}
        specialTaskListPins={{ closed_tasks: true, external_tasks: true }}
      />
    );

    expect(screen.getByTestId('column-external-list')).toHaveAttribute(
      'data-special-pinned',
      'true'
    );
    expect(screen.getByTestId('column-external-list')).toHaveAttribute(
      'data-special-sticky-offset',
      '0px'
    );
    expect(screen.getByTestId('column-closed-list')).toHaveAttribute(
      'data-special-pinned',
      'true'
    );
    expect(screen.getByTestId('column-closed-list')).toHaveAttribute(
      'data-special-sticky-offset',
      'calc(3.5rem + 0.75rem)'
    );
  });
});
