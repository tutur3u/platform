import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { toast } from '@tuturuuu/ui/sonner';
import { useState } from 'react';

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
  const [projectsSaving, setProjectsSaving] = useState<string | null>(null);
  const [newProjectName, setNewProjectName] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);

  // Toggle a project for the task (quick projects submenu)
  async function toggleTaskProject(projectId: string) {
    // CRITICAL: Get current task state from cache instead of stale prop
    // This ensures we read the most up-to-date state after optimistic updates
    const currentTask = taskId
      ? (queryClient.getQueryData(['task', taskId]) as Task | undefined) ?? task
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

    setProjectsSaving(projectId);

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
            projects: old.projects?.filter((p: any) => p.id !== projectId) || [],
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
      const supabase = createClient();
      let successCount = 0;

      if (active) {
        // Remove project one by one to ensure triggers fire for each task
        for (const taskId of tasksToRemoveFrom) {
          const { error } = await supabase
            .from('task_project_tasks')
            .delete()
            .eq('task_id', taskId)
            .eq('project_id', projectId);
          if (error) {
            console.error(
              `Failed to remove project from task ${taskId}:`,
              error
            );
          } else {
            successCount++;
          }
        }
      } else {
        // Add project one by one to ensure triggers fire for each task
        for (const taskId of tasksNeedingProject) {
          const { error } = await supabase.from('task_project_tasks').insert({
            task_id: taskId,
            project_id: projectId,
          });

          // Ignore duplicate key errors (code '23505' for unique_violation)
          if (error && error.code !== '23505') {
            console.error(`Failed to add project to task ${taskId}:`, error);
          } else {
            successCount++;
          }
        }
      }

      toast.success(active ? 'Project removed' : 'Project added', {
        description:
          successCount > 1 ? `${successCount} tasks updated` : undefined,
      });

      // Don't auto-clear selection - let user manually clear with "Clear" button
    } catch (e: any) {
      // Rollback on error
      if (previousTasks) {
        queryClient.setQueryData(['tasks', boardId], previousTasks);
      }
      console.error('Failed to toggle project:', e);
      toast.error('Error', {
        description: 'Failed to update project. Please try again.',
      });
    } finally {
      setProjectsSaving(null);
    }
  }

  // Create a new project
  async function createNewProject() {
    if (!newProjectName.trim() || !workspaceId) return;

    setCreatingProject(true);
    try {
      const response = await fetch(
        `/api/v1/workspaces/${workspaceId}/task-projects`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: newProjectName.trim(),
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to create project');
      }

      const newProject = await response.json();

      // Optimistically add the new project to workspace projects cache
      queryClient.setQueryData(
        ['task_projects', workspaceId],
        (old: TaskProject[] | undefined) => {
          if (!old) return [newProject];
          // Check if project already exists (shouldn't happen, but defensive)
          if (old.some((p) => p.id === newProject.id)) return old;
          // Add to sorted position by name
          const updated = [...old, newProject];
          return updated.sort((a, b) => a.name.localeCompare(b.name));
        }
      );

      // Auto-apply the newly created project to this task
      let linkSucceeded = false;
      try {
        const supabase = createClient();

        // Cancel any outgoing refetches
        await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });

        // Snapshot the previous value
        const previousTasks = queryClient.getQueryData(['tasks', boardId]);

        // Optimistically update the cache
        queryClient.setQueryData(
          ['tasks', boardId],
          (old: any[] | undefined) => {
            if (!old) return old;
            return old.map((t) => {
              if (t.id === task.id) {
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
        if (taskId) {
          queryClient.setQueryData(['task', taskId], (old: Task | undefined) => {
            if (!old) return old;
            return {
              ...old,
              projects: [...(old.projects || []), newProject],
            };
          });
        }

        const { error: linkErr } = await supabase
          .from('task_project_tasks')
          .insert({ task_id: task.id, project_id: newProject.id });
        if (linkErr) {
          // Rollback on error
          queryClient.setQueryData(['tasks', boardId], previousTasks);
          toast.error(
            'The project was created but could not be attached to the task. Refresh and try manually.'
          );
        } else {
          linkSucceeded = true;
        }
      } catch (applyErr: any) {
        console.error('Failed to auto-apply new project', applyErr);
      }

      // Only show success toast and reset form if link succeeded
      if (linkSucceeded) {
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
    } finally {
      setCreatingProject(false);
    }
  }

  return {
    projectsSaving,
    newProjectName,
    setNewProjectName,
    creatingProject,
    toggleTaskProject,
    createNewProject,
  };
}
