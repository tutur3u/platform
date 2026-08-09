const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
export const MAX_CRAWLER_PAGE_SIZE = 100;

function positiveInteger(value: string | null, fallback: number) {
  if (!value) return fallback;

  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseCrawlerPagination(searchParams: URLSearchParams) {
  return {
    page: positiveInteger(searchParams.get('page'), DEFAULT_PAGE),
    pageSize: Math.min(
      positiveInteger(searchParams.get('pageSize'), DEFAULT_PAGE_SIZE),
      MAX_CRAWLER_PAGE_SIZE
    ),
  };
}
