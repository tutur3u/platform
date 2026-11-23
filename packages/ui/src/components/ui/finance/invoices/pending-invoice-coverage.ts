import { MAX_PREPAID_MONTH_COUNT } from './utils';

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

export interface PendingInvoiceCoverage {
  /** Earliest owed month (`YYYY-MM`), or an empty string when none is owed. */
  month: string;
  /** Consecutive owed months starting at `month`, capped at the prepaid limit. */
  monthCount: number;
  /** Last month (`YYYY-MM`) of the run; equals `month` for a single month. */
  lastMonth: string;
}

function formatMonthIndex(index: number) {
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

function monthIndex(value: string): number | null {
  const match = MONTH_PATTERN.exec(value);
  if (!match) return null;
  return Number(match[1]) * 12 + Number(match[2]) - 1;
}

/**
 * Default invoice coverage for a pending row: the earliest owed month and the
 * unbroken run of owed months after it. A paid month inside the range is never
 * bridged, so the invoice never records coverage for a month that was settled
 * separately; the remaining months stay on the pending list. `singleMonth`
 * selects only the earliest month, for rows that span several classes whose
 * owed months differ: one invoice records its months for every linked class.
 */
export function getPendingInvoiceCoverage(
  monthsOwed: readonly string[] | null | undefined,
  { singleMonth = false }: { singleMonth?: boolean } = {}
): PendingInvoiceCoverage {
  const indexes = [
    ...new Set(
      (monthsOwed ?? [])
        .map((month) => monthIndex(month.trim()))
        .filter((index): index is number => index !== null)
    ),
  ].sort((a, b) => a - b);

  const first = indexes[0];
  if (first === undefined) return { month: '', monthCount: 1, lastMonth: '' };

  let monthCount = 1;
  while (
    !singleMonth &&
    monthCount < MAX_PREPAID_MONTH_COUNT &&
    indexes[monthCount] === first + monthCount
  ) {
    monthCount += 1;
  }

  return {
    month: formatMonthIndex(first),
    monthCount,
    lastMonth: formatMonthIndex(first + monthCount - 1),
  };
}

export function clampPrepaidMonthCount(value: number | null | undefined) {
  if (value == null || !Number.isInteger(value) || value < 1) return 1;
  return Math.min(value, MAX_PREPAID_MONTH_COUNT);
}
