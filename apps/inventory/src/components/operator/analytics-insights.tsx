'use client';

import { Boxes, Package, ShoppingCart, TriangleAlert } from '@tuturuuu/icons';
import type { InventoryAnalyticsResponse } from '@tuturuuu/internal-api/inventory';
import { Progress } from '@tuturuuu/ui/progress';
import { useTranslations } from 'next-intl';
import { OperatorModuleCard } from './operator-dashboard-primitives';
import { currency } from './operator-format';

export function AnalyticsInsights({
  data,
}: {
  data: InventoryAnalyticsResponse;
}) {
  const t = useTranslations('inventory.operator.analyticsCenter');
  const funnel = [
    [t('funnel.views'), data.storefrontFunnel.views],
    [t('funnel.addToCart'), data.storefrontFunnel.addToCart],
    [t('funnel.checkout'), data.storefrontFunnel.checkoutCreated],
    [t('funnel.completed'), data.storefrontFunnel.completed],
  ] as const;
  const maxFunnel = Math.max(1, ...funnel.map((entry) => entry[1]));
  return (
    <div className="grid min-w-0 gap-3 xl:grid-cols-3">
      <OperatorModuleCard
        description={t('topProductsDescription')}
        icon={Package}
        title={t('topProducts')}
      >
        <div className="grid gap-2">
          {data.products.slice(0, 7).map((product, index) => (
            <div
              className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-2 rounded-md border p-2 text-sm"
              key={`${product.productId ?? product.label}-${index}`}
            >
              <span className="text-center text-muted-foreground tabular-nums">
                {index + 1}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-medium">
                  {product.label}
                </span>
                <span className="block text-muted-foreground text-xs">
                  {t('productUnits', { count: product.units })}
                </span>
              </span>
              <span className="font-medium tabular-nums">
                {currency(product.revenue, data.currency)}
              </span>
            </div>
          ))}
          {data.products.length === 0 ? <Empty label={t('empty')} /> : null}
        </div>
      </OperatorModuleCard>
      <OperatorModuleCard
        description={t('funnelDescription')}
        icon={ShoppingCart}
        title={t('storefrontFunnel')}
      >
        <div className="grid gap-4">
          {funnel.map(([label, count]) => (
            <div className="grid gap-1.5" key={label}>
              <div className="flex items-center justify-between text-sm">
                <span>{label}</span>
                <span className="font-medium tabular-nums">
                  {count.toLocaleString()}
                </span>
              </div>
              <Progress value={(count / maxFunnel) * 100} />
            </div>
          ))}
          <p className="rounded-md bg-muted/40 p-3 text-sm">
            {t('conversionSummary', {
              value: (data.storefrontFunnel.conversionRate * 100).toFixed(1),
            })}
          </p>
        </div>
      </OperatorModuleCard>
      <OperatorModuleCard
        description={t('qualityDescription')}
        icon={TriangleAlert}
        title={t('catalogQuality')}
      >
        <div className="grid gap-2">
          <QualityRow
            label={t('withoutImages')}
            value={data.quality.productsWithoutImages}
          />
          <QualityRow
            label={t('withoutStock')}
            value={data.quality.productsWithoutStock}
          />
          <QualityRow
            label={t('unlimitedProducts')}
            value={data.quality.productsWithUnlimitedStock}
          />
          <QualityRow
            label={t('lowStockRows')}
            value={data.summary.lowStockRows ?? 0}
          />
          <QualityRow
            label={t('outOfStockRows')}
            value={data.summary.outOfStockRows ?? 0}
          />
        </div>
      </OperatorModuleCard>
      <OperatorModuleCard
        className="xl:col-span-2"
        description={t('warehouseDescription')}
        icon={Boxes}
        title={t('warehouseHealth')}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th className="pb-2 font-medium">{t('warehouse')}</th>
                <th className="pb-2 text-right font-medium">{t('products')}</th>
                <th className="pb-2 text-right font-medium">
                  {t('stockUnits')}
                </th>
                <th className="pb-2 text-right font-medium">
                  {t('inventoryValue')}
                </th>
                <th className="pb-2 text-right font-medium">{t('risk')}</th>
              </tr>
            </thead>
            <tbody>
              {data.warehouses.map((warehouse) => (
                <tr className="border-t" key={warehouse.id}>
                  <td className="py-3 font-medium">{warehouse.label}</td>
                  <td className="py-3 text-right tabular-nums">
                    {warehouse.products}
                  </td>
                  <td className="py-3 text-right tabular-nums">
                    {warehouse.finiteStockUnits}
                  </td>
                  <td className="py-3 text-right tabular-nums">
                    {currency(warehouse.inventoryValue, data.currency)}
                  </td>
                  <td className="py-3 text-right tabular-nums">
                    {warehouse.lowStockRows}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.warehouses.length === 0 ? <Empty label={t('empty')} /> : null}
        </div>
      </OperatorModuleCard>
      <OperatorModuleCard
        description={t('periodDescription')}
        icon={Boxes}
        title={t('periodPerformance')}
      >
        <div className="grid gap-2">
          {data.periods.slice(0, 6).map((period) => (
            <div
              className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm"
              key={period.periodId ?? period.label}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">
                  {period.label}
                </span>
                <span className="text-muted-foreground text-xs">
                  {t('salesCount', { count: period.sales })}
                </span>
              </span>
              <span className="font-medium tabular-nums">
                {currency(period.revenue, data.currency)}
              </span>
            </div>
          ))}
          {data.periods.length === 0 ? <Empty label={t('empty')} /> : null}
        </div>
      </OperatorModuleCard>
    </div>
  );
}

function QualityRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
      <span>{label}</span>
      <span className="font-semibold tabular-nums">
        {value.toLocaleString()}
      </span>
    </div>
  );
}
function Empty({ label }: { label: string }) {
  return (
    <p className="rounded-lg border border-dashed p-5 text-center text-muted-foreground text-sm">
      {label}
    </p>
  );
}
