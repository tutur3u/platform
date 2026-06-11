import { act, renderHook } from '@testing-library/react';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TaskFilters } from '../../boards/boardId/task-filter';
import {
  TaskDialogProvider,
  useTaskDialogContext,
} from '../task-dialog-provider';

const { mockGetCurrentUserTask } = vi.hoisted(() => ({
  mockGetCurrentUserTask: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api/tasks', async () => {
  const actual = await vi.importActual<
    typeof import('@tuturuuu/internal-api/tasks')
  >('@tuturuuu/internal-api/tasks');

  return {
    ...actual,
    getCurrentUserTask: mockGetCurrentUserTask,
  };
});

// Mock task data
const mockTask: Task = {
  id: 'task-1',
  name: 'Test Task',
  description: 'Test description',
  priority: 'high',
  start_date: undefined,
  end_date: null,
  estimation_points: 5,
  list_id: 'list-1',
  labels: [],
  assignees: [],
  created_at: '2024-01-01T00:00:00Z',
  sort_key: 1000,
  display_number: 1,
};

const mockList: TaskList = {
  id: 'list-1',
  name: 'To Do',
  board_id: 'board-1',
  position: 0,
  status: 'not_started',
  color: 'BLUE',
  created_at: '2024-01-01T00:00:00Z',
  creator_id: 'user-1',
  archived: false,
  deleted: false,
};

// Wrapper component
const wrapper = ({ children }: { children: ReactNode }) => (
  <TaskDialogProvider>{children}</TaskDialogProvider>
);

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

describe('TaskDialogProvider', () => {
  afterEach(() => {
    mockGetCurrentUserTask.mockReset();
    vi.useRealTimers();
  });

  it('should enable collaborationMode for paid task workspaces opened by id', async () => {
    mockGetCurrentUserTask.mockResolvedValueOnce({
      task: {
        ...mockTask,
        list: { board_id: 'board-1' },
      },
      availableLists: [mockList],
      taskWsId: 'workspace-1',
      taskWorkspacePersonal: false,
      taskWorkspaceTier: 'PRO',
    });

    const { result } = renderHook(() => useTaskDialogContext(), { wrapper });

    await act(async () => {
      await result.current.openTaskById(mockTask.id);
    });

    expect(result.current.state.collaborationMode).toBe(true);
    expect(result.current.state.taskWorkspaceTier).toBe('PRO');
  });

  it('should disable collaborationMode for free task workspaces opened by id', async () => {
    mockGetCurrentUserTask.mockResolvedValueOnce({
      task: {
        ...mockTask,
        list: { board_id: 'board-1' },
      },
      availableLists: [mockList],
      taskWsId: 'workspace-1',
      taskWorkspacePersonal: false,
      taskWorkspaceTier: 'FREE',
    });

    const { result } = renderHook(() => useTaskDialogContext(), { wrapper });

    await act(async () => {
      await result.current.openTaskById(mockTask.id);
    });

    expect(result.current.state.collaborationMode).toBe(false);
    expect(result.current.state.taskWorkspaceTier).toBe('FREE');
  });

  it('opens by id immediately from an initial snapshot before hydrating task details', async () => {
    const deferred = createDeferred<{
      task: Task & { list?: { board_id?: string | null } | null };
      availableLists: TaskList[];
      taskWsId: string;
      taskWorkspacePersonal: boolean;
      taskWorkspaceTier: 'PRO';
    }>();
    mockGetCurrentUserTask.mockReturnValueOnce(deferred.promise);

    const { result } = renderHook(() => useTaskDialogContext(), { wrapper });
    let openPromise!: Promise<boolean>;

    act(() => {
      openPromise = result.current.openTaskById(mockTask.id, {
        initialTask: { ...mockTask, name: 'Visible snapshot' },
        boardId: 'board-1',
        availableLists: [mockList],
        taskWsId: 'workspace-1',
      });
    });

    expect(result.current.state).toMatchObject({
      isOpen: true,
      isHydratingTask: true,
      taskLoadError: false,
      boardId: 'board-1',
      realtimeEnabled: false,
      task: {
        id: mockTask.id,
        name: 'Visible snapshot',
      },
    });

    await act(async () => {
      deferred.resolve({
        task: {
          ...mockTask,
          name: 'Hydrated task',
          list: { board_id: 'board-1' },
        },
        availableLists: [mockList],
        taskWsId: 'workspace-1',
        taskWorkspacePersonal: false,
        taskWorkspaceTier: 'PRO',
      });
      await openPromise;
    });

    expect(result.current.state).toMatchObject({
      isOpen: true,
      isHydratingTask: false,
      taskLoadError: false,
      collaborationMode: true,
      realtimeEnabled: true,
      taskHydrationVersion: 1,
      taskWorkspaceTier: 'PRO',
      task: {
        id: mockTask.id,
        name: 'Hydrated task',
      },
    });
  });

  it('keeps the dialog open in a non-editable error state when hydration fails', async () => {
    const deferred = createDeferred<never>();
    mockGetCurrentUserTask.mockReturnValueOnce(deferred.promise);

    const { result } = renderHook(() => useTaskDialogContext(), { wrapper });
    let openPromise!: Promise<boolean>;

    act(() => {
      openPromise = result.current.openTaskById(mockTask.id, {
        initialTask: { ...mockTask, name: 'Visible snapshot' },
        boardId: 'board-1',
      });
    });

    expect(result.current.state.isOpen).toBe(true);
    expect(result.current.state.isHydratingTask).toBe(true);

    await act(async () => {
      deferred.reject(new Error('network failed'));
      await openPromise;
    });

    expect(result.current.state).toMatchObject({
      isOpen: true,
      isHydratingTask: false,
      taskLoadError: true,
      task: {
        id: mockTask.id,
        name: 'Visible snapshot',
      },
    });
  });

  it('ignores stale hydration responses after another task opens', async () => {
    const firstDeferred = createDeferred<{
      task: Task & { list?: { board_id?: string | null } | null };
      availableLists: TaskList[];
      taskWsId: string;
      taskWorkspacePersonal: boolean;
      taskWorkspaceTier: 'PRO';
    }>();
    mockGetCurrentUserTask.mockReturnValueOnce(firstDeferred.promise);

    const { result } = renderHook(() => useTaskDialogContext(), { wrapper });
    let firstOpenPromise!: Promise<boolean>;

    act(() => {
      firstOpenPromise = result.current.openTaskById('task-1', {
        initialTask: { ...mockTask, id: 'task-1', name: 'First snapshot' },
        boardId: 'board-1',
      });
    });
    act(() => {
      result.current.closeDialog();
    });
    act(() => {
      result.current.openTask(
        { ...mockTask, id: 'task-2', name: 'Second task' },
        'board-1',
        [mockList]
      );
    });

    expect(result.current.state).toMatchObject({
      isOpen: true,
      task: {
        id: 'task-2',
        name: 'Second task',
      },
    });

    await act(async () => {
      firstDeferred.resolve({
        task: {
          ...mockTask,
          id: 'task-1',
          name: 'Stale hydrated task',
          list: { board_id: 'board-1' },
        },
        availableLists: [mockList],
        taskWsId: 'workspace-1',
        taskWorkspacePersonal: false,
        taskWorkspaceTier: 'PRO',
      });
      await firstOpenPromise;
    });

    expect(result.current.state).toMatchObject({
      isOpen: true,
      task: {
        id: 'task-2',
        name: 'Second task',
      },
    });
  });

  it('should provide initial dialog state', () => {
    const { result } = renderHook(() => useTaskDialogContext(), { wrapper });

    expect(result.current.state).toEqual({
      isOpen: false,
      task: undefined,
      boardId: undefined,
      availableLists: undefined,
      mode: undefined,
      collaborationMode: undefined,
    });
  });

  it('should update state when openTask is called', () => {
    const { result } = renderHook(() => useTaskDialogContext(), { wrapper });

    act(() => {
      result.current.openTask(mockTask, 'board-1', [mockList]);
    });

    expect(result.current.state.isOpen).toBe(true);
    expect(result.current.state.task).toEqual(mockTask);
    expect(result.current.state.boardId).toBe('board-1');
    expect(result.current.state.availableLists).toEqual([mockList]);
    expect(result.current.state.mode).toBe('edit');
  });

  it('should create new task mode when createTask is called', () => {
    const { result } = renderHook(() => useTaskDialogContext(), { wrapper });

    act(() => {
      result.current.createTask('board-1', 'list-1', [mockList]);
    });

    expect(result.current.state.isOpen).toBe(true);
    expect(result.current.state.boardId).toBe('board-1');
    expect(result.current.state.availableLists).toEqual([mockList]);
    expect(result.current.state.mode).toBe('create');
    expect(result.current.state.task).toBeDefined();
    expect(result.current.state.task?.id).toBe('new');
    expect(result.current.state.task?.list_id).toBe('list-1');
  });

  it('should close dialog when closeDialog is called', () => {
    const { result } = renderHook(() => useTaskDialogContext(), { wrapper });

    // First open a task
    act(() => {
      result.current.openTask(mockTask, 'board-1', [mockList]);
    });

    expect(result.current.state.isOpen).toBe(true);

    // Then close it
    act(() => {
      result.current.closeDialog();
    });

    expect(result.current.state.isOpen).toBe(false);
  });

  it('should set collaborationMode to false for edit mode without presence context', () => {
    const { result } = renderHook(() => useTaskDialogContext(), { wrapper });

    act(() => {
      result.current.openTask(mockTask, 'board-1', [mockList]);
    });

    // Without WorkspacePresenceProvider, cursorsEnabled defaults to false
    // so collaborationMode is false even for edit mode
    expect(result.current.state.collaborationMode).toBe(false);
    expect(result.current.state.mode).toBe('edit');
  });

  it('should set collaborationMode to false for create mode', () => {
    const { result } = renderHook(() => useTaskDialogContext(), { wrapper });

    act(() => {
      result.current.createTask('board-1', 'list-1', [mockList]);
    });

    expect(result.current.state.collaborationMode).toBe(false);
    expect(result.current.state.mode).toBe('create');
  });

  it('should call onUpdate callback', () => {
    const { result } = renderHook(() => useTaskDialogContext(), { wrapper });

    // onUpdate should be a function
    expect(typeof result.current.onUpdate).toBe('function');

    // Should execute without error
    act(() => {
      result.current.onUpdate(() => {});
    });
  });

  it('should handle rapid open/close cycles', () => {
    const { result } = renderHook(() => useTaskDialogContext(), { wrapper });

    // Rapidly open and close multiple times
    for (let i = 0; i < 5; i++) {
      act(() => {
        result.current.openTask(mockTask, 'board-1', [mockList]);
      });

      expect(result.current.state.isOpen).toBe(true);

      act(() => {
        result.current.closeDialog();
      });

      expect(result.current.state.isOpen).toBe(false);
    }
  });

  it('queues the next task instead of replacing the active task immediately', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useTaskDialogContext(), { wrapper });

    const task1 = { ...mockTask, id: 'task-1', name: 'Task 1' };
    const task2 = { ...mockTask, id: 'task-2', name: 'Task 2' };

    act(() => {
      result.current.openTask(task1, 'board-1', [mockList]);
    });

    expect(result.current.state.task?.name).toBe('Task 1');

    act(() => {
      result.current.registerCloseRequestHandler(() => {
        result.current.closeDialog();
      });
    });

    act(() => {
      result.current.openTask(task2, 'board-1', [mockList]);
    });

    expect(result.current.state.isOpen).toBe(false);
    expect(result.current.state.task).toBeUndefined();

    act(() => {
      vi.runAllTimers();
    });

    expect(result.current.state.task?.name).toBe('Task 2');
    expect(result.current.state.isOpen).toBe(true);
  });

  it('allows queued task opens to retry after the active dialog blocks close', async () => {
    const { result } = renderHook(() => useTaskDialogContext(), { wrapper });

    const task1 = { ...mockTask, id: 'task-1', name: 'Task 1' };
    const task2 = { ...mockTask, id: 'task-2', name: 'Task 2' };
    const task3 = { ...mockTask, id: 'task-3', name: 'Task 3' };
    const requestClose = vi.fn().mockResolvedValue(false);

    act(() => {
      result.current.openTask(task1, 'board-1', [mockList]);
      result.current.registerCloseRequestHandler(requestClose);
    });

    await act(async () => {
      result.current.openTask(task2, 'board-1', [mockList]);
      await Promise.resolve();
    });

    expect(requestClose).toHaveBeenCalledTimes(1);
    expect(result.current.state.task?.name).toBe('Task 1');

    await act(async () => {
      result.current.openTask(task3, 'board-1', [mockList]);
      await Promise.resolve();
    });

    expect(requestClose).toHaveBeenCalledTimes(2);
    expect(result.current.state.task?.name).toBe('Task 1');
  });

  it('should handle empty availableLists', () => {
    const { result } = renderHook(() => useTaskDialogContext(), { wrapper });

    act(() => {
      result.current.openTask(mockTask, 'board-1', []);
    });

    expect(result.current.state.availableLists).toEqual([]);
    expect(result.current.state.isOpen).toBe(true);
  });

  it('should create task with correct default values', () => {
    const { result } = renderHook(() => useTaskDialogContext(), { wrapper });

    act(() => {
      result.current.createTask('board-1', 'list-1', [mockList]);
    });

    const newTask = result.current.state.task;
    expect(newTask).toBeDefined();
    expect(newTask?.id).toBe('new');
    expect(newTask?.name).toBe('');
    expect(newTask?.list_id).toBe('list-1');
    expect(newTask?.created_at).toBeDefined();
    // expect(newTask?.updated_at).toBeDefined();
  });

  it('should preserve list-scoped creation while applying initial task values', () => {
    const { result } = renderHook(() => useTaskDialogContext(), { wrapper });

    act(() => {
      result.current.createTask('board-1', 'list-1', [mockList], undefined, {
        end_date: '2026-03-07T16:59:59.999Z',
        list_id: 'other-list',
        name: 'Prefilled timeline task',
        start_date: '2026-03-07T00:00:00.000Z',
      });
    });

    expect(result.current.state.task).toMatchObject({
      end_date: '2026-03-07T16:59:59.999Z',
      list_id: 'list-1',
      name: 'Prefilled timeline task',
      start_date: '2026-03-07T00:00:00.000Z',
    });
  });

  it('should seed parent task state for createSubtask', () => {
    const { result } = renderHook(() => useTaskDialogContext(), { wrapper });

    act(() => {
      result.current.createSubtask(
        'task-parent',
        'Parent task',
        'board-1',
        'list-1',
        [mockList]
      );
    });

    expect(result.current.state.mode).toBe('create');
    expect(result.current.state.parentTaskId).toBe('task-parent');
    expect(result.current.state.parentTaskName).toBe('Parent task');
    expect(result.current.state.pendingRelationship).toBeUndefined();
  });

  it('should seed pending relationship state for createTaskWithRelationship', () => {
    const { result } = renderHook(() => useTaskDialogContext(), { wrapper });

    act(() => {
      result.current.createTaskWithRelationship(
        'blocking',
        'task-2',
        'Blocking task',
        'board-1',
        'list-1',
        [mockList]
      );
    });

    expect(result.current.state.mode).toBe('create');
    expect(result.current.state.parentTaskId).toBeUndefined();
    expect(result.current.state.pendingRelationship).toEqual({
      type: 'blocking',
      relatedTaskId: 'task-2',
      relatedTaskName: 'Blocking task',
    });
  });

  it('should store filters when createTask is called with board filters', () => {
    const { result } = renderHook(() => useTaskDialogContext(), { wrapper });
    const filters: TaskFilters = {
      assignees: [],
      dueDateRange: null,
      estimationRange: null,
      includeMyTasks: true,
      includeUnassigned: false,
      labels: [],
      priorities: ['high'],
      projects: [],
      searchQuery: 'launch',
      sourceBoardIds: [],
      sourceScope: 'all_visible',
      sourceWorkspaceIds: [],
      sortBy: 'priority-high' as const,
    };

    act(() => {
      result.current.createTask('board-1', 'list-1', [mockList], filters);
    });

    expect(result.current.state.filters).toEqual(filters);
  });
});
