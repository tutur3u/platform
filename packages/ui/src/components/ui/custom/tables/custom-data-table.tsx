'use client';

import {
  DataTable,
  type DataTableProps,
} from '@tuturuuu/ui/custom/tables/data-table';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense } from 'react';
import useSearchParams from '../../../../hooks/useSearchParams';

export function CustomDataTable<TData, TValue>({
  namespace,
  hideToolbar,
  hidePagination,
  className,
  rowWrapper,
  onRowClick,
  onRowDoubleClick,
  ...props
}: DataTableProps<TData, TValue>) {
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();

  const pageSize = Number(searchParams.get('pageSize') || 10);
  const page = Number(searchParams.get('page') || 0);
  const pageIndex = page > 0 ? page - 1 : 0;

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
        onSearch={(query: string) =>
          query
            ? searchParams.set({ q: query, page: '1' })
            : searchParams.reset()
        }
        setParams={(params) => searchParams.set(params)}
        resetParams={() => searchParams.reset()}
        isEmpty={searchParams.isEmpty}
        newObjectTitle={t('common.create')}
        className={className}
        rowWrapper={rowWrapper}
        onRowClick={onRowClick}
        onRowDoubleClick={onRowDoubleClick}
        {...props}
      />
    </Suspense>
  );
}
