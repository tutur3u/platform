import { useQuery } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { Loader2 } from '@tuturuuu/icons';
import { getWorkspaceTask } from '@tuturuuu/internal-api/tasks';
import { toWorkspaceSlug } from '@tuturuuu/utils/constants';
import { useEffect } from 'react';
import { useTranslations } from 'use-intl';

/**
 * Local mirror of the shared (but not subpath-exported) `buildWorkspaceTaskUrl`
 * from `@tuturuuu/ui/tu-do/shared/task-url`. The shared module is a `.ts` file
 * and the `@tuturuuu/ui` export map only exposes `tu-do/shared/*.tsx`, so it
 * cannot be imported across the package boundary; this keeps the same logic.
 */
function buildWorkspaceTaskUrl({
  boardId,
  currentPathname,
  taskId,
  workspaceId,
  isPersonalWorkspace = false,
}: {
  boardId: string;
  currentPathname: string;
  taskId: string;
  workspaceId: string;
  isPersonalWorkspace?: boolean;
}): string {
  const workspaceSlug = toWorkspaceSlug(workspaceId, {
    personal: isPersonalWorkspace,
  });

  const wsSegment = `/${workspaceSlug}`;
  const fallbackWsSegment = `/${workspaceId}`;
  const wsIndex = currentPathname.indexOf(wsSegment);
  const fallbackWsIndex = currentPathname.indexOf(fallbackWsSegment);

  let localePrefix = '';
  if (wsIndex > 0) {
    localePrefix = currentPathname.substring(0, wsIndex);
  } else if (fallbackWsIndex > 0) {
    localePrefix = currentPathname.substring(0, fallbackWsIndex);
  }

  return `${localePrefix}/${workspaceSlug}/tasks/boards/${boardId}?task=${taskId}`;
}

/**
 * apps/tanstack-web fork of the shared @tuturuuu/ui TaskLegacyRouteRecovery.
 *
 * The shared component redirects legacy `/{wsId}/tasks/{taskId}` URLs to the
 * canonical board-backed task URL using `next/navigation`'s `useRouter().replace`
 * — which has no provider in TanStack Start and would throw at runtime. This fork
 * keeps the same behaviour but drives navigation through TanStack Router
 * (`router.navigate({ href, replace: true })`) and reads i18n from `use-intl`
 * (the framework-agnostic core the $locale layout's IntlProvider supplies).
 *
 * The task lookup runs client-side via the internal-api facade; until the
 * tanstack-web `/api/v1` data origin lands (Phase-2, backend-owned) the query
 * surfaces the loading/error state rather than resolving a redirect.
 */
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
      router.navigate({ href: canonicalUrl, replace: true });
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
    <div className="flex min-h-[40vh] items-center justify-center p-6">
      <div className="flex items-center gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>{t('loading')}</span>
      </div>
    </div>
  );
}
