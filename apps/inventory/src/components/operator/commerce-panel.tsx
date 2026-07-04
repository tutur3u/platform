'use client';

import {
  CircleDollarSign,
  CreditCard,
  ShieldCheck,
  User,
} from '@tuturuuu/icons';
import type {
  InventoryCheckoutSession,
  InventoryRevenueShareEarning,
  InventorySaleSummary,
} from '@tuturuuu/internal-api/inventory';
import type { ProductPromotion } from '@tuturuuu/types/primitives/ProductPromotion';
import { useTranslations } from 'next-intl';
import {
  CheckoutRows,
  PromotionRows,
  RevenueShareRows,
  SaleRows,
} from './commerce-rows';
import { CommerceTabs } from './commerce-shared';
import { OperatorMetricCard } from './operator-dashboard-primitives';
import { money } from './operator-format';
import { LoadingRows } from './operator-shell';
import type { InventoryCommerceTab } from './operator-types';
import { ProfitSummaryPanel } from './profit-summary-panel';

export function CommercePanel({
  checkouts,
  isLoading,
  promotions,
  query,
  revenueShares,
  sales,
  setTab,
  tab,
  wsId,
}: {
  checkouts: InventoryCheckoutSession[];
  isLoading?: boolean;
  promotions: ProductPromotion[];
  query: string;
  revenueShares: InventoryRevenueShareEarning[];
  sales: InventorySaleSummary[];
  setTab: (tab: InventoryCommerceTab) => void;
  tab: InventoryCommerceTab;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.commerce');
  const reserved = checkouts.filter((row) => row.status === 'reserved').length;
  const completed = checkouts.filter(
    (row) => row.status === 'completed'
  ).length;
  const salesTotal = sales.reduce((total, row) => total + row.paid_amount, 0);
  const salesCurrency = sales.find((row) => row.currency)?.currency ?? 'USD';

  return (
    <div className="grid gap-3">
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <OperatorMetricCard
          description={t('metrics.reservedDescription')}
          icon={CreditCard}
          label={t('metrics.reserved')}
          tone={reserved > 0 ? 'warning' : 'default'}
          value={reserved}
        />
        <OperatorMetricCard
          description={t('metrics.completedDescription')}
          icon={ShieldCheck}
          label={t('metrics.completed')}
          tone={completed > 0 ? 'success' : 'default'}
          value={completed}
        />
        <OperatorMetricCard
          description={t('metrics.salesDescription')}
          icon={User}
          label={t('metrics.sales')}
          value={sales.length}
        />
        <OperatorMetricCard
          description={t('metrics.revenueDescription')}
          icon={CircleDollarSign}
          label={t('metrics.revenue')}
          value={money(salesTotal, salesCurrency)}
        />
      </div>
      <CommerceTabs onChange={setTab} tab={tab} />
      {isLoading ? (
        <LoadingRows />
      ) : tab === 'checkouts' ? (
        <CheckoutRows rows={checkouts} wsId={wsId} />
      ) : tab === 'promotions' ? (
        <PromotionRows rows={promotions} wsId={wsId} />
      ) : tab === 'revenue-share' ? (
        <RevenueShareRows query={query} rows={revenueShares} />
      ) : (
        <div className="grid gap-3">
          <ProfitSummaryPanel sales={sales} wsId={wsId} />
          <SaleRows query={query} rows={sales} wsId={wsId} />
        </div>
      )}
    </div>
  );
}
