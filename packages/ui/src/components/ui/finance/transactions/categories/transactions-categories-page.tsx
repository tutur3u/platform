import { createClient } from '@tuturuuu/supabase/next/server';
import type { TransactionCategory } from '@tuturuuu/types/primitives/TransactionCategory';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { CustomDataTable } from '@tuturuuu/ui/custom/tables/custom-data-table';
import { AmountFilterWrapper } from '@tuturuuu/ui/finance/transactions/categories/amount-filter-wrapper';
import { transactionCategoryColumns } from '@tuturuuu/ui/finance/transactions/categories/columns';
import { TransactionCategoryForm } from '@tuturuuu/ui/finance/transactions/categories/form';
import { TypeFilterWrapper } from '@tuturuuu/ui/finance/transactions/categories/type-filter-wrapper';
import { Separator } from '@tuturuuu/ui/separator';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { getTranslations } from 'next-intl/server';

interface Props {
  wsId: string;
  searchParams: {
    q: string;
    page: string;
    pageSize: string;
    type?: string;
    minAmount?: string;
    maxAmount?: string;
  };
}

export default async function TransactionsCategoriesPage({
  wsId: id,
  searchParams,
}: Props) {
  const workspace = await getWorkspace(id);
  const wsId = workspace.id;

  const { data: rawData, count } = await getData(wsId, searchParams);
  const t = await getTranslations();

  const data = rawData.map((d) => ({
    ...d,
    href: `/${wsId}/finance/transactions/categories/${d.id}`,
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
        filters={[
          <TypeFilterWrapper key="type-filter" />,
          <AmountFilterWrapper key="amount-filter" />,
        ]}
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
    type,
    minAmount,
    maxAmount,
  }: {
    q?: string;
    page?: string;
    pageSize?: string;
    type?: string;
    minAmount?: string;
    maxAmount?: string;
  }
) {
  const supabase = await createClient();

  // Use optimized RPC function that filters by workspace
  const { data: categories, error } = await supabase.rpc(
    'get_transaction_categories_with_amount_by_workspace',
    { p_ws_id: wsId }
  );

  if (error) throw error;

  // Apply client-side filters
  let filtered = categories || [];

  if (q) {
    filtered = filtered.filter((cat) =>
      cat.name.toLowerCase().includes(q.toLowerCase())
    );
  }

  if (type) {
    if (type === 'income') {
      filtered = filtered.filter((cat) => !cat.is_expense);
    } else if (type === 'expense') {
      filtered = filtered.filter((cat) => cat.is_expense);
    }
  }

  if (minAmount) {
    const min = parseFloat(minAmount);
    if (!Number.isNaN(min)) {
      filtered = filtered.filter((cat) => Number(cat.amount) >= min);
    }
  }

  if (maxAmount) {
    const max = parseFloat(maxAmount);
    if (!Number.isNaN(max)) {
      filtered = filtered.filter((cat) => Number(cat.amount) <= max);
    }
  }

  const count = filtered.length;

  // Paginate
  if (page && pageSize) {
    const parsedPage = parseInt(page, 10);
    const parsedSize = parseInt(pageSize, 10);
    const start = (parsedPage - 1) * parsedSize;
    filtered = filtered.slice(start, start + parsedSize);
  }

  return { data: filtered as TransactionCategory[], count };
}
