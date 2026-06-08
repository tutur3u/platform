/**
 * @vitest-environment jsdom
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useBulkOperations } from '../bulk-operations';

type MockBulkPayload = {
  taskIds: string[];
  operation: unknown;
};

function getEndOfTodayIso() {
  const date = new Date();
  date.setHours(23, 59, 59, 999);
  return date.toISOString();
}

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const translate = (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${JSON.stringify(values)}` : key;
    translate.has = () => false;
    translate.raw = (key: string) => key;
    return translate;
  },
}));

vi.mock('@tuturuuu/internal-api/tasks', () => ({
  bulkWorkspaceTasks: vi.fn((_workspaceId, payload) =>
    Promise.resolve({
      successCount: payload.taskIds.length,
      failCount: 0,
      taskIds: payload.taskIds,
      succeededTaskIds: payload.taskIds,
      failures: [],
      taskMetaById: {},
    })
  ),
  getWorkspaceTask: vi.fn(() => Promise.resolve({ task: null })),
  listWorkspaceTaskLists: vi.fn(() => Promise.resolve({ lists: [] })),
  updateWorkspaceTask: vi.fn(() => Promise.resolve({ task: { id: 'task-1' } })),
  upsertCurrentUserTaskPersonalPlacement: vi.fn(() =>
    Promise.resolve({ task: { id: 'external-task' } })
  ),
}));

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

describe('bulk mutations with personal external tasks', () => {
  let queryClient: QueryClient;
  let wrapper: ({ children }: { children: ReactNode }) => ReactElement;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockBulkWorkspaceTasks: any;

  const localTask = {
    id: 'local-task',
    name: 'Local task',
    ws_id: 'personal-ws',
    list_id: 'list-1',
    priority: 'normal',
    estimation_points: 1,
    assignees: [],
    labels: [],
    projects: [],
    created_at: '2026-01-01T00:00:00.000Z',
    closed_at: null,
    completed_at: null,
  } as unknown as Task;

  const externalTask = {
    id: 'external-task',
    name: 'External task',
    ws_id: 'source-ws',
    list_id: 'list-1',
    priority: 'low',
    estimation_points: 2,
    assignees: [],
    labels: [],
    projects: [],
    personal_board_id: 'board-1',
    personal_list_id: 'list-1',
    source_workspace_id: 'source-ws',
    source_board_id: 'source-board',
    source_list_id: 'source-list',
    source_list_status: 'active',
    is_personal_external: true,
    is_personal_external_default: false,
    created_at: '2026-01-01T00:00:00.000Z',
    closed_at: null,
    completed_at: null,
  } as unknown as Task;

  const columns = [
    {
      id: 'list-1',
      name: 'Active',
      board_id: 'board-1',
      status: 'active',
      created_at: '2026-01-01T00:00:00.000Z',
      deleted: false,
    },
  ] as unknown as TaskList[];

  async function renderBulkOperations() {
    const { result } = renderHook(
      () =>
        useBulkOperations({
          queryClient,
          wsId: 'personal-ws',
          boardId: 'board-1',
          selectedTasks: new Set(['local-task', 'external-task']),
          columns,
          workspaceLabels: [
            {
              id: 'label-1',
              ws_id: 'personal-ws',
              name: 'Label',
              color: '#111111',
              created_at: '2026-01-01T00:00:00.000Z',
            },
          ],
          workspaceProjects: [
            {
              id: 'project-1',
              name: 'Project',
              status: 'active',
            },
          ],
          workspaceMembers: [
            {
              id: 'user-1',
              user_id: 'user-1',
              display_name: 'User One',
              email: 'user@example.com',
              avatar_url: null,
            },
          ],
          setBulkWorking: vi.fn(),
          clearSelection: vi.fn(),
          setBulkDeleteOpen: vi.fn(),
        }),
      { wrapper }
    );

    return result;
  }

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-09T10:00:00.000Z'));

    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    queryClient.setQueryData(['tasks', 'board-1'], [localTask, externalTask]);
    queryClient.setQueryData(
      ['tasks-full', 'board-1', 'all'],
      [localTask, externalTask]
    );

    const { bulkWorkspaceTasks } = await import('@tuturuuu/internal-api/tasks');
    mockBulkWorkspaceTasks = bulkWorkspaceTasks as any;
    vi.clearAllMocks();
  });

  it.each([
    [
      'priority',
      async (result: Awaited<ReturnType<typeof renderBulkOperations>>) =>
        result.current.bulkUpdatePriority('high'),
      {
        type: 'update_fields',
        updates: { priority: 'high' },
      },
    ],
    [
      'due date',
      async (result: Awaited<ReturnType<typeof renderBulkOperations>>) =>
        result.current.bulkUpdateDueDate('today'),
      () => ({
        type: 'update_fields',
        updates: { end_date: getEndOfTodayIso() },
      }),
    ],
    [
      'estimation',
      async (result: Awaited<ReturnType<typeof renderBulkOperations>>) =>
        result.current.bulkUpdateEstimation(5),
      {
        type: 'update_fields',
        updates: { estimation_points: 5 },
      },
    ],
  ])('groups %s updates by each task source workspace', async (_, run, operation) => {
    const result = await renderBulkOperations();
    const expectedOperation =
      typeof operation === 'function' ? operation() : operation;

    await act(async () => {
      await run(result);
    });

    expect(mockBulkWorkspaceTasks).toHaveBeenCalledTimes(2);
    expect(mockBulkWorkspaceTasks).toHaveBeenNthCalledWith(
      1,
      'personal-ws',
      {
        taskIds: ['local-task'],
        operation: expectedOperation,
      },
      expect.anything()
    );
    expect(mockBulkWorkspaceTasks).toHaveBeenNthCalledWith(
      2,
      'source-ws',
      {
        taskIds: ['external-task'],
        operation: expectedOperation,
      },
      expect.anything()
    );
  });

  it('updates mounted full-task caches during optimistic priority updates', async () => {
    const result = await renderBulkOperations();

    await act(async () => {
      await result.current.bulkUpdatePriority('high');
    });

    const fullTasks = queryClient.getQueryData<Task[]>([
      'tasks-full',
      'board-1',
      'all',
    ]);

    expect(fullTasks?.map((task) => [task.id, task.priority])).toEqual([
      ['local-task', 'high'],
      ['external-task', 'high'],
    ]);
  });

  it('rolls back only failed source-workspace ids on partial success', async () => {
    mockBulkWorkspaceTasks.mockImplementation(
      (workspaceId: string, payload: MockBulkPayload) =>
        Promise.resolve(
          workspaceId === 'source-ws'
            ? {
                successCount: 0,
                failCount: payload.taskIds.length,
                taskIds: payload.taskIds,
                succeededTaskIds: [],
                failures: payload.taskIds.map((taskId: string) => ({
                  taskId,
                  error: 'Task not found',
                })),
                taskMetaById: {},
              }
            : {
                successCount: payload.taskIds.length,
                failCount: 0,
                taskIds: payload.taskIds,
                succeededTaskIds: payload.taskIds,
                failures: [],
                taskMetaById: {},
              }
        )
    );
    const result = await renderBulkOperations();

    await act(async () => {
      await result.current.bulkUpdatePriority('high');
    });

    const tasks = queryClient.getQueryData<Task[]>(['tasks', 'board-1']);
    expect(tasks?.map((task) => [task.id, task.priority])).toEqual([
      ['local-task', 'high'],
      ['external-task', 'low'],
    ]);
  });

  it('groups assignee and delete mutations by each task source workspace', async () => {
    const result = await renderBulkOperations();

    await act(async () => {
      await result.current.bulkAddAssignee('user-1');
    });

    expect(mockBulkWorkspaceTasks).toHaveBeenNthCalledWith(
      1,
      'personal-ws',
      expect.objectContaining({
        taskIds: ['local-task'],
        operation: { type: 'add_assignee', assigneeId: 'user-1' },
      }),
      expect.anything()
    );
    expect(mockBulkWorkspaceTasks).toHaveBeenNthCalledWith(
      2,
      'source-ws',
      expect.objectContaining({
        taskIds: ['external-task'],
        operation: { type: 'add_assignee', assigneeId: 'user-1' },
      }),
      expect.anything()
    );

    mockBulkWorkspaceTasks.mockClear();

    await act(async () => {
      await result.current.bulkDeleteTasks();
    });

    expect(mockBulkWorkspaceTasks).toHaveBeenNthCalledWith(
      1,
      'personal-ws',
      expect.objectContaining({
        taskIds: ['local-task'],
        operation: {
          type: 'update_fields',
          updates: { deleted: true },
        },
      }),
      expect.anything()
    );
    expect(mockBulkWorkspaceTasks).toHaveBeenNthCalledWith(
      2,
      'source-ws',
      expect.objectContaining({
        taskIds: ['external-task'],
        operation: {
          type: 'update_fields',
          updates: { deleted: true },
        },
      }),
      expect.anything()
    );
  });

  it('keeps label and project overlays on the personal workspace route', async () => {
    const result = await renderBulkOperations();

    await act(async () => {
      await result.current.bulkAddLabel('label-1');
    });

    expect(mockBulkWorkspaceTasks).toHaveBeenCalledTimes(1);
    expect(mockBulkWorkspaceTasks).toHaveBeenCalledWith(
      'personal-ws',
      expect.objectContaining({
        taskIds: ['local-task', 'external-task'],
        operation: { type: 'add_label', labelId: 'label-1' },
      }),
      expect.anything()
    );

    mockBulkWorkspaceTasks.mockClear();

    await act(async () => {
      await result.current.bulkAddProject('project-1');
    });

    expect(mockBulkWorkspaceTasks).toHaveBeenCalledTimes(1);
    expect(mockBulkWorkspaceTasks).toHaveBeenCalledWith(
      'personal-ws',
      expect.objectContaining({
        taskIds: ['local-task', 'external-task'],
        operation: { type: 'add_project', projectId: 'project-1' },
      }),
      expect.anything()
    );
  });
});
