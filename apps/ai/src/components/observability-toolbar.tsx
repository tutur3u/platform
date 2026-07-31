'use client';

import { RefreshCw, X } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';
import {
  type ObservabilityFilters,
  RUN_STATUS_FILTERS,
} from './observability-filters';
import type { ObservabilityPreset } from './observability-helpers';

/**
 * One compact control strip for every observability section. Range always
 * shows; the run-only filters appear where they can actually be applied.
 */
export function ObservabilityToolbar({
  controls,
  isRefreshing,
  onRefresh,
  showRunFilters,
}: {
  controls: ObservabilityFilters;
  isRefreshing: boolean;
  onRefresh: () => void;
  showRunFilters: boolean;
}) {
  const t = useTranslations('ai-studio.observability');
  const { activeFilterCount, filters } = controls;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          onValueChange={(value) =>
            controls.setPreset(value as ObservabilityPreset)
          }
          value={filters.range}
        >
          <SelectTrigger className="h-9 w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="month">{t('current_month')}</SelectItem>
            {[7, 30, 90].map((days) => (
              <SelectItem key={days} value={String(days)}>
                {t('last_days', { days })}
              </SelectItem>
            ))}
            <SelectItem value="custom">{t('custom')}</SelectItem>
          </SelectContent>
        </Select>

        {filters.range === 'custom' ? (
          <>
            <Input
              aria-label={t('from_date')}
              className="h-9 w-full sm:w-40"
              onChange={(event) => controls.setRangeStart(event.target.value)}
              type="date"
              value={filters.from}
            />
            <Input
              aria-label={t('to_date')}
              className="h-9 w-full sm:w-40"
              onChange={(event) => controls.setRangeEnd(event.target.value)}
              type="date"
              value={filters.to}
            />
          </>
        ) : null}

        {showRunFilters ? (
          <>
            <Input
              aria-label={t('model')}
              className="h-9 w-full sm:w-44"
              onChange={(event) => controls.setModel(event.target.value)}
              placeholder={t('model')}
              value={filters.model}
            />
            <Input
              aria-label={t('feature')}
              className="h-9 w-full sm:w-40"
              onChange={(event) => controls.setFeature(event.target.value)}
              placeholder={t('feature')}
              value={filters.feature}
            />
            <Select
              onValueChange={(value) =>
                controls.setStatus(value as (typeof RUN_STATUS_FILTERS)[number])
              }
              value={filters.status}
            >
              <SelectTrigger className="h-9 w-full sm:w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RUN_STATUS_FILTERS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`status_${value}` as Parameters<typeof t>[0])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        ) : null}

        {activeFilterCount > 0 ? (
          <>
            <Badge variant="secondary">
              {t('active_filters', { count: activeFilterCount })}
            </Badge>
            <Button
              className="h-9"
              onClick={controls.clearFilters}
              size="sm"
              type="button"
              variant="ghost"
            >
              <X className="mr-1.5 size-3.5" />
              {t('clear_filters')}
            </Button>
          </>
        ) : null}

        <Button
          className="h-9 sm:ml-auto"
          disabled={isRefreshing}
          onClick={onRefresh}
          size="sm"
          type="button"
          variant="outline"
        >
          <RefreshCw
            className={`mr-1.5 size-3.5 ${isRefreshing ? 'animate-spin' : ''}`}
          />
          {t('refresh')}
        </Button>
      </div>

      {filters.range === 'custom' && !controls.range ? (
        <p className="text-dynamic-red text-xs">{t('invalid_custom_range')}</p>
      ) : null}
    </div>
  );
}
