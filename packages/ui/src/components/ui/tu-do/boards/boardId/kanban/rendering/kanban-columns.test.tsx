import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_KANBAN_COLUMN_WIDTH } from './kanban-column-width';
import { KanbanColumns } from './kanban-columns';

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

vi.mock('../../../../shared/cursor-overlay-multi-wrapper', () => ({
  default: () => <div data-testid="cursor-overlay" />,
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

describe('KanbanColumns', () => {
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
        dragPreviewPosition={null}
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
        dragPreviewPosition={null}
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
        dragPreviewPosition={null}
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
        dragPreviewPosition={null}
        taskHeightsRef={{ current: new Map() }}
        optimisticUpdateInProgress={new Set()}
        bulkUpdateCustomDueDate={vi.fn()}
        boardRef={{ current: null }}
        columnsId={lists.map((list) => list.id)}
      />
    );

    expect(screen.getByTestId('cursor-overlay')).toBeInTheDocument();
  });
});
