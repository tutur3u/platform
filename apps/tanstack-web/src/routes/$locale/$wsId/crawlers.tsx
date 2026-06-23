import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import {
  type BackendWorkspaceCrawledUrl,
  getBackendWorkspaceCrawlerDomains,
  getBackendWorkspaceCrawlerList,
  getBackendWorkspaceCrawlerUncrawled,
  withForwardedBackendApiAuth,
} from '@tuturuuu/internal-api/backend';
import { CrawlerListClientPage } from '@/components/crawlers/crawler-list-client-page';
import { withTanstackBackendRuntime } from '@/lib/cloudflare/backend';
import { requireCurrentUser } from '@/lib/platform/auth-gate';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';
import { resolveWorkspace } from '@/lib/platform/workspace';
import { requireWorkspacePermission } from '@/lib/platform/workspace-permission';

type CrawlerListSearch = {
  domain: string;
  page: number;
  pageSize: number;
  search: string;
};

type CrawlerListData = CrawlerListSearch & {
  count: number;
  crawledUrls: BackendWorkspaceCrawledUrl[];
  domains: string[];
  uncrawledCount: number;
  wsId: string;
};

function parsePositiveInteger(value: unknown, fallback: number, max?: number) {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseInt(value, 10)
        : Number.NaN;

  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return max ? Math.min(parsed, max) : parsed;
}

function parseSearchText(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function validateCrawlerListSearch(
  search: Record<string, unknown>
): CrawlerListSearch {
  return {
    domain: parseSearchText(search.domain),
    page: parsePositiveInteger(search.page, 1),
    pageSize: parsePositiveInteger(search.pageSize, 50, 100),
    search: parseSearchText(search.search),
  };
}

const loadCrawlerList = createServerFn({ method: 'GET' })
  .validator((data: CrawlerListSearch & { wsId: string }) => data)
  .handler(async ({ data }): Promise<CrawlerListData> => {
    const backendRuntime = await withTanstackBackendRuntime();
    const backendOptions = withForwardedBackendApiAuth(
      getRequestHeaders(),
      backendRuntime
    );
    const selectedDomain = data.domain || undefined;
    const [crawledUrls, domains, uncrawled] = await Promise.all([
      getBackendWorkspaceCrawlerList(
        data.wsId,
        {
          domain: selectedDomain,
          page: data.page,
          pageSize: data.pageSize,
          search: data.search || undefined,
        },
        backendOptions
      ),
      getBackendWorkspaceCrawlerDomains(data.wsId, backendOptions),
      getBackendWorkspaceCrawlerUncrawled(
        data.wsId,
        {
          page: 1,
          pageSize: 1,
        },
        backendOptions
      ),
    ]);

    return {
      count: crawledUrls.count,
      crawledUrls: crawledUrls.data,
      domain: data.domain,
      domains: domains.domains,
      page: data.page,
      pageSize: data.pageSize,
      search: data.search,
      uncrawledCount: uncrawled.pagination.totalItems,
      wsId: data.wsId,
    };
  });

export const Route = createFileRoute('/$locale/$wsId/crawlers')({
  component: CrawlerListRoutePage,
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
      description: 'Manage crawled URLs in your Tuturuuu workspace.',
      locale,
      title: 'Crawlers',
    });
  },
  loader: async ({ params, deps }): Promise<CrawlerListData> => {
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/crawlers`,
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

    return loadCrawlerList({
      data: {
        ...deps,
        wsId: workspace.workspaceId,
      },
    });
  },
});

function CrawlerListRoutePage() {
  const data = Route.useLoaderData() as CrawlerListData | undefined;

  if (!data) {
    throw notFound();
  }

  return (
    <CrawlerListClientPage
      count={data.count}
      crawledUrls={data.crawledUrls}
      domains={data.domains}
      page={data.page}
      pageSize={data.pageSize}
      search={data.search}
      selectedDomain={data.domain}
      uncrawledCount={data.uncrawledCount}
      wsId={data.wsId}
    />
  );
}
