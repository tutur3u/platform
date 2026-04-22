import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TaskDetailPage from '../task-detail-page';

const mockBack = vi.fn();
const mockPush = vi.fn();
const mockRefresh = vi.fn();
const mockUpdateLocation = vi.fn();
const mockDispatchRecentSidebarVisit = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    back: mockBack,
    push: mockPush,
    refresh: mockRefresh,
  }),
}));

vi.mock('@tuturuuu/ui/tu-do/providers/workspace-presence-provider', () => ({
  useOptionalWorkspacePresenceContext: () => ({
    updateLocation: mockUpdateLocation,
  }),
}));

vi.mock('@tuturuuu/ui/tu-do/tasks-route-context', () => ({
  useTasksHref: () => (path: string) => `/tasks${path}`,
}));

vi.mock('../recent-sidebar-events', () => ({
  dispatchRecentSidebarVisit: (payload: unknown) =>
    mockDispatchRecentSidebarVisit(payload),
}));

vi.mock('../task-edit-dialog', () => ({
  TaskEditDialog: ({
    task,
    onClose,
    onUpdate,
    onNavigateToTask,
  }: {
    task: Task;
    onClose: () => void;
    onUpdate: () => void;
    onNavigateToTask?: (taskId: string) => Promise<void>;
  }) => (
    <div data-testid="task-edit-dialog">
      <span>{task.name}</span>
      <button type="button" onClick={onClose}>
        Close
      </button>
      <button type="button" onClick={onUpdate}>
        Refresh
      </button>
      <button type="button" onClick={() => void onNavigateToTask?.('task-2')}>
        Open Related
      </button>
    </div>
  ),
}));

const mockTask = {
  id: 'task-1',
  name: 'Ship dedicated task page',
  description: '',
  priority: 'normal',
  start_date: undefined,
  end_date: null,
  estimation_points: null,
  list_id: 'list-1',
  labels: [],
  assignees: [],
  projects: [],
  created_at: '2026-03-03T00:00:00Z',
  sort_key: 1000,
  display_number: 42,
  list: {
    name: 'In Progress',
    board: {
      name: 'Platform',
    },
  },
} satisfies Task & {
  list: {
    name: string;
    board: {
      name: string;
    };
  };
};

describe('TaskDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.pushState({}, '', '/workspace-1/tasks/boards/board-1');
    window.history.pushState({}, '', '/workspace-1/tasks/task-1');
  });

  it('renders the shared task dialog surface and records the visit snapshot', async () => {
    render(
      <TaskDetailPage
        task={mockTask}
        boardId="board-1"
        wsId="workspace-1"
        isPersonalWorkspace={false}
      />
    );

    expect(screen.getByTestId('task-edit-dialog')).toBeInTheDocument();
    expect(screen.getByText('Ship dedicated task page')).toBeInTheDocument();

    await waitFor(() => {
      expect(mockUpdateLocation).toHaveBeenCalledWith({
        type: 'board',
        boardId: 'board-1',
        taskId: 'task-1',
      });
    });

    expect(mockDispatchRecentSidebarVisit).toHaveBeenCalledWith({
      href: '/workspace-1/tasks/boards/board-1?task=task-1',
      scopeWsId: 'workspace-1',
      snapshot: {
        badges: [
          { kind: 'board', value: 'Platform' },
          { kind: 'list', value: 'In Progress' },
        ],
        iconKey: 'task',
        title: 'Ship dedicated task page',
      },
    });
  });

  it('navigates back when the shared dialog closes from the dedicated page', async () => {
    render(
      <TaskDetailPage
        task={mockTask}
        boardId="board-1"
        wsId="workspace-1"
        isPersonalWorkspace={false}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(() => {
      expect(mockBack).toHaveBeenCalledTimes(1);
    });
  });

  it('pushes the canonical board task route when navigating to another task from relationships', async () => {
    render(
      <TaskDetailPage
        task={mockTask}
        boardId="board-1"
        wsId="workspace-1"
        isPersonalWorkspace={false}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open Related' }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(
        '/workspace-1/tasks/boards/board-1?task=task-2'
      );
    });
  });
});
