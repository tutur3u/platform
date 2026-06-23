'use client';

import { Search } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useState } from 'react';
import {
  usePathname,
  useRouter,
  useSearchParams,
} from '../../lib/platform/next-navigation-shim';
import type { CrawlerReadOnlyLabels } from './types';
import { buildCrawlerHref, formatTemplate, resetCrawlerHref } from './utils';

type UncrawledUrlFiltersProps = {
  domain?: string | null;
  domains: string[];
  labels: CrawlerReadOnlyLabels;
  pageSize: number;
  pageSizeOptions: number[];
  search?: string | null;
};

export function UncrawledUrlFilters({
  domain,
  domains,
  labels,
  pageSize,
  pageSizeOptions,
  search,
}: UncrawledUrlFiltersProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchInput, setSearchInput] = useState(search ?? '');
  const selectedDomain = domain || 'all';

  const updateSearchParams = (
    updates: Record<string, number | string | null | undefined>
  ) => {
    router.push(buildCrawlerHref(pathname, searchParams, updates));
  };

  return (
    <form
      className="flex flex-col gap-2 lg:flex-row lg:items-center"
      onSubmit={(event) => {
        event.preventDefault();
        updateSearchParams({
          page: 1,
          search: searchInput,
        });
      }}
    >
      <div className="relative min-w-0 flex-1 lg:w-64 lg:flex-none">
        <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label={labels.filters.search}
          className="pl-9"
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder={labels.filters.search}
          value={searchInput}
        />
      </div>

      <Select
        onValueChange={(nextDomain) => {
          updateSearchParams({
            domain: nextDomain,
            page: 1,
          });
        }}
        value={selectedDomain}
      >
        <SelectTrigger
          aria-label={labels.filters.domain}
          className="w-full lg:w-64"
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

      <Select
        onValueChange={(nextPageSize) => {
          updateSearchParams({
            page: 1,
            pageSize: nextPageSize,
          });
        }}
        value={String(pageSize)}
      >
        <SelectTrigger
          aria-label={labels.filters.pageSize}
          className="w-full lg:w-40"
        >
          <SelectValue placeholder={labels.filters.pageSize} />
        </SelectTrigger>
        <SelectContent>
          {pageSizeOptions.map((option) => (
            <SelectItem key={option} value={String(option)}>
              {formatTemplate(labels.filters.pageSizeOption, {
                count: option,
              })}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex gap-2">
        <Button className="flex-1 lg:flex-none" type="submit">
          {labels.filters.search}
        </Button>
        <Button
          className="flex-1 lg:flex-none"
          onClick={() => {
            setSearchInput('');
            router.push(resetCrawlerHref(pathname));
          }}
          type="button"
          variant="outline"
        >
          {labels.filters.reset}
        </Button>
      </div>
    </form>
  );
}
