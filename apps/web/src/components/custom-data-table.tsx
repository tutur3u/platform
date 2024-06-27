'use client';

import useSearchParams from '@/hooks/useSearchParams';
import {
  DataTable,
  DataTableProps,
} from '@repo/ui/components/ui/custom/tables/data-table';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

export function CustomDataTable<TData, TValue>({
  namespace,
  ...props
}: DataTableProps<TData, TValue>) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const generalT = useTranslations();
  const t = useTranslations(namespace as any);

  const pageSize = Number(searchParams.get('pageSize') || 10);
  const page = Number(searchParams.get('page') || 0);
  const pageIndex = page > 0 ? page - 1 : 0;

  return (
    <DataTable
      t={t}
      generalT={generalT}
      namespace={namespace}
      pageIndex={pageIndex || 0}
      pageSize={pageSize || 10}
      onRefresh={() => router.refresh()}
      defaultQuery={searchParams.getSingle('q', '')}
      onSearch={(query: string) =>
        query ? searchParams.set({ q: query, page: '1' }) : searchParams.reset()
      }
      setParams={(params) => searchParams.set(params)}
      resetParams={() => searchParams.reset()}
      isEmpty={searchParams.isEmpty}
      newObjectTitle={generalT('common.create')}
      {...props}
    />
  );
}
