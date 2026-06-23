import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import {
  type BackendWorkspaceCrawlerUncrawledPagination,
  type BackendWorkspaceCrawlerUncrawledUrl,
  getBackendWorkspaceCrawlerDomains,
  getBackendWorkspaceCrawlerUncrawled,
  withForwardedBackendApiAuth,
} from '@tuturuuu/internal-api/backend';
import { CrawlerUncrawledClientPage } from '@/components/crawlers/crawler-uncrawled-client-page';
import { withTanstackBackendRuntime } from '@/lib/cloudflare/backend';
import { requireCurrentUser } from '@/lib/platform/auth-gate';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';
import { resolveWorkspace } from '@/lib/platform/workspace';
import { requireWorkspacePermission } from '@/lib/platform/workspace-permission';

type CrawlerUncrawledSearch = {
  domain: string;
  page: number;
  pageSize: number;
  search: string;
};

type CrawlerUncrawledData = CrawlerUncrawledSearch & {
  domains: string[];
  groupedUrls: Record<string, BackendWorkspaceCrawlerUncrawledUrl[]>;
  pagination: BackendWorkspaceCrawlerUncrawledPagination;
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

function validateCrawlerUncrawledSearch(
  search: Record<string, unknown>
): CrawlerUncrawledSearch {
  return {
    domain: parseSearchText(search.domain),
    page: parsePositiveInteger(search.page, 1),
    pageSize: parsePositiveInteger(search.pageSize, 20, 100),
    search: parseSearchText(search.search),
  };
}

const loadCrawlerUncrawled = createServerFn({ method: 'GET' })
  .validator((data: CrawlerUncrawledSearch & { wsId: string }) => data)
  .handler(async ({ data }): Promise<CrawlerUncrawledData> => {
    const backendRuntime = await withTanstackBackendRuntime();
    const backendOptions = withForwardedBackendApiAuth(
      getRequestHeaders(),
      backendRuntime
    );
    const [uncrawled, domains] = await Promise.all([
      getBackendWorkspaceCrawlerUncrawled(
        data.wsId,
        {
          domain: data.domain || undefined,
          page: data.page,
          pageSize: data.pageSize,
          search: data.search || undefined,
        },
        backendOptions
      ),
      getBackendWorkspaceCrawlerDomains(data.wsId, backendOptions),
    ]);

    return {
      domain: data.domain,
      domains: domains.domains,
      groupedUrls: uncrawled.groupedUrls,
      page: data.page,
      pageSize: data.pageSize,
      pagination: uncrawled.pagination,
      search: data.search,
      wsId: data.wsId,
    };
  });

export const Route = createFileRoute('/$locale/$wsId/crawlers/uncrawled')({
  component: CrawlerUncrawledRoutePage,
  validateSearch: validateCrawlerUncrawledSearch,
  loaderDeps: ({ search }) => ({
    domain: search.domain,
    page: search.page,
    pageSize: search.pageSize,
    search: search.search,
  }),
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description:
        'Review discovered crawler URLs that have not been crawled yet.',
      locale,
      title: 'Uncrawled URLs',
    });
  },
  loader: async ({ params, deps }): Promise<CrawlerUncrawledData> => {
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/crawlers/uncrawled`,
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

    return loadCrawlerUncrawled({
      data: {
        ...deps,
        wsId: workspace.workspaceId,
      },
    });
  },
});

function CrawlerUncrawledRoutePage() {
  const data = Route.useLoaderData() as CrawlerUncrawledData | undefined;

  if (!data) {
    throw notFound();
  }

  return (
    <CrawlerUncrawledClientPage
      domains={data.domains}
      groupedUrls={data.groupedUrls}
      page={data.page}
      pageSize={data.pageSize}
      pagination={data.pagination}
      search={data.search}
      selectedDomain={data.domain}
      wsId={data.wsId}
    />
  );
}
