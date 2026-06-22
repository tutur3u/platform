import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
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
  BoardColumn: ({ column }: { column: TaskList }) => (
    <section data-testid={`column-${column.id}`} />
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
    const firstColumn = screen.getByTestId('column-list-1');
    const sharedTaskCard = screen.getByTestId('shared-task-card-overdue-task');

    expect(deadlinePanels).toHaveTextContent('Overdue');
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

  it('omits deadline panels when both deadline sections are empty', () => {
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
        deadlineSections={{ overdue: [], upcoming: [] }}
      />
    );

    expect(screen.queryByTestId('kanban-deadline-panels')).toBeNull();
    expect(screen.getByTestId('column-list-1')).toBeInTheDocument();
  });
});
