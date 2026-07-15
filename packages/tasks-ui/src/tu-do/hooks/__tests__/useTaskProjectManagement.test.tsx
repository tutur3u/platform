/**
 * @vitest-environment jsdom
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTaskProjectManagement } from '../useTaskProjectManagement';

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock('@tuturuuu/internal-api/tasks', () => ({
  createWorkspaceTaskProject: vi.fn(),
  updateWorkspaceTask: vi.fn(),
}));

describe('useTaskProjectManagement', () => {
  let queryClient: QueryClient;
  let mockUpdateWorkspaceTask: any;

  const project = {
    id: 'project-1',
    name: 'Roadmap',
    status: 'active',
  };

  const mockTask = {
    id: 'task-1',
    name: 'Test Task',
    list_id: 'list-1',
    display_number: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    projects: [],
  } satisfies Task;

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(async () => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    const { updateWorkspaceTask } = await import(
      '@tuturuuu/internal-api/tasks'
    );
    mockUpdateWorkspaceTask = updateWorkspaceTask as any;

    vi.clearAllMocks();
    mockUpdateWorkspaceTask.mockResolvedValue({ task: { id: 'task-1' } });
  });

  it('updates full-board and task detail caches without invalidating visible board queries', async () => {
    queryClient.setQueryData(['tasks', 'board-1'], [mockTask]);
    queryClient.setQueryData(['tasks-full', 'board-1', 'all'], [mockTask]);
    queryClient.setQueryData(['task', 'task-1'], mockTask);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(
      () =>
        useTaskProjectManagement({
          task: mockTask,
          boardId: 'board-1',
          workspaceProjects: [project],
          workspaceId: 'ws-1',
          taskId: 'task-1',
        }),
      { wrapper }
    );

    await act(async () => {
      await result.current.toggleTaskProject('project-1');
    });

    expect(
      queryClient
        .getQueryData<Task[]>(['tasks-full', 'board-1', 'all'])?.[0]
        ?.projects?.some((entry) => entry.id === 'project-1')
    ).toBe(true);
    expect(
      queryClient
        .getQueryData<Task>(['task', 'task-1'])
        ?.projects?.some((entry) => entry.id === 'project-1')
    ).toBe(true);
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: ['tasks', 'board-1'],
    });
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: ['tasks-full', 'board-1'],
    });
  });

  it('rolls back every visible cache when the project update fails', async () => {
    const taskWithProject = {
      ...mockTask,
      projects: [project],
    } as Task;
    mockUpdateWorkspaceTask.mockRejectedValueOnce(new Error('Database error'));
    queryClient.setQueryData(['tasks', 'board-1'], [taskWithProject]);
    queryClient.setQueryData(
      ['tasks-full', 'board-1', 'all'],
      [taskWithProject]
    );
    queryClient.setQueryData(['task', 'task-1'], taskWithProject);

    const { result } = renderHook(
      () =>
        useTaskProjectManagement({
          task: taskWithProject,
          boardId: 'board-1',
          workspaceProjects: [project],
          workspaceId: 'ws-1',
          taskId: 'task-1',
        }),
      { wrapper }
    );

    await act(async () => {
      await result.current.toggleTaskProject('project-1');
    });

    expect(queryClient.getQueryData<Task[]>(['tasks', 'board-1'])).toEqual([
      taskWithProject,
    ]);
    expect(
      queryClient.getQueryData<Task[]>(['tasks-full', 'board-1', 'all'])
    ).toEqual([taskWithProject]);
    expect(queryClient.getQueryData<Task>(['task', 'task-1'])).toEqual(
      taskWithProject
    );
  });
});
