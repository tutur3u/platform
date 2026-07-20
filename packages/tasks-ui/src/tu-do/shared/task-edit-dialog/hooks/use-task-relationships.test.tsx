/**
 * @vitest-environment jsdom
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceTaskLabel } from '../types';
import { useTaskRelationships } from './use-task-relationships';

const mocks = vi.hoisted(() => ({
  broadcast: vi.fn(),
  createWorkspaceLabel: vi.fn(),
  createWorkspaceProject: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  updateWorkspaceTask: vi.fn(),
}));

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}));

vi.mock('../../board-broadcast-context', () => ({
  useBoardBroadcast: () => mocks.broadcast,
}));

vi.mock('./task-api', () => ({
  createWorkspaceLabel: mocks.createWorkspaceLabel,
  createWorkspaceProject: mocks.createWorkspaceProject,
  updateWorkspaceTask: mocks.updateWorkspaceTask,
}));

describe('useTaskRelationships', () => {
  let queryClient: QueryClient;

  const existingLabel: WorkspaceTaskLabel = {
    id: 'label-existing',
    name: 'Beta',
    color: '#3b82f6',
    created_at: '2026-01-01T00:00:00.000Z',
  };

  const newLabel: WorkspaceTaskLabel = {
    id: 'label-new',
    name: 'Alpha',
    color: '#14b8a6',
    created_at: '2026-01-02T00:00:00.000Z',
  };

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    vi.clearAllMocks();
    mocks.createWorkspaceLabel.mockResolvedValue(newLabel);
    mocks.updateWorkspaceTask.mockResolvedValue({ task: { id: 'task-1' } });
  });

  it('adds labels created in the edit dialog to workspace label caches', async () => {
    const cachedTask = {
      id: 'task-1',
      labels: [],
    } as unknown as Task;

    queryClient.setQueryData(['tasks', 'board-1'], [cachedTask]);
    queryClient.setQueryData(['workspace-labels', 'real-ws'], [existingLabel]);
    queryClient.setQueryData(
      ['workspace_task_labels', 'real-ws'],
      [existingLabel]
    );

    const { result } = renderHook(
      () =>
        useTaskRelationships({
          wsId: 'personal',
          labelCacheWorkspaceId: 'real-ws',
          taskId: 'task-1',
          isCreateMode: false,
          boardId: 'board-1',
          selectedLabels: [],
          selectedAssignees: [],
          selectedProjects: [],
          newLabelName: 'Alpha',
          newLabelColor: '#14b8a6',
          newProjectName: '',
          setSelectedLabels: vi.fn(),
          setSelectedAssignees: vi.fn(),
          setSelectedProjects: vi.fn(),
          setAvailableLabels: vi.fn(),
          setNewLabelName: vi.fn(),
          setNewLabelColor: vi.fn(),
          setNewProjectName: vi.fn(),
          setShowNewLabelDialog: vi.fn(),
          setShowNewProjectDialog: vi.fn(),
          onUpdate: vi.fn(),
        }),
      { wrapper }
    );

    await act(async () => {
      await result.current.handleCreateLabel();
    });

    expect(mocks.createWorkspaceLabel).toHaveBeenCalledWith('personal', {
      name: 'Alpha',
      color: '#14b8a6',
    });
    expect(mocks.updateWorkspaceTask).toHaveBeenCalledWith(
      'personal',
      'task-1',
      {
        label_ids: ['label-new'],
      }
    );

    expect(
      queryClient.getQueryData<WorkspaceTaskLabel[]>([
        'workspace-labels',
        'real-ws',
      ])
    ).toEqual([newLabel, existingLabel]);
    expect(
      queryClient.getQueryData<WorkspaceTaskLabel[]>([
        'workspace-labels',
        'personal',
      ])
    ).toEqual([newLabel]);
    expect(
      queryClient.getQueryData<WorkspaceTaskLabel[]>([
        'workspace_task_labels',
        'real-ws',
      ])
    ).toEqual([newLabel, existingLabel]);
  });

  it('patches visible task caches when labels change without invalidating board task queries', async () => {
    const cachedTask = {
      id: 'task-1',
      labels: [],
    } as unknown as Task;

    queryClient.setQueryData(['tasks', 'board-1'], [cachedTask]);
    queryClient.setQueryData(['tasks-full', 'board-1', 'all'], [cachedTask]);
    queryClient.setQueryData(['task', 'task-1'], cachedTask);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(
      () =>
        useTaskRelationships({
          wsId: 'personal',
          taskId: 'task-1',
          isCreateMode: false,
          boardId: 'board-1',
          selectedLabels: [],
          selectedAssignees: [],
          selectedProjects: [],
          newLabelName: '',
          newLabelColor: '#14b8a6',
          newProjectName: '',
          setSelectedLabels: vi.fn(),
          setSelectedAssignees: vi.fn(),
          setSelectedProjects: vi.fn(),
          setAvailableLabels: vi.fn(),
          setNewLabelName: vi.fn(),
          setNewLabelColor: vi.fn(),
          setNewProjectName: vi.fn(),
          setShowNewLabelDialog: vi.fn(),
          setShowNewProjectDialog: vi.fn(),
          onUpdate: vi.fn(),
        }),
      { wrapper }
    );

    await act(async () => {
      await result.current.toggleLabel(newLabel);
    });

    expect(
      queryClient.getQueryData<Task[]>(['tasks', 'board-1'])?.[0]?.labels
    ).toEqual([newLabel]);
    expect(
      queryClient.getQueryData<Task[]>(['tasks-full', 'board-1', 'all'])?.[0]
        ?.labels
    ).toEqual([newLabel]);
    expect(queryClient.getQueryData<Task>(['task', 'task-1'])?.labels).toEqual([
      newLabel,
    ]);
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: ['tasks', 'board-1'],
    });
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: ['tasks-full', 'board-1'],
    });
    expect(mocks.broadcast).toHaveBeenCalledWith('task:relations-changed', {
      taskId: 'task-1',
    });
  });

  it('writes external task labels and projects through the personal overlay workspace', async () => {
    const project = { id: 'project-1', name: 'Personal', status: 'active' };
    const { result } = renderHook(
      () =>
        useTaskRelationships({
          wsId: 'source-workspace',
          relationshipWsId: 'personal-workspace',
          taskId: 'external-task',
          isCreateMode: false,
          boardId: 'source-board',
          selectedLabels: [],
          selectedAssignees: [],
          selectedProjects: [],
          newLabelName: '',
          newLabelColor: '#14b8a6',
          newProjectName: '',
          setSelectedLabels: vi.fn(),
          setSelectedAssignees: vi.fn(),
          setSelectedProjects: vi.fn(),
          setAvailableLabels: vi.fn(),
          setNewLabelName: vi.fn(),
          setNewLabelColor: vi.fn(),
          setNewProjectName: vi.fn(),
          setShowNewLabelDialog: vi.fn(),
          setShowNewProjectDialog: vi.fn(),
          onUpdate: vi.fn(),
        }),
      { wrapper }
    );

    await act(async () => {
      await result.current.toggleLabel(newLabel);
      await result.current.toggleProject(project);
    });

    expect(mocks.updateWorkspaceTask).toHaveBeenNthCalledWith(
      1,
      'personal-workspace',
      'external-task',
      { label_ids: ['label-new'] }
    );
    expect(mocks.updateWorkspaceTask).toHaveBeenNthCalledWith(
      2,
      'personal-workspace',
      'external-task',
      { project_ids: ['project-1'] }
    );
  });
});
