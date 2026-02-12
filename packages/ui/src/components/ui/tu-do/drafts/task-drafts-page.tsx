import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { DraftsPage } from '@tuturuuu/ui/tu-do/drafts/drafts-page';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

/**
 * Configuration options for TaskDraftsPage
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
  /**
   * Optional configuration for UI customization
   */
  config?: PageConfig;
}

/**
 * Shared Task Drafts Page component.
 * Handles workspace resolution, permissions, and data fetching.
 * Used by both apps/web and apps/tasks.
 */
export default async function TaskDraftsPage({ params, config = {} }: Props) {
  const { showFeatureSummary = false, showSeparator = false } = config;

  const { wsId: id } = await params;

  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const workspace = await getWorkspace(id);
  if (!workspace) redirect('/');

  const wsId = workspace.id;

  const { withoutPermission } = await getPermissions({ wsId });
  if (withoutPermission('manage_projects')) redirect(`/${wsId}`);

  const t = await getTranslations();

  return (
    <div className="space-y-6">
      {showFeatureSummary ? (
        <>
          <FeatureSummary
            pluralTitle={t('task-drafts.title')}
            singularTitle={t('task-drafts.title')}
            description={t('task-drafts.empty_description')}
          />
          {showSeparator && <Separator />}
        </>
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <h1 className="font-bold text-2xl tracking-tight">
              {t('task-drafts.title')}
            </h1>
            <p className="text-muted-foreground">
              {t('task-drafts.empty_description')}
            </p>
          </div>
        </div>
      )}
      <DraftsPage wsId={wsId} />
    </div>
  );
}

// Re-export the config type for consumers
export type { PageConfig as TaskDraftsPageConfig };
