'use client';

import {
  CircleDollarSign,
  CreditCard,
  Percent,
  ShieldCheck,
  ShoppingCart,
  User,
} from '@tuturuuu/icons';
import type {
  InventoryCheckoutSession,
  InventoryCommerceSummary,
  InventoryProductFormOptionsResponse,
  InventoryProductSummary,
  InventoryRevenueShareEarning,
  InventorySaleSummary,
  InventorySalesPeriod,
} from '@tuturuuu/internal-api/inventory';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { CheckoutRows, RevenueShareRows, SaleRows } from './commerce-rows';
import { OperatorAdvancedFilters } from './operator-advanced-filters';
import { OperatorMetricCard } from './operator-dashboard-primitives';
import { currency } from './operator-format';
import { LoadingRows } from './operator-shell';
import type { InventoryCommerceTab, InventoryFilters } from './operator-types';
import { ProfitSummaryPanel } from './profit-summary-panel';
import { SaleCreateDialog } from './sale-create-dialog';
import { SalesPeriodsPanel } from './sales-periods-panel';
import { useWorkspaceCurrency } from './workspace-currency';

export function CommercePanel({
  checkouts,
  isLoading,
  query,
  revenueShares,
  sales,
  salesSummary,
  salesCount,
  salesPeriods,
  fetchNextSalesPage,
  fetchNextProductsPage,
  formOptions,
  filters,
  hasNextProductsPage,
  hasNextSalesPage,
  isFetchingNextProductsPage,
  isFetchingNextSalesPage,
  products,
  selectedPeriodId,
  setPeriodId,
  setFilters,
  setTab,
  standaloneSales = false,
  tab,
  wsId,
}: {
  checkouts: InventoryCheckoutSession[];
  isLoading?: boolean;
  query: string;
  revenueShares: InventoryRevenueShareEarning[];
  sales: InventorySaleSummary[];
  salesSummary?: InventoryCommerceSummary;
  salesCount: number;
  salesPeriods: InventorySalesPeriod[];
  fetchNextSalesPage: () => unknown;
  fetchNextProductsPage: () => unknown;
  formOptions?: InventoryProductFormOptionsResponse;
  filters: InventoryFilters;
  hasNextProductsPage: boolean;
  hasNextSalesPage: boolean;
  isFetchingNextProductsPage: boolean;
  isFetchingNextSalesPage: boolean;
  products: InventoryProductSummary[];
  selectedPeriodId: string;
  setPeriodId: (periodId: string) => void;
  setFilters: (value: Partial<InventoryFilters>) => unknown;
  setTab: (tab: InventoryCommerceTab) => void;
  standaloneSales?: boolean;
  tab: InventoryCommerceTab;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.commerce');
  const tabsT = useTranslations('inventory.operator.commerce.tabs');
  const workspaceCurrency = useWorkspaceCurrency();
  const reserved = checkouts.filter((row) => row.status === 'reserved').length;
  const completed = checkouts.filter(
    (row) => row.status === 'completed'
  ).length;

  const commerceTabs = [
    { icon: CreditCard, label: tabsT('checkouts'), value: 'checkouts' },
    { icon: ShoppingCart, label: tabsT('cart'), value: 'cart' },
    { icon: Percent, label: tabsT('revenueShare'), value: 'revenue-share' },
  ] as const;
  const salesWorkspace = isLoading ? (
    <LoadingRows />
  ) : (
    <div className="grid gap-3">
      <OperatorAdvancedFilters
        filters={filters}
        mode="sales"
        options={formOptions}
        sales={sales}
        setFilters={setFilters}
      />
      <div className="flex justify-stretch sm:justify-end">
        <SaleCreateDialog
          fetchNextProductsPage={fetchNextProductsPage}
          hasNextProductsPage={hasNextProductsPage}
          isFetchingNextProductsPage={isFetchingNextProductsPage}
          options={formOptions}
          periods={salesPeriods}
          products={products}
          workspaceCurrency={workspaceCurrency}
          wsId={wsId}
        />
      </div>
      <SalesPeriodsPanel
        fetchNextProductsPage={fetchNextProductsPage}
        hasNextProductsPage={hasNextProductsPage}
        isFetchingNextProductsPage={isFetchingNextProductsPage}
        onSelect={setPeriodId}
        periods={salesPeriods}
        products={products}
        selectedPeriodId={selectedPeriodId}
        wsId={wsId}
      />
      <ProfitSummaryPanel
        currency={workspaceCurrency}
        summary={salesSummary}
        wsId={wsId}
      />
      <SaleRows
        fetchNextPage={fetchNextSalesPage}
        financeCategories={formOptions?.financeCategories ?? []}
        hasNextPage={hasNextSalesPage}
        isFetchingNextPage={isFetchingNextSalesPage}
        periods={salesPeriods}
        products={products}
        query={query}
        rows={sales}
        saleCategory={filters.saleCategory}
        saleCreator={filters.saleCreator}
        saleSort={filters.saleSort}
        saleWarehouse={filters.saleWarehouse}
        wallets={formOptions?.wallets ?? []}
        workspaceCurrency={workspaceCurrency}
        wsId={wsId}
      />
    </div>
  );

  return (
    <div className="grid gap-3">
      <div
        className={cn(
          'grid min-w-0 grid-cols-2 gap-2 sm:gap-3',
          !standaloneSales && 'xl:grid-cols-4'
        )}
      >
        {!standaloneSales ? (
          <>
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
          </>
        ) : null}
        <OperatorMetricCard
          description={t('metrics.salesDescription')}
          icon={User}
          label={t('metrics.sales')}
          value={salesSummary?.salesCount ?? salesCount}
        />
        <OperatorMetricCard
          description={t('metrics.revenueDescription')}
          icon={CircleDollarSign}
          label={t('metrics.revenue')}
          value={currency(salesSummary?.revenue, workspaceCurrency)}
        />
      </div>
      {standaloneSales ? salesWorkspace : null}
      {!standaloneSales ? (
        <Tabs
          className="gap-3"
          onValueChange={(value) => setTab(value as InventoryCommerceTab)}
          value={tab}
        >
          <TabsList
            aria-label={tabsT('label')}
            className="grid h-auto w-full grid-cols-3 gap-1 p-1"
          >
            {commerceTabs.map(({ icon: Icon, label, value }) => (
              <TabsTrigger
                className="min-w-0 touch-manipulation gap-1.5 px-2 py-2 text-xs sm:gap-2 sm:px-3 sm:text-sm"
                key={value}
                value={value}
              >
                <Icon className="hidden h-4 w-4 shrink-0 min-[380px]:block" />
                <span className="truncate">{label}</span>
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
          <TabsContent value="cart">
            {isLoading ? (
              <LoadingRows />
            ) : (
              <div className="grid min-h-64 place-items-center rounded-xl border border-dashed bg-muted/15 p-5 text-center sm:p-8">
                <div className="grid max-w-md justify-items-center gap-3">
                  <span className="grid h-12 w-12 place-items-center rounded-xl border bg-background shadow-sm">
                    <ShoppingCart className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="font-semibold text-lg">{tabsT('cart')}</h2>
                    <p className="mt-1 text-muted-foreground text-sm leading-6">
                      {t('cartDescription')}
                    </p>
                  </div>
                  <SaleCreateDialog
                    fetchNextProductsPage={fetchNextProductsPage}
                    hasNextProductsPage={hasNextProductsPage}
                    isFetchingNextProductsPage={isFetchingNextProductsPage}
                    options={formOptions}
                    periods={salesPeriods}
                    products={products}
                    workspaceCurrency={workspaceCurrency}
                    wsId={wsId}
                  />
                </div>
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
      ) : null}
    </div>
  );
}
