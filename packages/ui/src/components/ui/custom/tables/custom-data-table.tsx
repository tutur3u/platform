'use client';

import {
  DataTable,
  type DataTableProps,
} from '@tuturuuu/ui/custom/tables/data-table';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';

function CustomDataTableInner<TData, TValue>({
  namespace,
  hideToolbar,
  hidePagination,
  className,
  rowWrapper,
  onRowClick,
  onRowDoubleClick,
  ...props
}: DataTableProps<TData, TValue>) {
  const [mounted, setMounted] = useState(false);
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);
  }, []);

  const pageSize = mounted ? Number(searchParams.get('pageSize') || 10) : 10;
  const page = mounted ? Number(searchParams.get('page') || 0) : 0;
  const pageIndex = page > 0 ? page - 1 : 0;

  const handleSearch = useCallback(
    (query: string) => {
      if (!mounted) return;

      const params = new URLSearchParams(searchParams);
      if (query) {
        params.set('q', query);
        params.set('page', '1');
      } else {
        params.delete('q');
        params.delete('page');
      }
      router.push(`${pathname}?${params.toString()}`);
      router.refresh();
    },
    [mounted, searchParams, pathname, router]
  );

  const handleSetParams = useCallback(
    (params: { page?: number; pageSize?: string }) => {
      if (!mounted) return;

      const urlParams = new URLSearchParams(searchParams);
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          urlParams.set(key, value.toString());
        }
      });
      router.push(`${pathname}?${urlParams.toString()}`);
      router.refresh();
    },
    [mounted, searchParams, pathname, router]
  );

  const handleResetParams = useCallback(() => {
    if (!mounted) return;

    router.push(pathname);
    router.refresh();
  }, [mounted, pathname, router]);

  return (
    <DataTable
      t={t}
      hideToolbar={hideToolbar}
      hidePagination={hidePagination}
      namespace={namespace}
      pageIndex={pageIndex || 0}
      pageSize={pageSize || 10}
      onRefresh={() => router.refresh()}
      defaultQuery={mounted ? searchParams.get('q') || '' : ''}
      onSearch={handleSearch}
      setParams={handleSetParams}
      resetParams={handleResetParams}
      isEmpty={mounted ? searchParams.toString().length === 0 : true}
      newObjectTitle={t('common.create')}
      className={className}
      rowWrapper={rowWrapper}
      onRowClick={onRowClick}
      onRowDoubleClick={onRowDoubleClick}
      {...props}
    />
  );
}

export function CustomDataTable<TData, TValue>(
  props: DataTableProps<TData, TValue>
) {
  return (
    <Suspense fallback={null}>
      <CustomDataTableInner {...props} />
    </Suspense>
  );
}
