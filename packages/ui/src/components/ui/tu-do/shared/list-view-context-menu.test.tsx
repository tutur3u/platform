import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ListView } from './list-view';

const openTaskMock = vi.hoisted(() => vi.fn());

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}));

vi.mock('next/image', () => ({
  default: () => null,
}));

vi.mock('../hooks/useTaskDialog', () => ({
  useTaskDialog: () => ({
    openTask: openTaskMock,
  }),
}));

vi.mock('./board-broadcast-context', () => ({
  useBoardBroadcast: () => null,
}));

vi.mock('../boards/boardId/kanban/bulk/bulk-operations', () => ({
  useBulkOperations: () => ({
    bulkDeleteTasks: vi.fn(),
    bulkUpdateDueDate: vi.fn(),
    bulkUpdatePriority: vi.fn(),
  }),
}));

vi.mock('./task-row-actions-menu', () => ({
  TaskRowActionsMenu: ({
    onOpenChange,
    open,
    task,
  }: {
    onOpenChange?: (open: boolean) => void;
    open?: boolean;
    task: Task;
  }) => (
    <div>
      <button
        data-testid={`mock-task-menu-trigger-${task.id}`}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onOpenChange?.(!open);
        }}
      >
        more
      </button>
      {open && <div data-testid={`mock-task-menu-${task.id}`}>menu</div>}
    </div>
  ),
}));

const lists: TaskList[] = [
  {
    archived: false,
    board_id: 'board-1',
    color: 'GRAY',
    created_at: '2026-05-20T00:00:00.000Z',
    creator_id: 'user-1',
    deleted: false,
    id: 'list-1',
    name: 'To Do',
    position: 0,
    status: 'not_started',
  },
];

const tasks: Task[] = [
  {
    assignees: [],
    created_at: '2026-05-20T00:00:00.000Z',
    display_number: 1,
    end_date: null,
    id: 'task-1',
    labels: [],
    list_id: 'list-1',
    name: 'Openable task',
    priority: 'normal',
    sort_key: 1,
    start_date: undefined,
  },
];

function renderListView() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ListView
        boardId="board-1"
        lists={lists}
        tasks={tasks}
        workspaceId="ws-1"
      />
    </QueryClientProvider>
  );
}

describe('ListView task context menu', () => {
  beforeEach(() => {
    openTaskMock.mockReset();
  });

  it('opens the shared task menu from row right-click and the compact menu button', () => {
    renderListView();

    fireEvent.contextMenu(screen.getByText('Openable task'));
    expect(screen.getByTestId('mock-task-menu-task-1')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mock-task-menu-trigger-task-1'));
    expect(
      screen.queryByTestId('mock-task-menu-task-1')
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mock-task-menu-trigger-task-1'));
    expect(screen.getByTestId('mock-task-menu-task-1')).toBeInTheDocument();
  });
});
