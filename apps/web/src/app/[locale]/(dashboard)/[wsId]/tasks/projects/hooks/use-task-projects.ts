'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import type { TaskProject, TaskOption, LinkedTask } from '../types';

interface UseTaskProjectsParams {
  wsId: string;
  initialProjects: TaskProject[];
  managingProject: TaskProject | null;
}

const taskSchema = z.object({
  id: z.string(),
  name: z.string().optional().default('Untitled task'),
  completed_at: z.string().optional().nullable(),
  list_name: z.string().optional().nullable(),
});

const payloadSchema = z.union([
  z.array(taskSchema),
  z.object({
    tasks: z.array(taskSchema),
  }),
]);

export function useTaskProjects({
  wsId,
  initialProjects,
  managingProject,
}: UseTaskProjectsParams) {
  const t = useTranslations('dashboard.bucket_dump');

  const {
    data: projects = [],
    isLoading: projectsLoading,
    refetch: refetchProjects,
  } = useQuery<TaskProject[]>({
    queryKey: ['workspace', wsId, 'task-projects'],
    queryFn: async () => {
      const response = await fetch(`/api/v1/workspaces/${wsId}/task-projects`);
      if (!response.ok) {
        throw new Error(t('errors.fetch_projects'));
      }
      return response.json();
    },
    initialData: initialProjects,
  });

  const {
    data: availableTaskOptions = [],
    isLoading: tasksLoading,
    error: tasksError,
  } = useQuery<TaskOption[]>({
    queryKey: ['workspace', wsId, 'tasks-for-projects'],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/tasks?limit=200`
      );
      if (!response.ok) {
        throw new Error(t('errors.fetch_tasks'));
      }

      const payload = await response.json();
      const result = payloadSchema.safeParse(payload);

      if (!result.success) {
        throw new Error(t('errors.fetch_tasks'));
      }

      const data = result.data;
      const tasks = Array.isArray(data) ? data : data.tasks;

      return tasks.map((task) => ({
        id: task.id,
        name: task.name || 'Untitled task',
        completed_at: task.completed_at ?? null,
        listName: task.list_name ?? null,
      }));
    },
    enabled: Boolean(managingProject),
    staleTime: 60_000,
  });

  const createProjectMutation = useMutation({
    mutationFn: async ({
      name,
      description,
    }: {
      name: string;
      description?: string;
    }) => {
      const response = await fetch(`/api/v1/workspaces/${wsId}/task-projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || t('errors.create_project'));
      }
      return response.json();
    },
    onSuccess: () => {
      toast.success(t('success.project_created'));
      refetchProjects();
    },
    onError: (error: Error) => {
      toast.error(error.message || t('errors.create_project'));
    },
  });

  const updateProjectMutation = useMutation({
    mutationFn: async ({
      projectId,
      name,
      description,
    }: {
      projectId: string;
      name: string;
      description?: string;
    }) => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/task-projects/${projectId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, description }),
        }
      );
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || t('errors.update_project'));
      }
      return response.json();
    },
    onSuccess: () => {
      toast.success(t('success.project_updated'));
      refetchProjects();
    },
    onError: (error: Error) => {
      toast.error(error.message || t('errors.update_project'));
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async (projectId: string) => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/task-projects/${projectId}`,
        {
          method: 'DELETE',
        }
      );
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || t('errors.delete_project'));
      }
    },
    onSuccess: () => {
      toast.success(t('success.project_deleted'));
      refetchProjects();
    },
    onError: (error: Error) => {
      toast.error(error.message || t('errors.delete_project'));
    },
  });

  const linkTaskMutation = useMutation({
    mutationFn: async ({
      projectId,
      taskId,
    }: {
      projectId: string;
      taskId: string;
    }) => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/task-projects/${projectId}/tasks`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId }),
        }
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || t('errors.link_task'));
      }
      return response.json() as Promise<{ linkedTask: LinkedTask }>;
    },
    onSuccess: () => {
      toast.success(t('success.task_linked'));
      refetchProjects();
    },
    onError: (error: Error) => {
      toast.error(error.message || t('errors.link_task'));
    },
  });

  const unlinkTaskMutation = useMutation({
    mutationFn: async ({
      projectId,
      taskId,
    }: {
      projectId: string;
      taskId: string;
    }) => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/task-projects/${projectId}/tasks/${taskId}`,
        {
          method: 'DELETE',
        }
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || t('errors.unlink_task'));
      }
      return response.json();
    },
    onSuccess: () => {
      toast.success(t('success.task_unlinked'));
      refetchProjects();
    },
    onError: (error: Error) => {
      toast.error(error.message || t('errors.unlink_task'));
    },
  });

  return {
    // Queries
    projects,
    projectsLoading,
    refetchProjects,
    availableTaskOptions,
    tasksLoading,
    tasksError,

    // Mutations
    createProject: createProjectMutation.mutate,
    updateProject: updateProjectMutation.mutate,
    deleteProject: deleteProjectMutation.mutate,
    linkTask: linkTaskMutation.mutate,
    unlinkTask: unlinkTaskMutation.mutate,

    // Status flags
    isCreating: createProjectMutation.isPending,
    isUpdating: updateProjectMutation.isPending,
    isDeleting: deleteProjectMutation.isPending,
    isLinking: linkTaskMutation.isPending,
    isUnlinking: unlinkTaskMutation.isPending,
  };
}
