'use client';
import {
  Ban,
  CircleHelp,
  MailX,
  ServerCrash,
  ShieldAlert,
  TriangleAlert,
} from '@tuturuuu/icons';
import type { PeriodicReport } from '@tuturuuu/internal-api/reports';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import {
  DELIVERY_CATEGORIES,
  type DeliveryCategory,
} from './periodic-delivery-category';

export function PeriodicDeliveryWorklist({
  reports,
  total,
  categoryCounts,
  eligibleCount,
  selectedCount,
  canSend,
  currentRows,
  pending,
  categoryFilter,
  onCategoryChange,
  onSelectAll,
  onClear,
  onReview,
}: {
  reports: PeriodicReport[];
  total?: number;
  categoryCounts?: Record<DeliveryCategory, number>;
  eligibleCount: number;
  selectedCount: number;
  canSend: boolean;
  currentRows: boolean;
  pending: boolean;
  categoryFilter: DeliveryCategory | null;
  onCategoryChange: (category: DeliveryCategory | null) => void;
  onSelectAll: () => void;
  onClear: () => void;
  onReview: () => void;
}) {
  const t = useTranslations('reports-hub');
  const common = useTranslations('common');
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-foreground/[0.04] p-3">
        <div className="min-w-0">
          <p className="font-medium text-sm">{t('delivery_worklist')}</p>
          <p className="text-muted-foreground text-xs">
            {t('selection_scope', {
              loaded: reports.length,
              eligible: eligibleCount,
            })}
          </p>
        </div>
        {canSend && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!eligibleCount || !currentRows}
              onClick={onSelectAll}
            >
              {t('select_visible_eligible')}
            </Button>
            {selectedCount > 0 && (
              <Button size="sm" variant="ghost" onClick={onClear}>
                {t('clear_selection')}
              </Button>
            )}
            <Button
              size="sm"
              disabled={!selectedCount || !currentRows || pending}
              onClick={onReview}
            >
              {t('review_selected', { count: selectedCount })}
            </Button>
          </div>
        )}
      </div>
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1">
          <Button
            size="sm"
            variant={categoryFilter === null ? 'secondary' : 'ghost'}
            aria-pressed={categoryFilter === null}
            onClick={() => onCategoryChange(null)}
          >
            {common('all')}{' '}
            <span className="tabular-nums">
              {total?.toLocaleString() ?? '—'}
            </span>
          </Button>
          {DELIVERY_CATEGORIES.map((category) => {
            const appearance = CATEGORY_APPEARANCE[category];
            const Icon = appearance.icon;
            return (
              <Button
                key={category}
                size="sm"
                variant="outline"
                className={cn(
                  appearance.className,
                  categoryFilter === category &&
                    'ring-2 ring-ring ring-offset-2'
                )}
                aria-pressed={categoryFilter === category}
                onClick={() => onCategoryChange(category)}
              >
                <Icon className="size-3.5" aria-hidden="true" />
                {t(`category_${category}`)}{' '}
                <span className="tabular-nums">
                  {categoryCounts?.[category]?.toLocaleString() ?? '—'}
                </span>
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const CATEGORY_APPEARANCE = {
  missing_email: {
    icon: MailX,
    className:
      'border-dynamic-orange/20 bg-dynamic-orange/10 text-dynamic-orange',
  },
  suppression: {
    icon: Ban,
    className:
      'border-dynamic-purple/20 bg-dynamic-purple/10 text-dynamic-purple',
  },
  infrastructure: {
    icon: ServerCrash,
    className: 'border-dynamic-red/20 bg-dynamic-red/10 text-dynamic-red',
  },
  unknown: {
    icon: CircleHelp,
    className:
      'border-dynamic-yellow/20 bg-dynamic-yellow/10 text-dynamic-yellow',
  },
  approval: {
    icon: ShieldAlert,
    className: 'border-dynamic-cyan/20 bg-dynamic-cyan/10 text-dynamic-cyan',
  },
  failure: {
    icon: TriangleAlert,
    className: 'border-dynamic-red/20 bg-dynamic-red/10 text-dynamic-red',
  },
} as const;
