import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { toast } from '@tuturuuu/ui/sonner';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ListActions } from '../list-actions';

const updateWorkspaceTaskListMock = vi.fn();
const broadcastMock = vi.fn();
const moveAllTasksFromListMock = vi.fn();

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
  useMoveAllTasksFromList: () => ({
    isPending: false,
    mutateAsync: (...args: unknown[]) => moveAllTasksFromListMock(...args),
  }),
}));

vi.mock('../../../shared/board-broadcast-context', () => ({
  useBoardBroadcast: () => broadcastMock,
}));

vi.mock('../board-selector', () => ({
  BoardSelector: () => null,
}));

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
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
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  DropdownMenuItem: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => null,
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
    vi.mocked(toast.error).mockReset();
    vi.mocked(toast.success).mockReset();
    vi.mocked(toast.info).mockReset();
    vi.mocked(toast.warning).mockReset();
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

  it('removes the list and its tasks from cache and broadcasts delete on success', async () => {
    updateWorkspaceTaskListMock.mockResolvedValueOnce({ list: baseList });

    const { queryClient } = renderListActions({
      tasks: [baseTask],
    });

    fireEvent.click(screen.getAllByRole('button', { name: 'delete' })[0]!);
    fireEvent.click(screen.getAllByRole('button', { name: 'delete' }).at(-1)!);

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
});
