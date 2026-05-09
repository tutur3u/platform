import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
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
});
