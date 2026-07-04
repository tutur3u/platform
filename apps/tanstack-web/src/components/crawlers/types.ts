import type { ReactNode } from 'react';

export type CrawledUrlReadModel = {
  created_at?: string | null;
  html?: string | null;
  id: string;
  markdown?: string | null;
  url?: string | null;
};

export type UncrawledUrlReadModel = {
  created_at?: string | null;
  origin_id?: string | null;
  origin_url?: string | null;
  skipped?: boolean | null;
  url: string;
};

export type CrawlerPagination = {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

export type CrawlerReadOnlyLabels = {
  crawled: {
    title: string;
  };
  feature: {
    description: string;
    pluralTitle: string;
    singularTitle: string;
  };
  filters: {
    allDomains: string;
    domain: string;
    pageSize: string;
    pageSizeOption: string;
    reset: string;
    search: string;
  };
  navigation: {
    crawled: string;
    uncrawled: string;
  };
  stats: {
    allCaughtUp: string;
    domains: string;
    title: string;
    uncrawledUrls: string;
    uniqueDomainsDiscovered: string;
    waitingToBeCrawled: string;
  };
  status: {
    hasHtml: string;
    hasMarkdown: string;
    missingHtml: string;
    missingMarkdown: string;
  };
  uncrawled: {
    emptyDescription: string;
    emptyTitle: string;
    noResultsDescription: string;
    noResultsTitle: string;
    originFallback: string;
    showingRange: string;
    sourceUrl: string;
    title: string;
    urlCountPlural: string;
    urlCountSingular: string;
    waitingPlural: string;
    waitingSingular: string;
  };
};

export type CrawlerReadOnlyShellProps = {
  activeView: 'crawled' | 'uncrawled';
  children: ReactNode;
  crawledHref: string;
  labels: CrawlerReadOnlyLabels;
  uncrawledHref: string;
};

export type CrawlerListPageProps = {
  count: number;
  crawledHref: string;
  data: CrawledUrlReadModel[];
  domain?: string | null;
  domains: string[];
  labels: CrawlerReadOnlyLabels;
  locale: string;
  page: number;
  pageSize: number;
  search?: string | null;
  uncrawledCount: number;
  uncrawledHref: string;
};

export type UncrawledUrlsPageProps = {
  crawledHref: string;
  domain?: string | null;
  domains: string[];
  labels: CrawlerReadOnlyLabels;
  pageSizeOptions?: number[];
  pagination: CrawlerPagination;
  search?: string | null;
  uncrawledHref: string;
  urls: UncrawledUrlReadModel[];
};
