import { createFileRoute, notFound } from '@tanstack/react-router';
import { CronJobsPage } from '@/components/cron/jobs/cron-jobs-page';
import {
  type CronJobsRouteData,
  loadCronJobsData,
  validateCronJobsSearch,
} from '@/lib/cron/cron-jobs-route-data';
import {
  getWorkspaceNextPath,
  requireCurrentUser,
} from '@/lib/platform/auth-gate';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';
import { resolveWorkspace } from '@/lib/platform/workspace';
import { requireWorkspacePermission } from '@/lib/platform/workspace-permission';

export const Route = createFileRoute('/$locale/$wsId/cron/jobs')({
  component: CronJobsRoutePage,
  validateSearch: validateCronJobsSearch,
  loaderDeps: ({ search }) => ({
    page: search.page,
    pageSize: search.pageSize,
    q: search.q,
  }),
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description: 'Manage Jobs in the Cron area of your Tuturuuu workspace.',
      locale,
      title: 'Jobs',
    });
  },
  loader: async ({ deps, location, params }): Promise<CronJobsRouteData> => {
    await requireCurrentUser({
      locale: params.locale,
      nextPath: getWorkspaceNextPath(params, location.pathname, 'cron/jobs'),
    });

    const workspace = await resolveWorkspace({ data: { wsId: params.wsId } });
    if (!workspace.exists) {
      throw notFound();
    }

    await requireWorkspacePermission({
      locale: params.locale,
      permission: 'ai_lab',
      wsId: workspace.workspaceId,
    });

    const jobs = await loadCronJobsData({
      data: {
        page: deps.page,
        pageSize: deps.pageSize,
        q: deps.q,
        wsId: workspace.workspaceId,
      },
    });

    return {
      ...jobs,
      locale: resolveMessagesLocale(params.locale),
      workspaceId: workspace.workspaceId,
    };
  },
});

function CronJobsRoutePage() {
  const data = Route.useLoaderData() as CronJobsRouteData | undefined;

  if (!data) {
    throw notFound();
  }

  return <CronJobsPage jobs={data.jobs} locale={data.locale} />;
}
