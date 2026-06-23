'use client';

import { AlertCircle, BugPlay } from '@tuturuuu/icons';
import { Alert, AlertDescription } from '@tuturuuu/ui/alert';
import { Badge } from '@tuturuuu/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
} from '@tuturuuu/ui/pagination';
import {
  usePathname,
  useSearchParams,
} from '../../lib/platform/next-navigation-shim';
import { CrawlerReadOnlyShell } from './crawler-read-only-shell';
import type { UncrawledUrlReadModel, UncrawledUrlsPageProps } from './types';
import { UncrawledUrlFilters } from './uncrawled-url-filters';
import {
  buildCrawlerHref,
  CRAWLER_PAGE_SIZE_OPTIONS,
  formatCountTemplate,
  formatTemplate,
  getDisplayUrlParts,
  getOriginLabel,
  getPaginationRange,
  getVisiblePages,
  groupUncrawledUrls,
} from './utils';

export function UncrawledUrlsPage({
  crawledHref,
  domain,
  domains,
  labels,
  pageSizeOptions = [...CRAWLER_PAGE_SIZE_OPTIONS],
  pagination,
  search,
  uncrawledHref,
  urls,
}: UncrawledUrlsPageProps) {
  const groupedUrls = groupUncrawledUrls(urls);
  const groupEntries = Object.entries(groupedUrls);

  return (
    <CrawlerReadOnlyShell
      activeView="uncrawled"
      crawledHref={crawledHref}
      labels={labels}
      uncrawledHref={uncrawledHref}
    >
      <Card className="border-border/70">
        <CardHeader className="gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <CardTitle>{labels.uncrawled.title}</CardTitle>
            <p className="text-muted-foreground text-sm">
              {formatCountTemplate({
                count: pagination.totalItems,
                plural: labels.uncrawled.waitingPlural,
                singular: labels.uncrawled.waitingSingular,
              })}
            </p>
          </div>

          <UncrawledUrlFilters
            domain={domain}
            domains={domains}
            labels={labels}
            pageSize={pagination.pageSize}
            pageSizeOptions={pageSizeOptions}
            search={search}
          />
        </CardHeader>
        <CardContent>
          {pagination.totalItems === 0 ? (
            <UncrawledEmptyState labels={labels} />
          ) : groupEntries.length === 0 ? (
            <UncrawledNoResults labels={labels} />
          ) : (
            <div className="space-y-4">
              <div className="divide-y rounded-md border bg-card">
                {groupEntries.map(([originUrl, originUrls]) => (
                  <UncrawledUrlGroup
                    key={originUrl}
                    labels={labels}
                    originUrl={originUrl}
                    urls={originUrls}
                  />
                ))}
              </div>

              <UncrawledPagination labels={labels} pagination={pagination} />
            </div>
          )}
        </CardContent>
      </Card>
    </CrawlerReadOnlyShell>
  );
}

function UncrawledUrlGroup({
  labels,
  originUrl,
  urls,
}: {
  labels: UncrawledUrlsPageProps['labels'];
  originUrl: string;
  urls: UncrawledUrlReadModel[];
}) {
  const originLabel = getOriginLabel(
    originUrl,
    labels.uncrawled.originFallback
  );

  return (
    <section className="p-4 md:p-6">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-lg">{originLabel}</h3>
            <Badge className="border-dynamic-blue/20 bg-dynamic-blue/10 text-dynamic-blue">
              {formatCountTemplate({
                count: urls.length,
                plural: labels.uncrawled.urlCountPlural,
                singular: labels.uncrawled.urlCountSingular,
              })}
            </Badge>
          </div>

          {originUrl !== 'unknown' ? (
            <a
              className="block truncate text-muted-foreground text-sm hover:text-foreground"
              href={originUrl}
              rel="noreferrer"
              target="_blank"
            >
              {labels.uncrawled.sourceUrl}: {originUrl}
            </a>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3">
        {urls.map((url) => (
          <UncrawledUrlItem key={url.url} url={url} />
        ))}
      </div>
    </section>
  );
}

function UncrawledUrlItem({ url }: { url: UncrawledUrlReadModel }) {
  const parts = getDisplayUrlParts(url.url);

  return (
    <div className="flex min-w-0 items-center justify-between gap-4 rounded-md bg-muted/50 p-4">
      <div className="min-w-0 space-y-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="max-w-full truncate font-medium">{parts.path}</span>
          {parts.query ? (
            <span className="max-w-full truncate rounded-full bg-muted-foreground/10 px-2 py-0.5 text-muted-foreground text-xs">
              ?{parts.query}
            </span>
          ) : null}
          {parts.host ? (
            <Badge className="border-border bg-background text-muted-foreground">
              {parts.host}
            </Badge>
          ) : null}
        </div>
        <a
          className="block truncate text-muted-foreground text-sm hover:text-foreground"
          href={url.url}
          rel="noreferrer"
          target="_blank"
        >
          {url.url}
        </a>
      </div>
    </div>
  );
}

function UncrawledEmptyState({
  labels,
}: {
  labels: UncrawledUrlsPageProps['labels'];
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <BugPlay className="h-12 w-12 text-muted-foreground/50" />
      <p className="mt-4 font-medium text-lg">{labels.uncrawled.emptyTitle}</p>
      <p className="text-muted-foreground text-sm">
        {labels.uncrawled.emptyDescription}
      </p>
    </div>
  );
}

function UncrawledNoResults({
  labels,
}: {
  labels: UncrawledUrlsPageProps['labels'];
}) {
  return (
    <Alert>
      <AlertCircle className="h-4 w-4" />
      <AlertDescription>
        <span className="font-medium">{labels.uncrawled.noResultsTitle}</span>
        <span className="block text-muted-foreground">
          {labels.uncrawled.noResultsDescription}
        </span>
      </AlertDescription>
    </Alert>
  );
}

function UncrawledPagination({
  labels,
  pagination,
}: {
  labels: UncrawledUrlsPageProps['labels'];
  pagination: UncrawledUrlsPageProps['pagination'];
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const range = getPaginationRange(pagination);
  const visiblePages = getVisiblePages(pagination.page, pagination.totalPages);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-muted-foreground text-sm">
        {formatTemplate(labels.uncrawled.showingRange, {
          end: range.end,
          start: range.start,
          total: pagination.totalItems,
        })}
      </p>
      <Pagination>
        <PaginationContent>
          {visiblePages.map((page, index) =>
            page === 'ellipsis' ? (
              <PaginationItem key={`ellipsis-${index}`}>
                <span className="flex size-9 items-center justify-center">
                  ...
                </span>
              </PaginationItem>
            ) : (
              <PaginationItem key={page}>
                <PaginationLink
                  href={buildCrawlerHref(pathname, searchParams, { page })}
                  isActive={pagination.page === page}
                >
                  {page}
                </PaginationLink>
              </PaginationItem>
            )
          )}
          <PaginationItem>
            <PaginationNext
              aria-disabled={pagination.page >= pagination.totalPages}
              href={buildCrawlerHref(pathname, searchParams, {
                page: Math.min(pagination.page + 1, pagination.totalPages),
              })}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}
