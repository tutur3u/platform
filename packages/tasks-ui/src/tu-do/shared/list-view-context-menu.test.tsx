import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ListView } from './list-view';

const openTaskMock = vi.hoisted(() => vi.fn());
const openTaskByIdMock = vi.hoisted(() => vi.fn());

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) =>
    key === 'select_all_tasks' ? 'Select all tasks' : key,
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
    openTaskById: openTaskByIdMock,
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
    contextMenuPoint,
    task,
  }: {
    contextMenuPoint?: { x: number; y: number } | null;
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
      {open && (
        <div data-testid={`mock-task-menu-${task.id}`}>
          {contextMenuPoint
            ? `${contextMenuPoint.x}:${contextMenuPoint.y}`
            : 'menu'}
        </div>
      )}
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

function renderListView(viewTasks = tasks) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  const view = render(
    <QueryClientProvider client={queryClient}>
      <ListView
        boardId="board-1"
        lists={lists}
        tasks={viewTasks}
        workspaceId="ws-1"
        isPersonalWorkspace={true}
      />
    </QueryClientProvider>
  );

  return { ...view, queryClient };
}

describe('ListView task context menu', () => {
  beforeEach(() => {
    openTaskMock.mockReset();
    openTaskByIdMock.mockReset();
  });

  it('opens the shared task menu from row right-click and the compact menu button', () => {
    renderListView();

    const selectAll = screen.getByRole('checkbox', {
      name: 'Select all tasks',
    });
    expect(selectAll).toHaveClass('!border-2', 'shadow-sm');
    expect(selectAll).toHaveClass('!border-primary/70', 'ring-primary/15');
    expect(selectAll.className).toContain(
      'data-[state=checked]:!border-primary/80'
    );

    fireEvent.contextMenu(screen.getByText('Openable task'), {
      clientX: 120,
      clientY: 80,
    });
    expect(screen.getByTestId('mock-task-menu-task-1')).toHaveTextContent(
      '120:80'
    );

    fireEvent.click(screen.getByTestId('mock-task-menu-trigger-task-1'));
    expect(
      screen.queryByTestId('mock-task-menu-task-1')
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mock-task-menu-trigger-task-1'));
    expect(screen.getByTestId('mock-task-menu-task-1')).toBeInTheDocument();
  });

  it('opens external rows through the hydrating task-by-id path immediately', () => {
    const externalTask: Task = {
      ...tasks[0]!,
      id: 'external-task',
      name: 'External task',
      list_id: 'personal-list',
      personal_board_id: 'board-1',
      is_personal_external: true,
      source_workspace_id: 'source-ws',
      source_board_id: 'source-board',
      source_board_name: 'Source board',
      source_list_id: 'source-list',
      source_list_name: 'Source list',
    } satisfies Task;

    renderListView([externalTask]);

    fireEvent.click(screen.getByText('External task'));

    expect(openTaskByIdMock).toHaveBeenCalledWith(
      'external-task',
      expect.objectContaining({
        boardId: 'source-board',
        taskWsId: 'source-ws',
        taskWorkspacePersonal: false,
        initialTask: expect.objectContaining({
          id: 'external-task',
          list_id: 'source-list',
          name: 'External task',
        }),
        initialSharedContext: expect.objectContaining({
          boardConfig: expect.objectContaining({
            id: 'source-board',
            name: 'Source board',
            ws_id: 'source-ws',
          }),
          availableLists: [
            expect.objectContaining({
              id: 'source-list',
              name: 'Source list',
              board_id: 'source-board',
            }),
          ],
        }),
      })
    );
    expect(openTaskMock).not.toHaveBeenCalled();
  });

  it('preserves the expanded render window when task data updates in place', () => {
    const manyTasks = Array.from({ length: 60 }, (_, index) => ({
      ...tasks[0]!,
      display_number: index + 1,
      id: `task-${index + 1}`,
      name: `Task ${index + 1}`,
    }));
    const { queryClient, rerender } = renderListView(manyTasks);
    const scrollContainer = document.querySelector('[data-scroll-container]');

    expect(scrollContainer).not.toBeNull();
    Object.defineProperties(scrollContainer, {
      clientHeight: { configurable: true, value: 20 },
      scrollHeight: { configurable: true, value: 100 },
      scrollTop: { configurable: true, value: 81 },
    });
    fireEvent.scroll(scrollContainer!);
    expect(screen.getByText('Task 60')).toBeInTheDocument();

    const updatedTasks = manyTasks.map((task) => ({
      ...task,
      end_date: null,
    }));
    rerender(
      <QueryClientProvider client={queryClient}>
        <ListView
          boardId="board-1"
          lists={lists}
          tasks={updatedTasks}
          workspaceId="ws-1"
          isPersonalWorkspace={true}
        />
      </QueryClientProvider>
    );

    expect(screen.getByText('Task 60')).toBeInTheDocument();
  });
});
