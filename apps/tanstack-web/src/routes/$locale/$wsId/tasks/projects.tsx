import { createFileRoute, notFound } from '@tanstack/react-router';
import { TaskProjectsClient } from '@tuturuuu/ui/tu-do/projects/task-projects-client';
import type { TaskProject } from '@tuturuuu/ui/tu-do/projects/types';
import { useTranslations } from 'use-intl';
import { requireCurrentUser } from '../../../../lib/platform/auth-gate';
import { createPageHead } from '../../../../lib/platform/head';
import { resolveMessagesLocale } from '../../../../lib/platform/messages';
import {
  type ResolvedWorkspace,
  resolveWorkspace,
} from '../../../../lib/platform/workspace';
import { requireWorkspacePermission } from '../../../../lib/platform/workspace-permission';

const EMPTY_PROJECTS: TaskProject[] = [];

export const Route = createFileRoute('/$locale/$wsId/tasks/projects')({
  component: ProjectsRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description: 'Manage task projects in your Tuturuuu workspace.',
      locale,
      title: 'Task Projects',
    });
  },
  loader: async ({ params }): Promise<ResolvedWorkspace> => {
    // Auth gate FIRST, fail closed: legacy getCurrentUser() -> redirect('/login').
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/tasks/projects`,
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

function ProjectsRoutePage() {
  const workspace = Route.useLoaderData() as ResolvedWorkspace | undefined;
  // `task-projects` namespace resolves via the $locale layout's IntlProvider.
  const t = useTranslations('task-projects');

  if (!workspace) {
    throw notFound();
  }

  // Legacy prefetches `initialProjects` server-side as an optimization; the
  // client self-loads via TanStack Query (`initialData: initialProjects`), so
  // an empty initial set is functionally correct here.
  // (Client-side data fetch hits an /api origin tanstack-web does not serve yet
  // — the same Phase-2 data-origin gap noted for the other dashboard routes.)
  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-dynamic-surface/60 bg-background p-5">
        <p className="font-medium text-muted-foreground text-xs">
          {t('page_kicker')}
        </p>
        <h1 className="mt-1 font-semibold text-2xl">{t('page_heading')}</h1>
        <p className="mt-2 max-w-3xl text-muted-foreground text-sm">
          {t('page_subheading')}
        </p>
      </div>
      <TaskProjectsClient
        wsId={workspace.workspaceId}
        initialProjects={EMPTY_PROJECTS}
      />
    </div>
  );
}
