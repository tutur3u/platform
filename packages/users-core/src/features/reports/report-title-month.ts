/**
 * The month named in a report TITLE ("Báo cáo tháng 9", "Tháng 10/2026").
 * Pure and framework-free: the reports API (filter and per-month counts) and
 * the Contacts UI share it, so a month means the same thing on both sides.
 *
 * Filter keys:
 * - `YYYY-MM`  the title names a month and a year ("tháng 9/2026")
 * - `MM`       the title names only a month ("tháng 9")
 * - `none`     the title names no month
 */

export const NO_TITLE_MONTH = 'none';

const TITLE_MONTH_KEY = /^(?:\d{4}-(?:0[1-9]|1[0-2])|(?:0[1-9]|1[0-2])|none)$/;

/** "tháng", then a month number, then an optional year (checked unaccented). */
const TITLE_MONTH_PATTERN =
  /(?<![\p{L}\p{N}])thang\s*(\d{1,2})(?!\d)(?:\s*(?:\/|-|\.|,|nam)\s*(\d{4})(?!\d))?/gu;

const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

export interface ReportTitleMonth {
  /** 1-12 */
  month: number;
  /** Four-digit year, or null when the title names none. */
  year: number | null;
}

/** Lower-case, no diacritics ("Tháng" -> "thang", "đ" -> "d"). */
function foldTitle(title: string) {
  return title
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase();
}

/**
 * The first valid "tháng N" in a title (N 1-12, with or without a year, any
 * case or diacritics), or null when the title names no month.
 */
export function parseReportTitleMonth(
  title: string | null | undefined
): ReportTitleMonth | null {
  if (!title) return null;
  for (const match of foldTitle(title).matchAll(TITLE_MONTH_PATTERN)) {
    const month = Number(match[1]);
    if (month < 1 || month > 12) continue;
    const year = match[2] ? Number(match[2]) : null;
    return {
      month,
      year: year !== null && year >= MIN_YEAR && year <= MAX_YEAR ? year : null,
    };
  }
  return null;
}

function pad(month: number) {
  return String(month).padStart(2, '0');
}

/** The filter key a title files under (`none` when it names no month). */
export function reportTitleMonthKey(title: string | null | undefined) {
  const parsed = parseReportTitleMonth(title);
  if (!parsed) return NO_TITLE_MONTH;
  return parsed.year
    ? `${parsed.year}-${pad(parsed.month)}`
    : pad(parsed.month);
}

export function isReportTitleMonthKey(value: unknown): value is string {
  return typeof value === 'string' && TITLE_MONTH_KEY.test(value);
}

/** The parts of a month key, or null for `none` and anything invalid. */
export function parseReportTitleMonthKey(key: string): ReportTitleMonth | null {
  if (!isReportTitleMonthKey(key) || key === NO_TITLE_MONTH) return null;
  return key.length === 2
    ? { month: Number(key), year: null }
    : { month: Number(key.slice(5)), year: Number(key.slice(0, 4)) };
}

export function matchesReportTitleMonth(
  title: string | null | undefined,
  key: string
) {
  return reportTitleMonthKey(title) === key;
}

export interface ReportTitleMonthCount {
  key: string;
  count: number;
}

/** Sort rank: dated months, then months without a year, then `none`. */
function sortRank(key: string): [number, number, number] {
  const parts = parseReportTitleMonthKey(key);
  if (!parts) return [0, 0, 0];
  return [parts.year ? 2 : 1, parts.year ?? 0, parts.month];
}

/**
 * Every month found in the titles with how many reports carry it. Newest
 * dated month first, then months without a year, then `none`.
 */
export function summarizeReportTitleMonths(
  titles: Iterable<string | null | undefined>
): ReportTitleMonthCount[] {
  const counts = new Map<string, number>();
  for (const title of titles) {
    const key = reportTitleMonthKey(title);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts]
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => {
      const a = sortRank(left.key);
      const b = sortRank(right.key);
      return b[0] - a[0] || b[1] - a[1] || b[2] - a[2];
    });
}
