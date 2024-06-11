import {
  BatchesStatistics,
  InventoryProductsStatistics,
  ProductCategoriesStatistics,
  ProductsStatistics,
  PromotionsStatistics,
  SuppliersStatistics,
  UnitsStatistics,
  WarehousesStatistics,
} from '../../(dashboard)/statistics';
import LoadingStatisticCard from '@/components/loading-statistic-card';
import { Suspense } from 'react';

interface Props {
  params: {
    wsId: string;
  };
}

export const dynamic = 'force-dynamic';

export default async function InventoryPage({ params: { wsId } }: Props) {
  return (
    <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Suspense fallback={<LoadingStatisticCard />}>
        <ProductsStatistics wsId={wsId} redirect />
      </Suspense>

      <Suspense fallback={<LoadingStatisticCard />}>
        <InventoryProductsStatistics wsId={wsId} redirect />
      </Suspense>

      <Suspense fallback={<LoadingStatisticCard />}>
        <ProductCategoriesStatistics wsId={wsId} redirect />
      </Suspense>

      <Suspense fallback={<LoadingStatisticCard />}>
        <BatchesStatistics wsId={wsId} redirect />
      </Suspense>

      <Suspense fallback={<LoadingStatisticCard />}>
        <WarehousesStatistics wsId={wsId} redirect />
      </Suspense>

      <Suspense fallback={<LoadingStatisticCard />}>
        <UnitsStatistics wsId={wsId} redirect />
      </Suspense>

      <Suspense fallback={<LoadingStatisticCard />}>
        <SuppliersStatistics wsId={wsId} redirect />
      </Suspense>

      <Suspense fallback={<LoadingStatisticCard />}>
        <PromotionsStatistics wsId={wsId} redirect />
      </Suspense>
    </div>
  );
}
