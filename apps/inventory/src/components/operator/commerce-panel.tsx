'use client';

import {
  CircleDollarSign,
  CreditCard,
  Percent,
  ShieldCheck,
  TicketPercent,
  User,
} from '@tuturuuu/icons';
import type {
  InventoryCheckoutSession,
  InventoryRevenueShareEarning,
  InventorySaleSummary,
} from '@tuturuuu/internal-api/inventory';
import type { ProductPromotion } from '@tuturuuu/types/primitives/ProductPromotion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTranslations } from 'next-intl';
import {
  CheckoutRows,
  PromotionRows,
  RevenueShareRows,
  SaleRows,
} from './commerce-rows';
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
  const tabsT = useTranslations('inventory.operator.commerce.tabs');
  const reserved = checkouts.filter((row) => row.status === 'reserved').length;
  const completed = checkouts.filter(
    (row) => row.status === 'completed'
  ).length;
  const salesTotal = sales.reduce((total, row) => total + row.paid_amount, 0);
  const salesCurrency = sales.find((row) => row.currency)?.currency ?? 'USD';

  const commerceTabs = [
    { icon: CreditCard, label: tabsT('checkouts'), value: 'checkouts' },
    { icon: ShieldCheck, label: tabsT('sales'), value: 'sales' },
    { icon: Percent, label: tabsT('revenueShare'), value: 'revenue-share' },
    { icon: TicketPercent, label: tabsT('promotions'), value: 'promotions' },
  ] as const;

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
      <Tabs
        className="gap-3"
        onValueChange={(value) => setTab(value as InventoryCommerceTab)}
        value={tab}
      >
        <TabsList
          aria-label={tabsT('label')}
          className="grid h-auto w-full grid-cols-2 sm:grid-cols-4"
        >
          {commerceTabs.map(({ icon: Icon, label, value }) => (
            <TabsTrigger className="gap-2 py-1.5" key={value} value={value}>
              <Icon className="h-4 w-4" />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="checkouts">
          {isLoading ? (
            <LoadingRows />
          ) : (
            <CheckoutRows rows={checkouts} wsId={wsId} />
          )}
        </TabsContent>
        <TabsContent value="sales">
          {isLoading ? (
            <LoadingRows />
          ) : (
            <div className="grid gap-3">
              <ProfitSummaryPanel sales={sales} wsId={wsId} />
              <SaleRows query={query} rows={sales} wsId={wsId} />
            </div>
          )}
        </TabsContent>
        <TabsContent value="revenue-share">
          {isLoading ? (
            <LoadingRows />
          ) : (
            <RevenueShareRows query={query} rows={revenueShares} />
          )}
        </TabsContent>
        <TabsContent value="promotions">
          {isLoading ? (
            <LoadingRows />
          ) : (
            <PromotionRows rows={promotions} wsId={wsId} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
