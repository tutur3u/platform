import { ChevronLeft, ChevronRight } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import Link from 'next/link';

export const DETAIL_PAGE_PARAMETERS = [
  'commentsPage',
  'filesPage',
  'reviewsPage',
  'jobsPage',
  'artifactsPage',
] as const;
export const MAX_DETAIL_PAGE = 1000;

export type DetailPageParameter = (typeof DETAIL_PAGE_PARAMETERS)[number];

export type DetailSearchParams = Partial<
  Record<DetailPageParameter | 'page' | 'q' | 'ref', string>
>;

export type DetailPaginationLabels = {
  collectionFailed: string;
  nextPage: string;
  page: (page: number) => string;
  partialResults: string;
  previousPage: string;
};

export type DetailCollectionPage<T> = {
  failed: boolean;
  items: T[];
  labels: DetailPaginationLabels;
  nextHref?: string;
  nextPage: number | null;
  page: number;
  previousHref?: string;
};

export function normalizeDetailPage(value: string | undefined): number {
  if (!value || !/^\d+$/u.test(value)) return 1;
  return Math.min(MAX_DETAIL_PAGE, Math.max(1, Number(value)));
}

export function buildDetailPaginationHref({
  owner,
  page,
  pageParameter,
  repository,
  searchParams,
  view,
}: {
  owner: string;
  page: number;
  pageParameter: DetailPageParameter;
  repository: string;
  searchParams: DetailSearchParams;
  view: string[];
}): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value !== undefined) query.set(key, value);
  }
  query.set(pageParameter, String(page));

  const path = [owner, repository, ...view]
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `/${path}?${query.toString()}`;
}

export function RepositoryDetailPagination({
  failed,
  labels,
  nextHref,
  nextPage,
  page,
  previousHref,
}: {
  failed: boolean;
  labels: DetailPaginationLabels;
  nextHref?: string;
  nextPage: number | null;
  page: number;
  previousHref?: string;
}) {
  if (failed) {
    return (
      <p className="border-t p-4 text-muted-foreground text-sm">
        {labels.collectionFailed}
      </p>
    );
  }

  const isPartial = page > 1 || nextPage !== null;

  return (
    <footer className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-0.5">
        <p className="font-medium text-sm">{labels.page(page)}</p>
        {isPartial ? (
          <p className="text-muted-foreground text-xs">
            {labels.partialResults}
          </p>
        ) : null}
      </div>
      <nav aria-label={labels.page(page)} className="flex items-center gap-2">
        {previousHref ? (
          <Button asChild size="sm" variant="outline">
            <Link href={previousHref}>
              <ChevronLeft className="h-4 w-4" />
              {labels.previousPage}
            </Link>
          </Button>
        ) : null}
        {nextHref && nextPage !== null ? (
          <Button asChild size="sm" variant="outline">
            <Link href={nextHref}>
              {labels.nextPage}
              <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
        ) : null}
      </nav>
    </footer>
  );
}
