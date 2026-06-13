'use client';

import {
  Boxes,
  Calculator,
  CircleDollarSign,
  PackageSearch,
  Store,
} from '@tuturuuu/icons';
import type { InventoryDashboardReadinessItem } from '@tuturuuu/internal-api/inventory';
import { Progress } from '@tuturuuu/ui/progress';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

const readinessIcons = {
  checkout: CircleDollarSign,
  costing: Calculator,
  products: PackageSearch,
  setup: Boxes,
  storefront: Store,
} satisfies Record<InventoryDashboardReadinessItem['key'], typeof Boxes>;

export function OverviewReadiness({
  items,
  wsId,
}: {
  items: InventoryDashboardReadinessItem[];
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.dashboard.readiness');

  return (
    <div className="grid min-w-0 gap-2">
      {items.map((item) => {
        const Icon = readinessIcons[item.key];
        const score = Math.max(0, Math.min(Number(item.score) || 0, 100));
        const complete = score >= 100;

        return (
          <Link
            className="grid min-w-0 gap-3 rounded-lg border border-border bg-background p-3 transition hover:border-primary/40 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center"
            href={`/${wsId}/${item.view === 'catalog' ? 'catalog' : item.view}`}
            key={item.key}
          >
            <span
              className={cn(
                'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted/40 text-muted-foreground',
                complete && 'bg-primary/10 text-primary'
              )}
            >
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <span className="truncate font-medium text-sm">
                  {t(`${item.key}.title`)}
                </span>
                <span className="text-muted-foreground text-xs">
                  {item.completed}/{item.total}
                </span>
              </span>
              <Progress className="mt-2 h-1.5" value={score} />
            </span>
            <span className="text-muted-foreground text-xs">
              {Math.round(score)}%
            </span>
          </Link>
        );
      })}
    </div>
  );
}
