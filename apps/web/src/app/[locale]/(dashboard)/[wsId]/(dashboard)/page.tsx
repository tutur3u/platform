import {
  FinanceCategoryStatistics,
  HealthcareCategoryStatistics,
  InventoryCategoryStatistics,
  UsersCategoryStatistics,
} from './categories';
import {
  BatchesStatistics,
  ExpenseStatistics,
  HealthCheckupsStatistics,
  HealthDiagnosesStatistics,
  HealthVitalGroupsStatistics,
  HealthVitalsStatistics,
  IncomeStatistics,
  InventoryProductsStatistics,
  InvoicesStatistics,
  ProductCategoriesStatistics,
  ProductsStatistics,
  PromotionsStatistics,
  SuppliersStatistics,
  TotalBalanceStatistics,
  TransactionCategoriesStatistics,
  TransactionsStatistics,
  UnitsStatistics,
  UserGroupTagsStatistics,
  UserGroupsStatistics,
  UserReportsStatistics,
  UsersStatistics,
  WalletsStatistics,
  WarehousesStatistics,
} from './statistics';
import LoadingStatisticCard from '@/components/loading-statistic-card';
import { getWorkspace } from '@/lib/workspace-helper';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

interface Props {
  params: {
    wsId: string;
  };
}

export default async function WorkspaceHomePage({ params: { wsId } }: Props) {
  const workspace = await getWorkspace(wsId);
  if (!workspace) notFound();

  return (
    <>
      <FinanceCategoryStatistics wsId={wsId} />

      <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Suspense fallback={<LoadingStatisticCard className="md:col-span-2" />}>
          <TotalBalanceStatistics wsId={wsId} />
        </Suspense>

        <Suspense fallback={<LoadingStatisticCard />}>
          <IncomeStatistics wsId={wsId} />
        </Suspense>

        <Suspense fallback={<LoadingStatisticCard />}>
          <ExpenseStatistics wsId={wsId} />
        </Suspense>

        <Suspense fallback={<LoadingStatisticCard />}>
          <WalletsStatistics wsId={wsId} />
        </Suspense>

        <Suspense fallback={<LoadingStatisticCard />}>
          <TransactionCategoriesStatistics wsId={wsId} />
        </Suspense>

        <Suspense fallback={<LoadingStatisticCard />}>
          <TransactionsStatistics wsId={wsId} />
        </Suspense>

        <Suspense fallback={<LoadingStatisticCard />}>
          <InvoicesStatistics wsId={wsId} />
        </Suspense>
      </div>

      <HealthcareCategoryStatistics wsId={wsId} />

      <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Suspense fallback={<LoadingStatisticCard />}>
          <HealthCheckupsStatistics wsId={wsId} />
        </Suspense>
        <Suspense fallback={<LoadingStatisticCard />}>
          <HealthDiagnosesStatistics wsId={wsId} />
        </Suspense>
        <Suspense fallback={<LoadingStatisticCard />}>
          <HealthVitalsStatistics wsId={wsId} />
        </Suspense>
        <Suspense fallback={<LoadingStatisticCard />}>
          <HealthVitalGroupsStatistics wsId={wsId} />
        </Suspense>
      </div>

      <InventoryCategoryStatistics wsId={wsId} />

      <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Suspense fallback={<LoadingStatisticCard />}>
          <ProductsStatistics wsId={wsId} />
        </Suspense>

        <Suspense fallback={<LoadingStatisticCard />}>
          <InventoryProductsStatistics wsId={wsId} />
        </Suspense>

        <Suspense fallback={<LoadingStatisticCard />}>
          <ProductCategoriesStatistics wsId={wsId} />
        </Suspense>

        <Suspense fallback={<LoadingStatisticCard />}>
          <BatchesStatistics wsId={wsId} />
        </Suspense>

        <Suspense fallback={<LoadingStatisticCard />}>
          <WarehousesStatistics wsId={wsId} />
        </Suspense>

        <Suspense fallback={<LoadingStatisticCard />}>
          <UnitsStatistics wsId={wsId} />
        </Suspense>

        <Suspense fallback={<LoadingStatisticCard />}>
          <SuppliersStatistics wsId={wsId} />
        </Suspense>

        <Suspense fallback={<LoadingStatisticCard />}>
          <PromotionsStatistics wsId={wsId} />
        </Suspense>
      </div>

      <UsersCategoryStatistics wsId={wsId} />

      <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Suspense fallback={<LoadingStatisticCard />}>
          <UsersStatistics wsId={wsId} />
        </Suspense>

        <Suspense fallback={<LoadingStatisticCard />}>
          <UserGroupsStatistics wsId={wsId} />
        </Suspense>

        <Suspense fallback={<LoadingStatisticCard />}>
          <UserGroupTagsStatistics wsId={wsId} />
        </Suspense>

        <Suspense fallback={<LoadingStatisticCard />}>
          <UserReportsStatistics wsId={wsId} />
        </Suspense>
      </div>
    </>
  );
}
