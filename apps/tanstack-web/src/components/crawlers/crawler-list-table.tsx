'use client';

import { Filter } from '@tuturuuu/icons';
import {
  DataTable,
  type DataTableProps,
} from '@tuturuuu/ui/custom/tables/data-table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useCallback } from 'react';
import { useTranslations } from 'use-intl';
import {
  usePathname,
  useRouter,
  useSearchParams,
} from '../../lib/platform/next-navigation-shim';
import { getCrawlerListColumns } from './crawler-list-columns';
import type { CrawledUrlReadModel, CrawlerReadOnlyLabels } from './types';
import { buildCrawlerHref, resetCrawlerHref } from './utils';

type CrawlerListTableProps = {
  count: number;
  data: CrawledUrlReadModel[];
  domain?: string | null;
  domains: string[];
  labels: CrawlerReadOnlyLabels;
  locale: string;
  page: number;
  pageSize: number;
  search?: string | null;
};

export function CrawlerListTable({
  count,
  data,
  domain,
  domains,
  labels,
  locale,
  page,
  pageSize,
  search,
}: CrawlerListTableProps) {
  const t = useTranslations();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedDomain = domain || 'all';
  const isFiltered = Boolean(search || (domain && domain !== 'all'));

  const updateSearchParams = useCallback(
    (updates: Record<string, number | string | null | undefined>) => {
      router.push(buildCrawlerHref(pathname, searchParams, updates));
    },
    [pathname, router, searchParams]
  );

  const handleSetParams = useCallback<
    NonNullable<DataTableProps<CrawledUrlReadModel, unknown>['setParams']>
  >(
    (params) => {
      updateSearchParams({
        page: params.page,
        pageSize: params.pageSize,
        sortBy: params.sortBy,
        sortOrder: params.sortOrder,
      });
    },
    [updateSearchParams]
  );

  const resetParams = useCallback(() => {
    router.push(resetCrawlerHref(pathname));
  }, [pathname, router]);

  return (
    <DataTable
      columnGenerator={getCrawlerListColumns}
      count={count}
      data={data}
      defaultQuery={search ?? ''}
      defaultVisibility={{
        id: false,
      }}
      extraData={{
        labels,
        locale,
      }}
      filters={
        <CrawlerDomainSelect
          domain={selectedDomain}
          domains={domains}
          labels={labels}
          onDomainChange={(nextDomain) => {
            updateSearchParams({
              domain: nextDomain,
              page: 1,
            });
          }}
        />
      }
      isFiltered={isFiltered}
      namespace="crawled-url-data-table"
      onRefresh={() => router.refresh()}
      onSearch={(query) => {
        updateSearchParams({
          page: 1,
          search: query,
        });
      }}
      pageIndex={Math.max(page - 1, 0)}
      pageSize={pageSize}
      resetParams={resetParams}
      setParams={handleSetParams}
      t={t}
    />
  );
}

function CrawlerDomainSelect({
  domain,
  domains,
  labels,
  onDomainChange,
}: {
  domain: string;
  domains: string[];
  labels: CrawlerReadOnlyLabels;
  onDomainChange: (domain: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Filter className="h-4 w-4 text-muted-foreground" />
      <Select onValueChange={onDomainChange} value={domain || 'all'}>
        <SelectTrigger
          aria-label={labels.filters.domain}
          className="h-8 w-full sm:w-64"
        >
          <SelectValue placeholder={labels.filters.domain} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{labels.filters.allDomains}</SelectItem>
          {domains.map((domainOption) => (
            <SelectItem key={domainOption} value={domainOption}>
              {domainOption}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
