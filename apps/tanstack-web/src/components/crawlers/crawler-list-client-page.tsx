'use client';

import { useCrawlerLocale, useCrawlerReadOnlyLabels } from './crawler-labels';
import { CrawlerListPage } from './crawler-list-page';
import type { CrawledUrlReadModel } from './types';

export type CrawlerListClientPageProps = {
  count: number;
  crawledUrls: CrawledUrlReadModel[];
  crawledHref?: string;
  domains: string[];
  page: number;
  pageSize: number;
  search: string;
  selectedDomain: string;
  uncrawledCount: number;
  uncrawledHref?: string;
  wsId: string;
};

export function CrawlerListClientPage({
  count,
  crawledHref,
  crawledUrls,
  domains,
  page,
  pageSize,
  search,
  selectedDomain,
  uncrawledCount,
  uncrawledHref,
  wsId,
}: CrawlerListClientPageProps) {
  const labels = useCrawlerReadOnlyLabels();
  const locale = useCrawlerLocale();
  const resolvedCrawledHref = crawledHref ?? `/${wsId}/crawlers`;
  const resolvedUncrawledHref = uncrawledHref ?? `/${wsId}/crawlers/uncrawled`;

  return (
    <CrawlerListPage
      count={count}
      crawledHref={resolvedCrawledHref}
      data={crawledUrls}
      domain={selectedDomain}
      domains={domains}
      labels={labels}
      locale={locale}
      page={page}
      pageSize={pageSize}
      search={search}
      uncrawledCount={uncrawledCount}
      uncrawledHref={resolvedUncrawledHref}
    />
  );
}
