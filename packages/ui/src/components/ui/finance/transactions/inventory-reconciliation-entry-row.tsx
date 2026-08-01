'use client';

import type {
  InventoryFinanceEntry,
  InventoryFinanceProvider,
} from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { getCurrencyLocale } from '@tuturuuu/utils/currencies';
import { minorToMajor } from '@tuturuuu/utils/money';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

export function formatInventoryReconciliationAmount(
  amount: number,
  currency: string
) {
  return new Intl.NumberFormat(getCurrencyLocale(currency), {
    currency,
    maximumFractionDigits: currency === 'VND' ? 0 : 2,
    style: 'currency',
  }).format(amount);
}

export function inventoryProviderTranslationKey(
  provider: InventoryFinanceProvider
) {
  if (provider === 'cash') return 'provider_cash' as const;
  if (provider === 'polar') return 'provider_polar' as const;
  if (provider === 'square_pos') return 'provider_square_pos' as const;
  return 'provider_square_terminal' as const;
}

export function InventoryReconciliationEntryRow({
  checked,
  entry,
  onCheckedChange,
}: {
  checked: boolean;
  entry: InventoryFinanceEntry;
  onCheckedChange: (checked: boolean) => void;
}) {
  const t = useTranslations('inventory-finance-reconciliation');
  return (
    <div className="grid gap-3 border-b p-4 last:border-b-0 md:grid-cols-[auto_1.2fr_1fr_1fr_auto] md:items-center">
      <Checkbox
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        aria-label={t('select_entry')}
      />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            {t(inventoryProviderTranslationKey(entry.provider))}
          </Badge>
          <Badge variant="secondary">{t(`kind_${entry.kind}`)}</Badge>
          {entry.synchronizationError && (
            <Badge variant="destructive">{t('mapping_error')}</Badge>
          )}
        </div>
        <p className="mt-1 truncate font-medium text-sm">
          {entry.customer?.name ||
            entry.customer?.email ||
            t('unknown_customer')}
        </p>
        {entry.allocations.length > 0 ? (
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer text-muted-foreground">
              {t('allocation_breakdown')}
            </summary>
            <div className="mt-2 grid gap-1">
              {entry.allocations.map((allocation) => (
                <div
                  className="flex items-center justify-between gap-3"
                  key={allocation.lineId}
                >
                  <span className="min-w-0 truncate">
                    {allocation.quantity}× {allocation.title}
                  </span>
                  <span className="shrink-0 font-medium tabular-nums">
                    {formatInventoryReconciliationAmount(
                      minorToMajor(
                        allocation.recognizedRevenueAmount,
                        entry.currency
                      ),
                      entry.currency
                    )}
                  </span>
                </div>
              ))}
            </div>
          </details>
        ) : null}
      </div>
      <div className="min-w-0 text-sm">
        <p className="truncate font-mono text-xs">
          {entry.providerReferenceId}
        </p>
        <p className="text-muted-foreground text-xs">
          {new Intl.DateTimeFormat(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
          }).format(new Date(entry.occurredAt))}
        </p>
      </div>
      <div className="text-sm">
        <p className="font-semibold">
          {formatInventoryReconciliationAmount(entry.amount, entry.currency)}
        </p>
        <p className="text-muted-foreground text-xs">
          {entry.wallet?.name ?? t('needs_wallet')}
        </p>
      </div>
      <div className="flex justify-end">
        <Button asChild size="sm" variant="ghost">
          <Link href={entry.source.inventoryHref}>{t('inventory_sale')}</Link>
        </Button>
      </div>
    </div>
  );
}
