import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { updateWorkspaceTask } from '../task-api';
import {
  type UseTaskMutationsProps,
  useTaskMutations,
} from '../use-task-mutations';

vi.mock('../task-api', () => ({
  updateWorkspaceTask: vi.fn(),
}));

vi.mock('@tuturuuu/ui/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

describe('useTaskMutations', () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  const personalOverlayTask = {
    id: 'task-1',
    name: 'Overlay task',
    description: '',
    display_number: 1,
    created_at: '2026-07-07T00:00:00.000Z',
    list_id: 'personal-list',
    personal_board_id: 'personal-board',
    personal_list_id: 'personal-list',
    personal_sort_key: 1234,
    sort_key: 1234,
    source_workspace_id: 'source-ws',
    source_board_id: 'source-board',
    source_list_id: 'source-list',
    source_list_name: 'Source list',
    source_list_status: 'active',
    is_personal_external: true,
    priority: 'normal',
    estimation_points: 3,
    end_date: null,
    labels: [],
    assignees: [],
    projects: [],
  } satisfies Task;

  const sourceTask = {
    ...personalOverlayTask,
    list_id: 'source-list',
    personal_board_id: null,
    personal_list_id: null,
    personal_sort_key: null,
    is_personal_external: false,
  } satisfies Task;

  function makeProps(
    overrides: Partial<UseTaskMutationsProps> = {}
  ): UseTaskMutationsProps {
    return {
      wsId: 'source-ws',
      taskId: 'task-1',
      isCreateMode: false,
      boardId: 'source-board',
      visibleBoardId: 'personal-board',
      visibleTaskSnapshot: personalOverlayTask,
      estimationPoints: 3,
      priority: 'normal',
      selectedListId: 'source-list',
      taskName: 'Overlay task',
      setEstimationPoints: vi.fn(),
      setPriority: vi.fn(),
      setStartDate: vi.fn(),
      setEndDate: vi.fn(),
      setSelectedListId: vi.fn(),
      fallbackBroadcast: null,
      onUpdate: vi.fn(),
      ...overrides,
    };
  }

  function getPersonalOverlayCacheTask() {
    return queryClient.getQueryData<Task[]>(['tasks', 'personal-board'])?.[0] as
      | (Task & { _localMutationAt?: number })
      | undefined;
  }

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    queryClient.setQueryData(
      ['tasks', 'personal-board'],
      [personalOverlayTask]
    );
    vi.mocked(updateWorkspaceTask).mockReset();
  });

  afterEach(() => {
    queryClient.clear();
    vi.restoreAllMocks();
  });

  it('keeps a personal external card in the personal board cache when priority changes', async () => {
    const onUpdate = vi.fn();
    vi.mocked(updateWorkspaceTask).mockResolvedValueOnce({
      task: {
        ...sourceTask,
        priority: 'high',
        list_id: 'source-list',
      },
    });

    const { result } = renderHook(
      () => useTaskMutations(makeProps({ onUpdate })),
      { wrapper }
    );

    await act(async () => {
      await result.current.updatePriority('high');
    });

    expect(updateWorkspaceTask).toHaveBeenCalledWith('source-ws', 'task-1', {
      priority: 'high',
    });
    expect(onUpdate).not.toHaveBeenCalled();
    expect(getPersonalOverlayCacheTask()).toMatchObject({
      id: 'task-1',
      priority: 'high',
      list_id: 'personal-list',
      personal_board_id: 'personal-board',
      personal_list_id: 'personal-list',
      personal_sort_key: 1234,
      source_board_id: 'source-board',
      source_list_id: 'source-list',
      _localMutationAt: expect.any(Number),
    });
  });

  it('preserves personal placement while updating date, estimate, and name fields', async () => {
    const startIso = '2026-07-08T00:00:00.000Z';
    const endIso = '2026-07-09T00:00:00.000Z';
    const onUpdate = vi.fn();

    vi.mocked(updateWorkspaceTask)
      .mockResolvedValueOnce({
        task: { ...sourceTask, start_date: startIso, list_id: 'source-list' },
      })
      .mockResolvedValueOnce({
        task: { ...sourceTask, end_date: endIso, list_id: 'source-list' },
      })
      .mockResolvedValueOnce({
        task: {
          ...sourceTask,
          estimation_points: 8,
          list_id: 'source-list',
        },
      })
      .mockResolvedValueOnce({
        task: { ...sourceTask, name: 'Renamed task', list_id: 'source-list' },
      });

    const { result } = renderHook(
      () => useTaskMutations(makeProps({ onUpdate })),
      { wrapper }
    );

    await act(async () => {
      await result.current.updateStartDate(new Date(startIso));
      await result.current.updateEndDate(new Date(endIso));
      await result.current.updateEstimation(8);
      await result.current.saveNameToDatabase('Renamed task');
    });

    expect(onUpdate).not.toHaveBeenCalled();
    expect(getPersonalOverlayCacheTask()).toMatchObject({
      id: 'task-1',
      name: 'Renamed task',
      list_id: 'personal-list',
      personal_list_id: 'personal-list',
      start_date: startIso,
      end_date: endIso,
      estimation_points: 8,
      _localMutationAt: expect.any(Number),
    });
  });

  it('keeps normal source-board property refresh behavior unchanged', async () => {
    const onUpdate = vi.fn();
    queryClient.setQueryData(['tasks', 'source-board'], [sourceTask]);
    vi.mocked(updateWorkspaceTask).mockResolvedValueOnce({
      task: { ...sourceTask, priority: 'high' },
    });

    const { result } = renderHook(
      () =>
        useTaskMutations(
          makeProps({
            onUpdate,
            visibleBoardId: undefined,
            visibleTaskSnapshot: undefined,
          })
        ),
      { wrapper }
    );

    await act(async () => {
      await result.current.updatePriority('high');
    });

    const sourceCacheTask = queryClient.getQueryData<Task[]>([
      'tasks',
      'source-board',
    ])?.[0] as (Task & { _localMutationAt?: number }) | undefined;

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(sourceCacheTask).toMatchObject({
      id: 'task-1',
      priority: 'high',
      list_id: 'source-list',
    });
    expect(sourceCacheTask?._localMutationAt).toBeUndefined();
  });
});
