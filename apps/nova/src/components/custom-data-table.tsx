'use client';

import {
  DataTable,
  type DataTableProps,
} from '@tuturuuu/ui/custom/tables/data-table';
import useSearchParams from '@tuturuuu/ui/hooks/useSearchParams';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense } from 'react';

export function CustomDataTable<TData, TValue>({
  namespace,
  hideToolbar,
  hidePagination,
  className,
  preserveParams = [],
  ...props
}: DataTableProps<TData, TValue>) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const pageSize = Number(searchParams.get('pageSize') || 10);
  const page = Number(searchParams.get('page') || 0);
  const pageIndex = page > 0 ? page - 1 : 0;

  // Custom reset function that can preserve specified parameters
  const filterReset = () => {
    // If no params to preserve, do a standard reset
    if (preserveParams.length === 0) {
      searchParams.reset();
      return;
    }

    // Otherwise, build a new URL with only the preserved params
    const currentParams = new URLSearchParams(window.location.search);
    const preservedQueryString = new URLSearchParams();

    // Copy over only the parameters we want to preserve
    preserveParams.forEach((param) => {
      const value = currentParams.get(param);
      if (value) preservedQueryString.set(param, value);
    });

    // Navigate to the new URL
    const queryString = preservedQueryString.toString();
    router.push(queryString ? `${pathname}?${queryString}` : pathname);
  };

  return (
    <Suspense fallback={null}>
      <DataTable
        t={t}
        hideToolbar={hideToolbar}
        hidePagination={hidePagination}
        namespace={namespace}
        pageIndex={pageIndex || 0}
        pageSize={pageSize || 10}
        onRefresh={() => router.refresh()}
        defaultQuery={searchParams.getSingle('q', '')}
        onSearch={
          (query: string) =>
            query ? searchParams.set({ q: query, page: '1' }) : filterReset() // Use our custom reset function
        }
        setParams={(params) => searchParams.set(params)}
        resetParams={() => searchParams.reset()}
        isFiltered={!searchParams.isEmpty}
        newObjectTitle={t('common.create')}
        className={className}
        {...props}
      />
    </Suspense>
  );
}
