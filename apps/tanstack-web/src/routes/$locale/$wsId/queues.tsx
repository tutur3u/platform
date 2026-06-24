import { createFileRoute, notFound } from '@tanstack/react-router';
import { CrawlerListClientPage } from '@/components/crawlers/crawler-list-client-page';
import {
  type CrawlerListData,
  loadCrawlerListData,
  validateCrawlerListSearch,
} from '@/lib/crawlers/crawler-list-route-data';
import { requireCurrentUser } from '@/lib/platform/auth-gate';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';
import { resolveWorkspace } from '@/lib/platform/workspace';
import { requireWorkspacePermission } from '@/lib/platform/workspace-permission';

export const Route = createFileRoute('/$locale/$wsId/queues')({
  component: QueueListRoutePage,
  validateSearch: validateCrawlerListSearch,
  loaderDeps: ({ search }) => ({
    domain: search.domain,
    page: search.page,
    pageSize: search.pageSize,
    search: search.search,
  }),
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description: 'Manage Queues in your Tuturuuu workspace.',
      locale,
      title: 'Queues',
    });
  },
  loader: async ({ params, deps }): Promise<CrawlerListData> => {
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/queues`,
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

    return loadCrawlerListData({
      data: {
        ...deps,
        wsId: workspace.workspaceId,
      },
    });
  },
});

function QueueListRoutePage() {
  const data = Route.useLoaderData() as CrawlerListData | undefined;

  if (!data) {
    throw notFound();
  }

  return (
    <CrawlerListClientPage
      count={data.count}
      crawledHref={`/${data.wsId}/queues`}
      crawledUrls={data.crawledUrls}
      domains={data.domains}
      page={data.page}
      pageSize={data.pageSize}
      search={data.search}
      selectedDomain={data.domain}
      uncrawledCount={data.uncrawledCount}
      uncrawledHref={`/${data.wsId}/crawlers/uncrawled`}
      wsId={data.wsId}
    />
  );
}
