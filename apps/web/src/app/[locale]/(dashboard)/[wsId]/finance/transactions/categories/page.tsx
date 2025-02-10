import { transactionCategoryColumns } from './columns';
import { TransactionCategoryForm } from './form';
import { CustomDataTable } from '@/components/custom-data-table';
import { createClient } from '@tutur3u/supabase/next/server';
import { TransactionCategory } from '@tutur3u/types/primitives/TransactionCategory';
import FeatureSummary from '@tutur3u/ui/components/ui/custom/feature-summary';
import { Separator } from '@tutur3u/ui/components/ui/separator';
import { getTranslations } from 'next-intl/server';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<{
    q: string;
    page: string;
    pageSize: string;
  }>;
}

export default async function WorkspaceTransactionCategoriesPage({
  params,
  searchParams,
}: Props) {
  const { wsId } = await params;
  const { data: rawData, count } = await getData(wsId, await searchParams);
  const t = await getTranslations();

  const data = rawData.map((d) => ({
    ...d,
    // href: `/${wsId}/finance/transactions/${d.id}`,
    ws_id: wsId,
  }));

  return (
    <>
      <FeatureSummary
        pluralTitle={t('ws-transaction-categories.plural')}
        singularTitle={t('ws-transaction-categories.singular')}
        description={t('ws-transaction-categories.description')}
        createTitle={t('ws-transaction-categories.create')}
        createDescription={t('ws-transaction-categories.create_description')}
        form={<TransactionCategoryForm wsId={wsId} />}
      />
      <Separator className="my-4" />
      <CustomDataTable
        data={data}
        columnGenerator={transactionCategoryColumns}
        namespace="transaction-category-data-table"
        count={count}
        defaultVisibility={{
          id: false,
          created_at: false,
        }}
      />
    </>
  );
}

async function getData(
  wsId: string,
  {
    q,
    page = '1',
    pageSize = '10',
  }: { q?: string; page?: string; pageSize?: string }
) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .rpc('get_transaction_categories_with_amount', {}, { count: 'exact' })
    .eq('ws_id', wsId)
    .order('name', { ascending: true });

  if (q) queryBuilder.ilike('name', `%${q}%`);

  if (page && pageSize) {
    const parsedPage = parseInt(page);
    const parsedSize = parseInt(pageSize);
    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize;
    queryBuilder.range(start, end).limit(parsedSize);
  }

  const { data, error, count } = await queryBuilder;
  if (error) throw error;

  return { data, count } as { data: TransactionCategory[]; count: number };
}
