'use client';

import { CheckCircle2, Cloud, TicketPercent } from '@tuturuuu/icons';
import type { ProductPromotion } from '@tuturuuu/types/primitives/ProductPromotion';
import { Badge } from '@tuturuuu/ui/badge';
import { Progress } from '@tuturuuu/ui/progress';
import { useTranslations } from 'next-intl';
import { StatusBadge } from './commerce-shared';
import { currency } from './operator-format';
import { EmptyRow } from './operator-shell';
import {
  PromotionEditButton,
  PromotionFormDialog,
} from './promotion-form-dialog';

export function PromotionRows({
  rows,
  wsId,
}: {
  rows: ProductPromotion[];
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.promotions');

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {t('campaignsDescription')}
        </p>
        <PromotionFormDialog wsId={wsId} />
      </div>
      {rows.length === 0 ? (
        <EmptyRow description={t('emptyDescription')} label={t('empty')} />
      ) : (
        rows.map((row) => <PromotionRow key={row.id} row={row} wsId={wsId} />)
      )}
    </div>
  );
}

function PromotionRow({ row, wsId }: { row: ProductPromotion; wsId: string }) {
  const t = useTranslations('inventory.operator.promotions');
  const used = row.current_uses ?? 0;
  const usagePercent = row.max_uses
    ? Math.min((used / row.max_uses) * 100, 100)
    : 0;

  return (
    <article className="grid gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <TicketPercent className="size-4" />
          </span>
          <p className="truncate font-semibold">{row.name}</p>
          <Badge className="font-mono" variant="outline">
            {row.code}
          </Badge>
          <Badge
            className="gap-1"
            variant={row.polar_discount_id ? 'secondary' : 'outline'}
          >
            {row.polar_discount_id ? (
              <CheckCircle2 className="size-3" />
            ) : (
              <Cloud className="size-3" />
            )}
            {row.polar_discount_id ? t('polarSynced') : t('inventoryOnly')}
          </Badge>
        </div>
        {row.description ? (
          <p className="mt-2 line-clamp-2 text-muted-foreground text-sm">
            {row.description}
          </p>
        ) : null}
        <div className="mt-3 max-w-sm">
          <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
            <span className="text-muted-foreground">{t('usage')}</span>
            <span className="font-medium">
              {row.max_uses
                ? t('usesLabel', { max: row.max_uses, used })
                : t('usesUnlimited', { used })}
            </span>
          </div>
          {row.max_uses ? (
            <Progress className="h-1.5" value={usagePercent} />
          ) : null}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 sm:justify-end">
        <StatusBadge
          value={row.use_ratio ? `${row.value}%` : currency(Number(row.value))}
        />
        <PromotionEditButton promotion={row} wsId={wsId} />
      </div>
    </article>
  );
}
