'use client';

import { Minus, Plus } from '@tuturuuu/icons';
import type {
  InventoryStockMovement,
  InventoryStockMovementPerson,
} from '@tuturuuu/internal-api/inventory';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';

export function MovementCard({
  locale,
  movement,
}: {
  locale: string;
  movement: InventoryStockMovement;
}) {
  const t = useTranslations('inventory.operator.forms.stockHistory');
  const added = movement.direction === 'added';
  const beneficiary = movement.beneficiaryId
    ? (formatPerson(movement.beneficiary) ?? t('unavailablePerson'))
    : t('none');

  return (
    <article className="grid gap-3 rounded-lg border border-border bg-muted/10 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cn(
              'grid size-9 shrink-0 place-items-center rounded-full',
              added
                ? 'bg-dynamic-green/15 text-dynamic-green'
                : 'bg-dynamic-red/15 text-dynamic-red'
            )}
          >
            {added ? (
              <Plus className="h-4 w-4" />
            ) : (
              <Minus className="h-4 w-4" />
            )}
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-sm">
              {added ? t('added') : t('removed')}
            </p>
            <p className="text-muted-foreground text-xs">
              {new Intl.DateTimeFormat(locale, {
                hour: 'numeric',
                minute: '2-digit',
                second: '2-digit',
              }).format(new Date(movement.timestamp))}
            </p>
          </div>
        </div>
        <p
          className={cn(
            'font-semibold text-lg tabular-nums',
            added ? 'text-dynamic-green' : 'text-dynamic-red'
          )}
        >
          {added ? '+' : '-'}
          {new Intl.NumberFormat(locale).format(movement.quantity)}{' '}
          <span className="font-normal text-muted-foreground text-sm">
            {movement.unit?.name ?? t('unavailableUnit')}
          </span>
        </p>
      </div>
      <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
        <MovementDetail
          label={t('warehouse')}
          value={movement.warehouse?.name ?? t('unavailableWarehouse')}
        />
        <MovementDetail
          label={t('operator')}
          value={formatPerson(movement.operator) ?? t('unavailablePerson')}
        />
        <MovementDetail label={t('beneficiary')} value={beneficiary} />
        <MovementDetail
          label={t('timestamp')}
          value={new Intl.DateTimeFormat(locale, {
            dateStyle: 'medium',
            timeStyle: 'medium',
          }).format(new Date(movement.timestamp))}
        />
      </dl>
      {movement.note ? (
        <p className="whitespace-pre-wrap rounded-md border border-border bg-background p-3 text-sm leading-6">
          {movement.note}
        </p>
      ) : null}
    </article>
  );
}

export function groupMovementsByDate(
  movements: InventoryStockMovement[],
  locale: string
) {
  const formatter = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const groups = new Map<string, InventoryStockMovement[]>();

  for (const movement of movements) {
    const label = formatter.format(new Date(movement.timestamp));
    groups.set(label, [...(groups.get(label) ?? []), movement]);
  }

  return [...groups.entries()].map(([label, groupedMovements]) => ({
    label,
    movements: groupedMovements,
  }));
}

function MovementDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 gap-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="truncate">{value}</dd>
    </div>
  );
}

function formatPerson(person: InventoryStockMovementPerson | null) {
  if (!person) return null;
  return person.name ?? person.email ?? person.id;
}
