import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { toast } from '@tuturuuu/ui/sonner';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ListActions } from '../list-actions';

const updateWorkspaceTaskListMock = vi.fn();
const broadcastMock = vi.fn();
const moveAllTasksFromListMock = vi.fn();
const moveTaskIdsInBatchesMock = vi.fn();

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@tuturuuu/internal-api/tasks', () => ({
  createWorkspaceTaskList: vi.fn(),
  listWorkspaceTaskLists: vi.fn(),
  updateWorkspaceTaskList: (...args: unknown[]) =>
    updateWorkspaceTaskListMock(...args),
}));

vi.mock('@tuturuuu/utils/task-helper', () => ({
  moveAllActiveListTasks: (...args: unknown[]) =>
    moveAllTasksFromListMock(...args),
  moveTaskIdsInBatches: (...args: unknown[]) =>
    moveTaskIdsInBatchesMock(...args),
}));

vi.mock('../../../shared/board-broadcast-context', () => ({
  useBoardBroadcast: () => broadcastMock,
}));

vi.mock('../../board-selector', () => ({
  BoardSelector: ({ open }: { open: boolean }) =>
    open ? <div data-testid="board-selector" /> : null,
}));

vi.mock('../../capacity-rules-settings', () => ({
  CapacityRulesSettings: ({
    initialListId,
    lists,
  }: {
    initialListId?: string;
    lists: TaskList[];
  }) => (
    <div
      data-list-count={lists.length}
      data-selected-list={initialListId}
      data-testid="capacity-rules-settings"
    />
  ),
}));

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock('@tuturuuu/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  DropdownMenuContent: ({
    children,
    onKeyDown,
  }: {
    children: React.ReactNode;
    onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
  }) => (
    <div data-testid="list-menu" onKeyDown={onKeyDown}>
      {children}
    </div>
  ),
  DropdownMenuItem: ({
    children,
    onSelect,
    'aria-keyshortcuts': keyShortcuts,
  }: {
    children: React.ReactNode;
    onSelect?: () => void;
    'aria-keyshortcuts'?: string;
  }) => (
    <button
      type="button"
      aria-keyshortcuts={keyShortcuts}
      onClick={() => onSelect?.()}
    >
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => null,
  DropdownMenuShortcut: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));

const baseList: TaskList = {
  archived: false,
  board_id: 'board-1',
  color: 'BLUE',
  created_at: '2026-03-07T00:00:00.000Z',
  creator_id: 'user-1',
  deleted: false,
  id: 'list-1',
  name: 'To Do',
  position: 0,
  status: 'not_started',
};

const baseTask: Task = {
  assignees: [],
  created_at: '2026-03-07T00:00:00.000Z',
  display_number: 1,
  end_date: null,
  id: 'task-1',
  labels: [],
  list_id: 'list-1',
  name: 'Ship board updates',
  priority: 'normal',
  sort_key: 1,
  start_date: undefined,
};

function renderListActions(options?: {
  lists?: TaskList[];
  tasks?: Task[];
  isEditOpen?: boolean;
  onEditOpenChange?: (open: boolean) => void;
}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  queryClient.setQueryData(['task_lists', 'board-1'], [baseList]);
  queryClient.setQueryData(['tasks', 'board-1'], options?.tasks ?? []);

  const result = render(
    <QueryClientProvider client={queryClient}>
      <ListActions
        listId="list-1"
        listName="To Do"
        listStatus="not_started"
        lists={options?.lists}
        tasks={options?.tasks ?? []}
        boardId="board-1"
        wsId="ws-1"
        onUpdate={vi.fn()}
        isEditOpen={options?.isEditOpen ?? false}
        onEditOpenChange={options?.onEditOpenChange ?? vi.fn()}
      />
    </QueryClientProvider>
  );

  return {
    ...result,
    queryClient,
  };
}

describe('ListActions', () => {
  beforeEach(() => {
    updateWorkspaceTaskListMock.mockReset();
    broadcastMock.mockReset();
    moveAllTasksFromListMock.mockReset();
    moveTaskIdsInBatchesMock.mockReset();
    vi.mocked(toast.error).mockReset();
    vi.mocked(toast.success).mockReset();
    vi.mocked(toast.info).mockReset();
    vi.mocked(toast.warning).mockReset();
    vi.mocked(toast.loading).mockReset();
  });

  it('rolls back an optimistic rename when the mutation fails', async () => {
    updateWorkspaceTaskListMock.mockRejectedValueOnce(
      new Error('Rename failed')
    );

    const onEditOpenChange = vi.fn();
    const { queryClient } = renderListActions({
      isEditOpen: true,
      onEditOpenChange,
    });

    fireEvent.change(screen.getByPlaceholderText('list_name'), {
      target: { value: 'Doing' },
    });
    fireEvent.click(screen.getByText('save_changes'));

    await waitFor(() => {
      expect(
        queryClient.getQueryData<TaskList[]>(['task_lists', 'board-1'])
      ).toEqual([baseList]);
    });

    expect(onEditOpenChange).not.toHaveBeenCalledWith(false);
    expect(toast.error).toHaveBeenCalledWith('Rename failed');
  });

  it('opens capacity settings preselected to the current task list', () => {
    const secondList: TaskList = {
      ...baseList,
      id: 'list-2',
      name: 'Doing',
      position: 1,
      status: 'active',
    };
    // The list's own attributes and its capacity rules now live in one dialog,
    // so the menu entry opens it and capacity is a tab rather than a second
    // dialog reached from a submenu.
    renderListActions({ isEditOpen: true, lists: [baseList, secondList] });

    // Radix activates a tab on mouseDown, not click.
    fireEvent.mouseDown(screen.getByRole('tab', { name: /title/ }));

    const capacitySettings = screen.getByTestId('capacity-rules-settings');
    expect(capacitySettings).toHaveAttribute('data-selected-list', 'list-1');
    expect(capacitySettings).toHaveAttribute('data-list-count', '2');
  });

  it('opens the consolidated list settings dialog from the menu', () => {
    const onEditOpenChange = vi.fn();
    renderListActions({ onEditOpenChange });

    fireEvent.click(screen.getByRole('button', { name: /list_settings/ }));

    expect(onEditOpenChange).toHaveBeenCalledWith(true);
  });

  it('removes the list and its tasks from cache and broadcasts delete on success', async () => {
    updateWorkspaceTaskListMock.mockResolvedValueOnce({ list: baseList });

    const { queryClient } = renderListActions({
      tasks: [baseTask],
    });

    fireEvent.click(screen.getByRole('button', { name: /^delete_list/ }));
    fireEvent.click(
      screen.getAllByRole('button', { name: /^delete_list/ }).at(-1)!
    );

    await waitFor(() => {
      expect(
        queryClient.getQueryData<TaskList[]>(['task_lists', 'board-1'])
      ).toEqual([]);
      expect(queryClient.getQueryData<Task[]>(['tasks', 'board-1'])).toEqual(
        []
      );
    });

    expect(broadcastMock).toHaveBeenCalledWith('list:delete', {
      listId: 'list-1',
    });
  });
  it('archives optimistically, reports progress and offers undo', async () => {
    let finish: (value: unknown) => void = () => {};
    moveAllTasksFromListMock.mockImplementationOnce(
      (_ws, _list, _target, onProgress?: (p: object) => void) =>
        new Promise((resolve) => {
          onProgress?.({ done: 1, total: 1 });
          finish = resolve;
        })
    );
    const closedList: TaskList = {
      ...baseList,
      id: 'list-closed',
      status: 'closed',
    };
    const doneList: TaskList = { ...baseList, status: 'done' };
    const queryClient = new QueryClient();
    queryClient.setQueryData(['task_lists', 'board-1'], [doneList, closedList]);
    queryClient.setQueryData(['tasks', 'board-1'], [baseTask]);

    render(
      <QueryClientProvider client={queryClient}>
        <ListActions
          listId="list-1"
          listName="Done"
          listStatus="done"
          tasks={[baseTask]}
          boardId="board-1"
          wsId="ws-1"
          onUpdate={vi.fn()}
          isEditOpen={false}
          onEditOpenChange={vi.fn()}
        />
      </QueryClientProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: /archive_all_tasks/ }));
    fireEvent.click(
      screen.getByRole('button', { name: 'archive_n_tasks_action' })
    );

    await waitFor(() => {
      expect(
        queryClient.getQueryData<Task[]>(['tasks', 'board-1'])?.[0]?.list_id
      ).toBe('list-closed');
    });
    expect(toast.loading).toHaveBeenCalled();
    expect(moveAllTasksFromListMock).toHaveBeenCalledWith(
      'ws-1',
      'list-1',
      { listId: 'list-closed', targetBoardId: undefined },
      expect.any(Function)
    );

    finish({
      success: true,
      movedCount: 1,
      movedTaskIds: ['task-1'],
      failedTaskIds: [],
    });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'archived_tasks_successfully',
        expect.objectContaining({
          action: expect.objectContaining({ label: 'undo' }),
        })
      );
    });

    moveTaskIdsInBatchesMock.mockResolvedValueOnce({
      success: true,
      movedCount: 1,
      movedTaskIds: ['task-1'],
      failedTaskIds: [],
    });
    const [, archiveToast] = vi.mocked(toast.success).mock.calls[0]!;
    const options = archiveToast as unknown as {
      id: string;
      action: { onClick: () => void };
    };
    act(() => {
      options.action.onClick();
    });

    await waitFor(() => {
      expect(moveTaskIdsInBatchesMock).toHaveBeenCalledWith(
        'ws-1',
        ['task-1'],
        { listId: 'list-1', targetBoardId: undefined },
        expect.any(Function)
      );
      expect(toast.success).toHaveBeenCalledWith(
        'tasks_restored',
        expect.objectContaining({ id: `${options.id}-undo` })
      );
    });
    expect(
      queryClient.getQueryData<Task[]>(['tasks', 'board-1'])?.[0]?.list_id
    ).toBe('list-1');
  });

  it('rolls the cards back when archiving fails', async () => {
    moveAllTasksFromListMock.mockRejectedValueOnce(new Error('offline'));
    const closedList: TaskList = {
      ...baseList,
      id: 'list-closed',
      status: 'closed',
    };
    const queryClient = new QueryClient();
    queryClient.setQueryData(['task_lists', 'board-1'], [baseList, closedList]);
    queryClient.setQueryData(['tasks', 'board-1'], [baseTask]);

    render(
      <QueryClientProvider client={queryClient}>
        <ListActions
          listId="list-1"
          listName="Done"
          listStatus="done"
          tasks={[baseTask]}
          boardId="board-1"
          wsId="ws-1"
          onUpdate={vi.fn()}
          isEditOpen={false}
          onEditOpenChange={vi.fn()}
        />
      </QueryClientProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: /archive_all_tasks/ }));
    fireEvent.click(
      screen.getByRole('button', { name: 'archive_n_tasks_action' })
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'failed_to_archive_tasks',
        expect.objectContaining({ id: expect.any(String) })
      );
    });
    expect(queryClient.getQueryData<Task[]>(['tasks', 'board-1'])).toEqual([
      baseTask,
    ]);
  });
  it('runs menu actions from their single-letter shortcuts', () => {
    renderListActions({ tasks: [baseTask] });

    expect(
      screen.getByRole('button', { name: /^delete_list/ })
    ).toHaveAttribute('aria-keyshortcuts', 'D');

    fireEvent.keyDown(screen.getByTestId('list-menu'), {
      key: 'd',
      metaKey: true,
    });
    expect(screen.queryByText('delete_list_title')).not.toBeInTheDocument();

    fireEvent.keyDown(screen.getByTestId('list-menu'), { key: 'd' });
    expect(screen.getByText('delete_list_title')).toBeInTheDocument();
  });

  it('focuses Cancel first and offers moving tasks before deleting', async () => {
    renderListActions({ tasks: [baseTask] });

    fireEvent.click(screen.getByRole('button', { name: /^delete_list/ }));

    await waitFor(() => {
      expect(
        screen.getAllByRole('button', { name: /^cancel/ }).at(-1)
      ).toHaveFocus();
    });
    expect(screen.getByText('delete_list_task_warning')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'move_tasks_first' }));

    expect(screen.getByTestId('board-selector')).toBeInTheDocument();
    expect(updateWorkspaceTaskListMock).not.toHaveBeenCalled();
  });
});
