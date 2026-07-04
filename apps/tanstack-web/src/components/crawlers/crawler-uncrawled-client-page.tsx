'use client';

import { useCrawlerReadOnlyLabels } from './crawler-labels';
import type { CrawlerPagination, UncrawledUrlReadModel } from './types';
import { UncrawledUrlsPage } from './uncrawled-urls-page';
import { CRAWLER_PAGE_SIZE_OPTIONS } from './utils';

export type CrawlerUncrawledClientPageProps = {
  domains: string[];
  groupedUrls: Record<string, UncrawledUrlReadModel[]>;
  page: number;
  pageSize: number;
  pagination: CrawlerPagination;
  search: string;
  selectedDomain: string;
  wsId: string;
};

function flattenGroupedUrls(
  groupedUrls: Record<string, UncrawledUrlReadModel[]>
) {
  return Object.values(groupedUrls).flat();
}

export function CrawlerUncrawledClientPage({
  domains,
  groupedUrls,
  pagination,
  search,
  selectedDomain,
  wsId,
}: CrawlerUncrawledClientPageProps) {
  const labels = useCrawlerReadOnlyLabels();
  const crawledHref = `/${wsId}/crawlers`;
  const uncrawledHref = `/${wsId}/crawlers/uncrawled`;

  return (
    <UncrawledUrlsPage
      crawledHref={crawledHref}
      domain={selectedDomain}
      domains={domains}
      labels={labels}
      pageSizeOptions={[...CRAWLER_PAGE_SIZE_OPTIONS]}
      pagination={pagination}
      search={search}
      uncrawledHref={uncrawledHref}
      urls={flattenGroupedUrls(groupedUrls)}
    />
  );
}
