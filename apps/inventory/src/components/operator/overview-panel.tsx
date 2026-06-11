'use client';

import type {
  InventoryBundle,
  InventoryPolarSettings,
  InventoryProductSummary,
  InventoryStorefront,
} from '@tuturuuu/internal-api/inventory';
import { useTranslations } from 'next-intl';

export function OverviewPanel({
  bundles,
  lowStock,
  polarSettings,
  products,
  storefronts,
}: {
  bundles: InventoryBundle[];
  lowStock: Array<Record<string, unknown>>;
  polarSettings?: InventoryPolarSettings;
  products: InventoryProductSummary[];
  storefronts: InventoryStorefront[];
}) {
  const t = useTranslations('inventory.operator');
  const readyPolarConnections = (polarSettings?.integrations ?? []).filter(
    (integration) => integration.status === 'ready'
  ).length;
  const metrics = [
    { label: t('metrics.products'), value: products.length },
    { label: t('metrics.lowStock'), value: lowStock.length },
    { label: t('metrics.storefronts'), value: storefronts.length },
    { label: t('metrics.bundles'), value: bundles.length },
    { label: t('metrics.polarReady'), value: readyPolarConnections },
  ];

  return (
    <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-5">
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
