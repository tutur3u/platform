import type { FinanceCategoryBreakdownPoint } from '@tuturuuu/internal-api/finance';
import dayjs from 'dayjs';
import type {
  CategoryBreakdownCategory,
  CategoryBreakdownChartDatum,
  CategoryBreakdownDateRange,
  CategoryBreakdownDisplayRange,
  ChartInterval,
} from './category-breakdown-chart-types';

const DEFAULT_CATEGORY_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
];

function formatDisplayDate(
  date: dayjs.Dayjs,
  interval: ChartInterval,
  locale: string,
  includeYear = false
) {
  if (interval === 'yearly') {
    return new Intl.DateTimeFormat(locale, { year: 'numeric' }).format(
      date.toDate()
    );
  }

  if (interval === 'monthly') {
    return new Intl.DateTimeFormat(locale, {
      month: 'short',
      year: 'numeric',
    }).format(date.toDate());
  }

  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    ...(includeYear ? { year: 'numeric' } : {}),
  }).format(date.toDate());
}

export function getCategoryBreakdownDateRange(
  interval: ChartInterval,
  dateOffset: number,
  locale: string
): CategoryBreakdownDateRange {
  let endDate: dayjs.Dayjs;
  let startDate: dayjs.Dayjs;
  let displayStart: string;
  let displayEnd: string;

  switch (interval) {
    case 'daily':
      endDate = dayjs()
        .subtract(dateOffset * 30, 'days')
        .endOf('day');
      startDate = endDate.subtract(29, 'days').startOf('day');
      displayStart = formatDisplayDate(startDate, interval, locale);
      displayEnd = formatDisplayDate(endDate, interval, locale, true);
      break;
    case 'weekly':
      endDate = dayjs()
        .subtract(dateOffset * 12, 'weeks')
        .endOf('week');
      startDate = endDate.subtract(11, 'weeks').startOf('week');
      displayStart = formatDisplayDate(startDate, interval, locale);
      displayEnd = formatDisplayDate(endDate, interval, locale, true);
      break;
    case 'monthly':
      endDate = dayjs()
        .subtract(dateOffset * 12, 'months')
        .endOf('month');
      startDate = endDate.subtract(11, 'months').startOf('month');
      displayStart = formatDisplayDate(startDate, interval, locale);
      displayEnd = formatDisplayDate(endDate, interval, locale);
      break;
    case 'yearly':
      endDate = dayjs()
        .subtract(dateOffset * 5, 'years')
        .endOf('year');
      startDate = endDate.subtract(4, 'years').startOf('year');
      displayStart = formatDisplayDate(startDate, interval, locale);
      displayEnd = formatDisplayDate(endDate, interval, locale);
      break;
  }

  return {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    displayStart,
    displayEnd,
  };
}

export function getActualCategoryBreakdownDisplayRange(
  anchorToLatest: boolean,
  rawData: FinanceCategoryBreakdownPoint[],
  fallback: CategoryBreakdownDisplayRange,
  interval: ChartInterval,
  locale: string
): CategoryBreakdownDisplayRange {
  if (!anchorToLatest || rawData.length === 0) {
    return fallback;
  }

  const periods = rawData.map((item) => new Date(item.period).getTime());
  const minDate = dayjs(Math.min(...periods));
  const maxDate = dayjs(Math.max(...periods));

  switch (interval) {
    case 'daily':
    case 'weekly':
      return {
        displayStart: formatDisplayDate(minDate, interval, locale),
        displayEnd: formatDisplayDate(maxDate, interval, locale, true),
      };
    case 'monthly':
      return {
        displayStart: formatDisplayDate(minDate, interval, locale),
        displayEnd: formatDisplayDate(maxDate, interval, locale),
      };
    case 'yearly':
      return {
        displayStart: formatDisplayDate(minDate, interval, locale),
        displayEnd: formatDisplayDate(maxDate, interval, locale),
      };
  }
}

export function buildCategoryBreakdownChartData(
  rawData: FinanceCategoryBreakdownPoint[],
  options?: { limit: number; otherLabel: string }
): {
  categories: CategoryBreakdownCategory[];
  chartData: CategoryBreakdownChartDatum[];
} {
  const categoryMap = new Map<string, CategoryBreakdownCategory>();
  for (const item of rawData) {
    const key = `category_${item.category_id ?? 'uncategorized'}`;
    const existing = categoryMap.get(key);
    if (existing) {
      existing.total += Number(item.total) || 0;
    } else {
      categoryMap.set(key, {
        key,
        id: item.category_id,
        name: item.category_name,
        total: Number(item.total) || 0,
        color:
          item.category_color ||
          DEFAULT_CATEGORY_COLORS[
            categoryMap.size % DEFAULT_CATEGORY_COLORS.length
          ]!,
      });
    }
  }
  const ranked = [...categoryMap.values()].sort(
    (a, b) => b.total - a.total || a.key.localeCompare(b.key)
  );
  const visible = options ? ranked.slice(0, options.limit) : ranked;
  const visibleKeys = new Set(visible.map((category) => category.key));
  const remainder = ranked.slice(visible.length);
  const categories =
    remainder.length > 0
      ? [
          ...visible,
          {
            key: 'other_categories',
            id: null,
            name: options!.otherLabel,
            total: remainder.reduce((sum, category) => sum + category.total, 0),
            color: 'var(--muted-foreground)',
          },
        ]
      : visible;
  const periodMap = new Map<string, CategoryBreakdownChartDatum>();
  for (const item of rawData) {
    if (!periodMap.has(item.period))
      periodMap.set(item.period, { period: item.period });
    const period = periodMap.get(item.period)!;
    const categoryKey = `category_${item.category_id ?? 'uncategorized'}`;
    const key = visibleKeys.has(categoryKey) ? categoryKey : 'other_categories';
    period[key] = Number(period[key] || 0) + (Number(item.total) || 0);
  }
  const chartData = [...periodMap.values()].sort(
    (a, b) => new Date(a.period).getTime() - new Date(b.period).getTime()
  );
  return { categories, chartData };
}

export function formatCategoryBreakdownXAxisTick(
  value: string,
  interval: ChartInterval,
  locale: string
) {
  try {
    const date = new Date(value);
    switch (interval) {
      case 'daily':
      case 'weekly':
        return Intl.DateTimeFormat(locale, {
          day: 'numeric',
          month: locale === 'vi' ? 'numeric' : 'short',
        }).format(date);
      case 'monthly':
        return Intl.DateTimeFormat(locale, {
          month: locale === 'vi' ? 'numeric' : 'short',
          year: 'numeric',
        }).format(date);
      case 'yearly':
        return Intl.DateTimeFormat(locale, {
          year: 'numeric',
        }).format(date);
    }
  } catch {
    return value;
  }
}
