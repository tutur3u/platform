'use client';

import { Pause, Play, RefreshCw, Search, X } from '@tuturuuu/icons';
import type {
  ObservabilityLogFacets,
  ObservabilityLogGroup,
} from '@tuturuuu/internal-api/infrastructure/monitoring';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { useMemo, useState } from 'react';
import { LogGroupRow } from './log-group-row';
import { EmptyState, LoadingSkeleton } from './primitives';
import type { MonitoringTranslator } from './types';

export interface ObservabilityLogsFilters {
  deploymentStamp: string;
  level: string;
  query: string;
  requestId: string;
  route: string;
  source: string;
  status: string;
  user: string;
}

function selectClassName() {
  return 'h-9 rounded-md border border-border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-dynamic-blue/35';
}

function countByValue(facets: Array<{ count: number; value: string }>) {
  return new Map(facets.map((facet) => [facet.value, facet.count]));
}

function facetOptionLabel(facet: { count: number; value: string }) {
  return `${facet.value} (${facet.count})`;
}

function getStatusOptions(facets: Array<{ value: string }>) {
  const values = new Set(['5xx', '4xx', '3xx', '2xx']);
  facets.forEach((facet) => {
    values.add(facet.value);
  });
  return [...values];
}

export function LogsPanel({
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
  t,
  total,
}: {
  emptyLabel: string;
  endLabel: string;
  facets: ObservabilityLogFacets | undefined;
  filters: ObservabilityLogsFilters;
  groups: ObservabilityLogGroup[];
  hasMore: boolean;
  isFetchingMore: boolean;
  isLoading: boolean;
  isPaused: boolean;
  loaded: number;
  loadingLabel: string;
  moreLabel: string;
  onFilterChange: (filters: Partial<ObservabilityLogsFilters>) => void;
  onLoadMore: () => void;
  onRefresh: () => void;
  onTogglePaused: () => void;
  t: MonitoringTranslator;
  total: number;
}) {
  const panelT = (key: string, values?: Record<string, string | number>) =>
    t(`logs_panel.${key}`, values);
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
      ? { key: 'query', label: panelT('chips.query', { value: filters.query }) }
      : null,
    filters.route !== 'all'
      ? { key: 'route', label: panelT('chips.route', { value: filters.route }) }
      : null,
    filters.status !== 'all'
      ? {
          key: 'status',
          label: panelT('chips.status', { value: filters.status }),
        }
      : null,
    filters.level !== 'all'
      ? { key: 'level', label: panelT('chips.level', { value: filters.level }) }
      : null,
    filters.source !== 'all'
      ? {
          key: 'source',
          label: panelT('chips.source', { value: filters.source }),
        }
      : null,
    filters.requestId
      ? {
          key: 'requestId',
          label: panelT('chips.request_id', { value: filters.requestId }),
        }
      : null,
    filters.user
      ? { key: 'user', label: panelT('chips.user', { value: filters.user }) }
      : null,
    filters.deploymentStamp
      ? {
          key: 'deploymentStamp',
          label: panelT('chips.deployment', {
            value: filters.deploymentStamp,
          }),
        }
      : null,
  ].filter(Boolean) as Array<{
    key: keyof ObservabilityLogsFilters;
    label: string;
  }>;

  const clearFilter = (key: keyof ObservabilityLogsFilters) => {
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
            <p className="font-medium text-sm">{panelT('title')}</p>
            <p className="text-muted-foreground text-xs">
              {panelT('description')}
            </p>
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
              {isPaused ? panelT('resume') : panelT('pause')}
            </Button>
            <Button
              onClick={onRefresh}
              size="sm"
              type="button"
              variant="outline"
            >
              <RefreshCw className="h-4 w-4" />
              {panelT('refresh')}
            </Button>
          </div>
        </div>
        <div className="grid gap-2 xl:grid-cols-[minmax(220px,1fr)_180px_150px_150px_150px_170px_170px_180px]">
          <label className="relative">
            <Search className="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="h-9 pl-8"
              onChange={(event) =>
                onFilterChange({ query: event.target.value })
              }
              placeholder={panelT('search')}
              value={filters.query}
            />
          </label>
          <select
            className={selectClassName()}
            onChange={(event) => onFilterChange({ route: event.target.value })}
            value={filters.route}
          >
            <option value="all">{panelT('all_routes')}</option>
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
            <option value="all">{panelT('all_statuses')}</option>
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
            <option value="all">{panelT('all_levels')}</option>
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
            <option value="all">{panelT('all_sources')}</option>
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
            placeholder={panelT('request_id')}
            value={filters.requestId}
          />
          <Input
            className="h-9 font-mono"
            onChange={(event) => onFilterChange({ user: event.target.value })}
            placeholder={panelT('user')}
            value={filters.user}
          />
          <Input
            className="h-9 font-mono"
            onChange={(event) =>
              onFilterChange({ deploymentStamp: event.target.value })
            }
            placeholder={panelT('deployment')}
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
          </div>
        ) : null}
      </div>
      {isLoading ? (
        <LoadingSkeleton rows={8} />
      ) : groups.length === 0 ? (
        <EmptyState label={emptyLabel} />
      ) : (
        <div className="divide-y divide-border/60">
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
              t={panelT}
            />
          ))}
        </div>
      )}
      <div className="flex flex-col gap-2 border-border border-t px-4 py-3 text-muted-foreground text-xs sm:flex-row sm:items-center sm:justify-between">
        <span>{panelT('loaded', { loaded, total })}</span>
        {hasMore ? (
          <Button
            disabled={isFetchingMore}
            onClick={onLoadMore}
            size="sm"
            type="button"
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
