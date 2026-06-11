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

const { mockDispatchTaskSoundCue } = vi.hoisted(() => ({
  mockDispatchTaskSoundCue: vi.fn(),
}));

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
  bulkWorkspaceTasks: vi.fn(() =>
    Promise.resolve({
      successCount: 1,
      succeededTaskIds: ['local-task'],
      failures: [],
      taskMetaById: {
        'local-task': {
          completed_at: null,
          closed_at: null,
        },
      },
    })
  ),
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

vi.mock('../../../../../shared/task-sound-effects', () => ({
  dispatchTaskSoundCue: mockDispatchTaskSoundCue,
}));

describe('bulk move mutations', () => {
  let queryClient: QueryClient;
  let wrapper: ({ children }: { children: ReactNode }) => ReactElement;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockBulkWorkspaceTasks: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockUpsertCurrentUserTaskPersonalPlacement: any;

  const sourceList = {
    id: 'list-1',
    name: 'Active',
    board_id: 'board-1',
    status: 'active',
    created_at: '2025-01-01T00:00:00Z',
    deleted: false,
  } as unknown as TaskList;

  const targetList = {
    id: 'list-2',
    name: 'Later',
    board_id: 'board-1',
    status: 'active',
    created_at: '2025-01-01T00:00:00Z',
    deleted: false,
  } as unknown as TaskList;

  const localTask = {
    id: 'local-task',
    name: 'Local task',
    ws_id: 'personal-ws',
    list_id: 'list-1',
    created_at: '2025-01-01T00:00:00Z',
    closed_at: null,
    completed_at: null,
  } as unknown as Task;

  const externalTask = {
    id: 'external-task',
    name: 'External task',
    ws_id: 'source-ws',
    list_id: 'list-1',
    personal_board_id: 'board-1',
    personal_list_id: 'list-1',
    source_workspace_id: 'source-ws',
    source_board_id: 'source-board',
    source_list_id: 'source-list',
    source_list_status: 'active',
    is_personal_external: true,
    is_personal_external_default: false,
    created_at: '2025-01-01T00:00:00Z',
    closed_at: null,
    completed_at: null,
  } as unknown as Task;

  beforeEach(async () => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { bulkWorkspaceTasks, upsertCurrentUserTaskPersonalPlacement } =
      await import('@tuturuuu/internal-api/tasks');
    mockBulkWorkspaceTasks = bulkWorkspaceTasks as any;
    mockUpsertCurrentUserTaskPersonalPlacement =
      upsertCurrentUserTaskPersonalPlacement as any;

    vi.clearAllMocks();
  });

  it('bulk-moves selected external tasks through personal placement', async () => {
    queryClient.setQueryData(['tasks', 'board-1'], [localTask, externalTask]);
    mockUpsertCurrentUserTaskPersonalPlacement.mockResolvedValueOnce({
      task: {
        ...externalTask,
        list_id: 'list-2',
        personal_list_id: 'list-2',
        personal_sort_key: 2_000_000,
        sort_key: 2_000_000,
      },
    });

    const { result } = renderHook(
      () =>
        useBulkOperations({
          queryClient,
          wsId: 'personal-ws',
          boardId: 'board-1',
          selectedTasks: new Set(['local-task', 'external-task']),
          columns: [sourceList, targetList],
          setBulkWorking: vi.fn(),
          clearSelection: vi.fn(),
          setBulkDeleteOpen: vi.fn(),
        }),
      { wrapper }
    );

    await act(async () => {
      await result.current.bulkMoveToList('list-2', 'Later');
    });

    expect(mockBulkWorkspaceTasks).toHaveBeenCalledWith(
      'personal-ws',
      {
        taskIds: ['local-task'],
        operation: {
          type: 'move_to_list',
          listId: 'list-2',
        },
      },
      expect.anything()
    );
    expect(mockUpsertCurrentUserTaskPersonalPlacement).toHaveBeenCalledWith(
      'external-task',
      expect.objectContaining({
        personal_board_id: 'board-1',
        personal_list_id: 'list-2',
      })
    );
    expect(mockDispatchTaskSoundCue).toHaveBeenCalledTimes(1);
    expect(mockDispatchTaskSoundCue).toHaveBeenCalledWith({
      count: 2,
      cue: 'move',
      intensity: 1.2,
    });
  });
});
