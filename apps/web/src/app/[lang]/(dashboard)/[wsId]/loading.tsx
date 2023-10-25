import useTranslation from 'next-translate/useTranslation';
import { Separator } from '@/components/ui/separator';
import StatisticCard from '@/components/cards/StatisticCard';

export default async function Loading() {
  const { t } = useTranslation('ws-home');

  const homeLabel = t('home');
  const usersLabel = t('sidebar-tabs:users');

  return (
    <>
      <div className="rounded-lg border border-zinc-300 bg-zinc-500/5 p-4 dark:border-zinc-800/80 dark:bg-zinc-900">
        <h1 className="text-2xl font-bold">{homeLabel}</h1>
        <p className="text-zinc-700 dark:text-zinc-400">
          {t('description_p1')} {t('description_p2')}
        </p>
      </div>

      <Separator className="my-4" />
      <div className="mb-2 text-2xl font-semibold">
        {t('sidebar-tabs:finance')}
      </div>
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

        <StatisticCard
          title={t('workspace-finance-tabs:transactions')}
          loading
        />

        <StatisticCard title={t('workspace-finance-tabs:invoices')} loading />
      </div>

      <Separator className="mb-8 mt-4" />
      <div className="mb-2 text-2xl font-semibold">
        {t('sidebar-tabs:inventory')}
      </div>
      <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatisticCard title={t('workspace-inventory-tabs:products')} loading />

        <StatisticCard
          title={t('inventory-overview:products-with-prices')}
          loading
        />

        <StatisticCard
          title={t('workspace-inventory-tabs:categories')}
          loading
        />

        <StatisticCard title={t('workspace-inventory-tabs:batches')} loading />

        <StatisticCard
          title={t('workspace-inventory-tabs:warehouses')}
          loading
        />

        <StatisticCard title={t('workspace-inventory-tabs:units')} loading />

        <StatisticCard
          title={t('workspace-inventory-tabs:suppliers')}
          loading
        />

        <StatisticCard
          title={t('workspace-inventory-tabs:promotions')}
          loading
        />
      </div>

      <Separator className="mb-8 mt-4" />
      <div className="mb-2 text-2xl font-semibold">
        {t('sidebar-tabs:users')}
      </div>
      <div className="grid items-end gap-4 md:grid-cols-2 lg:grid-cols-3">
        <StatisticCard title={usersLabel} loading />

        <StatisticCard title={t('workspace-users-tabs:groups')} loading />

        <StatisticCard title={t('workspace-users-tabs:reports')} loading />
      </div>
    </>
  );
}
