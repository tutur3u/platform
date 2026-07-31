'use client';

import {
  parseAsString,
  parseAsStringLiteral,
  useQueryState,
  useQueryStates,
} from 'nuqs';
import { useDeferredValue, useMemo, useState } from 'react';
import {
  type ObservabilityPreset,
  resolveObservabilityRange,
} from './observability-helpers';

export const OBSERVABILITY_PRESETS = [
  'month',
  '7',
  '30',
  '90',
  'custom',
] as const satisfies readonly ObservabilityPreset[];

export const RUN_STATUS_FILTERS = [
  'all',
  'succeeded',
  'failed',
  'aborted',
  'running',
] as const;

const filterParsers = {
  feature: parseAsString.withDefault(''),
  from: parseAsString.withDefault(''),
  model: parseAsString.withDefault(''),
  range: parseAsStringLiteral(OBSERVABILITY_PRESETS).withDefault('month'),
  status: parseAsStringLiteral(RUN_STATUS_FILTERS).withDefault('all'),
  to: parseAsString.withDefault(''),
};

/**
 * Every observability filter lives in the URL so a filtered view can be shared,
 * bookmarked and reloaded. `rangeAnchor` is deliberately local state: it is the
 * "as of" instant a relative preset resolves against, and re-anchoring it is
 * what a manual refresh does.
 */
export function useObservabilityFilters() {
  const [filters, setFilters] = useQueryStates(filterParsers, {
    history: 'replace',
  });
  const [selectedRunId, setSelectedRunId] = useQueryState(
    'run',
    parseAsString.withOptions({ history: 'replace' })
  );
  const [rangeAnchor, setRangeAnchor] = useState(() => new Date());

  const deferredModel = useDeferredValue(filters.model);
  const deferredFeature = useDeferredValue(filters.feature);
  const range = useMemo(
    () =>
      resolveObservabilityRange(
        filters.range,
        filters.from,
        filters.to,
        rangeAnchor
      ),
    [filters.from, filters.range, filters.to, rangeAnchor]
  );

  const activeFilterCount = [
    filters.model.trim(),
    filters.feature.trim(),
    filters.status === 'all' ? '' : filters.status,
  ].filter(Boolean).length;

  return {
    activeFilterCount,
    clearFilters: () =>
      void setFilters({ feature: '', model: '', status: 'all' }),
    deferredFeature,
    deferredModel,
    filters,
    range,
    reanchorRange: () => setRangeAnchor(new Date()),
    selectedRunId,
    setFeature: (feature: string) => void setFilters({ feature }),
    setModel: (model: string) => void setFilters({ model }),
    setPreset: (value: ObservabilityPreset) => {
      setRangeAnchor(new Date());
      void setFilters({ range: value });
    },
    setRangeEnd: (to: string) => void setFilters({ to }),
    setRangeStart: (from: string) => void setFilters({ from }),
    setSelectedRunId: (runId: string | null) => void setSelectedRunId(runId),
    setStatus: (status: (typeof RUN_STATUS_FILTERS)[number]) =>
      void setFilters({ status }),
  };
}

export type ObservabilityFilters = ReturnType<typeof useObservabilityFilters>;
