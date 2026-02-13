import { createClient } from '@tuturuuu/supabase/next/server';
import type { TransactionCategoryWithStats } from '@tuturuuu/types/primitives/TransactionCategory';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { CategoryBreakdownChart } from '@tuturuuu/ui/finance/shared/charts/category-breakdown-chart';
import { AmountFilterWrapper } from '@tuturuuu/ui/finance/transactions/categories/amount-filter-wrapper';
import { CategoriesDataTable } from '@tuturuuu/ui/finance/transactions/categories/categories-data-table';
import { TransactionCategoryForm } from '@tuturuuu/ui/finance/transactions/categories/form';
import { TypeFilterWrapper } from '@tuturuuu/ui/finance/transactions/categories/type-filter-wrapper';
import { Separator } from '@tuturuuu/ui/separator';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

interface Props {
  wsId: string;
  currency?: string;
}

export default async function TransactionsCategoriesPage({
  wsId: id,
  currency = 'USD',
}: Props) {
  const workspace = await getWorkspace(id);
  if (!workspace) notFound();
  const wsId = workspace.id;

  // Fetch initial data for SSR hydration (first page with default params)
  const initialData = await getInitialData(wsId);
  const t = await getTranslations();

  // Determine default chart mode based on category types
  // If all categories are income (is_expense: false), default to 'income' mode
  const defaultChartType = initialData.allAreIncome ? 'income' : 'expense';

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
      <CategoryBreakdownChart
        wsId={wsId}
        currency={currency}
        defaultTransactionType={defaultChartType}
      />
      <Separator className="my-4" />
      <CategoriesDataTable
        wsId={wsId}
        initialData={initialData}
        currency={currency}
        filters={[
          <TypeFilterWrapper key="type-filter" />,
          <AmountFilterWrapper key="amount-filter" />,
        ]}
      />
    </>
  );
}

/**
 * Fetch initial data for SSR hydration.
 * Returns the first page of categories with default page size (10).
 */
async function getInitialData(wsId: string) {
  const supabase = await createClient();

  const { data: categories, error } = await supabase.rpc(
    'get_transaction_categories_with_amount_by_workspace',
    { p_ws_id: wsId }
  );

  if (error) throw error;

  const allCategories = (categories || []) as TransactionCategoryWithStats[];
  const count = allCategories.length;

  // Return first page (10 items) for initial hydration
  const pageSize = 10;
  const data = allCategories.slice(0, pageSize);

  // Check if all categories are income (for chart default mode)
  const allAreIncome =
    allCategories.length > 0 &&
    allCategories.every((cat) => cat.is_expense === false);

  return { data, count, allAreIncome };
}
