import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardBroadcastFn } from '../../../board-broadcast-context';
import type { WorkspaceTaskLabel } from '../../types';
import { useTaskRealtimeSync } from '../use-task-realtime-sync';

const taskApiMocks = vi.hoisted(() => ({
  getWorkspaceTask: vi.fn(),
}));

const boardRealtimeMocks = vi.hoisted(() => ({
  broadcast: vi.fn(),
  onTaskChange: undefined as
    | ((task: Task, eventType: 'INSERT' | 'UPDATE' | 'DELETE') => void)
    | undefined,
  onTaskRelationsChange: undefined as ((taskIds: string[]) => void) | undefined,
  useBoardRealtime: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api/tasks', () => ({
  getWorkspaceTask: taskApiMocks.getWorkspaceTask,
}));

vi.mock('@tuturuuu/ui/hooks/useBoardRealtime', () => ({
  useBoardRealtime: boardRealtimeMocks.useBoardRealtime,
}));

describe('useTaskRealtimeSync', () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  const makeProps = (
    overrides: Partial<Parameters<typeof useTaskRealtimeSync>[0]> = {}
  ): Parameters<typeof useTaskRealtimeSync>[0] => ({
    wsId: 'ws-1',
    taskWorkspaceId: undefined,
    taskId: 'task-1',
    boardId: 'board-1',
    isCreateMode: false,
    isOpen: true,
    isPersonalWorkspace: false,
    name: 'Initial task',
    priority: null,
    startDate: undefined,
    endDate: undefined,
    estimationPoints: null,
    selectedListId: 'list-1',
    pendingNameRef: { current: null },
    setName: vi.fn(),
    setPriority: vi.fn(),
    setStartDate: vi.fn(),
    setEndDate: vi.fn(),
    setEstimationPoints: vi.fn(),
    setSelectedListId: vi.fn(),
    setSelectedLabels: vi.fn(),
    setSelectedAssignees: vi.fn(),
    setSelectedProjects: vi.fn(),
    ...overrides,
  });

  beforeEach(() => {
    vi.resetAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { retry: false },
      },
    });
    boardRealtimeMocks.onTaskChange = undefined;
    boardRealtimeMocks.onTaskRelationsChange = undefined;
    boardRealtimeMocks.useBoardRealtime.mockImplementation(
      (
        _boardId: string,
        options?: {
          onTaskChange?: typeof boardRealtimeMocks.onTaskChange;
          onTaskRelationsChange?: typeof boardRealtimeMocks.onTaskRelationsChange;
        }
      ) => {
        boardRealtimeMocks.onTaskChange = options?.onTaskChange;
        boardRealtimeMocks.onTaskRelationsChange =
          options?.onTaskRelationsChange;
        return { broadcast: boardRealtimeMocks.broadcast };
      }
    );
  });

  it('refetches a matching task upsert before applying open dialog state', async () => {
    const start = '2026-05-22T01:00:00.000Z';
    const end = '2026-05-22T02:00:00.000Z';
    const props = makeProps();

    taskApiMocks.getWorkspaceTask.mockResolvedValueOnce({
      task: {
        id: 'task-1',
        name: 'Server task',
        priority: 'high',
        start_date: start,
        end_date: end,
        estimation_points: 5,
        list_id: 'list-2',
      },
    });

    renderHook(() => useTaskRealtimeSync(props), { wrapper });

    act(() => {
      boardRealtimeMocks.onTaskChange?.(
        {
          id: 'task-1',
          name: 'Untrusted broadcast task',
          priority: 'critical',
          start_date: '2026-05-23T01:00:00.000Z',
          end_date: '2026-05-23T02:00:00.000Z',
          estimation_points: 8,
          list_id: 'list-3',
        } as Task,
        'UPDATE'
      );
    });

    await waitFor(() => {
      expect(props.setName).toHaveBeenCalledWith('Server task');
    });
    expect(taskApiMocks.getWorkspaceTask).toHaveBeenCalledWith(
      'ws-1',
      'task-1'
    );
    expect(props.setName).not.toHaveBeenCalledWith('Untrusted broadcast task');
    expect(props.setPriority).toHaveBeenCalledWith('high');
    expect(props.setStartDate).toHaveBeenCalledWith(new Date(start));
    expect(props.setEndDate).toHaveBeenCalledWith(new Date(end));
    expect(props.setEstimationPoints).toHaveBeenCalledWith(5);
    expect(props.setSelectedListId).toHaveBeenCalledWith('list-2');
  });

  it('ignores task upserts for other tasks', () => {
    const props = makeProps();

    renderHook(() => useTaskRealtimeSync(props), { wrapper });

    act(() => {
      boardRealtimeMocks.onTaskChange?.(
        { id: 'other-task', name: 'Other task' } as Task,
        'UPDATE'
      );
    });

    expect(props.setName).not.toHaveBeenCalled();
    expect(props.setPriority).not.toHaveBeenCalled();
    expect(props.setSelectedListId).not.toHaveBeenCalled();
  });

  it('does not overwrite a local pending title edit', async () => {
    const props = makeProps({
      pendingNameRef: { current: 'Local draft title' },
    });
    taskApiMocks.getWorkspaceTask.mockResolvedValueOnce({
      task: { id: 'task-1', name: 'Remote title' },
    });

    renderHook(() => useTaskRealtimeSync(props), { wrapper });

    act(() => {
      boardRealtimeMocks.onTaskChange?.(
        { id: 'task-1', name: 'Remote title' } as Task,
        'UPDATE'
      );
    });

    await waitFor(() => {
      expect(taskApiMocks.getWorkspaceTask).toHaveBeenCalledWith(
        'ws-1',
        'task-1'
      );
    });
    expect(props.setName).not.toHaveBeenCalled();
  });

  it('refetches and applies relations when the open task changes', async () => {
    const label: WorkspaceTaskLabel = {
      id: 'label-1',
      name: 'Bug',
      color: 'red',
      created_at: '2026-05-22T00:00:00.000Z',
    };
    const props = makeProps();

    taskApiMocks.getWorkspaceTask.mockResolvedValueOnce({
      task: {
        id: 'task-1',
        labels: [label],
        assignees: [{ id: 'user-1', display_name: 'User 1' }],
        project_ids: ['project-2'],
        projects: [
          { id: 'project-1', name: 'Filtered out', status: 'active' },
          { id: 'project-2', name: 'Included', status: 'active' },
        ],
      },
    });

    renderHook(() => useTaskRealtimeSync(props), { wrapper });

    act(() => {
      boardRealtimeMocks.onTaskRelationsChange?.(['other-task', 'task-1']);
    });

    await waitFor(() => {
      expect(props.setSelectedLabels).toHaveBeenCalledWith([label]);
    });
    expect(taskApiMocks.getWorkspaceTask).toHaveBeenCalledWith(
      'ws-1',
      'task-1'
    );
    expect(props.setSelectedAssignees).toHaveBeenCalledWith([
      { id: 'user-1', display_name: 'User 1' },
    ]);
    expect(props.setSelectedProjects).toHaveBeenCalledWith([
      { id: 'project-2', name: 'Included', status: 'active' },
    ]);
  });

  it('returns the dialog-local board broadcast function', () => {
    const { result } = renderHook(() => useTaskRealtimeSync(makeProps()), {
      wrapper,
    });

    expect((result.current as { broadcast?: BoardBroadcastFn }).broadcast).toBe(
      boardRealtimeMocks.broadcast
    );
  });
});
