import { Calculator } from '@tuturuuu/icons';
import TaskEstimatesClient from '@tuturuuu/ui/tu-do/estimates/client';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

/**
 * Shared Task Estimates Page component.
 * Handles workspace resolution, permissions, and data fetching.
 * Used by both apps/web and apps/tasks.
 */
export default async function TaskEstimatesPage({ params }: Props) {
  const { wsId: id } = await params;

  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const workspace = await getWorkspace(id);
  if (!workspace) notFound();

  const wsId = workspace.id;

  const permissions = await getPermissions({ wsId });
  if (!permissions) notFound();
  const { withoutPermission } = permissions;
  if (withoutPermission('manage_projects')) redirect(`/${wsId}`);

  const t = await getTranslations('task-estimates');

  return (
    <div className="space-y-6 pb-8">
      <div className="space-y-3 rounded-lg border border-border/50 bg-linear-to-r from-dynamic-orange/5 via-background to-background p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-dynamic-orange/10 ring-1 ring-dynamic-orange/20">
            <Calculator className="h-5 w-5 text-dynamic-orange" />
          </div>
          <div>
            <h1 className="font-bold text-2xl tracking-tight">
              {t('page_title')}
            </h1>
            <p className="text-muted-foreground text-sm">
              {t('page_description')}
            </p>
          </div>
        </div>
      </div>
      <TaskEstimatesClient wsId={wsId} />
    </div>
  );
}
