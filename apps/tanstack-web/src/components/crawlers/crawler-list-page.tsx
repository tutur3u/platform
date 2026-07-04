import { CrawlerListTable } from './crawler-list-table';
import { CrawlerReadOnlyShell } from './crawler-read-only-shell';
import { CrawlerStatsCard } from './crawler-stats-card';
import type { CrawlerListPageProps } from './types';

export function CrawlerListPage({
  count,
  crawledHref,
  data,
  domain,
  domains,
  labels,
  locale,
  page,
  pageSize,
  search,
  uncrawledCount,
  uncrawledHref,
}: CrawlerListPageProps) {
  return (
    <CrawlerReadOnlyShell
      activeView="crawled"
      crawledHref={crawledHref}
      labels={labels}
      uncrawledHref={uncrawledHref}
    >
      <div className="space-y-5">
        <CrawlerStatsCard
          domainsCount={domains.length}
          labels={labels}
          uncrawledCount={uncrawledCount}
          uncrawledHref={uncrawledHref}
        />

        <section className="space-y-3">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="font-semibold text-xl">{labels.crawled.title}</h2>
              <p className="text-muted-foreground text-sm">
                {count.toLocaleString()} {labels.navigation.crawled}
              </p>
            </div>
          </div>

          <CrawlerListTable
            count={count}
            data={data}
            domain={domain}
            domains={domains}
            labels={labels}
            locale={locale}
            page={page}
            pageSize={pageSize}
            search={search}
          />
        </section>
      </div>
    </CrawlerReadOnlyShell>
  );
}
