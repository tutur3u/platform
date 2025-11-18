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
}

export function useTaskProjectManagement({
  task,
  boardId,
  workspaceProjects,
  workspaceId,
  selectedTasks,
  isMultiSelectMode,
  onClearSelection,
}: UseTaskProjectManagementProps) {
  const queryClient = useQueryClient();
  const [projectsSaving, setProjectsSaving] = useState<string | null>(null);
  const [newProjectName, setNewProjectName] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);

  // Toggle a project for the task (quick projects submenu)
  async function toggleTaskProject(projectId: string) {
    setProjectsSaving(projectId);
    const supabase = createClient();

    // Check if we're in multi-select mode with multiple tasks selected
    const shouldBulkUpdate =
      isMultiSelectMode &&
      selectedTasks &&
      selectedTasks.size > 1 &&
      selectedTasks.has(task.id);

    const tasksToUpdate = shouldBulkUpdate
      ? Array.from(selectedTasks)
      : [task.id];

    // Cancel any outgoing refetches
    await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });

    // Snapshot the previous value BEFORE optimistic update
    const previousTasks = queryClient.getQueryData(['tasks', boardId]) as Task[] | undefined;

    // Determine action: remove if ALL selected tasks have the project, add otherwise
    let active = task.projects?.some((p) => p.id === projectId);

    if (shouldBulkUpdate && previousTasks) {
      const selectedTasksData = previousTasks.filter((t) =>
        selectedTasks?.has(t.id)
      );
      // Only mark as active (to remove) if ALL selected tasks have the project
      active = selectedTasksData.every((t) =>
        t.projects?.some((p) => p.id === projectId)
      );
    }

    // Find the project details from workspace projects
    const project = workspaceProjects.find((p) => p.id === projectId);

    // Pre-calculate which tasks actually need to change
    const tasksNeedingProject = !active
      ? tasksToUpdate.filter((taskId) => {
          const t = previousTasks?.find((ct) => ct.id === taskId);
          return !t?.projects?.some((p) => p.id === projectId);
        })
      : [];

    const tasksToRemoveFrom = active
      ? tasksToUpdate.filter((taskId) => {
          const t = previousTasks?.find((ct) => ct.id === taskId);
          return t?.projects?.some((p) => p.id === projectId);
        })
      : [];

    // Optimistically update the cache - only update tasks that actually change
    queryClient.setQueryData(['tasks', boardId], (old: any[] | undefined) => {
      if (!old) return old;
      return old.map((t) => {
        if (active && tasksToRemoveFrom.includes(t.id)) {
          // Remove the project
          return {
            ...t,
            projects:
              t.projects?.filter((p: any) => p.id !== projectId) || [],
          };
        } else if (!active && tasksNeedingProject.includes(t.id)) {
          // Add the project
          return {
            ...t,
            projects: [
              ...(t.projects || []),
              project || { id: projectId, name: 'Unknown', status: null },
            ],
          };
        }
        return t;
      });
    });

    try {
      if (active) {
        // Remove project only from tasks that have it
        if (tasksToRemoveFrom.length > 0) {
          const { error } = await supabase
            .from('task_project_tasks')
            .delete()
            .in('task_id', tasksToRemoveFrom)
            .eq('project_id', projectId);
          if (error) throw error;
        }
      } else {
        // Add project to selected tasks that don't already have it
        if (tasksNeedingProject.length > 0) {
          const rows = tasksNeedingProject.map((taskId) => ({
            task_id: taskId,
            project_id: projectId,
          }));
          const { error } = await supabase
            .from('task_project_tasks')
            .insert(rows);

          // Ignore duplicate key errors
          if (error && error.code !== '23505') {
            throw error;
          }
        }
      }

      // Invalidate queries to ensure fresh data
      await queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });

      const taskCount = active ? tasksToRemoveFrom.length : tasksNeedingProject.length;
      toast.success(
        active ? 'Project removed' : 'Project added',
        {
          description:
            taskCount > 1
              ? `${taskCount} tasks updated`
              : undefined,
        }
      );

      // Clear selection after bulk update
      if (shouldBulkUpdate && onClearSelection) {
        onClearSelection();
      }
    } catch (e: any) {
      // Rollback on error
      queryClient.setQueryData(['tasks', boardId], previousTasks);
      toast.error(e.message || 'Unable to toggle project');
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

      // Invalidate workspace projects cache so all task cards get the new project
      queryClient.invalidateQueries({
        queryKey: ['task_projects', workspaceId],
      });

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
