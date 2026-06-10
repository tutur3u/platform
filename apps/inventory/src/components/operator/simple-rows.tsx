'use client';

import type {
  InventoryAuditLogSummary,
  InventoryBundle,
  InventoryCheckoutSession,
  InventorySaleSummary,
  InventoryStorefront,
} from '@tuturuuu/internal-api/inventory';
import { useTranslations } from 'next-intl';
import { STOREFRONT_APP_URL } from '@/constants/common';
import { currency } from './operator-format';
import { EmptyRow } from './operator-shell';

function StatusBadge({ value }: { value: string }) {
  return (
    <span className="inline-flex h-6 items-center rounded-md border border-dynamic-blue/25 bg-dynamic-blue/10 px-2 font-medium text-dynamic-blue text-xs">
      {value}
    </span>
  );
}

export function SimpleRows({
  rows,
  type,
}: {
  rows: Array<
    | InventoryAuditLogSummary
    | InventoryBundle
    | InventoryCheckoutSession
    | InventorySaleSummary
    | InventoryStorefront
  >;
  type: 'audits' | 'bundles' | 'checkouts' | 'sales' | 'storefronts';
}) {
  const t = useTranslations('inventory.operator');
  if (rows.length === 0) return <EmptyRow label={t('empty')} />;

  return (
    <div className="divide-y divide-border">
      {rows.map((row) => {
        const anyRow = row as Record<string, unknown>;
        const title = String(
          anyRow.name ??
            anyRow.customerName ??
            anyRow.customer_name ??
            anyRow.summary ??
            anyRow.id
        );
        const value =
          type === 'sales'
            ? currency(Number(anyRow.paid_amount ?? 0))
            : String(anyRow.status ?? anyRow.event_kind ?? '');

        return (
          <div
            className="grid gap-2 p-3 text-sm lg:grid-cols-[1fr_auto_auto] lg:items-center"
            key={String(anyRow.id)}
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{title}</p>
              <p className="truncate text-muted-foreground text-xs">
                {String(
                  anyRow.slug ??
                    anyRow.publicToken ??
                    anyRow.created_at ??
                    anyRow.id
                )}
              </p>
            </div>
            {value ? <StatusBadge value={value} /> : <span />}
            {type === 'storefronts' && 'slug' in anyRow ? (
              <a
                className="text-dynamic-blue text-xs"
                href={`${STOREFRONT_APP_URL}/store/${String(anyRow.slug)}`}
              >
                {t('openStore')}
              </a>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
