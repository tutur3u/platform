import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTaskBoardAiChatBarTaskFlow } from './use-task-board-ai-chat-bar-task-flow';

const {
  createWorkspaceTaskMock,
  createWorkspaceTaskJournalMock,
  getWorkspaceTaskBoardMock,
  listWorkspaceLabelsMock,
  listWorkspaceTaskListsMock,
  listWorkspaceTaskProjectsMock,
  toastErrorMock,
  toastSuccessMock,
} = vi.hoisted(() => ({
  createWorkspaceTaskMock: vi.fn(),
  createWorkspaceTaskJournalMock: vi.fn(),
  getWorkspaceTaskBoardMock: vi.fn(),
  listWorkspaceLabelsMock: vi.fn(),
  listWorkspaceTaskListsMock: vi.fn(),
  listWorkspaceTaskProjectsMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api/tasks', () => ({
  createWorkspaceTask: createWorkspaceTaskMock,
  createWorkspaceTaskJournal: createWorkspaceTaskJournalMock,
  getWorkspaceTaskBoard: getWorkspaceTaskBoardMock,
  listWorkspaceLabels: listWorkspaceLabelsMock,
  listWorkspaceTaskLists: listWorkspaceTaskListsMock,
  listWorkspaceTaskProjects: listWorkspaceTaskProjectsMock,
}));

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

function createTask(overrides: Record<string, unknown> = {}) {
  return {
    created_at: '2026-05-24T00:00:00.000Z',
    id: 'task-1',
    list_id: 'list-1',
    name: 'abc',
    sort_key: 1000,
    ...overrides,
  };
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe('useTaskBoardAiChatBarTaskFlow', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          gcTime: 0,
          retry: false,
        },
      },
    });

    vi.clearAllMocks();
    listWorkspaceTaskListsMock.mockResolvedValue({
      lists: [
        {
          deleted: false,
          id: 'list-1',
          name: 'Backlog',
          position: 0,
          status: 'not_started',
        },
      ],
    });
    listWorkspaceLabelsMock.mockResolvedValue([]);
    listWorkspaceTaskProjectsMock.mockResolvedValue([]);
    getWorkspaceTaskBoardMock.mockResolvedValue({
      board: {
        allow_zero_estimates: false,
        estimation_type: null,
        extended_estimation: false,
        id: 'board-1',
        name: 'Dev',
      },
    });
  });

  it('guards non-AI task creation against same-tick duplicate submits', async () => {
    let resolveCreate: (value: unknown) => void = () => {};
    createWorkspaceTaskMock.mockReturnValue(
      new Promise((resolve) => {
        resolveCreate = resolve;
      })
    );

    const { result } = renderHook(
      () =>
        useTaskBoardAiChatBarTaskFlow({
          boardId: 'board-1',
          currentUser: { id: 'user-1' },
          expanded: true,
          wsId: 'ws-1',
        }),
      { wrapper: createWrapper(queryClient) }
    );

    await waitFor(() => expect(result.current.selectedListId).toBe('list-1'));

    act(() => {
      result.current.setAiTaskMode(false);
      result.current.setTaskInput('abc');
    });

    await waitFor(() => expect(result.current.canCreateTask).toBe(true));

    act(() => {
      result.current.submitTaskInput();
      result.current.submitTaskInput();
    });

    await waitFor(() =>
      expect(createWorkspaceTaskMock).toHaveBeenCalledTimes(1)
    );
    expect(createWorkspaceTaskMock).toHaveBeenCalledWith('ws-1', {
      assignee_ids: ['user-1'],
      listId: 'list-1',
      name: 'abc',
    });

    act(() => {
      resolveCreate({ task: createTask() });
    });

    await waitFor(() =>
      expect(toastSuccessMock).toHaveBeenCalledWith('task_created_successfully')
    );
  });

  it('releases the submit guard after a failed create so the user can retry', async () => {
    createWorkspaceTaskMock
      .mockRejectedValueOnce(new Error('Network failed'))
      .mockResolvedValueOnce({ task: createTask({ id: 'task-2' }) });

    const { result } = renderHook(
      () =>
        useTaskBoardAiChatBarTaskFlow({
          boardId: 'board-1',
          currentUser: { id: 'user-1' },
          expanded: true,
          wsId: 'ws-1',
        }),
      { wrapper: createWrapper(queryClient) }
    );

    await waitFor(() => expect(result.current.selectedListId).toBe('list-1'));

    act(() => {
      result.current.setAiTaskMode(false);
      result.current.setTaskInput('abc');
    });

    await waitFor(() => expect(result.current.canCreateTask).toBe(true));

    act(() => {
      result.current.submitTaskInput();
    });

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith('Network failed')
    );

    act(() => {
      result.current.submitTaskInput();
    });

    await waitFor(() =>
      expect(createWorkspaceTaskMock).toHaveBeenCalledTimes(2)
    );
  });
});
