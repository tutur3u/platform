'use client';

import type {
  InventoryBundle,
  InventoryProductSummary,
  InventoryStorefront,
} from '@tuturuuu/internal-api/inventory';
import { useTranslations } from 'next-intl';

export function OverviewPanel({
  bundles,
  lowStock,
  products,
  storefronts,
}: {
  bundles: InventoryBundle[];
  lowStock: Array<Record<string, unknown>>;
  products: InventoryProductSummary[];
  storefronts: InventoryStorefront[];
}) {
  const t = useTranslations('inventory.operator');
  const metrics = [
    { label: t('metrics.products'), value: products.length },
    { label: t('metrics.lowStock'), value: lowStock.length },
    { label: t('metrics.storefronts'), value: storefronts.length },
    { label: t('metrics.bundles'), value: bundles.length },
  ];

  return (
    <div className="grid gap-3 p-4 lg:grid-cols-4">
      {metrics.map((metric) => (
        <div
          className="rounded-lg border border-border bg-background p-4"
          key={metric.label}
        >
          <p className="text-muted-foreground text-xs">{metric.label}</p>
          <p className="mt-2 font-semibold text-2xl">{metric.value}</p>
        </div>
      ))}
    </div>
  );
}
