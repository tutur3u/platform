'use client';

import { useQuery } from '@tanstack/react-query';
import { Plus } from '@tuturuuu/icons';
import { getWorkspace, getWorkspaceBoardsData } from '@tuturuuu/internal-api';
import { createClient } from '@tuturuuu/supabase/next/client';
import { Button } from '@tuturuuu/ui/button';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { useWorkspaceUser } from '@tuturuuu/ui/hooks/use-workspace-user';
import { Separator } from '@tuturuuu/ui/separator';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { BoardsListSkeleton } from './boards-list-skeleton';
import { EnhancedBoardsView } from './enhanced-boards-view';
import { TaskBoardForm } from './form';
import { QuickCreateBoardDialog } from './quick-create-board-dialog';

interface WorkspaceProjectsClientPageProps {
  config?: {
    showFeatureSummary?: boolean;
    showSeparator?: boolean;
  };
}

export default function WorkspaceProjectsClientPage({
  config = {},
}: WorkspaceProjectsClientPageProps) {
  const { showFeatureSummary = false, showSeparator = false } = config;
  const t = useTranslations();
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const routeWorkspaceId = typeof params.wsId === 'string' ? params.wsId : '';

  const q = searchParams.get('q') || '';
  const page = searchParams.get('page') || '1';
  const pageSize = searchParams.get('pageSize') || '10';

  const {
    data: workspace,
    isPending: isWorkspacePending,
    error: workspaceError,
  } = useQuery({
    queryKey: ['workspace', routeWorkspaceId],
    queryFn: () => getWorkspace(routeWorkspaceId),
    enabled: Boolean(routeWorkspaceId),
  });

  const { data: workspaceUser, isLoading: isWorkspaceUserLoading } =
    useWorkspaceUser();

  const permissionQuery = useQuery({
    queryKey: [
      'workspace-permission',
      workspace?.id,
      'manage_projects',
      workspaceUser?.id,
    ],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('has_workspace_permission', {
        p_user_id: workspaceUser!.id,
        p_ws_id: workspace!.id,
        p_permission: 'manage_projects',
      });

      if (error) {
        throw new Error(
          `Failed to check workspace permission: ${error.message}`
        );
      }

      return data ?? false;
    },
    enabled: Boolean(workspace?.id && workspaceUser?.id),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const canManageProjects = permissionQuery.data;
  const isPermissionLoading = permissionQuery.isLoading;

  const resolvedWsId = workspace?.id;

  const {
    data: boardsPayload,
    isPending: isBoardsPending,
    error: boardsError,
  } = useQuery({
    queryKey: ['boards', resolvedWsId, q, page, pageSize],
    queryFn: () =>
      getWorkspaceBoardsData(resolvedWsId!, {
        q,
        page: Number.parseInt(page, 10),
        pageSize: Number.parseInt(pageSize, 10),
      }),
    enabled: Boolean(resolvedWsId),
  });

  useEffect(() => {
    if (
      resolvedWsId &&
      !isPermissionLoading &&
      !isWorkspaceUserLoading &&
      canManageProjects === false
    ) {
      router.replace(`/${resolvedWsId}`);
    }
  }, [
    canManageProjects,
    isPermissionLoading,
    isWorkspaceUserLoading,
    resolvedWsId,
    router,
  ]);

  if (
    isWorkspacePending ||
    isWorkspaceUserLoading ||
    isPermissionLoading ||
    isBoardsPending
  ) {
    return <BoardsListSkeleton />;
  }

  if (canManageProjects === false) {
    return null;
  }

  if (workspaceError || permissionQuery.error || boardsError || !resolvedWsId) {
    return (
      <div className="rounded-lg border bg-muted/30 p-6 text-muted-foreground text-sm">
        {t('common.error')}
      </div>
    );
  }

  const createButton = (
    <TaskBoardForm wsId={resolvedWsId}>
      <Button className="flex items-center gap-2">
        <Plus className="h-4 w-4" />
        {t('ws-task-boards.create')}
      </Button>
    </TaskBoardForm>
  );

  return (
    <div className="space-y-6">
      {showFeatureSummary ? (
        <FeatureSummary
          pluralTitle={t('ws-task-boards.plural')}
          singularTitle={t('ws-task-boards.singular')}
          description={t('ws-task-boards.description')}
          createTitle={t('ws-task-boards.create')}
          createDescription={t('ws-task-boards.create_description')}
          action={createButton}
        />
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <h1 className="font-bold text-2xl tracking-tight">
              {t('ws-task-boards.plural')}
            </h1>
            <p className="text-muted-foreground">
              {t('ws-task-boards.description')}
            </p>
          </div>
          {createButton}
        </div>
      )}

      {showSeparator && <Separator />}

      <QuickCreateBoardDialog
        wsId={resolvedWsId}
        openWhenEmpty={q.trim() === '' && (boardsPayload?.count ?? 0) === 0}
      />
      <EnhancedBoardsView wsId={resolvedWsId} />
    </div>
  );
}
