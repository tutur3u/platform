import {
  dehydrate,
  HydrationBoundary,
  QueryClient,
} from '@tanstack/react-query';
import { Plus } from '@tuturuuu/icons';
import {
  getWorkspaceBoardsData,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { EnhancedBoardsView } from './enhanced-boards-view';
import { TaskBoardForm } from './form';
import { QuickCreateBoardDialog } from './quick-create-board-dialog';

/**
 * Configuration options for WorkspaceProjectsPage
 * Allows customization of UI elements based on the consuming app
 */
interface PageConfig {
  /**
   * Whether to show the FeatureSummary component with enhanced UI
   * @default false - shows simple header
   */
  showFeatureSummary?: boolean;
  /**
   * Whether to show a separator between header and content
   * @default false
   */
  showSeparator?: boolean;
}

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<{
    q?: string;
    page?: string;
    pageSize?: string;
  }>;
  /**
   * Optional configuration for UI customization
   */
  config?: PageConfig;
}

async function getData(
  wsId: string,
  {
    q,
    page = '1',
    pageSize = '10',
  }: { q?: string; page?: string; pageSize?: string }
) {
  return getWorkspaceBoardsData(
    wsId,
    {
      q,
      page: Number.parseInt(page, 10),
      pageSize: Number.parseInt(pageSize, 10),
    },
    withForwardedInternalApiAuth(await headers())
  );
}

export default async function WorkspaceProjectsPage({
  params,
  searchParams,
  config = {},
}: Props) {
  const { showFeatureSummary = false, showSeparator = false } = config;

  const { wsId: id } = await params;
  const sp = await searchParams;
  const workspace = await getWorkspace(id);
  if (!workspace) notFound();
  const wsId = workspace.id;

  const permissions = await getPermissions({ wsId });
  if (!permissions) notFound();
  const { withoutPermission } = permissions;

  if (withoutPermission('manage_projects')) redirect(`/${wsId}`);

  const queryClient = new QueryClient();
  const q = sp.q || '';
  const page = sp.page || '1';
  const pageSize = sp.pageSize || '10';

  const boardsQueryKey = ['boards', wsId, q, page, pageSize];
  const initialBoards = await getData(wsId, { q, page, pageSize });
  // Avoid duplicate DB calls by seeding the dehydrated cache directly
  queryClient.setQueryData(boardsQueryKey, initialBoards);

  const t = await getTranslations();

  // Common action button for both header variants
  const createButton = (
    <TaskBoardForm wsId={wsId}>
      <Button className="flex items-center gap-2">
        <Plus className="h-4 w-4" />
        {t('ws-task-boards.create')}
      </Button>
    </TaskBoardForm>
  );

  return (
    <div className="space-y-6">
      {showFeatureSummary ? (
        // Enhanced header with FeatureSummary (used by apps/web)
        <FeatureSummary
          pluralTitle={t('ws-task-boards.plural')}
          singularTitle={t('ws-task-boards.singular')}
          description={t('ws-task-boards.description')}
          createTitle={t('ws-task-boards.create')}
          createDescription={t('ws-task-boards.create_description')}
          action={createButton}
        />
      ) : (
        // Simple header (used by apps/tasks and other satellite apps)
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

      <HydrationBoundary state={dehydrate(queryClient)}>
        <QuickCreateBoardDialog
          wsId={wsId}
          openWhenEmpty={q.trim() === '' && initialBoards.count === 0}
        />
        <EnhancedBoardsView wsId={wsId} />
      </HydrationBoundary>
    </div>
  );
}

// Re-export the config type for consumers
export type { PageConfig as WorkspaceProjectsPageConfig };
