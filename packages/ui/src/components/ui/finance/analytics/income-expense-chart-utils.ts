import type { ChartInterval } from '../../../../hooks/use-analytics-filters';

const formatChartDate = (
  value: string,
  locale: string,
  options: Intl.DateTimeFormatOptions
) => new Intl.DateTimeFormat(locale, options).format(new Date(value));

export function formatIncomeExpenseAxisDate(
  value: string,
  interval: ChartInterval,
  locale: string
) {
  try {
    const date = new Date(value);
    if (interval === 'daily' || interval === 'weekly') {
      return new Intl.DateTimeFormat(locale, {
        day: 'numeric',
        month: 'short',
      }).format(date);
    }
    return Intl.DateTimeFormat(locale, {
      month: locale === 'vi' ? 'numeric' : 'short',
      year: 'numeric',
    }).format(date);
  } catch {
    return value;
  }
}

export function formatIncomeExpenseTooltipDate(
  value: string,
  interval: ChartInterval,
  locale: string
) {
  try {
    if (interval === 'daily' || interval === 'weekly') {
      return formatChartDate(value, locale, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    }
    const date = new Date(value);
    return Intl.DateTimeFormat(locale, {
      month: 'long',
      year: 'numeric',
    }).format(date);
  } catch {
    return value;
  }
}
