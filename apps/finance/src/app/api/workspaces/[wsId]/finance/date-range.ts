const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const MAX_FINANCE_DAILY_DATE_RANGE_DAYS = 366;
export const MAX_FINANCE_EXTENDED_DATE_RANGE_DAYS = 3660;

type ValidateFinanceDateRangeOptions = {
  endDate?: string | null;
  maxDays?: number;
  now?: Date;
  startDate?: string | null;
};

type FinanceDateRangeValidationResult =
  | {
      ok: true;
    }
  | {
      message: string;
      ok: false;
    };

function parseFinanceDate(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const parsed = new Date(trimmed);
  return Number.isFinite(parsed.getTime()) ? parsed : undefined;
}

export function validateFinanceDateRange({
  endDate,
  maxDays = MAX_FINANCE_DAILY_DATE_RANGE_DAYS,
  now = new Date(),
  startDate,
}: ValidateFinanceDateRangeOptions): FinanceDateRangeValidationResult {
  const parsedStartDate = parseFinanceDate(startDate);
  const parsedEndDate = parseFinanceDate(endDate);

  if (parsedStartDate === undefined || parsedEndDate === undefined) {
    return {
      ok: false,
      message: 'Invalid date range',
    };
  }

  if (!parsedStartDate) {
    return { ok: true };
  }

  const effectiveEndDate = parsedEndDate ?? now;
  if (parsedStartDate.getTime() > effectiveEndDate.getTime()) {
    return {
      ok: false,
      message: 'Start date must be before or equal to end date',
    };
  }

  const rangeDays =
    Math.floor(
      (effectiveEndDate.getTime() - parsedStartDate.getTime()) / MS_PER_DAY
    ) + 1;

  if (rangeDays > maxDays) {
    return {
      ok: false,
      message: `Date range cannot exceed ${maxDays} days`,
    };
  }

  return { ok: true };
}
