'use client';

import { useQuery } from '@tanstack/react-query';
import { getWorkspaceTask } from '@tuturuuu/internal-api/tasks';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { KanbanSkeleton } from '../boards/boardId/kanban/rendering/kanban-skeleton';
import { buildWorkspaceTaskUrl } from './task-url';

interface TaskLegacyRouteRecoveryProps {
  routePrefix?: string;
  taskId: string;
  workspaceId: string;
}

export function TaskLegacyRouteRecovery({
  routePrefix = '/tasks',
  taskId,
  workspaceId,
}: TaskLegacyRouteRecoveryProps) {
  const router = useRouter();
  const t = useTranslations('common');
  const { data, error } = useQuery({
    queryKey: ['legacy-task-route', workspaceId, taskId],
    queryFn: () => getWorkspaceTask(workspaceId, taskId),
    retry: false,
    staleTime: 30000,
  });

  useEffect(() => {
    if (!data?.task?.board_id) {
      return;
    }

    const canonicalUrl = buildWorkspaceTaskUrl({
      boardId: data.task.board_id,
      currentPathname: window.location.pathname,
      taskId,
      workspaceId,
      isPersonalWorkspace: workspaceId === 'personal',
    }).replace('/tasks/boards/', `${routePrefix}/boards/`);

    if (window.location.pathname + window.location.search !== canonicalUrl) {
      router.replace(canonicalUrl);
    }
  }, [data?.task.board_id, routePrefix, router, taskId, workspaceId]);

  if (error) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-6">
        <div className="max-w-md text-center">
          <p className="font-medium text-destructive">
            {t('error_loading_data')}
          </p>
          <p className="mt-2 text-muted-foreground text-sm">
            Task ID: {taskId}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-6rem)] min-h-[28rem]">
      <KanbanSkeleton />
    </div>
  );
}
