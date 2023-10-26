import useTranslation from 'next-translate/useTranslation';
import StatisticCard from '@/components/cards/StatisticCard';

export default async function Loading() {
  const { t } = useTranslation();

  return (
    <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
      <StatisticCard title={t('workspace-inventory-tabs:products')} loading />
      <StatisticCard
        title={t('inventory-overview:products-with-prices')}
        loading
      />
      <StatisticCard title={t('workspace-inventory-tabs:categories')} loading />
      <StatisticCard title={t('workspace-inventory-tabs:batches')} loading />
      <StatisticCard title={t('workspace-inventory-tabs:warehouses')} loading />
      <StatisticCard title={t('workspace-inventory-tabs:units')} loading />
      <StatisticCard title={t('workspace-inventory-tabs:suppliers')} loading />
      <StatisticCard title={t('workspace-inventory-tabs:promotions')} loading />
    </div>
  );
}
