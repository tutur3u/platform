'use client';

import useSearchParams from '@/hooks/useSearchParams';
import { DataTable } from '@repo/ui/components/ui/custom/tables/data-table';
import useTranslation from 'next-translate/useTranslation';
import { useRouter } from 'next/navigation';

export const CustomDataTable = ({ namespace, ...props }: any) => {
  const router = useRouter();
  const searchParams = useSearchParams();

  const { t } = useTranslation(namespace);

  const pageSize = Number(searchParams.get('pageSize') || 10);
  const page = Number(searchParams.get('page') || 0);
  const pageIndex = page > 0 ? page - 1 : 0;

  return (
    <DataTable
      t={t}
      namespace={namespace}
      pageIndex={pageIndex || 0}
      pageSize={pageSize || 10}
      onRefresh={() => router.refresh()}
      defaultQuery={searchParams.get({
        key: 'q',
        fallbackValue: '',
      })}
      onSearch={(query: string) =>
        query ? searchParams.set({ q: query, page: '1' }) : searchParams.reset()
      }
      setParams={(params) => searchParams.set(params)}
      resetParams={() => searchParams.reset()}
      isEmpty={searchParams.isEmpty}
      newObjectTitle={t('common:create')}
      {...props}
    />
  );
};
