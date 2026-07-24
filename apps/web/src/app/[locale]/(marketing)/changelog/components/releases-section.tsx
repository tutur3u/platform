import { Suspense } from 'react';
import { SectionEyebrow } from '@/components/landing/shared/section-shell';
import type { ReleaseFeed as Feed } from './github-releases';
import {
  ReleaseFeed,
  type ReleaseFeedLabels,
  ReleaseUnavailable,
} from './release-feed';
import { type ReleaseFilterLabels, ReleaseFilters } from './release-filters';
import { ReleasePagination } from './release-pagination';
import {
  filterReleases,
  packageFacets,
  paginate,
  type ReleaseQuery,
  sortReleases,
  typeFacets,
} from './release-query';

/**
 * The platform release feed section.
 *
 * Filtering and sorting happen here, on the server, against the hourly-cached
 * GitHub response — so the browser receives one page of results rather than
 * several hundred releases to sift through itself.
 */
export function ReleasesSection({
  eyebrow,
  feed,
  feedLabels,
  filterLabels,
  paginationLabels,
  query,
  resultsLabel,
  subtitle,
  title,
  truncatedNote,
}: {
  eyebrow: string;
  feed: Feed;
  feedLabels: ReleaseFeedLabels;
  filterLabels: ReleaseFilterLabels;
  paginationLabels: {
    next: string;
    pageOf: (page: ReleasePageInfo) => string;
    previous: string;
  };
  query: ReleaseQuery;
  resultsLabel: (count: number) => string;
  subtitle: string;
  title: string;
  truncatedNote: string | null;
}) {
  const filtered = filterReleases(feed.releases, query);
  const page = paginate(sortReleases(filtered, query.sort), query.page);

  return (
    <section
      className="relative px-4 py-16 sm:px-6 sm:py-20 lg:px-8"
      id="releases"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,color-mix(in_oklab,var(--foreground)_12%,transparent)_25%,color-mix(in_oklab,var(--foreground)_12%,transparent)_75%,transparent)]"
      />

      <div className="relative mx-auto w-full max-w-6xl">
        <SectionEyebrow index="03">{eyebrow}</SectionEyebrow>

        <div className="mt-6 grid gap-5 lg:grid-cols-[0.72fr_0.58fr] lg:items-end">
          <h2 className="text-balance font-display font-semibold text-3xl tracking-[-0.03em] sm:text-4xl">
            {title}
          </h2>
          <p className="text-balance text-foreground/55 leading-relaxed">
            {subtitle}
          </p>
        </div>

        {feed.ok ? (
          <>
            <div className="mt-10">
              {/* `useSearchParams` inside the controls needs a boundary. */}
              <Suspense
                fallback={
                  <div className="h-40 animate-pulse rounded-2xl border border-foreground/[0.08] bg-foreground/[0.02]" />
                }
              >
                <ReleaseFilters
                  labels={filterLabels}
                  packages={packageFacets(feed.releases)}
                  query={query}
                  types={typeFacets(feed.releases)}
                />
              </Suspense>
            </div>

            <div className="mt-6 flex flex-wrap items-baseline justify-between gap-3">
              <p className="font-mono-ui text-[0.62rem] text-foreground/40 uppercase tracking-[0.14em]">
                {resultsLabel(page.total)}
              </p>
              {truncatedNote ? (
                <p className="font-mono-ui text-[0.58rem] text-foreground/25 uppercase tracking-[0.12em]">
                  {truncatedNote}
                </p>
              ) : null}
            </div>

            <div className="mt-4">
              <ReleaseFeed labels={feedLabels} page={page} />
            </div>

            <ReleasePagination
              labels={{
                next: paginationLabels.next,
                pageOf: paginationLabels.pageOf({
                  page: page.page,
                  total: page.pageCount,
                }),
                previous: paginationLabels.previous,
              }}
              page={page.page}
              pageCount={page.pageCount}
              query={query}
            />
          </>
        ) : (
          <div className="mt-10">
            <ReleaseUnavailable labels={feedLabels} />
          </div>
        )}
      </div>
    </section>
  );
}

export interface ReleasePageInfo {
  page: number;
  total: number;
}
