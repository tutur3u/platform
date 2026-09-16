'use client';
import { RotateCcw } from '@tuturuuu/icons';
import type { InvoiceHistoryEntry } from '@tuturuuu/internal-api/finance';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { useFormatter, useTranslations } from 'next-intl';

export function InvoiceHistoryRow({
  entry,
  canRestore,
  restoring,
  onRestore,
}: {
  entry: InvoiceHistoryEntry;
  canRestore: boolean;
  restoring: boolean;
  onRestore: () => void;
}) {
  const t = useTranslations('ws-invoices');
  const format = useFormatter();
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 p-4">
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={entry.operation === 'DELETE' ? 'destructive' : 'secondary'}
          >
            {t(
              entry.operation === 'DELETE'
                ? 'activity_deleted'
                : entry.operation === 'UPDATE'
                  ? 'activity_updated'
                  : entry.operation === 'RESTORE'
                    ? 'activity_restored'
                    : 'activity_created'
            )}
          </Badge>
          <span className="font-medium text-sm">
            {entry.customer_name || t('activity_unknown_customer')}
          </span>
        </div>
        <p className="break-all font-mono text-muted-foreground text-xs">
          {entry.invoice_id}
        </p>
        <p className="text-muted-foreground text-xs">
          {entry.actor_name || t('activity_unknown_actor')} ·{' '}
          <time dateTime={entry.occurred_at}>
            {format.dateTime(new Date(entry.occurred_at), {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </time>
        </p>
        {entry.operation === 'UPDATE' && (
          <p className="text-muted-foreground text-xs">
            {t('activity_changed_fields')}:{' '}
            {entry.changed_fields
              .map((field) =>
                t.has(`history_fields.${field}`)
                  ? t(`history_fields.${field}`)
                  : field
              )
              .join(', ')}
          </p>
        )}
        {Object.keys(entry.changes ?? {}).length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">
              {t('activity_details')}
            </summary>
            <dl className="mt-2 space-y-3 rounded-md bg-muted/40 p-3">
              {Object.entries(entry.changes).map(([field, values]) => (
                <div key={field} className="space-y-1">
                  <dt className="font-medium">
                    {t(`history_fields.${field}`)}
                  </dt>
                  <dd className="whitespace-pre-wrap break-words text-muted-foreground text-xs">
                    {t('activity_before')}: {values.before || '—'}
                  </dd>
                  <dd className="whitespace-pre-wrap break-words text-xs">
                    {t('activity_after')}: {values.after || '—'}
                  </dd>
                </div>
              ))}
            </dl>
          </details>
        )}
        {entry.operation === 'DELETE' && !entry.can_restore && (
          <p className="max-w-xl text-muted-foreground text-xs">
            {t('recovery_unavailable')}
          </p>
        )}
      </div>
      {entry.can_restore && canRestore && (
        <Button
          variant="outline"
          size="sm"
          disabled={restoring}
          onClick={onRestore}
        >
          <RotateCcw className="size-4" />
          {t('restore_invoice')}
        </Button>
      )}
    </li>
  );
}
