import { Suspense } from 'react';
import LoadingStatisticCard from '@/components/loading-statistic-card';
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

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function InventoryPage({ params }: Props) {
  const { wsId } = await params;
  return (
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
  );
}
