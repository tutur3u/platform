import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { Task } from '@tuturuuu/types/primitives/Task';
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

function task(overrides: Partial<Task>): Task {
  return {
    created_at: '2026-05-07T00:00:00.000Z',
    display_number: 1,
    id: 'task-1',
    list_id: 'list-1',
    name: 'Task',
    ...overrides,
  };
}

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

  it('renders populated deadline panels before the regular kanban columns', () => {
    render(
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
        deadlineLabels={{
          overdue: 'Overdue',
          upcoming: 'Upcoming',
        }}
        deadlineSections={{
          overdue: [
            task({
              display_number: 42,
              end_date: '2026-05-06T00:00:00.000Z',
              id: 'overdue-task',
              list_id: 'list-1',
              name: 'Overdue task',
            }),
          ],
          upcoming: [],
        }}
      />
    );

    const deadlinePanels = screen.getByTestId('kanban-deadline-panels');
    const overdueSection = screen.getByTestId(
      'kanban-deadline-section-overdue'
    );
    const overdueCount = screen.getByTestId(
      'kanban-deadline-section-overdue-count'
    );
    const firstColumn = screen.getByTestId('column-list-1');
    const sharedTaskCard = screen.getByTestId('shared-task-card-overdue-task');

    expect(overdueSection).toHaveClass('border-dashed');
    expect(deadlinePanels).toHaveTextContent('Overdue');
    expect(overdueCount).toHaveTextContent('1');
    expect(sharedTaskCard).toHaveTextContent('Overdue task');
    expect(deadlinePanels.compareDocumentPosition(firstColumn)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );

    const overdueCardProps = taskCardMock.mock.calls.find(
      ([props]) => props.task.id === 'overdue-task'
    )?.[0];

    expect(overdueCardProps).toEqual(
      expect.objectContaining({
        boardId: 'board-1',
        dragDisabled: true,
        isMultiSelectMode: false,
        isPersonalWorkspace: false,
        isSelected: false,
        sortableId: 'deadline-overdue-overdue-task',
        taskList: lists[0],
        workspaceId: 'ws-1',
      })
    );
    expect(
      overdueCardProps.availableLists.map((list: TaskList) => list.id)
    ).toEqual(['list-1', 'list-2']);
  });

  it('filters deadline cards by document and external source controls', () => {
    render(
      <KanbanColumns
        columns={[...lists, externalList]}
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
        columnsId={[...lists, externalList].map((list) => list.id)}
        deadlineLabels={{
          filter: 'Filters',
          overdue: 'Overdue',
          showDocuments: 'Show document-list tasks',
          showExternalTasks: 'External tasks',
          upcoming: 'Upcoming',
        }}
        deadlineSections={{
          overdue: [],
          upcoming: [
            task({
              end_date: '2026-06-01T00:00:00.000Z',
              id: 'regular-deadline',
              list_id: 'list-1',
              name: 'Regular deadline task',
            }),
            task({
              end_date: '2026-06-02T00:00:00.000Z',
              id: 'document-deadline',
              list_id: 'list-1',
              name: 'Document deadline task',
              source_list_status: 'documents',
            }),
            task({
              end_date: '2026-06-03T00:00:00.000Z',
              id: 'external-deadline',
              list_id: 'external-list',
              name: 'External deadline task',
              source_workspace_id: 'source-ws',
            }),
          ],
        }}
      />
    );

    const upcomingSection = screen.getByTestId(
      'kanban-deadline-section-upcoming'
    );

    expect(
      screen.getByTestId('shared-task-card-regular-deadline')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('shared-task-card-document-deadline')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('shared-task-card-external-deadline')
    ).toBeInTheDocument();

    fireEvent.pointerDown(
      within(upcomingSection).getByRole('button', { name: 'Filters' }),
      { button: 0, ctrlKey: false }
    );
    fireEvent.click(
      screen.getByRole('menuitemcheckbox', {
        name: 'Show document-list tasks',
      })
    );
    fireEvent.click(
      screen.getByRole('menuitemcheckbox', { name: 'External tasks' })
    );

    expect(
      screen.getByTestId('shared-task-card-regular-deadline')
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('shared-task-card-document-deadline')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('shared-task-card-external-deadline')
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId('kanban-deadline-section-upcoming-count')
    ).toHaveTextContent('1');
  });

  it('sorts deadline cards using local deadline sort controls', () => {
    render(
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
        deadlineLabels={{
          overdue: 'Overdue',
          sort: 'Sort',
          sortNameAsc: 'Task name',
          upcoming: 'Upcoming',
        }}
        deadlineSections={{
          overdue: [],
          upcoming: [
            task({
              end_date: '2026-06-02T00:00:00.000Z',
              id: 'z-deadline',
              list_id: 'list-1',
              name: 'Zulu task',
            }),
            task({
              end_date: '2026-06-03T00:00:00.000Z',
              id: 'a-deadline',
              list_id: 'list-1',
              name: 'Alpha task',
            }),
          ],
        }}
      />
    );

    const upcomingSection = screen.getByTestId(
      'kanban-deadline-section-upcoming'
    );

    expect(
      within(upcomingSection)
        .getAllByTestId(/shared-task-card-/)
        .map((item) => item.textContent)
    ).toEqual(['Zulu task', 'Alpha task']);

    fireEvent.pointerDown(
      within(upcomingSection).getByRole('button', { name: 'Sort' }),
      { button: 0, ctrlKey: false }
    );
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Task name' }));

    expect(
      within(upcomingSection)
        .getAllByTestId(/shared-task-card-/)
        .map((item) => item.textContent)
    ).toEqual(['Alpha task', 'Zulu task']);
  });

  it('anchors the first load on the first real task list when empty special columns render to the left', () => {
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
          deadlineLabels={{
            overdue: 'Overdue',
            upcoming: 'Upcoming',
          }}
          deadlineSections={{
            overdue: [],
            upcoming: [],
          }}
          deadlineSectionsLoading
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
          deadlineLabels={{
            overdue: 'Overdue',
            upcoming: 'Upcoming',
          }}
          deadlineSections={{
            overdue: [],
            upcoming: [],
          }}
          deadlineSectionsLoading
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

  it('renders external deadline cards with their staging list context without exposing the staging list as a move target', () => {
    render(
      <KanbanColumns
        columns={[...lists, externalList]}
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
        columnsId={[...lists, externalList].map((list) => list.id)}
        deadlineLabels={{
          overdue: 'Overdue',
          upcoming: 'Upcoming',
        }}
        deadlineSections={{
          overdue: [],
          upcoming: [
            task({
              display_number: 99,
              end_date: '2026-06-01T00:00:00.000Z',
              id: 'external-deadline',
              list_id: 'external-list',
              name: 'External deadline task',
            }),
          ],
        }}
      />
    );

    expect(
      screen.getByTestId('kanban-deadline-task-card-external-deadline')
    ).toHaveClass('shrink-0');

    const externalCardProps = taskCardMock.mock.calls.find(
      ([props]) => props.task.id === 'external-deadline'
    )?.[0];

    expect(externalCardProps).toEqual(
      expect.objectContaining({
        taskList: externalList,
      })
    );
    expect(
      externalCardProps.availableLists.map((list: TaskList) => list.id)
    ).toEqual(['list-1', 'list-2']);
    expect(externalCardProps).toEqual(
      expect.objectContaining({
        deadlineContext: 'upcoming',
      })
    );
  });

  it('renders collapsed deadline sections with counts and expand labels', () => {
    render(
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
        deadlineLabels={{
          expandSection: (name) => `Expand ${name}`,
          overdue: 'Overdue',
          upcoming: 'Upcoming',
        }}
        deadlineSections={{
          overdue: [
            task({
              end_date: '2026-05-06T00:00:00.000Z',
              id: 'overdue-task',
              list_id: 'list-1',
              name: 'Overdue task',
            }),
          ],
          upcoming: [],
        }}
        deadlineSectionsCollapsed={{ overdue: true }}
      />
    );

    const collapsedOverdue = screen.getByTestId(
      'kanban-deadline-section-overdue-collapsed'
    );

    expect(collapsedOverdue).toHaveTextContent('Overdue');
    expect(collapsedOverdue).toHaveTextContent('1');
    expect(
      screen.getByRole('button', { name: 'Expand Overdue' })
    ).toBeInTheDocument();
  });

  it('keeps pinned deadline sections sticky without forcing them expanded', () => {
    render(
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
        deadlineLabels={{
          overdue: 'Overdue',
          upcoming: 'Upcoming',
        }}
        deadlineSections={{
          overdue: [],
          upcoming: [],
        }}
        deadlineSectionsCollapsed={{ overdue: true }}
        specialTaskListPins={{ overdue: true, upcoming: true }}
      />
    );

    const collapsedOverdue = screen.getByTestId(
      'kanban-deadline-section-overdue-collapsed'
    );
    const upcoming = screen.getByTestId('kanban-deadline-section-upcoming');

    expect(collapsedOverdue).toHaveAttribute(
      'data-kanban-pinned-special',
      'true'
    );
    expect(collapsedOverdue).toHaveClass('sticky');
    expect(collapsedOverdue.style.left).toBe(
      'calc(var(--kanban-snap-left-padding) + 0px)'
    );
    expect(upcoming).toHaveAttribute('data-kanban-pinned-special', 'true');
    expect(upcoming).toHaveClass('sticky');
    expect(upcoming.style.left).toBe(
      'calc(var(--kanban-snap-left-padding) + calc(3.5rem + 0.75rem))'
    );
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

  it('passes deadline tick props to upcoming deadline cards', () => {
    render(
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
        deadlineLabels={{
          overdue: 'Overdue',
          upcoming: 'Upcoming',
        }}
        deadlineNow={1_779_840_000_000}
        deadlineSections={{
          overdue: [],
          upcoming: [
            task({
              end_date: '2026-06-01T00:00:00.000Z',
              id: 'upcoming-task',
              list_id: 'list-1',
              name: 'Upcoming task',
            }),
          ],
        }}
      />
    );

    const upcomingCardProps = taskCardMock.mock.calls.find(
      ([props]) => props.task.id === 'upcoming-task'
    )?.[0];

    expect(upcomingCardProps).toEqual(
      expect.objectContaining({
        deadlineContext: 'upcoming',
        deadlineNow: 1_779_840_000_000,
      })
    );
  });

  it('reserves empty deadline panels before deadline tasks load', () => {
    const { container, rerender } = render(
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
        listStatusFilter="all"
        deadlineLabels={{
          overdue: 'Overdue',
          upcoming: 'Upcoming',
        }}
        deadlineSections={{ overdue: [], upcoming: [] }}
        deadlineSectionsLoading
      />
    );

    expect(screen.getByTestId('kanban-deadline-panels')).toBeInTheDocument();
    expect(
      screen.getByTestId('kanban-deadline-section-overdue')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('kanban-deadline-section-upcoming')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('kanban-deadline-section-overdue-count')
    ).toHaveTextContent('0');
    expect(
      screen.getByTestId('kanban-deadline-section-upcoming-count')
    ).toHaveTextContent('0');
    expect(
      screen.getByTestId('kanban-deadline-section-overdue-loading')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('kanban-deadline-section-upcoming-loading')
    ).toBeInTheDocument();
    expect(
      (container.firstElementChild as HTMLElement).style.getPropertyValue(
        '--kanban-column-width'
      )
    ).toContain('/ 4');
    expect(screen.getByTestId('column-list-1')).toBeInTheDocument();

    rerender(
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
        listStatusFilter="all"
        deadlineLabels={{
          overdue: 'Overdue',
          upcoming: 'Upcoming',
        }}
        deadlineSections={{ overdue: [], upcoming: [] }}
      />
    );

    expect(screen.getByTestId('kanban-deadline-panels')).toBeInTheDocument();
    expect(
      screen.queryByTestId('kanban-deadline-section-overdue-loading')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('kanban-deadline-section-upcoming-loading')
    ).not.toBeInTheDocument();
  });
});
