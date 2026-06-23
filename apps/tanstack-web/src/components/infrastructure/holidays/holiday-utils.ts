import type { HolidayWriteValues } from './types';

const HOLIDAY_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isHolidayWriteValue(
  value: unknown
): value is HolidayWriteValues {
  if (!value || typeof value !== 'object') return false;

  const holiday = value as Partial<HolidayWriteValues>;

  return (
    typeof holiday.date === 'string' &&
    HOLIDAY_DATE_PATTERN.test(holiday.date) &&
    typeof holiday.name === 'string' &&
    holiday.name.trim().length > 0
  );
}

export function parseHolidayBulkJson(value: string) {
  const parsed = JSON.parse(value) as unknown;
  const holidays = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && 'holidays' in parsed
      ? (parsed as { holidays?: unknown }).holidays
      : null;

  if (!Array.isArray(holidays) || holidays.length === 0) {
    return {
      holidays: [],
      ok: false as const,
      reason: 'invalid_json_format' as const,
    };
  }

  if (!holidays.every(isHolidayWriteValue)) {
    return {
      holidays: [],
      ok: false as const,
      reason: 'invalid_holiday_structure' as const,
    };
  }

  return {
    holidays: holidays.map((holiday) => ({
      date: holiday.date,
      name: holiday.name.trim(),
    })),
    ok: true as const,
  };
}

export function getHolidayYearOptions(
  currentYear: number,
  selectedYear: string
) {
  const years = new Set(
    Array.from({ length: 5 }, (_, index) => currentYear - 2 + index)
  );
  const selected = Number.parseInt(selectedYear, 10);

  if (Number.isInteger(selected)) {
    years.add(selected);
  }

  return Array.from(years).sort((a, b) => a - b);
}

export function formatHolidayCreatedAt(value: string | null | undefined) {
  if (!value) return '-';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
