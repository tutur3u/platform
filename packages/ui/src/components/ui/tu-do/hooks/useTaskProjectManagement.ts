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
}

export function useTaskProjectManagement({
  task,
  boardId,
  workspaceProjects,
  workspaceId,
}: UseTaskProjectManagementProps) {
  const queryClient = useQueryClient();
  const [projectsSaving, setProjectsSaving] = useState<string | null>(null);
  const [newProjectName, setNewProjectName] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);

  // Toggle a project for the task (quick projects submenu)
  async function toggleTaskProject(projectId: string) {
    setProjectsSaving(projectId);
    const supabase = createClient();
    const active = task.projects?.some((p) => p.id === projectId);

    // Cancel any outgoing refetches
    await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });

    // Snapshot the previous value
    const previousTasks = queryClient.getQueryData(['tasks', boardId]);

    // Find the project details from workspace projects
    const project = workspaceProjects.find((p) => p.id === projectId);

    // Optimistically update the cache
    queryClient.setQueryData(['tasks', boardId], (old: any[] | undefined) => {
      if (!old) return old;
      return old.map((t) => {
        if (t.id === task.id) {
          if (active) {
            // Remove the project
            return {
              ...t,
              projects:
                t.projects?.filter((p: any) => p.id !== projectId) || [],
            };
          } else {
            // Add the project
            return {
              ...t,
              projects: [
                ...(t.projects || []),
                project || { id: projectId, name: 'Unknown', status: null },
              ],
            };
          }
        }
        return t;
      });
    });

    try {
      if (active) {
        const { error } = await supabase
          .from('task_project_tasks')
          .delete()
          .eq('task_id', task.id)
          .eq('project_id', projectId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('task_project_tasks')
          .insert({ task_id: task.id, project_id: projectId });

        // Handle duplicate key error gracefully
        if (error) {
          // Error code 23505 is duplicate key violation in PostgreSQL
          if (error.code === '23505') {
            // Project is already linked - just update cache to reflect reality
            toast.info('This project is already linked to the task');
            // Fetch current state to sync cache
            await queryClient.invalidateQueries({
              queryKey: ['tasks', boardId],
            });
            return;
          }
          throw error;
        }
      }
      // Success - mark query as needing refetch but don't force it immediately
      queryClient.setQueryData(['tasks', boardId], (old: any[] | undefined) => {
        return old; // Return unchanged to signal success without triggering render
      });
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
