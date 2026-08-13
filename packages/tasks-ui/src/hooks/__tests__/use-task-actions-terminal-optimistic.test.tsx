/**
 * @vitest-environment jsdom
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTaskActions } from '../use-task-actions';

const apiMocks = vi.hoisted(() => ({
  updateWorkspaceTask: vi.fn(),
  upsertCurrentUserTaskPersonalPlacement: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api/tasks', () => ({
  listWorkspaceTaskLists: vi.fn(() => Promise.resolve({ lists: [] })),
  resolveTaskProjectWorkspaceId: vi.fn(() => Promise.resolve('ws-1')),
  updateWorkspaceTask: apiMocks.updateWorkspaceTask,
  upsertCurrentUserTaskPersonalPlacement:
    apiMocks.upsertCurrentUserTaskPersonalPlacement,
}));

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock('../../tu-do/shared/task-sound-effects', () => ({
  dispatchTaskSoundCue: vi.fn(),
}));

vi.mock('@tuturuuu/utils/task-helper', () => ({
  isPersonalExternalStagingListId: (listId: string | null) =>
    listId?.startsWith('personal-external-staging:') ?? false,
  useUpdateTask: vi.fn(() => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue(undefined),
  })),
}));

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

const baseTask = {
  id: 'task-1',
  name: 'Task',
  ws_id: 'ws-1',
  list_id: 'active-list',
  created_at: '2026-08-13T00:00:00.000Z',
  closed_at: null,
  completed_at: null,
  assignees: [],
  labels: [],
  projects: [],
  display_number: 1,
} as unknown as Task;

const externalTask = {
  ...baseTask,
  is_personal_external: true,
  personal_board_id: 'board-1',
  personal_list_id: 'active-list',
  source_workspace_id: 'source-ws',
  source_board_id: 'source-board',
  source_list_id: 'source-active-list',
  source_list_status: 'active',
} as Task;

const doneList = {
  id: 'done-list',
  name: 'Done',
  board_id: 'board-1',
  status: 'done',
  created_at: '2026-08-13T00:00:00.000Z',
} as TaskList;

const closedList = {
  id: 'closed-list',
  name: 'Closed',
  board_id: 'board-1',
  status: 'closed',
  created_at: '2026-08-13T00:00:00.000Z',
} as TaskList;

type TerminalCase = {
  action: 'done' | 'closed';
  external: boolean;
};

describe('useTaskActions terminal optimistic caches', () => {
  let queryClient: QueryClient;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { retry: false },
      },
    });
    vi.clearAllMocks();
  });

  it.each<TerminalCase>([
    { action: 'done', external: false },
    { action: 'done', external: true },
    { action: 'closed', external: false },
    { action: 'closed', external: true },
  ])(
    'moves an $external terminal task to $action in every mounted cache before persistence finishes',
    async ({ action, external }) => {
      const task = external ? externalTask : baseTask;
      const targetList = action === 'done' ? doneList : closedList;
      const deferred = createDeferred<{ task: Task }>();
      const persistenceMock = external
        ? apiMocks.upsertCurrentUserTaskPersonalPlacement
        : apiMocks.updateWorkspaceTask;
      persistenceMock.mockReturnValueOnce(deferred.promise);
      queryClient.setQueryData(['tasks', 'board-1'], [task]);
      queryClient.setQueryData(['tasks-full', 'board-1', 'filtered'], [task]);

      const { result } = renderHook(
        () =>
          useTaskActions({
            task,
            boardId: 'board-1',
            workspaceId: 'ws-1',
            targetCompletionList: doneList,
            targetClosedList: closedList,
            availableLists: [doneList, closedList],
            onUpdate: vi.fn(),
            setIsLoading: vi.fn(),
            setMenuOpen: vi.fn(),
          }),
        { wrapper }
      );

      let actionPromise!: Promise<void>;
      act(() => {
        actionPromise =
          action === 'done'
            ? result.current.handleMoveToCompletion()
            : result.current.handleMoveToClose();
      });

      await waitFor(() => expect(persistenceMock).toHaveBeenCalled());
      const optimisticTask = queryClient.getQueryData<Task[]>([
        'tasks-full',
        'board-1',
        'filtered',
      ])?.[0];
      expect(optimisticTask).toEqual(
        expect.objectContaining({
          id: task.id,
          list_id: targetList.id,
          closed_at: expect.any(String),
          _localMutationAt: expect.any(Number),
          ...(action === 'done' ? { completed_at: expect.any(String) } : {}),
          ...(external ? { personal_list_id: targetList.id } : {}),
        })
      );

      deferred.resolve({
        task: {
          ...task,
          list_id: targetList.id,
          personal_list_id: external ? targetList.id : task.personal_list_id,
          source_list_status: external ? action : task.source_list_status,
          completed_at: action === 'done' ? '2026-08-13T08:00:00.000Z' : null,
          closed_at: '2026-08-13T08:00:00.000Z',
        } as Task,
      });
      await act(async () => actionPromise);
    }
  );
});
