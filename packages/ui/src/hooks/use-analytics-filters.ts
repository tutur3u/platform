'use client';

import dayjs from 'dayjs';
import { useCallback, useMemo, useState } from 'react';

export type DatePreset =
  | '7d'
  | '30d'
  | 'this-month'
  | 'last-month'
  | 'this-quarter'
  | 'this-year'
  | 'all';

export type ChartInterval = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface DateRange {
  startDate: string | null;
  endDate: string | null;
}

export interface AnalyticsFiltersState {
  dateRange: DateRange;
  preset: DatePreset;
  interval: ChartInterval;
  includeConfidential: boolean;
}

export interface AnalyticsFiltersActions {
  setDateRange: (range: DateRange) => void;
  setPreset: (preset: DatePreset) => void;
  setInterval: (interval: ChartInterval) => void;
  setIncludeConfidential: (include: boolean) => void;
  toggleConfidential: () => void;
  reset: () => void;
}

export interface UseAnalyticsFiltersReturn
  extends AnalyticsFiltersState,
    AnalyticsFiltersActions {
  // Computed values
  displayRange: string;
  apiDateRange: DateRange;
  suggestedInterval: ChartInterval;
}

const DATE_PRESETS: Record<
  DatePreset,
  { label: string; getRange: () => DateRange }
> = {
  '7d': {
    label: 'Last 7 days',
    getRange: () => ({
      startDate: dayjs().subtract(6, 'days').startOf('day').toISOString(),
      endDate: dayjs().endOf('day').toISOString(),
    }),
  },
  '30d': {
    label: 'Last 30 days',
    getRange: () => ({
      startDate: dayjs().subtract(29, 'days').startOf('day').toISOString(),
      endDate: dayjs().endOf('day').toISOString(),
    }),
  },
  'this-month': {
    label: 'This month',
    getRange: () => ({
      startDate: dayjs().startOf('month').toISOString(),
      endDate: dayjs().endOf('month').toISOString(),
    }),
  },
  'last-month': {
    label: 'Last month',
    getRange: () => ({
      startDate: dayjs().subtract(1, 'month').startOf('month').toISOString(),
      endDate: dayjs().subtract(1, 'month').endOf('month').toISOString(),
    }),
  },
  'this-quarter': {
    label: 'This quarter',
    getRange: () => {
      // Calculate quarter start/end manually since dayjs 'quarter' may need plugin
      const now = dayjs();
      const currentMonth = now.month(); // 0-11
      const quarterStartMonth = Math.floor(currentMonth / 3) * 3;
      const quarterStart = now.month(quarterStartMonth).startOf('month');
      const quarterEnd = quarterStart.add(2, 'month').endOf('month');
      return {
        startDate: quarterStart.toISOString(),
        endDate: quarterEnd.toISOString(),
      };
    },
  },
  'this-year': {
    label: 'This year',
    getRange: () => ({
      startDate: dayjs().startOf('year').toISOString(),
      endDate: dayjs().endOf('year').toISOString(),
    }),
  },
  all: {
    label: 'All time',
    getRange: () => ({
      startDate: null,
      endDate: null,
    }),
  },
};

export const getPresetLabel = (preset: DatePreset): string =>
  DATE_PRESETS[preset]?.label ?? preset;

export const getPresetRange = (preset: DatePreset): DateRange =>
  DATE_PRESETS[preset]?.getRange() ?? { startDate: null, endDate: null };

/**
 * Suggests an appropriate chart interval based on the date range duration.
 */
export function suggestInterval(dateRange: DateRange): ChartInterval {
  if (!dateRange.startDate || !dateRange.endDate) {
    return 'monthly'; // Default for 'all time'
  }

  const start = dayjs(dateRange.startDate);
  const end = dayjs(dateRange.endDate);
  const days = end.diff(start, 'days');

  if (days <= 30) return 'daily';
  if (days <= 90) return 'weekly';
  if (days <= 365 * 2) return 'monthly';
  return 'yearly';
}

const DEFAULT_STATE: AnalyticsFiltersState = {
  dateRange: getPresetRange('30d'),
  preset: '30d',
  interval: 'daily',
  includeConfidential: true,
};

export function useAnalyticsFilters(
  initialState?: Partial<AnalyticsFiltersState>
): UseAnalyticsFiltersReturn {
  const [state, setState] = useState<AnalyticsFiltersState>(() => ({
    ...DEFAULT_STATE,
    ...initialState,
    // Recalculate dateRange if preset is provided
    dateRange:
      initialState?.preset && !initialState.dateRange
        ? getPresetRange(initialState.preset)
        : (initialState?.dateRange ?? DEFAULT_STATE.dateRange),
  }));

  const setDateRange = useCallback((range: DateRange) => {
    setState((prev) => ({
      ...prev,
      dateRange: range,
      // Clear preset when manually setting date range
      preset: 'all' as DatePreset,
    }));
  }, []);

  const setPreset = useCallback((preset: DatePreset) => {
    const range = getPresetRange(preset);
    const suggestedInterval = suggestInterval(range);
    setState((prev) => ({
      ...prev,
      preset,
      dateRange: range,
      interval: suggestedInterval,
    }));
  }, []);

  const setInterval = useCallback((interval: ChartInterval) => {
    setState((prev) => ({ ...prev, interval }));
  }, []);

  const setIncludeConfidential = useCallback((includeConfidential: boolean) => {
    setState((prev) => ({ ...prev, includeConfidential }));
  }, []);

  const toggleConfidential = useCallback(() => {
    setState((prev) => ({
      ...prev,
      includeConfidential: !prev.includeConfidential,
    }));
  }, []);

  const reset = useCallback(() => {
    setState(DEFAULT_STATE);
  }, []);

  // Compute display range string
  const displayRange = useMemo(() => {
    if (state.preset !== 'all') {
      return getPresetLabel(state.preset);
    }

    const { startDate, endDate } = state.dateRange;
    if (!startDate && !endDate) return 'All time';

    const formatDate = (date: string) => dayjs(date).format('MMM D, YYYY');

    if (startDate && endDate) {
      return `${formatDate(startDate)} - ${formatDate(endDate)}`;
    }
    if (startDate) return `From ${formatDate(startDate)}`;
    if (endDate) return `Until ${formatDate(endDate)}`;
    return 'Custom range';
  }, [state.dateRange, state.preset]);

  // API-friendly date range (converts ISO strings to proper format)
  const apiDateRange = useMemo<DateRange>(
    () => ({
      startDate: state.dateRange.startDate,
      endDate: state.dateRange.endDate,
    }),
    [state.dateRange]
  );

  // Suggested interval based on current range
  const suggestedIntervalValue = useMemo(
    () => suggestInterval(state.dateRange),
    [state.dateRange]
  );

  return {
    // State
    dateRange: state.dateRange,
    preset: state.preset,
    interval: state.interval,
    includeConfidential: state.includeConfidential,
    // Actions
    setDateRange,
    setPreset,
    setInterval,
    setIncludeConfidential,
    toggleConfidential,
    reset,
    // Computed
    displayRange,
    apiDateRange,
    suggestedInterval: suggestedIntervalValue,
  };
}

// Export preset options for use in UI components
export const DATE_PRESET_OPTIONS: Array<{
  value: DatePreset;
  label: string;
}> = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'this-month', label: 'This month' },
  { value: 'last-month', label: 'Last month' },
  { value: 'this-quarter', label: 'This quarter' },
  { value: 'this-year', label: 'This year' },
  { value: 'all', label: 'All time' },
];

export const INTERVAL_OPTIONS: Array<{
  value: ChartInterval;
  label: string;
}> = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];
