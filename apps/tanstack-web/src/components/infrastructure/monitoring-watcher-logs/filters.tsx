'use client';

import { Search } from '@tuturuuu/icons';
import { Input } from '@tuturuuu/ui/input';
import { FilterSelect } from '../monitoring-requests/archive-primitives';
import type { WatcherLogOption } from './log-utils';
import type { WatcherLogsTranslations } from './types';

const PAGE_SIZE_VALUES = [10, 25, 50, 100] as const;

export function WatcherLogFilters({
  deploymentStatusFilter,
  deploymentStatusOptions,
  levelFilter,
  levelOptions,
  onDeploymentStatusFilterChange,
  onLevelFilterChange,
  onPageSizeChange,
  onScopeFilterChange,
  onSearchValueChange,
  pageSize,
  scopeFilter,
  scopeOptions,
  searchValue,
  t,
}: {
  deploymentStatusFilter: string;
  deploymentStatusOptions: WatcherLogOption[];
  levelFilter: string;
  levelOptions: WatcherLogOption[];
  onDeploymentStatusFilterChange: (value: string) => void;
  onLevelFilterChange: (value: string) => void;
  onPageSizeChange: (value: number) => void;
  onScopeFilterChange: (value: string) => void;
  onSearchValueChange: (value: string) => void;
  pageSize: number;
  scopeFilter: string;
  scopeOptions: WatcherLogOption[];
  searchValue: string;
  t: WatcherLogsTranslations;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.8fr)_repeat(4,minmax(0,1fr))]">
        <div className="relative">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-11 rounded-lg border-border/60 pl-10"
            onChange={(event) => onSearchValueChange(event.target.value)}
            placeholder={t('explorer.search_logs_placeholder')}
            value={searchValue}
          />
        </div>

        <FilterSelect
          label={t('explorer.scope_filter')}
          onValueChange={onScopeFilterChange}
          options={scopeOptions}
          value={scopeFilter}
        />

        <FilterSelect
          label={t('explorer.level_filter')}
          onValueChange={onLevelFilterChange}
          options={levelOptions}
          value={levelFilter}
        />

        <FilterSelect
          label={t('explorer.rollout_status_filter')}
          onValueChange={onDeploymentStatusFilterChange}
          options={deploymentStatusOptions}
          value={deploymentStatusFilter}
        />

        <FilterSelect
          label={t('explorer.page_size')}
          onValueChange={(value) => onPageSizeChange(Number(value))}
          options={PAGE_SIZE_VALUES.map((value) => ({
            label: t('explorer.per_page', { count: value }),
            value: String(value),
          }))}
          value={String(pageSize)}
        />
      </div>

      <p className="mt-3 text-muted-foreground text-xs">
        {t('logs_page.page_refinement')}
      </p>
    </div>
  );
}
