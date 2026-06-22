import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BoardActivitySettings } from './board-activity-settings';

const { listWorkspaceTaskHistoryMock } = vi.hoisted(() => ({
  listWorkspaceTaskHistoryMock: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@tuturuuu/internal-api/tasks', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tuturuuu/internal-api/tasks')>();

  return {
    ...actual,
    listWorkspaceTaskHistory: (
      ...args: Parameters<typeof listWorkspaceTaskHistoryMock>
    ) => listWorkspaceTaskHistoryMock(...args),
  };
});

vi.mock('@tuturuuu/ui/custom/combobox', () => ({
  Combobox: ({
    onChange,
    options,
    placeholder,
    selected,
  }: {
    onChange?: (value: string) => void;
    options: { label: string; value: string }[];
    placeholder?: string;
    selected: string;
  }) => (
    <select
      aria-label={placeholder}
      onChange={(event) => onChange?.(event.target.value)}
      value={selected}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

vi.mock('@tuturuuu/ui/avatar', () => ({
  Avatar: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AvatarFallback: ({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  ),
  AvatarImage: () => null,
}));

const todoListId = '11111111-1111-4111-8111-111111111111';
const doingListId = '22222222-2222-4222-8222-222222222222';

function renderBoardActivitySettings() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <BoardActivitySettings
        boardId="board-1"
        taskLists={[
          { id: todoListId, name: 'To Do' },
          { id: doingListId, name: 'Doing' },
        ]}
        wsId="ws-1"
      />
    </QueryClientProvider>
  );
}

describe('BoardActivitySettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listWorkspaceTaskHistoryMock.mockImplementation(
      (_wsId: string, options: { page?: number }) => {
        if (options.page === 2) {
          return Promise.resolve({
            count: 3,
            data: [
              {
                board_id: 'board-1',
                board_name: 'Roadmap',
                change_type: 'task_created',
                changed_at: '2026-06-21T08:00:00.000Z',
                changed_by: 'user-2',
                field_name: null,
                id: 'history-3',
                new_value: null,
                old_value: null,
                task_id: 'task-3',
                task_name: 'Launch checklist',
                user: {
                  avatar_url: null,
                  id: 'user-2',
                  name: 'Bao Tran',
                },
              },
            ],
            page: 2,
            pageSize: 20,
          });
        }

        return Promise.resolve({
          count: 3,
          data: [
            {
              board_id: 'board-1',
              board_name: 'Roadmap',
              change_type: 'field_updated',
              changed_at: '2026-06-22T08:00:00.000Z',
              changed_by: 'user-1',
              field_name: 'priority',
              id: 'history-1',
              new_value: 'high',
              old_value: 'normal',
              task_id: 'task-1',
              task_name: 'Homepage task',
              user: {
                avatar_url: null,
                id: 'user-1',
                name: 'Alex Nguyen',
              },
            },
            {
              board_id: 'board-1',
              board_name: 'Roadmap',
              change_type: 'field_updated',
              changed_at: '2026-06-21T09:00:00.000Z',
              changed_by: 'user-1',
              field_name: 'list_id',
              id: 'history-2',
              new_value: doingListId,
              old_value: todoListId,
              task_id: 'task-2',
              task_name: 'Move task',
              user: {
                avatar_url: null,
                id: 'user-1',
                name: 'Alex Nguyen',
              },
            },
          ],
          page: 1,
          pageSize: 20,
        });
      }
    );
  });

  it('renders a compact timeline summary and sends filter controls to the history API', async () => {
    renderBoardActivitySettings();

    expect(await screen.findByText('Homepage task')).toBeInTheDocument();
    expect(screen.getAllByText('Alex Nguyen').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Field Updated').length).toBeGreaterThan(0);
    expect(screen.getByText('tasks.priority_normal')).toBeInTheDocument();
    expect(screen.getByText('tasks.priority_high')).toBeInTheDocument();
    expect(screen.getByText('To Do')).toBeInTheDocument();
    expect(screen.getByText('Doing')).toBeInTheDocument();
    expect(screen.queryByText(todoListId)).not.toBeInTheDocument();

    await waitFor(() => {
      expect(listWorkspaceTaskHistoryMock).toHaveBeenCalledWith(
        'ws-1',
        expect.objectContaining({
          boardId: 'board-1',
          changeType: undefined,
          page: 1,
          pageSize: 20,
          search: undefined,
        }),
        expect.objectContaining({ baseUrl: expect.any(String) })
      );
    });

    fireEvent.change(screen.getByLabelText('common.all'), {
      target: { value: 'field_updated' },
    });

    await waitFor(() => {
      expect(listWorkspaceTaskHistoryMock).toHaveBeenLastCalledWith(
        'ws-1',
        expect.objectContaining({
          boardId: 'board-1',
          changeType: 'field_updated',
        }),
        expect.objectContaining({ baseUrl: expect.any(String) })
      );
    });

    fireEvent.change(screen.getByPlaceholderText('common.search_tasks'), {
      target: { value: 'priority' },
    });

    await waitFor(() => {
      expect(listWorkspaceTaskHistoryMock).toHaveBeenLastCalledWith(
        'ws-1',
        expect.objectContaining({
          boardId: 'board-1',
          changeType: 'field_updated',
          search: 'priority',
        }),
        expect.objectContaining({ baseUrl: expect.any(String) })
      );
    });
  });

  it('loads the next activity page and appends timeline entries', async () => {
    renderBoardActivitySettings();

    expect(await screen.findByText('Homepage task')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'common.load_more' }));

    expect(await screen.findByText('Launch checklist')).toBeInTheDocument();

    await waitFor(() => {
      expect(listWorkspaceTaskHistoryMock).toHaveBeenCalledWith(
        'ws-1',
        expect.objectContaining({
          boardId: 'board-1',
          page: 2,
          pageSize: 20,
        }),
        expect.objectContaining({ baseUrl: expect.any(String) })
      );
    });
  });
});
