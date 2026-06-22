import { createFileRoute, notFound } from '@tanstack/react-router';
import { Calculator } from '@tuturuuu/icons';
import TaskEstimatesClient from '@tuturuuu/ui/tu-do/estimates/client';
import { useTranslations } from 'use-intl';
import { requireCurrentUser } from '../../../../lib/platform/auth-gate';
import { createPageHead } from '../../../../lib/platform/head';
import { resolveMessagesLocale } from '../../../../lib/platform/messages';
import {
  type ResolvedWorkspace,
  resolveWorkspace,
} from '../../../../lib/platform/workspace';
import { requireWorkspacePermission } from '../../../../lib/platform/workspace-permission';

export const Route = createFileRoute('/$locale/$wsId/tasks/estimates')({
  component: EstimatesRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description: 'Manage task estimates in your Tuturuuu workspace.',
      locale,
      title: 'Task Estimates',
    });
  },
  loader: async ({ params }): Promise<ResolvedWorkspace> => {
    // Auth gate FIRST, fail closed: legacy getCurrentUser() -> redirect('/login').
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/tasks/estimates`,
    });

    // Legacy getWorkspace() -> notFound() when missing/forbidden.
    const workspace = await resolveWorkspace({ data: { wsId: params.wsId } });
    if (!workspace.exists) {
      throw notFound();
    }

    // Legacy withoutPermission('manage_projects') -> redirect(`/${wsId}`).
    await requireWorkspacePermission({
      wsId: workspace.workspaceId,
      permission: 'manage_projects',
      locale: params.locale,
    });

    return workspace;
  },
});

function EstimatesRoutePage() {
  const workspace = Route.useLoaderData() as ResolvedWorkspace | undefined;
  // `task-estimates` namespace resolves via the $locale layout's IntlProvider.
  const t = useTranslations('task-estimates');

  if (!workspace) {
    throw notFound();
  }

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
      <TaskEstimatesClient wsId={workspace.workspaceId} />
    </div>
  );
}
