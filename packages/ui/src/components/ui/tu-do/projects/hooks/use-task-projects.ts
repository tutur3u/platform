'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import {
  createWorkspaceTaskProject,
  deleteWorkspaceTaskProject,
  linkWorkspaceTaskProjectTask,
  listWorkspaceTaskProjectDetails,
  listWorkspaceTasks,
  unlinkWorkspaceTaskProjectTask,
  updateWorkspaceTaskProject,
} from '@tuturuuu/internal-api/tasks';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import type { TaskOption, TaskProject } from '../types';

interface UseTaskProjectsParams {
  wsId: string;
  initialProjects: TaskProject[];
  managingProject: TaskProject | null;
}

const linkedTaskSchema = z.object({
  id: z.string(),
  name: z.string(),
  completed: z.boolean().nullable().optional(),
  completed_at: z.string().nullable(),
  closed_at: z.string().nullable().optional(),
  priority: z.string().nullable(),
  listName: z.string().nullable(),
  listStatus: z.string().nullable().optional(),
});

const relatedUserSchema = z.object({
  id: z.string(),
  display_name: z.string().nullable(),
  avatar_url: z.string().nullable(),
});

const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  ws_id: z.string(),
  creator_id: z.string(),
  lead_id: z.string().nullable(),
  status: z.string().nullable(),
  priority: z.string().nullable(),
  health_status: z.string().nullable(),
  start_date: z.string().nullable(),
  end_date: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string().nullable(),
  creator: relatedUserSchema.nullable().optional(),
  lead: relatedUserSchema.nullable().optional(),
  tasksCount: z.number(),
  completedTasksCount: z.number(),
  linkedTasks: z.array(linkedTaskSchema),
  linkedDocuments: z.array(linkedTaskSchema),
});

const PROJECT_TASK_LIST_STATUSES = [
  'not_started',
  'active',
  'review',
  'done',
  'closed',
];

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
      const payload = await listWorkspaceTaskProjectDetails(wsId);
      const result = z.array(projectSchema).safeParse(payload);

      if (!result.success) {
        throw new Error(t('errors.fetch_projects'));
      }

      return result.data as TaskProject[];
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
      const { tasks } = await listWorkspaceTasks(wsId, {
        limit: 200,
        listStatuses: PROJECT_TASK_LIST_STATUSES,
      });

      return tasks.map((task) => ({
        id: task.id,
        name: task.name || 'Untitled task',
        completed_at: task.completed_at ?? null,
        listName:
          (task as typeof task & { task_lists?: { name?: string | null } })
            .task_lists?.name ??
          task.source_list_name ??
          null,
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
      return createWorkspaceTaskProject(wsId, { name, description });
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
      return updateWorkspaceTaskProject(wsId, projectId, { name, description });
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
      await deleteWorkspaceTaskProject(wsId, projectId);
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
      return linkWorkspaceTaskProjectTask(wsId, projectId, taskId);
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
      return unlinkWorkspaceTaskProjectTask(wsId, projectId, taskId);
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
