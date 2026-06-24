import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import {
  type BackendWorkspaceCrawledUrl,
  getBackendWorkspaceCrawlerDomains,
  getBackendWorkspaceCrawlerList,
  getBackendWorkspaceCrawlerUncrawled,
  withForwardedBackendApiAuth,
} from '@tuturuuu/internal-api/backend';
import { withTanstackBackendRuntime } from '@/lib/cloudflare/backend';

export type CrawlerListSearch = {
  domain: string;
  page: number;
  pageSize: number;
  search: string;
};

export type CrawlerListData = CrawlerListSearch & {
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

export function validateCrawlerListSearch(
  search: Record<string, unknown>
): CrawlerListSearch {
  return {
    domain: parseSearchText(search.domain),
    page: parsePositiveInteger(search.page, 1),
    pageSize: parsePositiveInteger(search.pageSize, 50, 100),
    search: parseSearchText(search.search),
  };
}

export const loadCrawlerListData = createServerFn({ method: 'GET' })
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
