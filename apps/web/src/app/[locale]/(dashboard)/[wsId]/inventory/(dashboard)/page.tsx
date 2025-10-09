import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { getTranslations } from 'next-intl/server';
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

export const metadata: Metadata = {
  title: 'Inventory',
  description: 'Manage Inventory in your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function InventoryPage({ params }: Props) {
  const { wsId } = await params;

  const { permissions } = await getPermissions({
    wsId,
  });
  const t = await getTranslations();

  if (!permissions.includes('view_inventory')) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <h2 className="text-lg font-semibold">{t('ws-roles.inventory_access_denied')}</h2>
          <p className="text-muted-foreground">
            {t('ws-roles.inventory_access_denied_description')}
          </p>
        </div>
      </div>
    );
  }

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
