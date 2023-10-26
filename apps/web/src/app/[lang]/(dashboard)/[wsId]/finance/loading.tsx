import useTranslation from 'next-translate/useTranslation';
import StatisticCard from '@/components/cards/StatisticCard';

export default async function Loading() {
  const { t } = useTranslation();

  return (
    <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
      <StatisticCard
        title={t('finance-overview:total-balance')}
        className="md:col-span-2"
        loading
      />
      <StatisticCard title={t('finance-overview:total-income')} loading />
      <StatisticCard title={t('finance-overview:total-expense')} loading />
      <StatisticCard title={t('workspace-finance-tabs:wallets')} loading />
      <StatisticCard title={t('workspace-finance-tabs:categories')} loading />
      <StatisticCard title={t('workspace-finance-tabs:transactions')} loading />
      <StatisticCard title={t('workspace-finance-tabs:invoices')} loading />
    </div>
  );
}
