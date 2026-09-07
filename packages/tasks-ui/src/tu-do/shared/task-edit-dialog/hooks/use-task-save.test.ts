import { QueryClient } from '@tanstack/react-query';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCreateTask,
  mockCreateWorkspaceTaskRelationship,
  mockDispatchTaskSoundCue,
  mockUpdateTask,
  mockUpdateDescription,
} = vi.hoisted(() => ({
  mockCreateTask: vi.fn(),
  mockUpdateTask: vi.fn(),
  mockUpdateDescription: vi.fn(),
  mockCreateWorkspaceTaskRelationship: vi.fn(),
  mockDispatchTaskSoundCue: vi.fn(),
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

import {
  applyPendingRelationshipSummary,
  handleCreateTask,
  persistPendingTaskRelationships,
} from './use-task-save';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('persistPendingTaskRelationships', () => {
  it('persists pending relationships in deterministic order and invalidates affected tasks', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    mockCreateWorkspaceTaskRelationship.mockResolvedValue({});

    const affectedTaskIds = await persistPendingTaskRelationships(
      'workspace-1',
      'task-new',
      {
        parentTask: { id: 'task-parent', name: 'Parent task' },
        childTasks: [{ id: 'task-child', name: 'Child task' }],
        blockingTasks: [{ id: 'task-blocked', name: 'Blocked task' }],
        blockedByTasks: [{ id: 'task-blocker', name: 'Blocker task' }],
        relatedTasks: [{ id: 'task-related', name: 'Related task' }],
      },
      queryClient
    );

    expect(
      mockCreateWorkspaceTaskRelationship.mock.calls.map((call) => ({
        routeTaskId: call[1],
        sourceTaskId: call[2].source_task_id,
        targetTaskId: call[2].target_task_id,
        type: call[2].type,
      }))
    ).toEqual([
      {
        routeTaskId: 'task-parent',
        sourceTaskId: 'task-parent',
        targetTaskId: 'task-new',
        type: 'parent_child',
      },
      {
        routeTaskId: 'task-new',
        sourceTaskId: 'task-new',
        targetTaskId: 'task-child',
        type: 'parent_child',
      },
      {
        routeTaskId: 'task-new',
        sourceTaskId: 'task-new',
        targetTaskId: 'task-blocked',
        type: 'blocks',
      },
      {
        routeTaskId: 'task-blocker',
        sourceTaskId: 'task-blocker',
        targetTaskId: 'task-new',
        type: 'blocks',
      },
      {
        routeTaskId: 'task-related',
        sourceTaskId: 'task-related',
        targetTaskId: 'task-new',
        type: 'related',
      },
    ]);

    expect(new Set(affectedTaskIds)).toEqual(
      new Set([
        'task-new',
        'task-parent',
        'task-child',
        'task-blocked',
        'task-blocker',
        'task-related',
      ])
    );
    expect(invalidateSpy).toHaveBeenCalledTimes(6);
  });
});

describe('applyPendingRelationshipSummary', () => {
  it('updates task cache relationship summaries for the new and affected tasks', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    queryClient.setQueryData(
      ['tasks', 'board-1'],
      [
        {
          id: 'task-parent',
          name: 'Parent',
          list_id: 'list-1',
          display_number: 1,
          created_at: '2024-01-01T00:00:00Z',
          relationship_summary: {
            parent_task_id: null,
            parent_task: null,
            child_count: 2,
            blocked_by_count: 0,
            blocking_count: 0,
            related_count: 0,
          },
        },
        {
          id: 'task-child',
          name: 'Child',
          list_id: 'list-1',
          display_number: 2,
          created_at: '2024-01-01T00:00:00Z',
          relationship_summary: {
            parent_task_id: null,
            parent_task: null,
            child_count: 0,
            blocked_by_count: 0,
            blocking_count: 0,
            related_count: 0,
          },
        },
        {
          id: 'task-new',
          name: 'New',
          list_id: 'list-1',
          display_number: 3,
          created_at: '2024-01-01T00:00:00Z',
        },
      ]
    );

    applyPendingRelationshipSummary({
      boardId: 'board-1',
      newTaskId: 'task-new',
      queryClient,
      pendingTaskRelationships: {
        parentTask: { id: 'task-parent', name: 'Parent' },
        childTasks: [{ id: 'task-child', name: 'Child' }],
        blockingTasks: [],
        blockedByTasks: [],
        relatedTasks: [],
      },
    });

    expect(queryClient.getQueryData(['tasks', 'board-1'])).toEqual([
      expect.objectContaining({
        id: 'task-parent',
        relationship_summary: expect.objectContaining({ child_count: 3 }),
      }),
      expect.objectContaining({
        id: 'task-child',
        relationship_summary: expect.objectContaining({
          parent_task_id: 'task-new',
          parent_task: expect.objectContaining({
            id: 'task-new',
            name: 'New',
          }),
        }),
      }),
      expect.objectContaining({
        id: 'task-new',
        relationship_summary: {
          parent_task_id: 'task-parent',
          parent_task: {
            id: 'task-parent',
            name: 'Parent',
            display_number: null,
            ticket_prefix: null,
          },
          child_count: 1,
          completed_child_count: 0,
          blocked_by_count: 0,
          blocking_count: 0,
          related_count: 0,
        },
      }),
    ]);
  });
});

describe('handleCreateTask', () => {
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
