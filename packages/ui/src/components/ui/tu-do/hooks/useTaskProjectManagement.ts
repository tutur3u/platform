import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createWorkspaceTaskProject,
  updateWorkspaceTask,
} from '@tuturuuu/internal-api/tasks';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { toast } from '@tuturuuu/ui/sonner';
import { useState } from 'react';
import { useBoardBroadcast } from '../shared/board-broadcast-context';

function getInternalApiOptions() {
  if (typeof window === 'undefined') {
    return undefined;
  }

  return { baseUrl: window.location.origin };
}

interface TaskProject {
  id: string;
  name: string;
  status: string | null;
}

interface UseTaskProjectManagementProps {
  task: Task;
  boardId: string;
  workspaceProjects: TaskProject[];
  workspaceId?: string;
  selectedTasks?: Set<string>; // For bulk operations
  isMultiSelectMode?: boolean;
  onClearSelection?: () => void;
  taskId?: string; // Optional task ID for syncing individual task cache
}

export function useTaskProjectManagement({
  task,
  boardId,
  workspaceProjects,
  workspaceId,
  selectedTasks,
  isMultiSelectMode,
  taskId,
}: UseTaskProjectManagementProps) {
  const queryClient = useQueryClient();
  const broadcast = useBoardBroadcast();
  const [newProjectName, setNewProjectName] = useState('');

  const createProjectMutation = useMutation({
    mutationFn: async (name: string) => {
      if (!workspaceId) {
        throw new Error('Workspace context is missing');
      }

      return createWorkspaceTaskProject(
        workspaceId,
        { name: name.trim() },
        getInternalApiOptions()
      );
    },
    onSuccess: (newProject) => {
      if (!workspaceId) return;

      queryClient.setQueryData(
        ['task_projects', workspaceId],
        (old: TaskProject[] | undefined) => {
          if (!old) return [newProject];
          if (old.some((project) => project.id === newProject.id)) {
            return old;
          }

          return [...old, newProject].sort((a, b) =>
            a.name.localeCompare(b.name)
          );
        }
      );
    },
  });

  // Toggle a project for the task (quick projects submenu)
  async function toggleTaskProject(projectId: string) {
    if (!workspaceId) {
      toast.error('Error', {
        description:
          'Workspace context is missing. Please refresh and try again.',
      });
      return;
    }

    // CRITICAL: Get current task state from cache instead of stale prop
    // This ensures we read the most up-to-date state after optimistic updates
    const currentTask = taskId
      ? ((queryClient.getQueryData(['task', taskId]) as Task | undefined) ??
        task)
      : task;

    // Check if we're in multi-select mode with multiple tasks selected
    const shouldBulkUpdate =
      isMultiSelectMode &&
      selectedTasks &&
      selectedTasks.size > 1 &&
      selectedTasks.has(currentTask.id);

    const tasksToUpdate = shouldBulkUpdate
      ? Array.from(selectedTasks)
      : [currentTask.id];

    // Cancel any outgoing refetches
    await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });

    // Snapshot the previous value BEFORE optimistic update
    const previousTasks = queryClient.getQueryData(['tasks', boardId]) as
      | Task[]
      | undefined;

    // Determine action: remove if ALL selected tasks have the project, add otherwise
    // Use currentTask from cache, not stale task prop
    let active = currentTask.projects?.some((p) => p.id === projectId) ?? false;

    if (shouldBulkUpdate && previousTasks) {
      const selectedTasksData = previousTasks.filter((t) =>
        selectedTasks?.has(t.id)
      );
      // Only mark as active (to remove) if ALL selected tasks have the project
      active = selectedTasksData.every(
        (t) => t.projects?.some((p) => p.id === projectId) ?? false
      );
    }

    // Helper to get task from either board cache or individual cache
    const getTaskState = (taskId: string): Task | undefined => {
      // First try board cache
      const fromBoardCache = previousTasks?.find((ct) => ct.id === taskId);
      if (fromBoardCache) return fromBoardCache;

      // Fallback to individual task cache (for tasks not in board view)
      if (taskId === currentTask.id) return currentTask;

      return undefined;
    };

    // Pre-calculate which tasks actually need to change
    const tasksNeedingProject = !active
      ? tasksToUpdate.filter((tId) => {
          const t = getTaskState(tId);
          return !t?.projects?.some((p) => p.id === projectId);
        })
      : [];

    const tasksToRemoveFrom = active
      ? tasksToUpdate.filter((tId) => {
          const t = getTaskState(tId);
          return t?.projects?.some((p) => p.id === projectId);
        })
      : [];

    // Get project details from workspace projects for optimistic update
    const project = workspaceProjects.find((p) => p.id === projectId);

    // Optimistically update the cache - only update tasks that actually change
    queryClient.setQueryData(['tasks', boardId], (old: Task[] | undefined) => {
      if (!old) return old;
      return old.map((t) => {
        if (active && tasksToRemoveFrom.includes(t.id)) {
          // Remove the project
          return {
            ...t,
            projects: t.projects?.filter((p: any) => p.id !== projectId) || [],
          };
        } else if (!active && tasksNeedingProject.includes(t.id)) {
          // Add the project
          return {
            ...t,
            projects: [
              ...(t.projects || []),
              project || { id: projectId, name: 'Unknown', status: 'unknown' },
            ],
          };
        }
        return t;
      });
    });

    // CRITICAL: Also update the individual task cache if taskId is provided
    // This ensures the chip menu's task cache stays in sync with the board cache
    if (taskId) {
      queryClient.setQueryData(['task', taskId], (old: Task | undefined) => {
        if (!old) return old;
        if (active && tasksToRemoveFrom.includes(taskId)) {
          // Remove the project
          return {
            ...old,
            projects:
              old.projects?.filter((p: any) => p.id !== projectId) || [],
          };
        } else if (!active && tasksNeedingProject.includes(taskId)) {
          // Add the project
          return {
            ...old,
            projects: [
              ...(old.projects || []),
              project || { id: projectId, name: 'Unknown', status: 'unknown' },
            ],
          };
        }
        return old;
      });
    }

    try {
      const internalApiOptions = getInternalApiOptions();
      const succeededTaskIds: string[] = [];
      const targetTaskIds = active ? tasksToRemoveFrom : tasksNeedingProject;

      const updateOperations = targetTaskIds.flatMap((taskId) => {
        const taskState = getTaskState(taskId);
        if (!taskState) {
          return [];
        }

        const nextProjectIds = active
          ? (taskState.projects ?? [])
              .map((entry) => entry.id)
              .filter((id) => id !== projectId)
          : [
              ...new Set([
                ...(taskState.projects ?? []).map((entry) => entry.id),
                projectId,
              ]),
            ];

        return [
          {
            taskId,
            promise: updateWorkspaceTask(
              workspaceId,
              taskId,
              {
                project_ids: nextProjectIds,
              },
              internalApiOptions
            ),
          },
        ];
      });

      const settledResults = await Promise.allSettled(
        updateOperations.map((operation) => operation.promise)
      );

      settledResults.forEach((result, index) => {
        const operation = updateOperations[index];
        if (!operation) return;

        if (result.status === 'fulfilled') {
          succeededTaskIds.push(operation.taskId);
          return;
        }

        if (active) {
          console.error(
            `Failed to remove project from task ${operation.taskId}:`,
            result.reason
          );
          return;
        }

        console.error(
          `Failed to add project to task ${operation.taskId}:`,
          result.reason
        );
      });

      if (targetTaskIds.length > 0 && succeededTaskIds.length === 0) {
        throw new Error('Failed to update any tasks');
      }

      const targetCount = targetTaskIds.length;

      const failedTaskIds = targetTaskIds.filter(
        (taskId) => !succeededTaskIds.includes(taskId)
      );

      if (failedTaskIds.length > 0 && previousTasks) {
        const previousTaskMap = new Map(previousTasks.map((t) => [t.id, t]));
        queryClient.setQueryData(
          ['tasks', boardId],
          (current: Task[] | undefined) => {
            if (!current) return current;
            return current.map((task) => {
              if (!failedTaskIds.includes(task.id)) {
                return task;
              }

              return previousTaskMap.get(task.id) || task;
            });
          }
        );

        if (taskId && failedTaskIds.includes(taskId)) {
          const previousTask = previousTaskMap.get(taskId);
          if (previousTask) {
            queryClient.setQueryData(['task', taskId], previousTask);
          }
        }
      }

      // Broadcast relation changes for all affected tasks
      for (const tid of succeededTaskIds) {
        broadcast?.('task:relations-changed', { taskId: tid });
      }

      if (failedTaskIds.length > 0) {
        toast.warning(
          active ? 'Partial project removal' : 'Partial project addition',
          {
            description: `${succeededTaskIds.length}/${targetCount} tasks updated`,
          }
        );
      } else {
        toast.success(active ? 'Project removed' : 'Project added', {
          description:
            succeededTaskIds.length > 1
              ? `${succeededTaskIds.length} tasks updated`
              : undefined,
        });
      }

      // Don't auto-clear selection - let user manually clear with "Clear" button
    } catch (e: any) {
      // Rollback on error
      if (previousTasks) {
        queryClient.setQueryData(['tasks', boardId], previousTasks);
        if (taskId) {
          const previousTask = previousTasks.find(
            (entry) => entry.id === taskId
          );
          if (previousTask) {
            queryClient.setQueryData(['task', taskId], previousTask);
          }
        }
      }
      console.error('Failed to toggle project:', e);
      toast.error('Error', {
        description: 'Failed to update project. Please try again.',
      });
    }
  }

  // Create a new project
  async function createNewProject() {
    if (!newProjectName.trim() || !workspaceId) return;

    try {
      const newProject =
        await createProjectMutation.mutateAsync(newProjectName);
      const canonicalTaskId = taskId ?? task.id;

      // Auto-apply the newly created project to this task
      let linkSucceeded = false;
      let previousTasks: Task[] | undefined;
      try {
        // Cancel any outgoing refetches
        await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });

        // Snapshot the previous value
        previousTasks = queryClient.getQueryData(['tasks', boardId]);

        // Optimistically update the cache
        queryClient.setQueryData(
          ['tasks', boardId],
          (old: Task[] | undefined) => {
            if (!old) return old;
            return old.map((t) => {
              if (t.id === canonicalTaskId) {
                return {
                  ...t,
                  projects: [...(t.projects || []), newProject],
                };
              }
              return t;
            });
          }
        );

        // CRITICAL: Also update individual task cache if taskId is provided
        if (canonicalTaskId) {
          queryClient.setQueryData(
            ['task', canonicalTaskId],
            (old: Task | undefined) => {
              if (!old) return old;
              return {
                ...old,
                projects: [...(old.projects || []), newProject],
              };
            }
          );
        }

        const taskState =
          (queryClient.getQueryData(['task', canonicalTaskId]) as
            | Task
            | undefined) ?? task;
        const nextProjectIds = [
          ...new Set([
            ...(taskState.projects ?? []).map((entry) => entry.id),
            newProject.id,
          ]),
        ];

        await updateWorkspaceTask(
          workspaceId,
          canonicalTaskId,
          {
            project_ids: nextProjectIds,
          },
          getInternalApiOptions()
        );
        linkSucceeded = true;
      } catch (applyErr: any) {
        queryClient.setQueryData(['tasks', boardId], previousTasks);
        toast.error(
          'The project was created but could not be attached to the task. Refresh and try manually.'
        );
        if (canonicalTaskId) {
          queryClient.invalidateQueries({
            queryKey: ['task', canonicalTaskId],
          });
        }
        console.error('Failed to auto-apply new project', applyErr);
      }

      // Only show success toast and reset form if link succeeded
      if (linkSucceeded) {
        broadcast?.('task:relations-changed', { taskId: canonicalTaskId });

        // Reset form and close dialog
        setNewProjectName('');

        toast.success(
          `"${newProject.name}" project created and applied to this task`
        );
      }

      // ✅ NO invalidation - workspace projects cache already updated optimistically above

      return newProject;
    } catch (e: any) {
      toast.error(e.message || 'Unable to create new project');
      throw e;
    }
  }

  return {
    newProjectName,
    setNewProjectName,
    creatingProject: createProjectMutation.isPending,
    toggleTaskProject,
    createNewProject,
  };
}
