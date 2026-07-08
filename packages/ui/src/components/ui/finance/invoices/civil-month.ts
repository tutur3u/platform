const MONTH_VALUE_PATTERN = /^(\d{4})-(\d{2})$/;
const DATE_VALUE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/;

export const MAX_PREPAID_MONTH_COUNT = 12;
export const PREPAID_MONTH_OPTION_HORIZON = 12;

type CivilDateParts = {
  day: number;
  month: number;
  year: number;
};

const invalidDate = () => new Date(Number.NaN);

const getDaysInMonth = (year: number, month: number) =>
  new Date(year, month, 0).getDate();

const isValidCivilDate = ({ day, month, year }: CivilDateParts) =>
  Number.isInteger(year) &&
  Number.isInteger(month) &&
  Number.isInteger(day) &&
  month >= 1 &&
  month <= 12 &&
  day >= 1 &&
  day <= getDaysInMonth(year, month);

const parseCivilDateParts = (
  value: string | Date | null | undefined
): CivilDateParts | null => {
  if (!value) return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return {
      day: value.getDate(),
      month: value.getMonth() + 1,
      year: value.getFullYear(),
    };
  }

  const trimmed = value.trim();
  const monthMatch = MONTH_VALUE_PATTERN.exec(trimmed);
  if (monthMatch) {
    const [, year, month] = monthMatch;
    const parts = {
      day: 1,
      month: Number(month),
      year: Number(year),
    };
    return isValidCivilDate(parts) ? parts : null;
  }

  const dateMatch = DATE_VALUE_PATTERN.exec(trimmed);
  if (dateMatch) {
    const [, year, month, day] = dateMatch;
    const parts = {
      day: Number(day),
      month: Number(month),
      year: Number(year),
    };
    return isValidCivilDate(parts) ? parts : null;
  }

  return null;
};

const formatCivilMonthValue = (year: number, month: number) =>
  `${year}-${String(month).padStart(2, '0')}`;

export const parseLocalCalendarDate = (
  value: string | Date | null | undefined
): Date => {
  const parts = parseCivilDateParts(value);
  return parts
    ? new Date(parts.year, parts.month - 1, parts.day)
    : invalidDate();
};

export const getMonthStartDate = (
  value: string | Date | null | undefined
): Date => {
  const date = parseLocalCalendarDate(value);
  if (Number.isNaN(date.getTime())) {
    return date;
  }

  return new Date(date.getFullYear(), date.getMonth(), 1);
};

export const formatMonthValue = (date: Date): string =>
  formatCivilMonthValue(date.getFullYear(), date.getMonth() + 1);

export const formatMonthLabel = (month: string, locale: string): string => {
  const date = getMonthStartDate(month);
  if (Number.isNaN(date.getTime())) {
    return month;
  }

  return date.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
  });
};

export const addMonthsToMonthValue = (
  month: string,
  monthOffset: number
): string => {
  const parts = parseCivilDateParts(month);
  if (!parts) return month;

  const totalMonthIndex = parts.year * 12 + (parts.month - 1) + monthOffset;
  const year = Math.floor(totalMonthIndex / 12);
  const monthNumber = (totalMonthIndex % 12) + 1;

  return formatCivilMonthValue(year, monthNumber);
};

export const normalizePrepaidMonthCount = (
  value: number | null | undefined
): number => {
  if (!Number.isFinite(value) || !value) return 1;

  return Math.min(MAX_PREPAID_MONTH_COUNT, Math.max(1, Math.trunc(value)));
};

export const getCoverageMonths = (
  selectedMonth: string,
  prepaidMonthCount = 1
): string[] => {
  const monthCount = normalizePrepaidMonthCount(prepaidMonthCount);
  const startMonth = parseCivilDateParts(selectedMonth);
  if (!startMonth) return [];

  return Array.from({ length: monthCount }, (_, index) =>
    addMonthsToMonthValue(selectedMonth, index)
  );
};

export const getCoverageEndMonthValue = (
  selectedMonth: string,
  prepaidMonthCount = 1
): string => {
  const coverageMonths = getCoverageMonths(selectedMonth, prepaidMonthCount);
  return coverageMonths[coverageMonths.length - 1] ?? selectedMonth;
};

export const getCoverageValidUntilMonthValue = (
  selectedMonth: string,
  prepaidMonthCount = 1
): string => addMonthsToMonthValue(selectedMonth, prepaidMonthCount);

export const formatCoverageRangeLabel = ({
  locale,
  prepaidMonthCount,
  selectedMonth,
}: {
  locale: string;
  prepaidMonthCount?: number | null;
  selectedMonth: string;
}): string => {
  const coverageMonths = getCoverageMonths(
    selectedMonth,
    prepaidMonthCount ?? 1
  );
  const firstMonth = coverageMonths[0];
  const lastMonth = coverageMonths[coverageMonths.length - 1];

  if (!firstMonth || !lastMonth || firstMonth === lastMonth) {
    return formatMonthLabel(selectedMonth, locale);
  }

  return `${formatMonthLabel(firstMonth, locale)} - ${formatMonthLabel(
    lastMonth,
    locale
  )}`;
};

export const resolveBillingTimezone = (
  timezone: string | null | undefined
): string => {
  const trimmed = timezone?.trim();
  if (!trimmed || trimmed === 'auto') return 'UTC';

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: trimmed }).format(new Date(0));
    return trimmed;
  } catch {
    return 'UTC';
  }
};

export const getCurrentBillingDate = (
  timezone: string | null | undefined,
  now = new Date()
): Date => {
  const resolvedTimezone = resolveBillingTimezone(timezone);
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone: resolvedTimezone,
    year: 'numeric',
  }).formatToParts(now);
  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  const year = Number(getPart('year'));
  const month = Number(getPart('month'));
  const day = Number(getPart('day'));
  const civilDate = { day, month, year };

  return isValidCivilDate(civilDate)
    ? new Date(year, month - 1, day)
    : invalidDate();
};

export const getCurrentMonthValue = (
  timezone: string | null | undefined,
  now = new Date()
): string => formatMonthValue(getCurrentBillingDate(timezone, now));

export const getCurrentMonthStartDate = (
  timezone: string | null | undefined,
  now = new Date()
): Date => getMonthStartDate(getCurrentMonthValue(timezone, now));
