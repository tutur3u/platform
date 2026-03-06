import {
  addMonths,
  addYears,
  format,
  parse,
  startOfMonth,
  startOfYear,
  subMonths,
  subYears,
} from 'date-fns';
import type { AuditLogPeriod, AuditLogTimeOption } from './audit-log-types';

const AUDIT_LOG_MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;
const AUDIT_LOG_YEAR_REGEX = /^\d{4}$/;

export function getFallbackAuditLogMonthValue(baseDate = new Date()) {
  return format(startOfMonth(baseDate), 'yyyy-MM');
}

export function getFallbackAuditLogYearValue(baseDate = new Date()) {
  return format(startOfYear(baseDate), 'yyyy');
}

export function resolveAuditLogPeriod(period?: string): AuditLogPeriod {
  return period === 'yearly' ? 'yearly' : 'monthly';
}

export function resolveAuditLogMonthValue(month?: string) {
  return month && AUDIT_LOG_MONTH_REGEX.test(month)
    ? month
    : getFallbackAuditLogMonthValue();
}

export function resolveAuditLogYearValue(year?: string) {
  return year && AUDIT_LOG_YEAR_REGEX.test(year)
    ? year
    : getFallbackAuditLogYearValue();
}

export function getAuditLogTimeRange({
  period,
  month,
  year,
}: {
  period?: string;
  month?: string;
  year?: string;
}) {
  const resolvedPeriod = resolveAuditLogPeriod(period);

  if (resolvedPeriod === 'yearly') {
    const value = resolveAuditLogYearValue(year);
    const start = parse(value, 'yyyy', new Date());

    return {
      period: resolvedPeriod,
      value,
      start,
      end: addYears(start, 1),
    };
  }

  const value = resolveAuditLogMonthValue(month);
  const start = parse(`${value}-01`, 'yyyy-MM-dd', new Date());

  return {
    period: resolvedPeriod,
    value,
    start,
    end: addMonths(start, 1),
  };
}

export function getAuditLogTimeOptions({
  locale,
  period,
  count,
}: {
  locale: string;
  period: AuditLogPeriod;
  count?: number;
}): AuditLogTimeOption[] {
  if (period === 'yearly') {
    const formatter = new Intl.DateTimeFormat(locale, {
      year: 'numeric',
    });

    return Array.from({ length: count ?? 6 }, (_, index) => {
      const yearDate = subYears(startOfYear(new Date()), index);

      return {
        value: format(yearDate, 'yyyy'),
        label: formatter.format(yearDate),
      };
    });
  }

  const formatter = new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
  });

  return Array.from({ length: count ?? 12 }, (_, index) => {
    const monthDate = subMonths(startOfMonth(new Date()), index);

    return {
      value: format(monthDate, 'yyyy-MM'),
      label: formatter.format(monthDate),
    };
  });
}
