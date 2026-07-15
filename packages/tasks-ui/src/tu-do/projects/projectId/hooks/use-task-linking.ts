'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  linkWorkspaceTaskProjectTask,
  listWorkspaceTasks,
} from '@tuturuuu/internal-api/tasks';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { toast } from '@tuturuuu/ui/sonner';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';

interface UseTaskLinkingOptions {
  wsId: string;
  projectId: string;
  linkedTasks: Task[];
}

const PROJECT_TASK_LIST_STATUSES = [
  'not_started',
  'active',
  'review',
  'done',
  'closed',
];

export function useTaskLinking({
  wsId,
  projectId,
  linkedTasks,
}: UseTaskLinkingOptions) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showLinkTaskDialog, setShowLinkTaskDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Query for fetching available tasks (only when dialog is open)
  const { data: availableTasks = [] } = useQuery({
    queryKey: ['workspace-tasks', wsId],
    queryFn: async () => {
      const data = await listWorkspaceTasks(wsId, {
        listStatuses: PROJECT_TASK_LIST_STATUSES,
      });
      return data.tasks;
    },
    enabled: showLinkTaskDialog,
    staleTime: 60000, // 1 minute
  });

  // Filter available tasks based on search
  const filteredAvailableTasks = useMemo(() => {
    if (!searchQuery) return [];
    return availableTasks.filter(
      (task) =>
        task.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !linkedTasks.some((t) => t.id === task.id)
    );
  }, [availableTasks, searchQuery, linkedTasks]);

  // Mutation for linking task to project
  const linkTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      return linkWorkspaceTaskProjectTask(wsId, projectId, taskId);
    },
    onSuccess: () => {
      toast.success('Task linked successfully');
      void queryClient.invalidateQueries({
        queryKey: ['task-project-tasks', wsId, projectId],
      });
      void queryClient.invalidateQueries({
        queryKey: ['tasks', wsId, `project:${projectId}`],
      });
      router.refresh();
      setShowLinkTaskDialog(false);
      setSearchQuery('');
    },
    onError: (error) => {
      console.error('Error linking task:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to link task'
      );
    },
  });

  const linkTaskToProject = useCallback(
    (taskId: string) => {
      linkTaskMutation.mutate(taskId);
    },
    [linkTaskMutation]
  );

  return {
    showLinkTaskDialog,
    setShowLinkTaskDialog,
    searchQuery,
    setSearchQuery,
    filteredAvailableTasks,
    isLinkingTask: linkTaskMutation.isPending,
    linkTaskToProject,
  };
}
