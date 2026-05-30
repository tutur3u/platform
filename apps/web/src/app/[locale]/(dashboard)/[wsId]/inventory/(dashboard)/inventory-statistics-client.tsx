'use client';

import { useQuery } from '@tanstack/react-query';
import { getInventoryStatistics } from '@tuturuuu/internal-api/inventory';
import { useTranslations } from 'next-intl';
import StatisticCard from '@/components/cards/StatisticCard';
import LoadingStatisticCard from '@/components/loading-statistic-card';

type InventoryStatisticsClientProps = {
  wsId: string;
};

export function InventoryStatisticsClient({
  wsId,
}: InventoryStatisticsClientProps) {
  const t = useTranslations();
  const statistics = useQuery({
    queryKey: ['inventory-statistics', wsId],
    queryFn: () => getInventoryStatistics(wsId),
    staleTime: 30 * 1000,
  });

  if (statistics.isLoading) {
    return (
      <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <LoadingStatisticCard key={index} />
        ))}
      </div>
    );
  }

  if (statistics.isError) {
    return (
      <div className="rounded-lg border border-dynamic-red/30 bg-dynamic-red/10 p-4 text-dynamic-red text-sm">
        {t('common.error')}
      </div>
    );
  }

  const data = statistics.data;

  return (
    <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
      <StatisticCard
        title={t('workspace-inventory-tabs.products')}
        value={data?.products ?? 0}
        href={`/${wsId}/inventory/products`}
      />
      <StatisticCard
        title={t('inventory-overview.products-with-prices')}
        value={data?.inventoryProducts ?? 0}
        href={`/${wsId}/inventory/products`}
      />
      <StatisticCard
        title={t('workspace-inventory-tabs.categories')}
        value={data?.categories ?? 0}
        href={`/${wsId}/inventory/categories`}
      />
      <StatisticCard
        title={t('workspace-inventory-tabs.batches')}
        value={data?.batches ?? 0}
        href={`/${wsId}/inventory/batches`}
      />
      <StatisticCard
        title={t('workspace-inventory-tabs.warehouses')}
        value={data?.warehouses ?? 0}
        href={`/${wsId}/inventory/warehouses`}
      />
      <StatisticCard
        title={t('workspace-inventory-tabs.units')}
        value={data?.units ?? 0}
        href={`/${wsId}/inventory/units`}
      />
      <StatisticCard
        title={t('workspace-inventory-tabs.suppliers')}
        value={data?.suppliers ?? 0}
        href={`/${wsId}/inventory/suppliers`}
      />
      <StatisticCard
        title={t('workspace-inventory-tabs.promotions')}
        value={data?.promotions ?? 0}
        href={`/${wsId}/inventory/promotions`}
      />
    </div>
  );
}
