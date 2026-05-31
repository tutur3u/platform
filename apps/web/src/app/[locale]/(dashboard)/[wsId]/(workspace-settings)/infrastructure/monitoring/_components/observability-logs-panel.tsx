'use client';

import {
  Pause,
  Play,
  RefreshCw,
  Search,
  SlidersHorizontal,
  X,
} from '@tuturuuu/icons';
import type {
  ObservabilityLogFacets,
  ObservabilityLogGroup,
} from '@tuturuuu/internal-api/infrastructure';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  countByValue,
  facetOptionLabel,
  getStatusOptions,
  LogGroupRow,
  selectClassName,
} from './observability-logs-panel-row';

export interface ObservabilityLogsPanelFilters {
  deploymentStamp: string;
  level: string;
  query: string;
  requestId: string;
  route: string;
  source: string;
  status: string;
}

export function ObservabilityLogsPanel({
  emptyLabel,
  endLabel,
  facets,
  filters,
  groups,
  hasMore,
  isFetchingMore,
  isLoading,
  isPaused,
  loaded,
  loadingLabel,
  moreLabel,
  onFilterChange,
  onLoadMore,
  onRefresh,
  onTogglePaused,
  total,
}: {
  emptyLabel: string;
  endLabel: string;
  facets: ObservabilityLogFacets | undefined;
  filters: ObservabilityLogsPanelFilters;
  groups: ObservabilityLogGroup[];
  hasMore: boolean;
  isFetchingMore: boolean;
  isLoading: boolean;
  isPaused: boolean;
  loaded: number;
  loadingLabel: string;
  moreLabel: string;
  onFilterChange: (filters: Partial<ObservabilityLogsPanelFilters>) => void;
  onLoadMore: () => void;
  onRefresh: () => void;
  onTogglePaused: () => void;
  total: number;
}) {
  const t = useTranslations('blue-green-monitoring.observability.logs_panel');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const levelCounts = useMemo(
    () => countByValue(facets?.levels ?? []),
    [facets?.levels]
  );
  const sourceCounts = useMemo(
    () => countByValue(facets?.sources ?? []),
    [facets?.sources]
  );
  const statusOptions = useMemo(
    () => getStatusOptions(facets?.statuses ?? []),
    [facets?.statuses]
  );
  const activeFilters = [
    filters.query
      ? { key: 'query', label: t('chips.query', { value: filters.query }) }
      : null,
    filters.route !== 'all'
      ? { key: 'route', label: t('chips.route', { value: filters.route }) }
      : null,
    filters.status !== 'all'
      ? { key: 'status', label: t('chips.status', { value: filters.status }) }
      : null,
    filters.level !== 'all'
      ? { key: 'level', label: t('chips.level', { value: filters.level }) }
      : null,
    filters.source !== 'all'
      ? { key: 'source', label: t('chips.source', { value: filters.source }) }
      : null,
    filters.requestId
      ? {
          key: 'requestId',
          label: t('chips.request_id', { value: filters.requestId }),
        }
      : null,
    filters.deploymentStamp
      ? {
          key: 'deploymentStamp',
          label: t('chips.deployment', { value: filters.deploymentStamp }),
        }
      : null,
  ].filter(Boolean) as Array<{
    key: keyof ObservabilityLogsPanelFilters;
    label: string;
  }>;

  const clearFilter = (key: keyof ObservabilityLogsPanelFilters) => {
    onFilterChange({
      [key]:
        key === 'level' ||
        key === 'source' ||
        key === 'status' ||
        key === 'route'
          ? 'all'
          : '',
    });
  };

  return (
    <section className="rounded-lg border border-border bg-background">
      <div className="space-y-3 border-border border-b p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="font-medium text-sm">{t('title')}</p>
            <p className="text-muted-foreground text-xs">{t('description')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={onTogglePaused}
              size="sm"
              type="button"
              variant="outline"
            >
              {isPaused ? (
                <Play className="h-4 w-4" />
              ) : (
                <Pause className="h-4 w-4" />
              )}
              {isPaused ? t('resume') : t('pause')}
            </Button>
            <Button
              onClick={onRefresh}
              size="sm"
              type="button"
              variant="outline"
            >
              <RefreshCw className="h-4 w-4" />
              {t('refresh')}
            </Button>
          </div>
        </div>
        <div className="grid gap-2 xl:grid-cols-[minmax(220px,1fr)_180px_150px_150px_150px_180px_180px]">
          <label className="relative">
            <Search className="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="h-9 pl-8"
              onChange={(event) =>
                onFilterChange({ query: event.target.value })
              }
              placeholder={t('search')}
              value={filters.query}
            />
          </label>
          <select
            className={selectClassName()}
            onChange={(event) => onFilterChange({ route: event.target.value })}
            value={filters.route}
          >
            <option value="all">{t('all_routes')}</option>
            {(facets?.routes ?? []).map((facet) => (
              <option key={facet.value} value={facet.value}>
                {facetOptionLabel(facet)}
              </option>
            ))}
          </select>
          <select
            className={selectClassName()}
            onChange={(event) => onFilterChange({ status: event.target.value })}
            value={filters.status}
          >
            <option value="all">{t('all_statuses')}</option>
            {statusOptions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <select
            className={selectClassName()}
            onChange={(event) => onFilterChange({ level: event.target.value })}
            value={filters.level}
          >
            <option value="all">{t('all_levels')}</option>
            {(['error', 'warn', 'info', 'debug'] as const).map((value) => (
              <option key={value} value={value}>
                {value} ({levelCounts.get(value) ?? 0})
              </option>
            ))}
          </select>
          <select
            className={selectClassName()}
            onChange={(event) => onFilterChange({ source: event.target.value })}
            value={filters.source}
          >
            <option value="all">{t('all_sources')}</option>
            {(['api', 'cron', 'server'] as const).map((value) => (
              <option key={value} value={value}>
                {value} ({sourceCounts.get(value) ?? 0})
              </option>
            ))}
          </select>
          <Input
            className="h-9 font-mono"
            onChange={(event) =>
              onFilterChange({ requestId: event.target.value })
            }
            placeholder={t('request_id')}
            value={filters.requestId}
          />
          <Input
            className="h-9 font-mono"
            onChange={(event) =>
              onFilterChange({ deploymentStamp: event.target.value })
            }
            placeholder={t('deployment')}
            value={filters.deploymentStamp}
          />
        </div>
        {activeFilters.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            {activeFilters.map((filter) => (
              <button
                className="inline-flex h-7 items-center gap-1 rounded-full border border-border bg-muted/30 px-2 text-xs"
                key={filter.key}
                onClick={() => clearFilter(filter.key)}
                type="button"
              >
                {filter.label}
                <X className="h-3 w-3" />
              </button>
            ))}
            <Button
              onClick={() =>
                onFilterChange({
                  deploymentStamp: '',
                  level: 'all',
                  query: '',
                  requestId: '',
                  route: 'all',
                  source: 'all',
                  status: 'all',
                })
              }
              size="sm"
              type="button"
              variant="ghost"
            >
              {t('clear_filters')}
            </Button>
          </div>
        ) : null}
      </div>
      <div className="hidden grid-cols-[32px_142px_84px_80px_minmax(220px,1fr)_180px_170px_88px] gap-3 border-border border-b px-3 py-2 text-muted-foreground text-xs lg:grid">
        <span />
        <span>{t('columns.time')}</span>
        <span>{t('columns.level')}</span>
        <span>{t('columns.status')}</span>
        <span>{t('columns.message')}</span>
        <span>{t('columns.request')}</span>
        <span>{t('columns.deployment')}</span>
        <span>{t('columns.source')}</span>
      </div>
      {isLoading ? (
        <div className="space-y-3 p-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              className="h-16 animate-pulse rounded-md bg-muted/40"
              key={index}
            />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="grid min-h-48 place-items-center gap-2 p-6 text-muted-foreground text-sm">
          <SlidersHorizontal className="h-5 w-5" />
          {emptyLabel}
        </div>
      ) : (
        <div>
          {groups.map((group) => (
            <LogGroupRow
              expanded={expandedId === group.id}
              group={group}
              key={group.id}
              onToggle={() =>
                setExpandedId((current) =>
                  current === group.id ? null : group.id
                )
              }
            />
          ))}
        </div>
      )}
      <div className="flex items-center justify-between gap-3 border-border border-t px-3 py-2 text-muted-foreground text-xs">
        <span>{t('loaded', { loaded, total })}</span>
        {hasMore ? (
          <Button
            disabled={isFetchingMore}
            onClick={onLoadMore}
            size="sm"
            variant="outline"
          >
            {isFetchingMore ? loadingLabel : moreLabel}
          </Button>
        ) : (
          <span>{endLabel}</span>
        )}
      </div>
    </section>
  );
}
