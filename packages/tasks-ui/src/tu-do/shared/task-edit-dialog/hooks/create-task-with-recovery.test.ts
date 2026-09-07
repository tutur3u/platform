import { QueryClient } from '@tanstack/react-query';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCreateTask,
  mockCreateWorkspaceTaskRelationship,
  mockDispatchTaskSoundCue,
  mockUpdateTask,
  mockUpdateDescription,
  mockSaveScheduling,
} = vi.hoisted(() => ({
  mockCreateTask: vi.fn(),
  mockSaveScheduling: vi.fn(),
  mockUpdateTask: vi.fn(),
  mockUpdateDescription: vi.fn(),
  mockCreateWorkspaceTaskRelationship: vi.fn(),
  mockDispatchTaskSoundCue: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tuturuuu/internal-api')>()),
  updateCurrentUserTaskSchedulingSettings: mockSaveScheduling,
}));

vi.mock('@tuturuuu/internal-api/tasks', async () => {
  const actual = await vi.importActual<
    typeof import('@tuturuuu/internal-api/tasks')
  >('@tuturuuu/internal-api/tasks');

  return {
    ...actual,
    createWorkspaceTaskRelationship: mockCreateWorkspaceTaskRelationship,
  };
});

vi.mock('@tuturuuu/supabase/next/client', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'user-1' } },
      }),
    },
  })),
}));

vi.mock('@tuturuuu/utils/task-helper', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tuturuuu/utils/task-helper')>()),
  createTask: mockCreateTask,
}));

vi.mock('./task-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./task-api')>()),
  updateWorkspaceTask: mockUpdateTask,
  updateWorkspaceTaskDescription: mockUpdateDescription,
}));

vi.mock('../../task-sound-effects', () => ({
  dispatchTaskSoundCue: mockDispatchTaskSoundCue,
}));

import { handleCreateTask } from './use-task-save';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockSaveScheduling.mockResolvedValue({ settings: {} });
});

function createOptions(
  overrides: Partial<Parameters<typeof handleCreateTask>[0]> = {}
): Parameters<typeof handleCreateTask>[0] {
  return {
    autoSchedule: false,
    boardId: 'board-1',
    broadcast: null,
    calendarHours: null,
    createMultiple: false,
    descriptionString: null,
    descriptionYjsState: null,
    endDate: undefined,
    estimationPoints: null,
    isPersonalWorkspace: false,
    isSplittable: false,
    maxSplitDurationMinutes: null,
    minSplitDurationMinutes: null,
    name: 'Instant task',
    onClose: vi.fn(),
    onUpdate: vi.fn(),
    priority: null,
    queryClient: new QueryClient(),
    selectedAssignees: [],
    selectedLabels: [],
    selectedListId: 'list-1',
    selectedProjects: [],
    setDescription: vi.fn(),
    setEndDate: vi.fn(),
    setEstimationPoints: vi.fn(),
    setIsLoading: vi.fn(),
    setIsSaving: vi.fn(),
    setName: vi.fn(),
    setPriority: vi.fn(),
    setSelectedAssignees: vi.fn(),
    setSelectedLabels: vi.fn(),
    setSelectedProjects: vi.fn(),
    setStartDate: vi.fn(),
    startDate: undefined,
    toast: vi.fn(),
    totalDuration: null,
    user: { id: 'user-1' },
    userTaskSettings: { task_auto_assign_to_self: false },
    wsId: 'ws-1',
    ...overrides,
  };
}

describe('handleCreateTask', () => {
  it('retains a confirmed task and draft when scheduling fails, then retries that row', async () => {
    const options = createOptions({ totalDuration: 2 });
    localStorage.setItem(
      'tu-do:task-draft:board-1',
      JSON.stringify({ name: options.name, totalDuration: 2 })
    );
    mockCreateTask.mockResolvedValue({
      id: 'saved-row',
      name: options.name,
      list_id: 'list-1',
    });
    mockSaveScheduling.mockRejectedValueOnce(
      new Error('Scheduling unavailable')
    );
    await handleCreateTask(options);
    expect(options.onClose).not.toHaveBeenCalled();
    expect(options.setName).not.toHaveBeenCalled();
    expect(
      JSON.parse(localStorage.getItem('tu-do:task-draft:board-1')!)
        .persistedTask.id
    ).toBe('saved-row');
    mockUpdateTask.mockResolvedValue({});
    mockUpdateDescription.mockResolvedValue({});
    await handleCreateTask(options);
    expect(mockCreateTask).toHaveBeenCalledTimes(1);
    expect(options.onClose).toHaveBeenCalledOnce();
  });

  it('keeps the form open until task creation is confirmed', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const onClose = vi.fn();
    let resolveCreateTask!: (task: Task) => void;
    const createTaskPromise = new Promise<Task>((resolve) => {
      resolveCreateTask = resolve;
    });

    queryClient.setQueryData(['tasks', 'board-1'], []);
    queryClient.setQueryData(['tasks-full', 'board-1', 'filtered'], []);
    mockCreateTask.mockReturnValueOnce(createTaskPromise);

    const savePromise = handleCreateTask({
      autoSchedule: false,
      boardId: 'board-1',
      broadcast: null,
      calendarHours: null,
      createMultiple: false,
      descriptionString: null,
      descriptionYjsState: null,
      endDate: undefined,
      estimationPoints: null,
      isPersonalWorkspace: false,
      isSplittable: false,
      maxSplitDurationMinutes: null,
      minSplitDurationMinutes: null,
      name: 'Instant task',
      onClose,
      onUpdate: vi.fn(),
      priority: null,
      queryClient,
      selectedAssignees: [],
      selectedLabels: [],
      selectedListId: 'list-1',
      selectedProjects: [],
      setDescription: vi.fn(),
      setEndDate: vi.fn(),
      setEstimationPoints: vi.fn(),
      setIsLoading: vi.fn(),
      setIsSaving: vi.fn(),
      setName: vi.fn(),
      setPriority: vi.fn(),
      setSelectedAssignees: vi.fn(),
      setSelectedLabels: vi.fn(),
      setSelectedProjects: vi.fn(),
      setStartDate: vi.fn(),
      startDate: undefined,
      toast: vi.fn(),
      totalDuration: null,
      user: { id: 'user-1' },
      userTaskSettings: { task_auto_assign_to_self: false },
      wsId: 'ws-1',
    });

    const pendingTasks = queryClient.getQueryData<Task[]>(['tasks', 'board-1']);
    expect(pendingTasks).toEqual([
      expect.objectContaining({
        _isOptimistic: true,
        list_id: 'list-1',
        name: 'Instant task',
      }),
    ]);
    expect(
      queryClient.getQueryData(['tasks-full', 'board-1', 'filtered'])
    ).toEqual(pendingTasks);
    expect(onClose).not.toHaveBeenCalled();

    resolveCreateTask({
      assignees: [],
      created_at: '2026-08-14T00:00:00.000Z',
      id: 'task-new',
      labels: [],
      list_id: 'list-1',
      name: 'Instant task',
      projects: [],
    } as unknown as Task);
    await savePromise;
    expect(onClose).toHaveBeenCalledOnce();

    expect(queryClient.getQueryData<Task[]>(['tasks', 'board-1'])).toEqual([
      expect.objectContaining({
        id: 'task-new',
        name: 'Instant task',
      }),
    ]);
    expect(
      queryClient.getQueryData<Task[]>(['tasks', 'board-1'])?.[0] as Task & {
        _isOptimistic?: boolean;
      }
    ).not.toHaveProperty('_isOptimistic');
  });

  it('preserves the form and removes only the failed optimistic task when creation rejects', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const onClose = vi.fn();
    let rejectCreateTask!: (error: Error) => void;
    const setName = vi.fn();
    const setDescription = vi.fn();
    const toast = vi.fn();
    const createTaskPromise = new Promise<Task>((_, reject) => {
      rejectCreateTask = reject;
    });

    queryClient.setQueryData(['tasks', 'board-1'], []);
    queryClient.setQueryData(['tasks-full', 'board-1', 'filtered'], []);
    mockCreateTask.mockReturnValueOnce(createTaskPromise);

    const savePromise = handleCreateTask({
      autoSchedule: false,
      boardId: 'board-1',
      broadcast: null,
      calendarHours: null,
      createMultiple: false,
      descriptionString: null,
      descriptionYjsState: null,
      endDate: undefined,
      estimationPoints: null,
      isPersonalWorkspace: false,
      isSplittable: false,
      maxSplitDurationMinutes: null,
      minSplitDurationMinutes: null,
      name: 'Instant task',
      onClose,
      onUpdate: vi.fn(),
      priority: null,
      queryClient,
      selectedAssignees: [],
      selectedLabels: [],
      selectedListId: 'list-1',
      selectedProjects: [],
      setDescription,
      setEndDate: vi.fn(),
      setEstimationPoints: vi.fn(),
      setIsLoading: vi.fn(),
      setIsSaving: vi.fn(),
      setName,
      setPriority: vi.fn(),
      setSelectedAssignees: vi.fn(),
      setSelectedLabels: vi.fn(),
      setSelectedProjects: vi.fn(),
      setStartDate: vi.fn(),
      startDate: undefined,
      toast,
      totalDuration: null,
      user: { id: 'user-1' },
      userTaskSettings: { task_auto_assign_to_self: false },
      wsId: 'ws-1',
    });

    const pendingTasks = queryClient.getQueryData<Task[]>(['tasks', 'board-1']);
    expect(pendingTasks).toEqual([
      expect.objectContaining({
        _isOptimistic: true,
        list_id: 'list-1',
        name: 'Instant task',
      }),
    ]);
    expect(
      queryClient.getQueryData(['tasks-full', 'board-1', 'filtered'])
    ).toEqual(pendingTasks);
    expect(onClose).not.toHaveBeenCalled();

    rejectCreateTask(new Error('Network request failed'));
    await savePromise;
    expect(onClose).not.toHaveBeenCalled();
    expect(setName).not.toHaveBeenCalled();
    expect(setDescription).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(['tasks', 'board-1'])).toEqual([]);
    expect(
      queryClient.getQueryData(['tasks-full', 'board-1', 'filtered'])
    ).toEqual([]);
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive' })
    );
  });

  it('resumes a confirmed task after a description failure without creating a duplicate', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const onClose = vi.fn();
    const setName = vi.fn();
    const setDescription = vi.fn();
    const toast = vi.fn();
    const savedTask = {
      id: 'saved-row',
      name: 'Instant task',
      list_id: 'list-1',
    } as Task;
    localStorage.setItem(
      'tu-do:task-draft:board-1',
      JSON.stringify({
        name: 'Instant task',
        persistedTask: savedTask,
        persistedWorkspaceId: 'ws-1',
      })
    );
    mockUpdateTask.mockResolvedValue({ task: savedTask });
    mockUpdateDescription.mockResolvedValue({ task: savedTask });
    queryClient.setQueryData(['tasks', 'board-1'], []);
    queryClient.setQueryData(['tasks-full', 'board-1', 'filtered'], []);

    const savePromise = handleCreateTask({
      autoSchedule: false,
      boardId: 'board-1',
      broadcast: null,
      calendarHours: null,
      createMultiple: false,
      descriptionString: null,
      descriptionYjsState: null,
      endDate: undefined,
      estimationPoints: null,
      isPersonalWorkspace: false,
      isSplittable: false,
      maxSplitDurationMinutes: null,
      minSplitDurationMinutes: null,
      name: 'Instant task',
      onClose,
      onUpdate: vi.fn(),
      priority: null,
      queryClient,
      selectedAssignees: [],
      selectedLabels: [],
      selectedListId: 'list-1',
      selectedProjects: [],
      setDescription,
      setEndDate: vi.fn(),
      setEstimationPoints: vi.fn(),
      setIsLoading: vi.fn(),
      setIsSaving: vi.fn(),
      setName,
      setPriority: vi.fn(),
      setSelectedAssignees: vi.fn(),
      setSelectedLabels: vi.fn(),
      setSelectedProjects: vi.fn(),
      setStartDate: vi.fn(),
      startDate: undefined,
      toast,
      totalDuration: null,
      user: { id: 'user-1' },
      userTaskSettings: { task_auto_assign_to_self: false },
      wsId: 'ws-1',
    });

    const pendingTasks = queryClient.getQueryData<Task[]>(['tasks', 'board-1']);
    expect(pendingTasks).toEqual([
      expect.objectContaining({
        _isOptimistic: true,
        list_id: 'list-1',
        name: 'Instant task',
      }),
    ]);
    expect(
      queryClient.getQueryData(['tasks-full', 'board-1', 'filtered'])
    ).toEqual(pendingTasks);
    expect(onClose).not.toHaveBeenCalled();

    await savePromise;
    expect(mockCreateTask).not.toHaveBeenCalled();
    expect(mockSaveScheduling).toHaveBeenCalledWith(
      'saved-row',
      expect.objectContaining({
        total_duration: null,
        is_splittable: false,
        auto_schedule: false,
      })
    );
    expect(mockUpdateTask).toHaveBeenCalledWith(
      'ws-1',
      'saved-row',
      expect.objectContaining({ name: 'Instant task' })
    );
    expect(mockUpdateDescription).toHaveBeenCalledWith(
      'ws-1',
      'saved-row',
      expect.any(Object)
    );
    expect(onClose).toHaveBeenCalledOnce();
    expect(localStorage.getItem('tu-do:task-draft:board-1')).toBeNull();
    expect(queryClient.getQueryData<Task[]>(['tasks', 'board-1'])).toEqual([
      expect.objectContaining({ id: 'saved-row' }),
    ]);
  });

  it('dispatches the create sound cue once after successful task creation', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const toast = vi.fn();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    mockCreateTask.mockResolvedValueOnce({
      id: 'task-new',
      name: 'New task',
      list_id: 'list-1',
      created_at: '2026-01-01T00:00:00Z',
    });

    await handleCreateTask({
      autoSchedule: false,
      boardId: 'board-1',
      broadcast: null,
      calendarHours: null,
      createMultiple: false,
      descriptionString: null,
      descriptionYjsState: null,
      endDate: undefined,
      estimationPoints: null,
      isPersonalWorkspace: false,
      isSplittable: false,
      maxSplitDurationMinutes: null,
      minSplitDurationMinutes: null,
      name: 'New task',
      onClose: vi.fn(),
      onUpdate: vi.fn(),
      priority: null,
      queryClient,
      selectedAssignees: [],
      selectedLabels: [],
      selectedListId: 'list-1',
      selectedProjects: [],
      setDescription: vi.fn(),
      setEndDate: vi.fn(),
      setEstimationPoints: vi.fn(),
      setIsLoading: vi.fn(),
      setIsSaving: vi.fn(),
      setName: vi.fn(),
      setPriority: vi.fn(),
      setSelectedAssignees: vi.fn(),
      setSelectedLabels: vi.fn(),
      setSelectedProjects: vi.fn(),
      setStartDate: vi.fn(),
      startDate: undefined,
      toast,
      totalDuration: null,
      user: { id: 'user-1' },
      userTaskSettings: { task_auto_assign_to_self: false },
      wsId: 'ws-1',
    });

    expect(mockCreateTask).toHaveBeenCalledWith(
      'ws-1',
      'list-1',
      expect.objectContaining({
        name: 'New task',
      })
    );
    expect(mockDispatchTaskSoundCue).toHaveBeenCalledTimes(1);
    expect(mockDispatchTaskSoundCue).toHaveBeenCalledWith('create');
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['task-list-counts', 'board-1'],
    });
  });
});
