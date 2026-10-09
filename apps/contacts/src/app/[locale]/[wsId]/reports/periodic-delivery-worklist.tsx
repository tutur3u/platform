'use client';
import type { PeriodicReport } from '@tuturuuu/internal-api/reports';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import {
  DELIVERY_CATEGORIES,
  type DeliveryCategory,
  periodicDeliveryCategory,
} from './periodic-delivery-category';

export function PeriodicDeliveryWorklist({
  reports,
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
        <p className="text-muted-foreground text-xs">
          {t('category_scope_note')}
        </p>
        <div className="flex flex-wrap gap-1">
          <Button
            size="sm"
            variant={categoryFilter === null ? 'secondary' : 'ghost'}
            aria-pressed={categoryFilter === null}
            onClick={() => onCategoryChange(null)}
          >
            {t('all_loaded', { count: reports.length })}
          </Button>
          {DELIVERY_CATEGORIES.map((category) => (
            <Button
              key={category}
              size="sm"
              variant={categoryFilter === category ? 'secondary' : 'ghost'}
              aria-pressed={categoryFilter === category}
              onClick={() => onCategoryChange(category)}
            >
              {t(`category_${category}`)}{' '}
              <span className="text-muted-foreground tabular-nums">
                {
                  reports.filter(
                    (report) => periodicDeliveryCategory(report) === category
                  ).length
                }
              </span>
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
