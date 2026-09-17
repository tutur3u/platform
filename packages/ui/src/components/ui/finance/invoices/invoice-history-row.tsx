'use client';
import { RotateCcw } from '@tuturuuu/icons';
import type { InvoiceHistoryEntry } from '@tuturuuu/internal-api/finance';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { useFormatter, useTranslations } from 'next-intl';
import {
  FINANCE_HIDDEN_AMOUNT,
  useFinanceConfidentialVisibility,
} from '../shared/use-finance-confidential-visibility';

export function InvoiceHistoryRow({
  entry,
  timeZone,
  canRestore,
  restoring,
  onRestore,
}: {
  entry: InvoiceHistoryEntry;
  timeZone?: string;
  canRestore: boolean;
  restoring: boolean;
  onRestore: () => void;
}) {
  const t = useTranslations('ws-invoices');
  const format = useFormatter();
  const { isConfidential } = useFinanceConfidentialVisibility();
  const displayValue = (
    field: string,
    value: string | number | boolean | null
  ) => {
    if (value == null) return '—';
    if (
      isConfidential &&
      ['amount', 'price', 'paid_amount', 'total_diff', 'value'].includes(field)
    )
      return FINANCE_HIDDEN_AMOUNT;
    return typeof value === 'number' ? format.number(value) : String(value);
  };
  return (
    <li
      className={`flex flex-wrap items-start justify-between gap-3 p-4 ${entry.entity_type === 'invoice' && entry.operation === 'DELETE' && entry.is_deleted ? 'border-l-2 border-l-destructive bg-destructive/5' : ''}`}
    >
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
          <Badge variant="outline">
            {t(`history_entities.${entry.entity_type}`)}
          </Badge>
          <span className="font-medium text-sm">
            {entry.customer_name || t('activity_unknown_customer')}
          </span>
        </div>
        {entry.amount != null && (
          <p className="font-semibold text-sm tabular-nums">
            {isConfidential
              ? FINANCE_HIDDEN_AMOUNT
              : format.number(entry.amount)}{' '}
            {entry.currency?.toUpperCase()}
          </p>
        )}
        {entry.entity_type === 'invoice' &&
          entry.operation === 'DELETE' &&
          entry.is_deleted && (
            <Badge variant="outline">
              {t(
                entry.can_restore
                  ? 'recovery_ready'
                  : 'recovery_review_required'
              )}
            </Badge>
          )}
        <p className="break-all font-mono text-muted-foreground text-xs">
          {entry.invoice_id}
        </p>
        <p className="text-muted-foreground text-xs">
          {entry.actor_name ||
            (entry.actor_id
              ? t('activity_recorded_actor', { id: entry.actor_id })
              : t('activity_unknown_actor'))}{' '}
          ·{' '}
          <time dateTime={entry.occurred_at}>
            {format.dateTime(new Date(entry.occurred_at), {
              dateStyle: 'medium',
              timeStyle: 'medium',
              timeZone,
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
                    {t.has(`history_fields.${field}`)
                      ? t(`history_fields.${field}`)
                      : field}
                  </dt>
                  <dd className="whitespace-pre-wrap break-words text-muted-foreground text-xs">
                    {t('activity_before')}: {displayValue(field, values.before)}
                  </dd>
                  <dd className="whitespace-pre-wrap break-words text-xs">
                    {t('activity_after')}: {displayValue(field, values.after)}
                  </dd>
                </div>
              ))}
            </dl>
          </details>
        )}
        {entry.entity_type === 'invoice' &&
          entry.operation === 'DELETE' &&
          !entry.can_restore && (
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
