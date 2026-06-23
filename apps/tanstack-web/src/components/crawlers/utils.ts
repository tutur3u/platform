import type { CrawlerPagination, UncrawledUrlReadModel } from './types';

export const CRAWLER_PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

type TemplateValue = number | string;

export function formatTemplate(
  template: string,
  values: Record<string, TemplateValue>
) {
  return Object.entries(values).reduce((result, [key, value]) => {
    const formattedValue =
      typeof value === 'number' ? new Intl.NumberFormat().format(value) : value;

    return result.replaceAll(`{${key}}`, formattedValue);
  }, template);
}

export function formatCountTemplate({
  count,
  plural,
  singular,
}: {
  count: number;
  plural: string;
  singular: string;
}) {
  return formatTemplate(count === 1 ? singular : plural, { count });
}

export function formatDateTime(
  value: string | null | undefined,
  locale: string
) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function buildCrawlerHref(
  pathname: string,
  currentParams: URLSearchParams,
  updates: Record<string, number | string | null | undefined>
) {
  const nextParams = new URLSearchParams(currentParams);

  for (const [key, value] of Object.entries(updates)) {
    if (
      value === undefined ||
      value === null ||
      value === '' ||
      value === 'all'
    ) {
      nextParams.delete(key);
    } else {
      nextParams.set(key, String(value));
    }
  }

  const query = nextParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function resetCrawlerHref(pathname: string) {
  return pathname;
}

export function getPaginationRange(pagination: CrawlerPagination) {
  if (pagination.totalItems <= 0) {
    return {
      end: 0,
      start: 0,
    };
  }

  const start = (pagination.page - 1) * pagination.pageSize + 1;
  const end = Math.min(
    pagination.page * pagination.pageSize,
    pagination.totalItems
  );

  return { end, start };
}

export function getVisiblePages(currentPage: number, totalPages: number) {
  const pages: Array<'ellipsis' | number> = [];

  for (let page = 1; page <= totalPages; page += 1) {
    const shouldShowPage =
      page === 1 ||
      page === totalPages ||
      (page >= currentPage - 2 && page <= currentPage + 2);

    if (shouldShowPage) {
      pages.push(page);
      continue;
    }

    const shouldShowLeadingEllipsis = page === 2 && currentPage - 2 > 2;
    const shouldShowTrailingEllipsis =
      page === totalPages - 1 && currentPage + 2 < totalPages - 1;

    if (shouldShowLeadingEllipsis || shouldShowTrailingEllipsis) {
      pages.push('ellipsis');
    }
  }

  return pages;
}

export function groupUncrawledUrls(urls: UncrawledUrlReadModel[]) {
  return urls.reduce<Record<string, UncrawledUrlReadModel[]>>((groups, url) => {
    const key = url.origin_url || url.origin_id || 'unknown';
    const group = groups[key] ?? [];
    groups[key] = [...group, url];
    return groups;
  }, {});
}

export function getDisplayUrlParts(url: string) {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      path: parsed.pathname === '/' ? parsed.hostname : parsed.pathname,
      query: parsed.searchParams.toString(),
    };
  } catch {
    return {
      host: '',
      path: url,
      query: '',
    };
  }
}

export function getOriginLabel(originUrl: string, fallback: string) {
  if (originUrl === 'unknown') {
    return fallback;
  }

  try {
    return new URL(originUrl).hostname;
  } catch {
    return originUrl || fallback;
  }
}
