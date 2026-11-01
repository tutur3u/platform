import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import type { ComponentProps, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  clearBoardFilters,
  hasActiveBoardFilters,
  toggleFocus,
} from '../../shared/board-header/board-filter-state';
import { TaskProjectDetail } from './task-project-detail';

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@tuturuuu/ui/hooks/use-workspace-members', () => ({
  useWorkspaceMembers: () => ({ data: [] }),
}));
vi.mock('@tuturuuu/tasks-ui/tu-do/tasks-route-context', () => ({
  useTasksHref: () => (path: string) => `/tasks${path}`,
}));
vi.mock('@tuturuuu/tasks-ui/tu-do/providers/task-dialog-provider', () => ({
  TaskDialogProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@tuturuuu/tasks-ui/tu-do/shared/task-dialog-manager', () => ({
  TaskDialogManager: () => null,
}));
vi.mock('./hooks', () => ({
  useAnimationVariants: () => ({}),
  useProjectForm: () => ({}),
  useProjectUpdates: () => ({}),
  useTaskLinking: () => ({}),
}));
vi.mock('./dialogs', () => ({ LinkTaskDialog: () => null }));
vi.mock('./components/project-overview-context', () => ({
  ProjectOverviewProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('./components', async () => ({
  TasksTab: (await import('./components/tasks-tab')).TasksTab,
  DocumentsTab: () => null,
  OverviewTab: () => null,
  ProjectHeader: () => null,
  UpdatesTab: () => null,
}));
vi.mock('@tuturuuu/tasks-ui/tu-do/shared/board-header', () => ({
  BoardHeader: (
    props: ComponentProps<
      typeof import('../../shared/board-header').BoardHeader
    >
  ) => (
    <div data-testid="board-header">
      <button
        type="button"
        onClick={() => {
          const next = toggleFocus({
            currentUser: { id: 'me', display_name: 'Linh' },
            filters: props.filters,
            listStatusFilter: props.listStatusFilter,
          });
          props.onFiltersChange(next.filters);
          props.onListStatusFilterChange(next.listStatusFilter);
        }}
      >
        Focus
      </button>
      {hasActiveBoardFilters(props.filters, props.listStatusFilter) ? (
        <button
          type="button"
          onClick={() => {
            props.onFiltersChange(clearBoardFilters(props.filters));
            props.onListStatusFilterChange('all');
          }}
        >
          Clear
        </button>
      ) : null}
    </div>
  ),
}));
vi.mock('@tuturuuu/tasks-ui/tu-do/boards/boardId/kanban', () => ({
  KanbanBoard: ({ tasks }: { tasks: Task[] }) => (
    <div data-testid="tasks">
      {tasks.map((task) => (
        <div key={task.id}>{task.name}</div>
      ))}
    </div>
  ),
}));
vi.mock('@tuturuuu/tasks-ui/tu-do/shared/list-view', () => ({
  ListView: () => null,
}));
vi.mock('@tuturuuu/tasks-ui/tu-do/boards/boardId/timeline-board', () => ({
  TimelineBoard: () => null,
}));

const lists = ['not_started', 'active', 'review', 'done', 'closed'].map(
  (status) => ({
    id: status,
    status,
    board_id: 'board-1',
  })
) as TaskList[];
const tasks = lists.map((list, index) => ({
  id: `task-${index}`,
  name: list.status,
  list_id: list.id,
  assignees: [{ id: 'me', display_name: 'Linh' }],
  priority: index === 2 ? 'critical' : 'normal',
})) as Task[];

function renderProject(projectTasks = tasks, projectLists = lists) {
  render(
    <TaskProjectDetail
      workspace={
        { id: 'ws-1', personal: false } as ComponentProps<
          typeof TaskProjectDetail
        >['workspace']
      }
      project={
        { id: 'project-1', name: 'Platform' } as ComponentProps<
          typeof TaskProjectDetail
        >['project']
      }
      wsId="ws-1"
      currentUserId="me"
      tasks={projectTasks}
      documents={[]}
      lists={projectLists}
    />
  );
  fireEvent.mouseDown(screen.getByRole('tab', { name: /^tasks/ }), {
    button: 0,
    ctrlKey: false,
  });
}

describe('project Tasks Focus', () => {
  it('shows my not-started, active and review tasks highest priority first, then clears', () => {
    renderProject([
      ...tasks,
      {
        ...tasks[0]!,
        id: 'other',
        name: 'Someone else',
        assignees: [{ id: 'other', display_name: 'Minh' }],
      },
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Focus' }));
    expect(screen.getByTestId('tasks')).toHaveTextContent(
      /^reviewnot_startedactive$/
    );
    expect(screen.queryByText('done')).not.toBeInTheDocument();
    expect(screen.queryByText('closed')).not.toBeInTheDocument();
    expect(screen.queryByText('Someone else')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByText('done')).toBeInTheDocument();
    expect(screen.getByText('closed')).toBeInTheDocument();
    expect(screen.getByText('Someone else')).toBeInTheDocument();
  });

  it.each(['no open lists', 'no matching assignees'])(
    'retains the header and Clear with %s',
    (reason) => {
      const closedOnly = reason === 'no open lists';
      renderProject(
        closedOnly
          ? tasks.filter((task) => ['done', 'closed'].includes(task.list_id))
          : tasks.map((task) => ({ ...task, assignees: [] })),
        closedOnly
          ? lists.filter((list) => ['done', 'closed'].includes(list.id))
          : lists
      );
      fireEvent.click(screen.getByRole('button', { name: 'Focus' }));
      expect(screen.getByText('no_tasks_title')).toBeInTheDocument();
      expect(screen.getByTestId('board-header')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
      expect(screen.queryByText('no_tasks_title')).not.toBeInTheDocument();
      expect(screen.getByTestId('tasks').children.length).toBeGreaterThan(0);
    }
  );
});
