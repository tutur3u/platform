'use client';

import {
  CircleDollarSign,
  CreditCard,
  Percent,
  ShieldCheck,
  User,
} from '@tuturuuu/icons';
import type {
  InventoryCheckoutSession,
  InventoryRevenueShareEarning,
  InventorySaleSummary,
  InventorySalesPeriod,
} from '@tuturuuu/internal-api/inventory';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTranslations } from 'next-intl';
import { CheckoutRows, RevenueShareRows, SaleRows } from './commerce-rows';
import { OperatorMetricCard } from './operator-dashboard-primitives';
import { money } from './operator-format';
import { LoadingRows } from './operator-shell';
import type { InventoryCommerceTab } from './operator-types';
import { ProfitSummaryPanel } from './profit-summary-panel';
import { SalesPeriodsPanel } from './sales-periods-panel';

export function CommercePanel({
  checkouts,
  isLoading,
  query,
  revenueShares,
  sales,
  salesPeriods,
  selectedPeriodId,
  setPeriodId,
  setTab,
  tab,
  wsId,
}: {
  checkouts: InventoryCheckoutSession[];
  isLoading?: boolean;
  query: string;
  revenueShares: InventoryRevenueShareEarning[];
  sales: InventorySaleSummary[];
  salesPeriods: InventorySalesPeriod[];
  selectedPeriodId: string;
  setPeriodId: (periodId: string) => void;
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
          className="grid h-auto w-full grid-cols-3"
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
              <SalesPeriodsPanel
                onSelect={setPeriodId}
                periods={salesPeriods}
                selectedPeriodId={selectedPeriodId}
                wsId={wsId}
              />
              <ProfitSummaryPanel sales={sales} wsId={wsId} />
              <SaleRows
                periods={salesPeriods}
                query={query}
                rows={sales}
                wsId={wsId}
              />
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
      </Tabs>
    </div>
  );
}
