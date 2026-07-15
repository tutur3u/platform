import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TasksTab } from '../tasks-tab';

const captured = vi.hoisted(() => ({
  boardHeaderProps: undefined as any,
  kanbanProps: undefined as any,
  listViewProps: undefined as any,
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@tuturuuu/tasks-ui/tu-do/tasks-route-context', () => ({
  useTasksHref: () => (path: string) => `/tasks${path}`,
}));

vi.mock('@tuturuuu/tasks-ui/tu-do/shared/progressive-loader-context', () => ({
  ProgressiveLoaderProvider: ({ children }: any) => (
    <div data-testid="progressive-loader">{children}</div>
  ),
}));

vi.mock('@tuturuuu/tasks-ui/tu-do/shared/board-header', () => ({
  BoardHeader: (props: any) => {
    captured.boardHeaderProps = props;
    return <div data-testid="board-header" />;
  },
}));

vi.mock('@tuturuuu/tasks-ui/tu-do/boards/boardId/kanban', () => ({
  KanbanBoard: (props: any) => {
    captured.kanbanProps = props;
    return <div data-testid="kanban-board" />;
  },
}));

vi.mock('@tuturuuu/tasks-ui/tu-do/shared/list-view', () => ({
  ListView: (props: any) => {
    captured.listViewProps = props;
    return <div data-testid="list-view" />;
  },
}));

vi.mock('@tuturuuu/tasks-ui/tu-do/boards/boardId/timeline-board', () => ({
  TimelineBoard: () => <div data-testid="timeline-board" />,
}));

const lists: TaskList[] = [
  {
    archived: false,
    board_id: 'board-1',
    color: 'BLUE',
    created_at: '2026-06-01T00:00:00.000Z',
    creator_id: 'user-1',
    deleted: false,
    id: 'list-1',
    name: 'Todo',
    position: 0,
    status: 'active',
  },
];

const tasks: Task[] = [
  {
    assignees: [],
    created_at: '2026-06-01T00:00:00.000Z',
    display_number: 1,
    end_date: null,
    id: 'task-1',
    labels: [],
    list_id: 'list-1',
    name: 'Align project board',
    priority: 'normal',
    sort_key: 1,
  },
];

const filters = {
  assignees: [],
  dueDateRange: null,
  estimationRange: null,
  includeMyTasks: false,
  includeUnassigned: false,
  labels: [],
  priorities: [],
  projects: [],
  searchQuery: 'project',
  sortBy: 'priority-high',
  sourceBoardIds: [],
  sourceScope: 'all_visible',
  sourceWorkspaceIds: [],
} as const;

function renderTasksTab(
  overrides?: Partial<React.ComponentProps<typeof TasksTab>>
) {
  return render(
    <TasksTab
      workspace={{ id: 'ws-1', personal: false } as any}
      wsId="ws-1"
      projectId="project-1"
      projectName="Project One"
      tasks={tasks}
      lists={lists}
      currentUserId="user-1"
      currentView="kanban"
      setCurrentView={vi.fn()}
      filters={filters as any}
      setFilters={vi.fn()}
      listStatusFilter="active"
      setListStatusFilter={vi.fn()}
      setShowLinkTaskDialog={vi.fn()}
      onTaskPartialUpdate={vi.fn()}
      isMultiSelectMode={false}
      setIsMultiSelectMode={vi.fn()}
      {...overrides}
    />
  );
}

describe('TasksTab layout', () => {
  beforeEach(() => {
    captured.boardHeaderProps = undefined;
    captured.kanbanProps = undefined;
    captured.listViewProps = undefined;
  });

  it('uses a board-like overflow shell for populated project tasks', () => {
    renderTasksTab();

    expect(screen.getByTestId('task-project-tasks-tab')).toHaveClass(
      'min-h-0',
      'overflow-hidden'
    );
    expect(screen.getByTestId('task-project-tasks-header')).toHaveClass(
      'shrink-0'
    );
    expect(screen.getByTestId('task-project-tasks-view')).toHaveClass(
      'min-h-0',
      'flex-1',
      'overflow-hidden'
    );

    expect(captured.boardHeaderProps.backUrl).toBe('/ws-1/tasks/projects');
    expect(captured.kanbanProps.disableSort).toBe(true);
    expect(captured.kanbanProps.listStatusFilter).toBe('active');
    expect(captured.kanbanProps.filters).toBe(filters);
  });

  it('keeps list view sorting and search aligned with board views', () => {
    renderTasksTab({ currentView: 'list' });

    expect(screen.getByTestId('list-view')).toBeInTheDocument();
    expect(captured.listViewProps.preserveTaskOrder).toBe(true);
    expect(captured.listViewProps.searchQuery).toBe('project');
  });

  it('omits removed projects route back link in embedded mode', () => {
    renderTasksTab({ embedded: true });

    expect(captured.boardHeaderProps.backUrl).toBeUndefined();
  });
});
