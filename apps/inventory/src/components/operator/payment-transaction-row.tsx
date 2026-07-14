import {
  CheckCircle2,
  Clock,
  ExternalLink,
  TriangleAlert,
} from '@tuturuuu/icons';
import type { InventoryCheckoutSession } from '@tuturuuu/internal-api/inventory';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { useLocale, useTranslations } from 'next-intl';
import { money } from './operator-format';

export function PaymentTransactionRow({
  row,
}: {
  row: InventoryCheckoutSession;
}) {
  const t = useTranslations('inventory.operator.transactionVerification');
  const locale = useLocale();
  const provider = row.squareStatus ? 'square' : 'polar';
  const status = row.squareStatus ?? row.polarStatus ?? row.status;
  const completed = ['completed', 'paid'].includes(status);
  const failed = ['cancelled', 'canceled', 'expired', 'failed'].includes(
    status
  );
  const StatusIcon = completed ? CheckCircle2 : failed ? TriangleAlert : Clock;
  const observedAt = row.squareLastSyncedAt ?? row.completedAt ?? row.expiresAt;

  return (
    <div className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={cn(
            'mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border',
            completed &&
              'border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green',
            failed &&
              'border-dynamic-orange/30 bg-dynamic-orange/10 text-dynamic-orange',
            !completed && !failed && 'border-border bg-muted/30'
          )}
        >
          <StatusIcon className="size-4" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-medium text-sm">
              {row.customerName || row.publicToken}
            </p>
            <Badge variant="outline">{t(`provider.${provider}`)}</Badge>
            <Badge variant="secondary">{status.replaceAll('_', ' ')}</Badge>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-2 text-muted-foreground text-xs">
            <span>
              {provider === 'square'
                ? t(`environment.${row.squareEnvironment ?? 'sandbox'}`)
                : t(`environment.${row.polarEnvironment ?? 'sandbox'}`)}
            </span>
            {observedAt ? (
              <span>
                ·{' '}
                {new Intl.DateTimeFormat(locale, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(new Date(observedAt))}
              </span>
            ) : null}
            {row.squareFailureReason ? (
              <span className="text-destructive">
                · {row.squareFailureReason}
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 sm:justify-end">
        <span className="font-semibold text-sm tabular-nums">
          {money(row.totalAmount, row.currency)}
        </span>
        {row.squareReceiptUrl ? (
          <Button asChild className="size-8" size="icon" variant="outline">
            <a href={row.squareReceiptUrl} rel="noreferrer" target="_blank">
              <ExternalLink className="size-3.5" />
              <span className="sr-only">{t('openReceipt')}</span>
            </a>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
