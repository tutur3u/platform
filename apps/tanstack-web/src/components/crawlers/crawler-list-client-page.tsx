'use client';

import { useCrawlerLocale, useCrawlerReadOnlyLabels } from './crawler-labels';
import { CrawlerListPage } from './crawler-list-page';
import type { CrawledUrlReadModel } from './types';

export type CrawlerListClientPageProps = {
  count: number;
  crawledUrls: CrawledUrlReadModel[];
  domains: string[];
  page: number;
  pageSize: number;
  search: string;
  selectedDomain: string;
  uncrawledCount: number;
  wsId: string;
};

export function CrawlerListClientPage({
  count,
  crawledUrls,
  domains,
  page,
  pageSize,
  search,
  selectedDomain,
  uncrawledCount,
  wsId,
}: CrawlerListClientPageProps) {
  const labels = useCrawlerReadOnlyLabels();
  const locale = useCrawlerLocale();
  const crawledHref = `/${wsId}/crawlers`;
  const uncrawledHref = `/${wsId}/crawlers/uncrawled`;

  return (
    <CrawlerListPage
      count={count}
      crawledHref={crawledHref}
      data={crawledUrls}
      domain={selectedDomain}
      domains={domains}
      labels={labels}
      locale={locale}
      page={page}
      pageSize={pageSize}
      search={search}
      uncrawledCount={uncrawledCount}
      uncrawledHref={uncrawledHref}
    />
  );
}
